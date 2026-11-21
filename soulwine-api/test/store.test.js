import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store, COLLECTIONS } from "../src/store/store.js";
import { ApiError } from "../src/http/http.js";
import { backupWorkspace } from "../scripts/backup.js";
import { DatabaseSync } from "node:sqlite";
import { config } from "../src/config.js";
import { seedState } from "../src/store/seed.js";
import { spawnSync } from "node:child_process";

const product = (sku) => ({ sku, name: sku, physical: 10, held: 0, damaged: 0, retail: 100, wholesale: 80, min: 2, status: "product_active" });
const meta = (action = "test.change") => ({ requestId: crypto.randomUUID(), actor: { id: "U-1", name: "Người kiểm tra", role: "director", authenticated: true }, action, method: "POST", route: "/test", status: 200 });
function seed() { return { revision: 0, collections: Object.fromEntries(Object.keys(COLLECTIONS).map((key) => [key, []])) }; }
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kilo", "soulwine-store-"));
  const stores = [];
  const open = (seedFn = seed) => { const store = new Store(dir, seedFn); store.load(); stores.push(store); return store; };
  t.after(() => { stores.forEach((store) => store.close()); fs.rmSync(dir, { recursive: true, force: true }); });
  return { dir, open };
}

test("state and audit commit atomically, each event has a unique stable id", (t) => {
  const { open } = fixture(t), store = open();
  const result = store.transact(meta(), (tx) => {
    tx.list("products").push(product("SW-1"));
    tx.list("customers").push({ id: "KH-1", name: "Khách hàng" });
    tx.note("Đã tạo danh mục");
    return { saved: true };
  });
  assert.equal(result.events.length, 3);
  assert.equal(new Set(result.events.map((event) => event.seq)).size, 3);
  assert(result.events.every((event) => event.revision === 1));
  const event = result.events.find((item) => item.entity === "products");
  assert.equal(store.auditEvent(event.seq).after.sku, "SW-1");
  store.close();
  const reopened = open();
  assert.equal(reopened.find("products", "SW-1").physical, 10);
  assert.equal(reopened.state.revision, 1);
  assert.equal(reopened.journal.length, 3);
});

test("failed domain mutation rolls back every entity while preserving a failure audit", (t) => {
  const store = fixture(t).open();
  store.transact(meta(), (tx) => tx.list("products").push(product("SW-1")));
  const start = store.journal.length;
  assert.throws(() => store.transact(meta("order.invalid"), (tx) => {
    tx.find("products", "SW-1").physical = 0;
    tx.list("customers").push({ id: "MUST-NOT-EXIST", name: "Không được ghi" });
    tx.note("Thông báo thành công chưa hợp lệ");
    throw new ApiError(400, "invalid_order", "Không đủ điều kiện thực hiện");
  }), /Không đủ điều kiện/);
  assert.equal(store.find("products", "SW-1").physical, 10);
  assert.equal(store.find("customers", "MUST-NOT-EXIST"), null);
  const events = store.journal.slice(start);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "activity");
  assert.equal(events[0].status, 400);
  assert(!events[0].summary.includes("thành công chưa hợp lệ"));
});

test("only explicitly allowed security attempt failures may commit counters", (t) => {
  const store = fixture(t).open();
  store.transact(meta(), (tx) => tx.list("credentials").push({ userId: "U-1", email: "user@example.test", hash: "PRIVATE_HASH", salt: "PRIVATE_SALT", failedAttempts: 0 }));
  assert.throws(() => store.transact({ ...meta("auth.login"), commitOnErrorCodes: ["invalid_credentials"] }, (tx) => {
    tx.find("credentials", "U-1").failedAttempts++;
    throw new ApiError(401, "invalid_credentials", "Email hoặc mật khẩu không đúng");
  }), /không đúng/);
  assert.equal(store.find("credentials", "U-1").failedAttempts, 1);
  assert(store.journal.some((event) => event.entity === "credentials" && event.changes?.failedAttempts?.after === 1));
});

test("audit output redacts credential material, raw tokens and OTPs", (t) => {
  const store = fixture(t).open();
  store.transact(meta(), (tx) => {
    tx.list("credentials").push({ userId: "U-1", email: "user@example.test", salt: "PRIVATE_SALT", hash: "PRIVATE_HASH", password: "PRIVATE_PASSWORD" });
    tx.list("sessions").push({ token: "PRIVATE_BEARER_TOKEN", userId: "U-1", scope: "full", role: "director" });
    tx.list("outbox").push({ id: "OB-1", email: "user@example.test", code: "987654", salt: "OTP_SALT", hash: "OTP_HASH" });
  });
  const log = JSON.stringify(store.journal);
  for (const secret of ["PRIVATE_SALT", "PRIVATE_HASH", "PRIVATE_PASSWORD", "PRIVATE_BEARER_TOKEN", "987654", "OTP_SALT", "OTP_HASH"]) assert(!log.includes(secret), secret);
  assert.equal(store.journal.find((event) => event.entity === "credentials").after.email, "user@example.test");
});

test("audit records cannot be updated or deleted through SQL", (t) => {
  const store = fixture(t).open();
  store.transact(meta(), (tx) => tx.note("Sự kiện được lưu"));
  assert.throws(() => store.db.exec("UPDATE audit_events SET action='changed'"), /append-only/);
  assert.throws(() => store.db.exec("DELETE FROM audit_events"), /append-only/);
  assert.equal(store.journal.length, 1);
});

test("storage write failure does not publish uncommitted memory state", (t) => {
  const store = fixture(t).open();
  const before = structuredClone(store.state);
  store.db.exec("PRAGMA query_only=ON");
  assert.throws(() => store.transact(meta(), (tx) => tx.list("products").push(product("NO-COMMIT"))));
  assert.deepEqual(store.state, before);
  store.db.exec("PRAGMA query_only=OFF");
  assert.equal(store.journal.length, 0);
});

test("invalid stock and non-finite numeric data never reach disk", (t) => {
  const store = fixture(t).open();
  assert.throws(() => store.transact(meta(), (tx) => tx.list("products").push({ ...product("BAD"), held: 11 })), /Tồn vật lý/);
  assert.throws(() => store.transact(meta(), (tx) => tx.list("products").push({ ...product("NAN"), wholesale: NaN })), /Giá trị số/);
  assert.equal(store.list("products").length, 0);
});

test("multiple store connections serialize writes without overwriting other state", (t) => {
  const { open } = fixture(t), first = open(), second = open();
  first.transact(meta(), (tx) => tx.list("products").push(product("SW-A")));
  second.transact(meta(), (tx) => {
    assert.equal(tx.find("products", "SW-A").physical, 10);
    tx.list("products").push(product("SW-B"));
  });
  first.refresh();
  assert.equal(first.list("products").length, 2);
  assert.equal(first.state.revision, 2);
  assert.equal(first.journal.length, 2);
});

test("corrupt existing database fails closed instead of silently reseeding", (t) => {
  const { dir, open } = fixture(t);
  const file = path.join(dir, "soulwine.sqlite");
  const damaged = Buffer.from("invalid sqlite file, preserve this data");
  fs.writeFileSync(file, damaged);
  assert.throws(() => open(), /Không thể mở dữ liệu|database|file/i);
  assert.deepEqual(fs.readFileSync(file), damaged);
});

test("async and nested transaction callbacks are rejected without partial writes", (t) => {
  const store = fixture(t).open();
  assert.throws(() => store.transact(meta(), async (tx) => { tx.list("products").push(product("ASYNC")); }), /synchronous/);
  assert.equal(store.list("products").length, 0);
  assert.throws(() => store.transact(meta(), (tx) => { tx.list("products").push(product("NESTED")); store.transact(meta(), () => {}); }), /Nested/);
  assert.equal(store.list("products").length, 0);
});

test("online backup contains a consistent state and audit snapshot while WAL remains open", async (t) => {
  const { dir, open } = fixture(t), store = open();
  store.transact(meta(), (tx) => { tx.list("products").push(product("BACKUP")); tx.note("Sao lưu giao dịch"); });
  const file = await backupWorkspace(dir);
  store.transact(meta(), (tx) => tx.find("products", "BACKUP").physical = 9);
  const database = new DatabaseSync(file, { readOnly: true });
  try {
    assert.equal(database.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    const state = database.prepare("SELECT revision,payload FROM workspace_state").get();
    assert.equal(state.revision, 1);
    assert.equal(JSON.parse(state.payload).products[0].physical, 10);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM audit_events").get().count, 2);
  } finally { database.close(); }
});

test("production bootstrap requires an explicit admin secret and does not seed known passwords", () => {
  const before = { production: config.production, bootstrapAdmin: config.bootstrapAdmin };
  try {
    config.production = true;
    config.bootstrapAdmin = { email: "", password: "", name: "Quản trị" };
    assert.throws(() => seedState(), /BOOTSTRAP_ADMIN/);
    config.bootstrapAdmin = { email: "admin@example.test", password: "UniqueAdminSecret2026", name: "Quản trị" };
    const seeded = seedState();
    assert.equal(seeded.collections.users.length, 1);
    assert.equal(seeded.collections.users[0].email, "admin@example.test");
    assert.deepEqual(seeded.collections.users[0].roleIds, ["director"]);
    assert.equal(seeded.collections.credentials.length, 1);
    assert(!JSON.stringify(seeded).includes("UniqueAdminSecret2026"));
  } finally { Object.assign(config, before); }
});

test("WAL recovers committed state and discards an unfinished transaction after abrupt process exit", (t) => {
  const { dir, open } = fixture(t);
  const moduleUrl = new URL("../src/store/store.js", import.meta.url).href;
  const source = `
    import { Store, COLLECTIONS } from ${JSON.stringify(moduleUrl)};
    const store = new Store(process.env.SOULWINE_TEST_DATA, () => ({ revision:0, collections:Object.fromEntries(Object.keys(COLLECTIONS).map(key => [key,[]])) }));
    store.load();
    store.transact({action:'committed'}, tx => { tx.list('products').push({sku:'CRASH',name:'CRASH',physical:4,held:0,damaged:0}); tx.note('Committed'); });
    store.transact({action:'unfinished'}, tx => { tx.find('products','CRASH').physical = 1; process.exit(17); });
  `;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", source], { env: { ...process.env, SOULWINE_TEST_DATA: dir }, encoding: "utf8", timeout: 15000 });
  assert.equal(child.status, 17, child.stderr);
  const store = open();
  assert.equal(store.find("products", "CRASH").physical, 4);
  assert.equal(store.state.revision, 1);
  assert.equal(store.journal.length, 2);
  assert(!store.journal.some((event) => event.action === "unfinished"));
});
