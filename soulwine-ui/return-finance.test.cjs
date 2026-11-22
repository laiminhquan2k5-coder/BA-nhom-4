const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

function fixture(kind = "undelivered") {
  const context = vm.createContext({ console, Intl, Date, structuredClone });
  for (const file of ["data.js", "workflows.js", "management.js", "views.js"]) {
    vm.runInContext(readFileSync(join(__dirname, file), "utf8"), context, { filename: file });
    if (file === "data.js") vm.runInContext("state.ui = {};", context);
  }
  vm.runInContext(`
    var form, error = "", notices = [], locked = false;
    var workspaceStatus = { conflict: false };
    state.settings = {};
    state.loggedIn = true;
    state.role = "warehouse_manager";
    state.activeUserId = "U-001";
    state.products = [{ sku: "SKU", name: "Wine", physical: 10, held: 0, damaged: 0 }];
    state.orders = [{ code: "ORDER", customerId: "CUSTOMER", type: "Bán lẻ", total: 100, paid: 100, status: "failed", lines: [{ sku: "SKU", qty: 4, shipped: 4, held: 0 }] }];
    state.deliveries = [{ code: "TRIP", order: "ORDER", status: "failed", items: [{ sku: "SKU", qty: 4 }], acceptedItems: [{ sku: "SKU", qty: 0 }] }];
    state.returns = [{ code: "RETURN", delivery: "TRIP", order: "ORDER", customerId: "CUSTOMER", sku: "SKU", qty: 4, receivedQty: 4, returnKind: "undelivered", status: "return_received", receivedAt: "2026-01-01T00:00:00.000Z" }];
    showForm = (title, fields, submit, options) => { form = { title, fields, submit, options }; };
    formError = (message) => { error = message; };
    toast = (message) => { notices.push(message); };
    closeDialog = () => {};
    render = () => {};
    persistWorkspace = () => true;
    syncIssueReadiness = () => {};
    stockLock = () => locked;
    productCell = (sku) => sku;
    pageHead = () => "";
    dataTable = (_, rows) => rows.map((row) => row.cells.join(" ")).join(" ");
    storeAttachments = async ([file], reference) => {
      const entry = { id: "FILE-" + (Object.keys(state.attachments).length + 1), name: file.name, type: file.type, size: file.size, content: "YWJj", reference };
      state.attachments[entry.id] = entry;
      if (typeof afterUpload === "function") afterUpload();
      return [entry];
    };
    var item = state.returns[0], delivery = state.deliveries[0], order = state.orders[0], product = state.products[0];
  `, context);
  if (kind === "customer") vm.runInContext('item.returnKind = "customer"; delivery.status = "delivered"; delivery.acceptedItems[0].qty = 4;', context);
  const run = (code) => vm.runInContext(code, context);
  const submit = (values) => {
    context.values = values;
    return run('error = ""; form.submit({ get: (key) => values[key] ?? null });');
  };
  return { context, run, submit, get error() { return run("error"); } };
}

const proof = { name: "proof.pdf", size: 3, type: "application/pdf" };
const financeInput = { reference: "FIN-01", note: "Verified external result", evidence: proof };
const resolutionInput = { evidenceId: "FILE-1", authorizationReference: "AUTHORIZED-01", note: "Financial resolution verified", authorized: "on", verified: "on" };

function post(f) {
  f.run('showReturnInspection("RETURN");');
  f.submit({ good: "3", damaged: "1", reason: "Inspection" });
  assert.equal(f.error, "");
}

function accountant(f) { f.run('state.role = "accountant"; state.activeUserId = "U-002";'); }

test("warehouse posting waits for finance, preserves stock/K06 stamps and cannot replay", () => {
  const f = fixture();
  post(f);
  assert.equal(f.run("item.status"), "return_finance_pending");
  assert.equal(f.run("returnStatus(item)"), "return_finance_pending");
  assert.equal(f.run("returnIsPosted(item)"), true);
  assert.equal(f.run("product.physical"), 14);
  assert.equal(f.run("product.damaged"), 1);
  assert.equal(f.run("availableOf(product)"), 13);
  assert.equal(f.run("order.lines[0].shipped"), 0);
  assert.equal(f.run("delivery.status"), "returned");
  assert.ok(f.run("item.postedAt"));
  assert.equal(f.run("item.receivedAt"), "2026-01-01T00:00:00.000Z");
  const before = f.run("JSON.stringify([product, order, delivery, state.movements])");
  f.submit({ good: "4", damaged: "0", reason: "Duplicate" });
  assert.ok(f.error);
  assert.equal(f.run("JSON.stringify([product, order, delivery, state.movements])"), before);
  assert.match(f.run("returnDetails(item).body"), /Chờ xử lý tài chính/);
  assert.doesNotMatch(f.run("viewReturns()"), />Hoàn tất</);
});

test("sold customer return never reverses previously delivered quantities", () => {
  const f = fixture("customer");
  post(f);
  assert.equal(f.run("order.lines[0].shipped"), 4);
  assert.equal(f.run("deliveryAcceptedQty(delivery, 'SKU')"), 4);
  assert.equal(f.run("item.status"), "return_finance_pending");
});

test("partial undelivered posting can continue while earlier receipt awaits finance", () => {
  const f = fixture();
  f.run('item.qty = item.receivedQty = 2; state.returns.push({ ...item, code: "RETURN-2" });');
  f.run('showReturnInspection("RETURN");');
  f.submit({ good: "1", damaged: "1", reason: "First part" });
  assert.equal(f.error, "");
  assert.equal(f.run("delivery.status"), "failed");
  f.run('showReturnInspection("RETURN-2");');
  f.submit({ good: "2", damaged: "0", reason: "Remainder" });
  assert.equal(f.error, "");
  assert.equal(f.run("product.physical"), 14);
  assert.equal(f.run("order.lines[0].shipped"), 0);
  assert.equal(f.run("delivery.status"), "returned");
});

test("stock lock and invalid classifications still block warehouse posting", () => {
  const f = fixture();
  f.run('showReturnInspection("RETURN"); locked = true;');
  f.submit({ good: "3", damaged: "1", reason: "Inspection" });
  assert.ok(f.error);
  f.run("locked = false;");
  f.submit({ good: "4", damaged: "1", reason: "Too many" });
  assert.ok(f.error);
  assert.equal(f.run("product.physical"), 10);
  assert.equal(f.run("state.movements.length"), 0);
});

test("finance evidence only and replacement evidence never complete the return", async () => {
  const f = fixture();
  post(f);
  f.run('showReturnResolutionEvidence("RETURN", "replacement");');
  await f.submit({ ...financeInput, reference: "REPLACE-01" });
  assert.equal(f.error, "");
  assert.equal(f.run("returnFinanciallyResolved(item)"), false);
  accountant(f);
  f.run('showReturnResolutionEvidence("RETURN", "finance");');
  await f.submit(financeInput);
  assert.equal(f.error, "");
  assert.equal(f.run("item.status"), "return_finance_pending");
  assert.equal(f.run("item.financialResolution"), undefined);
  assert.equal(f.run("state.payments.length"), 0);
  assert.equal(f.run("product.physical"), 14);
  f.run('showReturnResolutionEvidence("RETURN", "finance");');
  await f.submit({ ...financeInput, reference: "fin-01" });
  assert.ok(f.error);
  assert.equal(f.run("item.resolutionEvidence.length"), 2);
});

test("only explicit authorized accountant confirmation closes, without moving money or stock", async () => {
  const f = fixture();
  post(f);
  accountant(f);
  f.run('showReturnResolutionEvidence("RETURN", "finance");');
  await f.submit(financeInput);
  const before = f.run("JSON.stringify([product, order, delivery, state.payments, state.movements, item.postedAt, item.receivedAt])");
  f.run('showReturnFinanceResolution("RETURN");');
  f.submit({ ...resolutionInput, verified: null });
  assert.ok(f.error);
  assert.equal(f.run("item.status"), "return_finance_pending");
  f.submit({ ...resolutionInput, authorized: null });
  assert.ok(f.error);
  f.submit({ ...resolutionInput, authorizationReference: " " });
  assert.ok(f.error);
  f.submit(resolutionInput);
  assert.equal(f.error, "");
  assert.equal(f.run("returnStatus(item)"), "completed");
  assert.match(f.run("returnDetails(item).body"), />Hoàn tất</);
  assert.equal(f.run("JSON.stringify([product, order, delivery, state.payments, state.movements, item.postedAt, item.receivedAt])"), before);
  const saved = f.run("JSON.stringify(item.financialResolution)");
  f.submit(resolutionInput);
  assert.ok(f.error);
  assert.equal(f.run("JSON.stringify(item.financialResolution)"), saved);
  f.run('delete state.attachments["FILE-1"];');
  assert.equal(f.run("returnStatus(item)"), "return_finance_pending");
});

test("legacy completed without financial confirmation normalizes display and stays posted", () => {
  const f = fixture();
  f.run('item.status = "completed"; delete item.postedAt;');
  assert.equal(f.run("returnIsPosted(item)"), true);
  assert.equal(f.run("returnStatus(item)"), "return_finance_pending");
  assert.doesNotMatch(f.run("returnDetails(item).body"), />Hoàn tất</);
  f.run('form = undefined; showReturnInspection("RETURN");');
  assert.equal(f.run("form"), undefined);
  assert.equal(f.run("product.physical"), 10);
  assert.ok(f.run("deliveryReturnBlock(delivery)"));
  f.run('item.status = "inspecting"; state.movements.push({ type: "Hàng hoàn", ref: item.code });');
  assert.equal(f.run("returnIsPosted(item)"), true);
  assert.equal(f.run("returnStatus(item)"), "return_finance_pending");
});

test("non-accountants, stale actor and stale attachment cannot confirm finance", async () => {
  const f = fixture();
  post(f);
  f.run('form = undefined; showReturnFinanceResolution("RETURN");');
  assert.equal(f.run("form"), undefined);
  accountant(f);
  f.run('showReturnResolutionEvidence("RETURN", "finance");');
  await f.submit(financeInput);
  f.run('showReturnFinanceResolution("RETURN"); state.role = "warehouse_manager"; state.activeUserId = "U-001";');
  f.submit(resolutionInput);
  assert.ok(f.error);
  accountant(f);
  f.run('showReturnFinanceResolution("RETURN"); state.attachments["FILE-1"].reference = "OTHER";');
  f.submit(resolutionInput);
  assert.ok(f.error);
  assert.equal(f.run("item.status"), "return_finance_pending");
});

test("evidence upload role change is rejected and its attachment cleaned up", async () => {
  const f = fixture();
  post(f);
  accountant(f);
  f.run('showReturnResolutionEvidence("RETURN", "finance"); var afterUpload = () => { state.users[1].status = "user_locked"; };');
  await f.submit(financeInput);
  assert.ok(f.error);
  assert.equal(f.run("Object.keys(state.attachments).length"), 0);
  assert.equal(f.run("item.resolutionEvidence"), undefined);
});
