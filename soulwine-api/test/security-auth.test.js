import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import { createApp } from "../server.js";
import { config } from "../src/config.js";

const tempRoot = "C:\\Users\\quan\\AppData\\Local\\Temp\\kilo";
const digest = (token) => crypto.createHash("sha256").update(token).digest("hex");
const past = "2020-01-01T12:00:00Z";

async function fixture(t) {
  assert.ok(fs.existsSync(tempRoot), "Preapproved temporary directory must exist");
  const dataDir = fs.mkdtempSync(path.join(tempRoot, "soulwine-security-"));
  const { server, store } = createApp(dataDir);
  const originalOutbox = config.allowDevOutbox;
  config.allowDevOutbox = false;
  t.after(async () => {
    config.allowDevOutbox = originalOutbox;
    if (server.listening) {
      const closed = once(server, "close");
      server.close();
      server.closeIdleConnections();
      await closed;
    }
    store.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const passwords = new Map();
  const api = async (method, route, token, body) => {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, data: await response.json() };
  };
  const login = async (role) => {
    const account = config.seedAccounts.find((user) => user.roleIds.includes(role));
    const result = await api("POST", "/api/auth/login", null, { email: account.email, password: passwords.get(account.id) || config.initialPasswords[account.id] });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    return { ...result.data, account };
  };
  const full = async (role) => {
    const result = await login(role);
    if (result.mustChange) {
      const password = `Changed-${result.account.id}@2026`;
      const changed = await api("POST", "/api/auth/change-password", result.token, { currentPassword: config.initialPasswords[result.account.id], newPassword: password });
      assert.equal(changed.status, 200, JSON.stringify(changed.data));
      assert.equal(changed.data.token, result.token);
      passwords.set(result.account.id, password);
    }
    const selected = await api("POST", "/api/auth/session", result.token, { role });
    assert.equal(selected.status, 200, JSON.stringify(selected.data));
    assert.equal(selected.data.token, result.token);
    return result.token;
  };
  const seed = (fn) => store.transact({ action: "test.fixture" }, fn);
  return { store, api, login, full, seed };
}

test("bearer tokens are hashed at rest and raw tokens survive role/password responses", async (t) => {
  const f = await fixture(t);
  const token = await f.full("director");
  assert.equal(f.store.find("sessions", token), null);
  assert.equal(f.store.find("sessions", digest(token)).userId, "U-001");
  assert.equal((await f.api("GET", "/api/stock", token)).status, 200);
  assert.equal((await f.api("GET", "/api/stock", digest(token))).status, 401);
  assert.ok(!JSON.stringify(f.store.state).includes(token));
  assert.ok(!JSON.stringify(f.store.journal).includes(token));
  const second = await f.login("director");
  const changed = await f.api("POST", "/api/auth/change-password", token, { currentPassword: "Changed-U-001@2026", newPassword: "SecondChange123" });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.token, token);
  assert.equal((await f.api("GET", "/api/stock", second.token)).status, 401);
  assert.equal((await f.api("POST", "/api/auth/logout", token)).status, 200);
  assert.equal((await f.api("GET", "/api/stock", token)).status, 401);
});

test("role removal and disabling users revoke sessions; request resolution rechecks live user assignments", async (t) => {
  const f = await fixture(t);
  const director = await f.full("director");
  const sales = await f.full("sales_staff");
  assert.equal((await f.api("PATCH", "/api/users/U-004", director, { roleIds: ["warehouse_staff"] })).status, 200);
  assert.ok(f.store.find("sessions", digest(sales)).revokedAt);
  assert.equal((await f.api("GET", "/api/customers", sales)).status, 401);
  const warehouse = await f.full("warehouse_staff");
  assert.equal((await f.api("PATCH", "/api/users/U-005", director, { status: "user_locked" })).status, 200);
  assert.ok(f.store.find("sessions", digest(warehouse)).revokedAt);
  assert.equal((await f.api("GET", "/api/stock", warehouse)).status, 401);
  const manager = await f.full("sales_manager");
  f.seed((tx) => { tx.find("users", "U-003").roleIds = ["warehouse_staff"]; });
  assert.equal((await f.api("GET", "/api/products", manager)).status, 401);
  const fresh = await f.login("sales_staff");
  f.seed((tx) => { tx.find("users", "U-004").status = "user_locked"; });
  assert.equal((await f.api("POST", "/api/auth/session", fresh.token, { role: "warehouse_staff" })).status, 401);
});

test("development outbox requires explicit enablement and a full director session", async (t) => {
  const f = await fixture(t);
  const restrictedDirector = await f.login("director");
  config.allowDevOutbox = true;
  assert.equal((await f.api("GET", "/api/auth/outbox", restrictedDirector.token)).status, 403);
  config.allowDevOutbox = false;
  const director = await f.full("director");
  const email = config.seedAccounts[0].email;
  assert.equal((await f.api("POST", "/api/auth/forgot", null, { email })).status, 200);
  assert.equal((await f.api("GET", "/api/auth/outbox", director)).status, 403);
  config.allowDevOutbox = true;
  const restricted = await f.login("sales_staff");
  assert.equal((await f.api("GET", "/api/auth/outbox", restricted.token)).status, 403);
  const sales = await f.full("sales_staff");
  assert.equal((await f.api("GET", "/api/auth/outbox", sales)).status, 403);
  const entries = await f.api("GET", "/api/auth/outbox", director);
  assert.equal(entries.status, 200);
  assert.match(entries.data[0].code, /^\d{6}$/);
});

test("new OTP issuance invalidates earlier codes and reset consumes all challenges", async (t) => {
  const f = await fixture(t);
  const email = config.seedAccounts[0].email;
  await f.api("POST", "/api/auth/forgot", null, { email });
  const firstId = f.store.list("outbox").at(-1).id;
  await f.api("POST", "/api/auth/forgot", null, { email });
  assert.ok(f.store.find("outbox", firstId).consumedAt);
  assert.equal(f.store.find("outbox", firstId).code, null);
  const latest = structuredClone(f.store.list("outbox").at(-1));
  const rejected = await f.api("POST", "/api/auth/reset-password", null, { email, code: latest.code, newPassword: config.initialPasswords["U-001"] });
  assert.equal(rejected.data.code, "same_password");
  assert.equal(f.store.find("outbox", latest.id).attempts, 0);
  assert.equal(f.store.find("outbox", latest.id).consumedAt, null);
  const reset = await f.api("POST", "/api/auth/reset-password", null, { email, code: latest.code, newPassword: "ResetPassword123" });
  assert.equal(reset.status, 200, JSON.stringify(reset.data));
  assert.ok(f.store.list("outbox").every((entry) => entry.consumedAt && entry.code === null));
  assert.equal((await f.api("POST", "/api/auth/reset-password", null, { email, code: latest.code, newPassword: "ReplayPassword123" })).data.code, "otp_missing");
});

test("password changes and administrative reissue invalidate reset challenges, including old email", async (t) => {
  const f = await fixture(t);
  const director = await f.full("director");
  const email = config.seedAccounts[3].email;
  await f.api("POST", "/api/auth/forgot", null, { email });
  await f.full("sales_staff");
  assert.ok(f.store.list("outbox").filter((entry) => entry.email === email).every((entry) => entry.consumedAt));
  await f.api("POST", "/api/auth/forgot", null, { email });
  const reissued = await f.api("POST", "/api/users/U-004/password", director, { password: "ReissuedPassword123", email: "replacement@example.com", mustChange: true });
  assert.equal(reissued.status, 200);
  assert.equal(f.store.find("users", "U-004").email, "replacement@example.com");
  assert.equal(f.store.find("credentials", "U-004").email, "replacement@example.com");
  assert.ok(f.store.list("outbox").filter((entry) => entry.email === email).every((entry) => entry.consumedAt && entry.code === null));
});

test("failed password and OTP counters persist and lock on the configured attempt", async (t) => {
  const f = await fixture(t);
  const email = config.seedAccounts[3].email;
  for (let attempt = 1; attempt <= config.auth.maxFailedLogins; attempt++) {
    const response = await f.api("POST", "/api/auth/login", null, { email, password: "WrongPassword123" });
    assert.equal(response.status, attempt === config.auth.maxFailedLogins ? 423 : 401);
    assert.equal(f.store.find("credentials", "U-004").failedAttempts, attempt);
  }
  await f.api("POST", "/api/auth/forgot", null, { email });
  const id = f.store.list("outbox").at(-1).id;
  for (let attempt = 1; attempt <= config.auth.maxOtpAttempts; attempt++) {
    const response = await f.api("POST", "/api/auth/reset-password", null, { email, code: "invalid", newPassword: "NextPassword123" });
    assert.equal(response.data.code, attempt === config.auth.maxOtpAttempts ? "otp_locked" : "otp_invalid");
    assert.equal(f.store.find("outbox", id).attempts, attempt);
  }
  assert.ok(f.store.find("outbox", id).consumedAt);
});

test("last director cannot lose director role, including combined role/status updates", async (t) => {
  const f = await fixture(t);
  const director = await f.full("director");
  for (const body of [{ roleIds: ["sales_staff"] }, { roleIds: ["sales_staff"], status: "user_locked" }]) {
    const response = await f.api("PATCH", "/api/users/U-001", director, body);
    assert.equal(response.status, 409);
    assert.equal(response.data.code, "last_director");
    assert.ok(f.store.find("users", "U-001").roleIds.includes("director"));
  }
  assert.equal((await f.api("PATCH", "/api/users/U-004", director, { roleIds: ["toString"] })).status, 400);
  assert.equal((await f.api("PATCH", "/api/users/U-004", director, { status: "unknown" })).status, 400);
});

test("retail balances reject confirmed and pending overpayments without partial writes", async (t) => {
  const f = await fixture(t);
  const accountant = await f.full("accountant");
  const sales = await f.full("sales_staff");
  f.seed((tx) => tx.list("orders").push({ code: "SO-TEST", customerId: "C1", type: "Bán lẻ", total: 100, paid: 0, status: "pending_payment", lines: [] }));
  const payment = (amount) => ({ record: "SO-TEST", amount, method: "Tiền mặt", reference: "R1" });
  assert.equal((await f.api("POST", "/api/payments", accountant, payment(101))).status, 400);
  assert.equal(f.store.list("payments").length, 0);
  const pending = await f.api("POST", "/api/payments", sales, payment(60));
  assert.equal(pending.status, 200);
  assert.equal((await f.api("POST", "/api/payments", sales, payment(41))).status, 400);
  assert.equal(f.store.list("payments").length, 1);
  assert.equal((await f.api("POST", `/api/payments/${pending.data.id}/confirm`, accountant)).status, 200);
  assert.equal(f.store.find("orders", "SO-TEST").paid, 60);
  assert.equal((await f.api("POST", "/api/payments", accountant, payment(40))).status, 200);
  assert.equal(f.store.find("orders", "SO-TEST").paid, 100);
  assert.equal((await f.api("POST", "/api/payments", accountant, payment(1))).status, 400);
});

test("contract schemes enforce deposit minimum for both reservation and issue", async (t) => {
  const f = await fixture(t);
  const warehouse = await f.full("warehouse_manager");
  f.seed((tx) => {
    tx.list("products").push({ sku: "SKU", name: "Wine", status: "product_active", physical: 10, held: 0, damaged: 0, unit: "Bottle" });
    for (const [code, scheme] of [["C100", "100%"], ["C50", "50/50"]]) {
      tx.list("contracts").push({ code, value: 100, paid: 1, status: "active", scheme, shipments: [{ id: "S1", status: "planned", delivery: "", items: [{ sku: "SKU", qty: 1 }] }] });
      tx.list("orders").push({ code: `SO-${code}`, contract: code, type: "Bán sỉ", customerId: "C1", total: 100, paid: 1, status: "pending_payment", lines: [{ sku: "SKU", qty: 1, price: 100, held: 0, shipped: 0 }] });
    }
  });
  for (const [code, minimum] of [["C100", 100], ["C50", 50]]) {
    const reserve = () => f.api("POST", `/api/orders/SO-${code}/reserve`, warehouse, { sku: "SKU", qty: 1 });
    assert.equal((await reserve()).data.code, "not_eligible");
    assert.equal((await f.api("POST", `/api/orders/SO-${code}/issue`, warehouse)).data.code, "not_eligible");
    f.seed((tx) => { tx.find("contracts", code).paid = minimum; tx.find("orders", `SO-${code}`).paid = minimum; });
    assert.equal((await reserve()).status, 200);
    assert.equal((await f.api("POST", `/api/orders/SO-${code}/issue`, warehouse)).status, 200);
  }
});

test("restocked failed deliveries require a fresh issue and cannot be redelivered", async (t) => {
  const f = await fixture(t);
  const sales = await f.full("sales_staff");
  const warehouse = await f.full("warehouse_manager");
  f.seed((tx) => {
    tx.list("products").push({ sku: "SKU", name: "Wine", status: "product_active", physical: 0, held: 0, damaged: 0, unit: "Bottle" });
    tx.list("orders").push({ code: "SO-RETURN", type: "Bán lẻ", customerId: "C1", total: 100, paid: 100, status: "failed", lines: [{ sku: "SKU", qty: 1, price: 100, held: 0, shipped: 1 }] });
    tx.list("deliveries").push({ code: "D1", order: "SO-RETURN", status: "failed", items: [{ sku: "SKU", qty: 1 }] });
  });
  const created = await f.api("POST", "/api/returns", sales, { order: "SO-RETURN", delivery: "D1", sku: "SKU", qty: 1, reason: "Failed delivery" });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  assert.equal(created.data.delivery, "D1");
  assert.equal((await f.api("POST", "/api/deliveries/D1/schedule", sales, { carrier: "Courier", planned: "2026-01-01" })).status, 400);
  const inspect = { condition: "good", receivedAt: past, reason: "Received back" };
  assert.equal((await f.api("POST", `/api/returns/${created.data.code}/inspect`, warehouse, inspect)).status, 200);
  assert.equal(f.store.find("products", "SKU").physical, 1);
  assert.equal(f.store.find("orders", "SO-RETURN").lines[0].shipped, 0);
  assert.equal(f.store.find("deliveries", "D1").status, "returned");
  assert.equal((await f.api("POST", `/api/returns/${created.data.code}/inspect`, warehouse, inspect)).status, 409);
  assert.equal((await f.api("POST", "/api/deliveries/D1/schedule", sales, { carrier: "Courier", planned: "2026-01-01" })).status, 409);
  assert.equal((await f.api("POST", "/api/orders/SO-RETURN/reserve", warehouse, { sku: "SKU", qty: 1 })).status, 200);
  const issued = await f.api("POST", "/api/orders/SO-RETURN/issue", warehouse);
  assert.equal(issued.status, 200);
  assert.equal(f.store.find("products", "SKU").physical, 0);
  const replacement = f.store.list("deliveries").find((delivery) => delivery.code !== "D1");
  assert.equal((await f.api("POST", `/api/deliveries/${replacement.code}/schedule`, sales, { carrier: "Courier", planned: "2026-01-01" })).status, 200);
  assert.equal((await f.api("POST", `/api/deliveries/${replacement.code}/result`, sales, { result: "delivered", receivedAt: past, fileName: "signed.pdf" })).status, 200);
  assert.equal(f.store.find("orders", "SO-RETURN").status, "completed");
  assert.equal(f.store.find("products", "SKU").physical, 0);
});

test("invalid delivery dates and enums do not change workflow or inventory", async (t) => {
  const f = await fixture(t);
  const sales = await f.full("sales_manager");
  f.seed((tx) => {
    tx.list("products").push({ sku: "SKU", name: "Original", status: "product_active", retail: 100, wholesale: 50, min: 0, physical: 0, held: 0, damaged: 0, unit: "Bottle" });
    tx.list("orders").push({ code: "SO-DATE", type: "Bán lẻ", total: 100, paid: 100, status: "shipping", lines: [] });
    tx.list("deliveries").push({ code: "D1", order: "SO-DATE", status: "shipping", items: [] });
  });
  for (const body of [
    { result: "unknown", receivedAt: past, fileName: "proof.pdf" },
    { result: "delivered", receivedAt: "not-a-date", fileName: "proof.pdf" },
    { result: "delivered", receivedAt: "2026-02-30", fileName: "proof.pdf" },
    { result: "delivered", receivedAt: "2099-01-01", fileName: "proof.pdf" }
  ]) {
    assert.equal((await f.api("POST", "/api/deliveries/D1/result", sales, body)).status, 400);
    assert.equal(f.store.find("deliveries", "D1").status, "shipping");
  }
  assert.equal((await f.api("PATCH", "/api/products/SKU", sales, { name: "Must roll back", retail: -1 })).status, 400);
  assert.equal(f.store.find("products", "SKU").name, "Original");
  assert.equal(f.store.find("products", "SKU").retail, 100);
});

test("returns are capped per delivery and ambiguous deliveries must be selected explicitly", async (t) => {
  const f = await fixture(t);
  const sales = await f.full("sales_staff");
  const warehouse = await f.full("warehouse_manager");
  f.seed((tx) => {
    tx.list("products").push({ sku: "SKU", name: "Wine", status: "product_active", physical: 0, held: 0, damaged: 0, unit: "Bottle" });
    tx.list("orders").push({ code: "SO-MULTI", type: "Bán lẻ", total: 400, paid: 400, status: "failed", lines: [{ sku: "SKU", qty: 4, price: 100, held: 0, shipped: 4 }] });
    for (const code of ["D1", "D2"]) tx.list("deliveries").push({ code, order: "SO-MULTI", status: "failed", items: [{ sku: "SKU", qty: 2 }] });
  });
  const body = { order: "SO-MULTI", sku: "SKU", qty: 1, reason: "Return" };
  assert.equal((await f.api("POST", "/api/returns", sales, body)).data.code, "invalid_return_delivery");
  assert.equal((await f.api("POST", "/api/returns", sales, { ...body, delivery: "D1", qty: 3 })).status, 400);
  const partial = await f.api("POST", "/api/returns", sales, { ...body, delivery: "D1" });
  assert.equal(partial.status, 200);
  assert.equal((await f.api("POST", `/api/returns/${partial.data.code}/inspect`, warehouse, { condition: "good", receivedAt: past, reason: "Counted" })).status, 200);
  assert.equal(f.store.find("orders", "SO-MULTI").lines[0].shipped, 3);
  assert.equal((await f.api("POST", "/api/returns", sales, { ...body, delivery: "D1", qty: 2 })).status, 400);
  const rest = await f.api("POST", "/api/returns", sales, { ...body, delivery: "D1" });
  assert.equal(rest.status, 200);
  assert.equal((await f.api("POST", `/api/returns/${rest.data.code}/inspect`, warehouse, { condition: "good", receivedAt: past, reason: "Counted" })).status, 200);
  assert.equal(f.store.find("deliveries", "D1").status, "returned");
  assert.equal(f.store.find("deliveries", "D2").status, "failed");
  assert.equal(f.store.find("products", "SKU").physical, 2);
});
