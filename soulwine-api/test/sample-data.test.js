import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { config } from "../src/config.js";
import { Store, COLLECTIONS } from "../src/store/store.js";
import { seedState } from "../src/store/seed.js";
import { seedSampleData } from "../scripts/seed-sample.js";

const require = createRequire(import.meta.url);
const { SAMPLE_SET_ID, LEGACY_SAMPLE_SET_IDS, COLLECTION_KEYS, createSamplePlan } = require("../../soulwine-shared/sample-data.cjs");

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kilo", "soulwine-sample-"));
  const stores = [];
  const open = () => { const store = new Store(dir, seedState); store.load(); stores.push(store); return store; };
  t.after(() => { stores.forEach((store) => store.close()); fs.rmSync(dir, { recursive: true, force: true }); });
  return { dir, open };
}

test("compact fixture replaces only the previous marked sample set, keeping auth and audit history", (t) => {
  const { dir, open } = fixture(t), store = open();
  const plan = createSamplePlan({ collections: store.state.collections, users: store.list("users") });
  store.transact({ action: "test.legacy-sample" }, (tx) => {
    for (const key of COLLECTION_KEYS) tx.list(key).push(...plan.collections[key].map((record) => ({ ...record, sampleSet: LEGACY_SAMPLE_SET_IDS[0] })));
  });
  const credentials = structuredClone(store.list("credentials")), auditCount = store.journal.length;
  store.close();
  const report = seedSampleData(dir), updated = open();
  assert.equal(report.namespace, "LK02");
  assert.equal(updated.list("products").length, 6);
  assert.equal(updated.list("customers").length, 4);
  assert.equal(updated.list("orders").length, 5);
  assert.equal(updated.list("contracts").length, 3);
  assert(COLLECTION_KEYS.every((key) => updated.list(key).every((record) => record.sampleSet === SAMPLE_SET_ID)));
  assert.deepEqual(updated.list("credentials"), credentials);
  assert(updated.journal.length > auditCount);
  assert(updated.journal.some((event) => event.action === "test.legacy-sample"));
});

test("compact upgrade refuses to remove sample records referenced by user-entered data", (t) => {
  const { dir, open } = fixture(t), store = open();
  const plan = createSamplePlan({ collections: store.state.collections, users: store.list("users") });
  store.transact({ action: "test.legacy-links" }, (tx) => {
    for (const key of COLLECTION_KEYS) tx.list(key).push(...plan.collections[key].map((record) => ({ ...record, sampleSet: LEGACY_SAMPLE_SET_IDS[0] })));
    tx.list("quotes").push({ code: "USER-QUOTE", customerId: plan.collections.customers[0].id, lines: [{ sku: plan.collections.products[0].sku, qty: 1, price: 100, discount: 0 }], status: "draft" });
  });
  const before = structuredClone(store.state.collections);
  store.close();
  assert.throws(() => seedSampleData(dir), /tham chiếu/);
  assert.deepEqual(open().state.collections, before);
});

test("sample adapter appends related records without changing identities or existing business data", (t) => {
  const { dir, open } = fixture(t), original = open();
  original.transact({ action: "test.prepare" }, (tx) => {
    tx.list("credentials")[0].failedAttempts = 2;
    tx.list("credentials")[0].mustChange = false;
    tx.list("sessions").push({ token: "a".repeat(64), userId: tx.list("users")[0].id, scope: "full", role: "director", expiresAt: "2099-01-01T00:00:00.000Z" });
    tx.list("outbox").push({ id: "KEEP-OTP", email: "existing@example.test", code: "123456", used: false });
    tx.list("products").push({ sku: "KEEP-STOCK", name: "Existing product", physical: 15, held: 2, damaged: 1, retail: 100, wholesale: 80, min: 1, status: "product_active" });
    tx.list("customers").push({ id: "KEEP-CUSTOMER", name: "Existing customer", phone: "0900000000" });
    tx.list("suppliers").push({ id: "KEEP-SUPPLIER", name: "Existing supplier" });
    tx.list("orders").push({ code: "KEEP-ORDER", customerId: "KEEP-CUSTOMER", total: 160, paid: 160, status: "holding", lines: [{ sku: "KEEP-STOCK", qty: 2, held: 2, shipped: 0, price: 80 }] });
  });
  const before = structuredClone(original.state.collections);
  original.close();
  const report = seedSampleData(dir);
  assert.equal(report.skipped, false);
  assert.equal(report.sampleSet, SAMPLE_SET_ID);
  assert(report.total > 0);
  assert.equal(report.total, Object.values(report.counts).reduce((sum, count) => sum + count, 0));
  const persisted = open();
  for (const [name, records] of Object.entries(before)) {
    if (name === "settings") continue;
    const key = COLLECTIONS[name].key;
    for (const record of records) assert.deepEqual(persisted.find(name, record[key]), record, `${name}: ${record[key]}`);
    if (["users", "credentials", "sessions", "outbox"].includes(name)) assert.deepEqual(persisted.list(name), records);
  }
  const expectedSettings = structuredClone(before.settings);
  expectedSettings[0].rules.receiptTolerance = 5;
  assert.deepEqual(persisted.list("settings"), expectedSettings);
  for (const [name, count] of Object.entries(report.counts)) {
    assert.equal(persisted.list(name).length, before[name].length + count, name);
    assert.equal(persisted.list(name).filter((record) => record.sampleSet === SAMPLE_SET_ID).length, count, name);
  }
  assert.equal(Object.hasOwn(persisted.state.collections, "activity"), false);
  const events = persisted.journal.filter((event) => event.action === "sample.seed");
  assert(events.length > report.total);
  assert(events.every((event) => event.actor.id === "system" && event.actor.authenticated === false && event.actor.source === "sample"));
  const notes = events.filter((event) => event.kind === "activity");
  assert(notes.some((event) => /Initialized operational records|Workflow/i.test(event.summary)));
  for (const scenario of report.scenarios) {
    assert(notes.some((event) => event.summary.includes(scenario.code) && scenario.roles.every((role) => event.summary.includes(role))));
  }
});

test("sample seeding is idempotent across reopened SQLite connections, including audit", (t) => {
  const { dir, open } = fixture(t);
  seedSampleData(dir);
  const first = open(), state = structuredClone(first.state), journal = first.journal;
  first.close();
  const report = seedSampleData(dir);
  assert.equal(report.skipped, true);
  assert.equal(report.total, 0);
  assert(Object.values(report.counts).every((count) => count === 0));
  const second = open();
  assert.deepEqual(second.state, state);
  assert.deepEqual(second.journal, journal);
});

test("sample seeding preserves an explicitly configured receipt tolerance, including zero", (t) => {
  for (const tolerance of [0, 12]) {
    const { dir, open } = fixture(t), store = open();
    store.transact({ action: "test.settings" }, (tx) => { tx.find("settings", "singleton").rules.receiptTolerance = tolerance; });
    const expected = structuredClone(store.list("settings"));
    store.close();
    seedSampleData(dir);
    assert.deepEqual(open().list("settings"), expected);
  }
});

test("production seeding is rejected before opening or creating a database", (t) => {
  const { dir } = fixture(t), previous = config.production;
  try {
    config.production = true;
    assert.throws(() => seedSampleData(dir), /disabled in production/);
    assert.deepEqual(fs.readdirSync(dir), []);
  } finally { config.production = previous; }
});

test("sample plan sees the latest committed records and account names inside its transaction", (t) => {
  const { dir, open } = fixture(t), store = open();
  const plan = createSamplePlan({ collections: store.state.collections, users: store.list("users"), now: new Date() });
  const { sampleSet, ...collision } = structuredClone(plan.collections.products[0]);
  collision.name = "Committed while seeder was opening";
  store.close();
  const transact = Store.prototype.transact;
  let injected = false;
  Store.prototype.transact = function (meta, callback) {
    if (meta.action === "sample.seed" && !injected) {
      injected = true;
      const concurrent = open();
      transact.call(concurrent, { action: "test.concurrent" }, (tx) => {
        tx.list("products").push(collision);
        tx.list("users").forEach((user, index) => { user.name = `Latest account ${index}`; });
      });
      concurrent.close();
    }
    return transact.call(this, meta, callback);
  };
  try { seedSampleData(dir); } finally { Store.prototype.transact = transact; }
  const persisted = open();
  assert.equal(injected, true);
  assert.deepEqual(persisted.find("products", collision.sku), collision);
  const generated = JSON.stringify(Object.values(persisted.state.collections).flat().filter((record) => record.sampleSet === SAMPLE_SET_ID));
  for (const user of persisted.list("users")) assert(generated.includes(user.name), user.name);
});

test("sample graph resolves business references and obeys persisted stock and quantity constraints", (t) => {
  const { dir, open } = fixture(t);
  seedSampleData(dir);
  const store = open();
  const sample = (name) => store.list(name).filter((record) => record.sampleSet === SAMPLE_SET_ID);
  const reference = (name, key) => assert(store.find(name, key), `${name} missing ${key}`);
  for (const name of ["quotes", "contracts", "orders", "payments", "reservations", "issues", "deliveries", "returns"]) {
    for (const record of sample(name)) if (record.customerId) reference("customers", record.customerId);
  }
  for (const name of ["quotes", "contracts", "orders", "issues", "receipts", "purchaseRequests", "purchaseOrders", "stocktakes"]) {
    for (const record of sample(name)) for (const line of record.lines) reference("products", line.sku);
  }
  for (const contract of sample("contracts")) reference("quotes", contract.quote);
  for (const order of sample("orders")) {
    if (order.contract) reference("contracts", order.contract);
    if (order.quote) reference("quotes", order.quote);
    assert(order.paid >= 0 && order.paid <= order.total);
    for (const line of order.lines) assert(line.held + line.shipped <= line.qty);
  }
  for (const name of ["reservations", "issues", "deliveries", "returns"]) {
    for (const record of sample(name)) reference("orders", record.order);
  }
  for (const payment of sample("payments")) assert(store.find("orders", payment.record) || store.find("contracts", payment.record));
  for (const approval of sample("approvals")) {
    reference({ discount: "quotes", payment: "payments", purchase: "purchaseRequests" }[approval.type], approval.ref);
  }
  for (const request of sample("purchaseRequests")) reference("suppliers", request.supplier);
  for (const order of sample("purchaseOrders")) { reference("purchaseRequests", order.request); reference("suppliers", order.supplier); }
  for (const receipt of sample("receipts")) { reference("purchaseOrders", receipt.po); reference("suppliers", receipt.supplier); }
  for (const delivery of sample("deliveries")) { reference("issues", delivery.issue); for (const line of delivery.items) reference("products", line.sku); }
  for (const returned of sample("returns")) { reference("deliveries", returned.delivery); reference("products", returned.sku); }
  for (const reservation of sample("reservations")) reference("products", reservation.sku);
  for (const movement of sample("movements")) reference("products", movement.sku);
  for (const product of sample("products")) assert(product.physical >= product.held + product.damaged);
  assert.doesNotThrow(() => store.validateState(store.state));
});

test("shared sample plan is pure, deterministic, collision-safe and uses current active account identities", () => {
  const state = seedState();
  state.collections.users = state.collections.users.map((user, index) => ({ ...user, id: `ACTIVE-${index}`, name: `Current operator ${index}` }));
  state.collections.users.unshift({ id: "INACTIVE", name: "Inactive operator", roleIds: ["director", "accountant", "sales_manager", "sales_staff", "warehouse_manager", "warehouse_staff"], status: "user_inactive" });
  const input = { collections: state.collections, users: state.collections.users, now: new Date("2026-11-21T12:00:00.000Z") };
  const before = structuredClone(input), plan = createSamplePlan(input);
  assert.deepEqual(input, before);
  assert.deepEqual(createSamplePlan(input), plan);
  const serialized = JSON.stringify({ collections: plan.collections, activity: plan.activity });
  assert(!serialized.includes("Inactive operator"));
  for (const user of state.collections.users.filter((user) => user.status === "user_active")) assert(serialized.includes(user.name), user.name);
  const collisionInput = structuredClone(input);
  for (const [name, records] of Object.entries(plan.collections)) {
    collisionInput.collections[name].push(...records.map(({ sampleSet, ...record }) => record));
  }
  const collisionPlan = createSamplePlan(collisionInput);
  assert.equal(collisionPlan.alreadyLoaded, false);
  for (const [name, records] of Object.entries(collisionPlan.collections)) {
    const key = COLLECTIONS[name].key, existing = new Set(collisionInput.collections[name].map((record) => record[key]));
    for (const record of records) assert(!existing.has(record[key]), `${name}: ${record[key]}`);
  }
  assert.equal(createSamplePlan({ ...input, collections: Object.fromEntries(Object.entries(input.collections).map(([name, records]) => [name, [...records, ...(plan.collections[name] || [])]])) }).alreadyLoaded, true);
});
