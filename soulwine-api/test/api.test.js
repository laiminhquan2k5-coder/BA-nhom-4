import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server.js";
import { readSharedWorkspace } from "../src/store/shared-workspace.js";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "kilo", "soulwine-api-test-"));
let server;
let store;
let base;
const emails = {
  director: "quynh.nguyen@soulwine.vn",
  accountant: "hanh.nguyen@soulwine.vn",
  sales_manager: "thu.pham@soulwine.vn",
  sales_staff: "huyen.pham@soulwine.vn",
  warehouse_manager: "quynh.nguyen@soulwine.vn",
  warehouse_staff: "ngan.pham@soulwine.vn"
};
const initialPasswords = {
  "quynh.nguyen@soulwine.vn": "SW-Giamdoc@2026",
  "hanh.nguyen@soulwine.vn": "SW-Ketoan@2026",
  "thu.pham@soulwine.vn": "SW-Banhang@2026",
  "huyen.pham@soulwine.vn": "SW-Nvbanhang@2026",
  "ngan.pham@soulwine.vn": "SW-Kho@2026"
};
const accountPassword = {};
const recoveryMessages = [];
const passwordFor = (role) => accountPassword[emails[role]] ?? initialPasswords[emails[role]];

async function api(method, requestPath, { token, body } = {}) {
  const response = await fetch(`${base}${requestPath}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}

async function login(role, { selectRole = false } = {}) {
  const result = await api("POST", "/api/auth/login", { body: { email: emails[role], password: passwordFor(role) } });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const token = result.data.token;
  if (selectRole && result.data.selectRole) {
    const selected = await api("POST", "/api/auth/session", { token, body: { role } });
    assert.equal(selected.status, 200, JSON.stringify(selected.data));
  }
  return token;
}

async function establish(role, newPassword) {
  const initial = passwordFor(role);
  const first = await api("POST", "/api/auth/login", { body: { email: emails[role], password: initial } });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  const change = await api("POST", "/api/auth/change-password", { token: first.data.token, body: { currentPassword: initial, newPassword, confirm: newPassword } });
  assert.equal(change.status, 200, JSON.stringify(change.data));
  accountPassword[emails[role]] = newPassword;
  const token = change.data.token;
  const selected = await api("POST", "/api/auth/session", { token, body: { role } });
  assert.equal(selected.status, 200, JSON.stringify(selected.data));
  return token;
}

before(async () => {
  const app = createApp(dataDir, { logging: false, recoveryMailer: async (message) => { recoveryMessages.push(message); } });
  store = app.store;
  server = app.server;
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  store.saveSnapshot();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("SoulWine API", () => {
  it("khởi động và cung cấp health check", async () => {
    const health = await api("GET", "/api/health");
    assert.equal(health.status, 200);
    assert.equal(health.data.ok, true);
  });

  it("từ chối sai mật khẩu, ghi nhật ký từng lần và khóa tài khoản sau 5 lần", async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const result = await api("POST", "/api/auth/login", { body: { email: emails.director, password: "SaiMatKhau1" } });
      if (attempt < 4) {
        assert.equal(result.status, 401);
        assert.match(result.data.message, /Còn \d+ lần thử/);
      } else {
        assert.equal(result.status, 423);
        assert.match(result.data.message, /tạm khóa/);
      }
    }
    const credential = store.find("credentials", "U-001");
    assert.equal(credential.failedAttempts, 5);
    assert.equal(credential.locked, true);
    const failedChanges = store.journal.filter((event) => event.action === "auth.login" && event.status === 401 && event.entity === "credentials");
    assert.equal(failedChanges.length, 4);
    assert.ok(failedChanges.every((event) => event.changes && event.changes.failedAttempts));
    const failedNotes = store.journal.filter((event) => event.action === "auth.login" && event.kind === "activity" && event.status === 401);
    assert.equal(failedNotes.length, 4);
    const lockedNotes = store.journal.filter((event) => event.kind === "activity" && /tạm khóa/.test(event.summary || ""));
    assert.ok(lockedNotes.length >= 1);
  });

  it("khôi phục quyền truy cập qua OTP: quên mật khẩu → mã OTP → đặt lại → đăng nhập", async () => {
    const forgot = await api("POST", "/api/auth/forgot", { body: { email: emails.director } });
    assert.equal(forgot.status, 200);
    const { to, code } = recoveryMessages.at(-1);
    assert.equal(to, emails.director);
    assert.match(code, /^\d{6}$/);
    assert.equal(Object.hasOwn(store.list("outbox").at(-1), "code"), false);
    assert.equal((await api("POST", "/api/auth/reset-password", { body: { email: emails.director, code: "000000", newPassword: "Kh0iPhuc@2026" } })).status, 400);
    assert.equal((await api("POST", "/api/auth/reset-password", { body: { email: emails.director, code, newPassword: "Kh0iPhuc@2026" } })).status, 200);
    assert.equal((await api("POST", "/api/auth/login", { body: { email: emails.director, password: "SW-Giamdoc@2026" } })).status, 401);
    const recovered = await api("POST", "/api/auth/login", { body: { email: emails.director, password: "Kh0iPhuc@2026" } });
    assert.equal(recovered.status, 200);
    assert.equal(recovered.data.mustChange, false);
    assert.equal(store.find("credentials", "U-001").locked, false);
    accountPassword[emails.director] = "Kh0iPhuc@2026";
    const otpNote = store.journal.filter((event) => event.kind === "activity" && /khôi phục quyền truy cập thành công/i.test(event.summary || ""));
    assert.ok(otpNote.length >= 1);
  });

  it("yêu cầu chọn vai trò sau đăng nhập và đổi mật khẩu thu hồi phiên khác", async () => {
    const noRole = await api("GET", "/api/stock", { token: await login("director") });
    assert.equal(noRole.status, 403);
    assert.equal(noRole.data.code, "role_required");
    const token = await establish("director", "GiamDocMoi@2026");
    const wrongCurrent = await api("POST", "/api/auth/change-password", { token, body: { currentPassword: "SaiHienTai1", newPassword: "DoiLan2@2026", confirm: "DoiLan2@2026" } });
    assert.equal(wrongCurrent.status, 400);
    const secondSession = await login("director", { selectRole: true });
    const change = await api("POST", "/api/auth/change-password", { token, body: { currentPassword: "GiamDocMoi@2026", newPassword: "DoiLan2@2026", confirm: "DoiLan2@2026" } });
    assert.equal(change.status, 200);
    const revoked = await api("GET", "/api/stock", { token: secondSession });
    assert.equal(revoked.status, 401);
    accountPassword[emails.director] = "DoiLan2@2026";
  });

  it("ghi nhận yêu cầu trái quyền vào nhật ký (request.rejected)", async () => {
    const salesToken = await establish("sales_staff", "NhanVien@2026");
    const denied = await api("POST", "/api/products", { token: salesToken, body: { sku: "SW-XXX", name: "Sai quyền", retail: 1, wholesale: 1, min: 0 } });
    assert.equal(denied.status, 403);
    const rejected = store.journal.filter((event) => event.action === "request.rejected" && (event.summary || "").includes("/api/products"));
    assert.ok(rejected.length >= 1);
    assert.equal(rejected.at(-1).status, 403);
  });

  it("tạo danh mục: sản phẩm, khách hàng, nhà cung cấp kèm nhật ký before/after", async () => {
    const director = await login("director", { selectRole: true });
    const product = await api("POST", "/api/products", { token: director, body: { sku: "SW-100", name: "Vang đỏ kiểm thử", category: "Vang đỏ", unit: "Chai", retail: 1000000, wholesale: 800000, min: 5, origin: "Pháp", volume: "750 ml", abv: "13%" } });
    assert.equal(product.status, 200, JSON.stringify(product.data));
    assert.equal((await api("POST", "/api/products", { token: director, body: { sku: "SW-100", name: "Trùng SKU", retail: 1, wholesale: 1, min: 0 } })).status, 409);
    const customer = await api("POST", "/api/customers", { token: director, body: { name: "Công ty khách hàng kiểm thử", type: "Bán sỉ", phone: "0912000001", address: "Hà Nội" } });
    assert.equal(customer.status, 200);
    const supplier = await api("POST", "/api/suppliers", { token: director, body: { name: "Nhà cung cấp kiểm thử", contact: "Nguyễn Văn A", phone: "0987600001", terms: "30 ngày" } });
    assert.equal(supplier.status, 200);
    const createEvent = [...store.journal].reverse().find((event) => event.action === "products.create" && event.key === "SW-100");
    assert.equal(createEvent.before, null);
    assert.equal(createEvent.after.name, "Vang đỏ kiểm thử");
    assert.equal(createEvent.actor.name, "Nguyễn Như Quỳnh");
    assert.equal(createEvent.actor.role, "director");
    assert.ok(createEvent.requestId);
  });

  it("chuỗi mua hàng: yêu cầu mua đủ hai phê duyệt → đơn đặt hàng → tiếp nhận nhập kho tăng tồn", async () => {
    const manager = await establish("warehouse_manager", "QuanLyKho@2026");
    const accountant = await establish("accountant", "KeToanMoi@2026");
    const director = await login("director", { selectRole: true });
    assert.equal((await api("PUT", "/api/settings", { token: director, body: { rules: { receiptTolerance: 5 } } })).status, 200);
    const request = await api("POST", "/api/purchase-requests", { token: manager, body: { supplier: "NCC-001", note: "Bổ sung tồn phục vụ hợp đồng", needed: "2026-12-01", lines: [{ sku: "SW-100", qty: 10, price: 500000 }] } });
    assert.equal(request.status, 200, JSON.stringify(request.data));
    const approvals = store.list("approvals").filter((item) => item.ref === request.data.code);
    assert.equal(approvals.length, 2);
    const accountantApproval = approvals.find((item) => item.assignee === "accountant");
    const directorApproval = approvals.find((item) => item.assignee === "director");
    assert.equal((await api("POST", `/api/approvals/${directorApproval.id}/decide`, { token: director, body: { approve: true } })).status, 200);
    assert.equal(store.find("purchaseRequests", request.data.code).status, "pending");
    assert.equal((await api("POST", `/api/approvals/${accountantApproval.id}/decide`, { token: accountant, body: { approve: true } })).status, 200);
    assert.equal(store.find("purchaseRequests", request.data.code).status, "approved");
    const po = await api("POST", "/api/purchase-orders", { token: manager, body: { request: request.data.code, receiveDate: "2026-11-21", terms: "Thanh toán 30 ngày" } });
    assert.equal(po.status, 200);
    const receipt = await api("POST", "/api/receipts", { token: manager, body: { po: po.data.code } });
    assert.equal(receipt.status, 200);
    assert.equal((await api("POST", `/api/receipts/${receipt.data.code}/confirm`, { token: manager })).status, 400);
    assert.equal((await api("POST", `/api/receipts/${receipt.data.code}/evidence`, { token: manager, body: { fileName: "phieu-giao.pdf" } })).status, 200);
    assert.equal((await api("PUT", `/api/receipts/${receipt.data.code}/counts`, { token: manager, body: { lines: { "SW-100": { received: 20, good: 20, damaged: 0 } } } })).status, 200);
    assert.equal((await api("POST", `/api/receipts/${receipt.data.code}/confirm`, { token: manager })).status, 400);
    assert.equal((await api("PUT", `/api/receipts/${receipt.data.code}/counts`, { token: manager, body: { lines: { "SW-100": { received: 10, good: 10, damaged: 0 } } } })).status, 200);
    assert.equal((await api("POST", `/api/receipts/${receipt.data.code}/confirm`, { token: manager })).status, 200);
    assert.equal(store.find("products", "SW-100").physical, 10);
    const movements = store.list("movements").filter((movement) => movement.type === "Nhập kho" && movement.sku === "SW-100");
    assert.equal(movements.length, 1);
    assert.equal(movements[0].qty, 10);
  });

  it("báo giá → phê duyệt → hợp đồng đủ chữ ký → đơn thực hiện → thanh toán", async () => {
    const sales = await establish("sales_manager", "QuanLyBan@2026");
    const director = await login("director", { selectRole: true });
    const accountant = await login("accountant");
    const quote = await api("POST", "/api/quotes", { token: sales, body: { customerId: "KH-001", lines: [{ sku: "SW-100", qty: 8, price: 800000 }], note: "Giao 1 đợt" } });
    assert.equal(quote.status, 200, JSON.stringify(quote.data));
    assert.equal((await api("POST", `/api/quotes/${quote.data.code}/submit`, { token: sales, body: {} })).status, 400);
    const submit = await api("POST", `/api/quotes/${quote.data.code}/submit`, { token: sales, body: { confirmed: "Email khách đồng ý 20/11" } });
    assert.equal(submit.status, 200);
    assert.equal(submit.data.status, "pending");
    const approval = store.list("approvals").find((item) => item.ref === quote.data.code);
    assert.equal(approval.assignee, "director");
    assert.equal((await api("POST", `/api/approvals/${approval.id}/decide`, { token: sales, body: { approve: true } })).status, 403);
    assert.equal((await api("POST", `/api/approvals/${approval.id}/decide`, { token: director, body: { approve: false, reason: "" } })).status, 400);
    assert.equal((await api("POST", `/api/approvals/${approval.id}/decide`, { token: director, body: { approve: true } })).status, 200);
    assert.equal(store.find("quotes", quote.data.code).status, "approved");
    const contract = await api("POST", "/api/contracts", { token: sales, body: { fromQuote: quote.data.code, scheme: "50/50", due: "2026-12-31" } });
    assert.equal(contract.status, 200, JSON.stringify(contract.data));
    assert.equal((await api("POST", `/api/contracts/${contract.data.code}/checklist/customerConfirm`, { token: sales, body: {} })).status, 200);
    assert.equal((await api("POST", `/api/contracts/${contract.data.code}/checklist/directorSign`, { token: director, body: {} })).status, 400);
    assert.equal((await api("POST", `/api/contracts/${contract.data.code}/checklist/accountantCheck`, { token: accountant, body: {} })).status, 200);
    assert.equal((await api("POST", `/api/contracts/${contract.data.code}/checklist/directorSign`, { token: director, body: {} })).status, 200);
    assert.equal((await api("POST", `/api/contracts/${contract.data.code}/checklist/customerSign`, { token: sales, body: {} })).status, 200);
    assert.equal((await api("POST", `/api/contracts/${contract.data.code}/checklist/scan`, { token: sales, body: {} })).status, 400);
    assert.equal((await api("POST", `/api/contracts/${contract.data.code}/checklist/scan`, { token: sales, body: { fileName: "hop-dong-da-ky.pdf" } })).status, 200);
    assert.equal(store.find("contracts", contract.data.code).status, "active");
    assert.equal((await api("POST", `/api/contracts/${contract.data.code}/shipments`, { token: sales, body: { date: "2026-11-25", items: { "SW-100": 8 } } })).status, 200);
    const order = await api("POST", `/api/contracts/${contract.data.code}/order`, { token: sales });
    assert.equal(order.status, 200);
    assert.equal(order.data.status, "pending_payment");
    const payment = await api("POST", "/api/payments", { token: accountant, body: { record: contract.data.code, amount: 3200000, method: "Chuyển khoản", reference: "FT-001", fileName: "chung-tu.pdf" } });
    assert.equal(payment.status, 200, JSON.stringify(payment.data));
    assert.equal(payment.data.status, "confirmed");
    assert.equal(store.find("contracts", contract.data.code).paid, 3200000);
    assert.equal(store.find("orders", order.data.code).status, "eligible");
  });

  it("giữ hàng chặn vượt tồn, khóa kiểm kê chặn nhập xuất, xuất kho và giao hàng hoàn tất đơn", async () => {
    const manager = await login("warehouse_manager", { selectRole: true });
    const sales = await login("sales_manager");
    const order = store.list("orders").find((item) => item.type === "Bán sỉ");
    assert.equal((await api("POST", `/api/orders/${order.code}/reserve`, { token: manager, body: { sku: "SW-100", qty: 11 } })).status, 400);
    const reserve = await api("POST", `/api/orders/${order.code}/reserve`, { token: manager, body: { sku: "SW-100", qty: 8, note: "Đợt 1" } });
    assert.equal(reserve.status, 200, JSON.stringify(reserve.data));
    assert.equal(store.find("products", "SW-100").held, 8);
    assert.equal(store.find("orders", order.code).status, "holding");
    const stocktake = await api("POST", "/api/stocktakes", { token: manager, body: { scope: "Toàn kho" } });
    assert.equal(stocktake.status, 200);
    const lockedReserve = await api("POST", `/api/orders/${order.code}/reserve`, { token: manager, body: { sku: "SW-100", qty: 1 } });
    assert.equal(lockedReserve.status, 403);
    assert.equal(lockedReserve.data.code, "stock_locked");
    assert.equal((await api("POST", `/api/orders/${order.code}/issue`, { token: manager })).status, 403);
    const period = stocktake.data;
    assert.equal((await api("POST", `/api/stocktakes/${period.code}/counts`, { token: manager, body: { sku: "SW-100", count: 10 } })).status, 200);
    assert.equal((await api("POST", `/api/stocktakes/${period.code}/finish`, { token: manager })).status, 200);
    assert.equal((await api("POST", `/api/stocktakes/${period.code}/complete`, { token: manager })).status, 200);
    assert.equal(store.find("stocktakes", period.code).locked, false);
    const issue = await api("POST", `/api/orders/${order.code}/issue`, { token: manager });
    assert.equal(issue.status, 200, JSON.stringify(issue.data));
    assert.equal(store.find("products", "SW-100").physical, 2);
    assert.equal(store.find("products", "SW-100").held, 0);
    assert.equal(store.find("orders", order.code).status, "issued");
    const delivery = store.list("deliveries").find((item) => item.order === order.code);
    assert.equal(delivery.status, "delivery_pending");
    assert.equal((await api("POST", `/api/deliveries/${delivery.code}/schedule`, { token: sales, body: { carrier: "Vận chuyển nội bộ", planned: "2026-11-25", fee: 100000, payer: "Khách hàng", address: "Hà Nội" } })).status, 200);
    assert.equal((await api("POST", `/api/deliveries/${delivery.code}/result`, { token: sales, body: { result: "delivered", receivedAt: new Date(Date.now() - 1000).toISOString(), fileName: "bien-ban.pdf" } })).status, 200);
    assert.equal(store.find("orders", order.code).status, "completed");
    assert.equal(store.find("contracts", order.contract).shipments[0].status, "delivered");
  });

  it("truy vấn nhật ký: lọc, phân trang, chi tiết before/after và xuất CSV", async () => {
    const director = await login("director", { selectRole: true });
    const audit = await api("GET", "/api/audit?entity=orders&pageSize=5", { token: director });
    assert.equal(audit.status, 200);
    assert.ok(audit.data.total >= 3);
    assert.ok(audit.data.events.length <= 5);
    assert.ok(audit.data.events.every((event) => event.entity === "orders"));
    assert.ok(!audit.data.events.some((event) => event.entity === "sessions"));
    const createEvent = [...store.journal].reverse().find((event) => event.action === "products.create" && event.key === "SW-100");
    const detail = await api("GET", `/api/audit/${createEvent.seq}`, { token: director });
    assert.equal(detail.status, 200);
    assert.equal(detail.data.after.name, "Vang đỏ kiểm thử");
    const csv = await fetch(`${base}/api/audit/export`, { headers: { Authorization: `Bearer ${director}` } });
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get("content-type"), /text\/csv/);
    assert.match(await csv.text(), /products\.create/);
    assert.equal((await api("GET", "/api/audit", { token: await login("warehouse_staff") })).status, 403);
  });

  it("khôi phục trạng thái: mở lại server cùng thư mục dữ liệu giữ nguyên state và journal", async () => {
    const revision = store.state.revision;
    const journalLength = store.journal.length;
    await new Promise((resolve) => server.close(resolve));
    const reopened = createApp(dataDir, { logging: false });
    store = reopened.store;
    server = reopened.server;
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    assert.equal(store.state.revision, revision);
    assert.equal(store.journal.length, journalLength);
    assert.equal(store.find("products", "SW-100").physical, 2);
    assert.equal(store.list("orders").find((item) => item.type === "Bán sỉ").status, "completed");
    const director = await login("director", { selectRole: true });
    const stock = await api("GET", "/api/stock", { token: director });
    assert.equal(stock.status, 200);
    assert.equal(stock.data.items.find((item) => item.sku === "SW-100").physical, 2);
  });

  it("Giám đốc cấp lại mật khẩu và mở khóa tài khoản bị khóa", async () => {
    const director = await login("director", { selectRole: true });
    for (let attempt = 0; attempt < 5; attempt++) await api("POST", "/api/auth/login", { body: { email: emails.sales_staff, password: "SaiLanNay1" } });
    assert.equal(store.find("credentials", "U-004").locked, true);
    assert.equal((await api("POST", "/api/users/U-004/unlock", { token: director })).status, 200);
    assert.equal(store.find("credentials", "U-004").locked, false);
    assert.equal((await api("POST", "/api/users/U-004/password", { token: director, body: { password: "CapLai@2026", mustChange: true } })).status, 200);
    const firstLogin = await api("POST", "/api/auth/login", { body: { email: emails.sales_staff, password: "CapLai@2026" } });
    assert.equal(firstLogin.status, 200);
    assert.equal(firstLogin.data.mustChange, true);
    assert.ok(store.journal.some((event) => event.kind === "activity" && /cấp lại mật khẩu/.test(event.summary || "")));
  });

  it("đồng bộ workspace dùng chung: yêu cầu phiên, kiểm soát phiên bản và ghi nhật ký", async () => {
    assert.equal((await api("GET", "/api/workspace")).status, 401);
    assert.equal((await api("PUT", "/api/workspace", { body: { version: 1, baseRevision: 0, data: {} } })).status, 401);
    const director = await login("director", { selectRole: true });
    const empty = await api("GET", "/api/workspace", { token: director });
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.data, { exists: false, revision: 0, savedAt: null });
    const blob = { users: [{ id: "U-001" }], settings: { organization: { name: "SoulWine" } }, note: "bản dùng chung kiểm thử" };
    const first = await api("PUT", "/api/workspace", { token: director, body: { version: 1, baseRevision: 0, data: blob } });
    assert.equal(first.status, 200, JSON.stringify(first.data));
    assert.equal(first.data.revision, 1);
    const stale = await api("PUT", "/api/workspace", { token: director, body: { version: 1, baseRevision: 0, data: blob } });
    assert.equal(stale.status, 409);
    assert.equal(stale.data.code, "workspace_conflict");
    assert.equal(stale.data.details.currentRevision, 1);
    assert.equal((await api("PUT", "/api/workspace", { token: director, body: { version: 2, baseRevision: 1, data: blob } })).status, 400);
    assert.equal((await api("PUT", "/api/workspace", { token: director, body: { version: 1, baseRevision: -1, data: blob } })).status, 400);
    const accountant = await login("accountant");
    const meta = await api("GET", "/api/workspace?meta=1", { token: accountant });
    assert.equal(meta.status, 200);
    assert.deepEqual(meta.data, { exists: true, revision: 1, savedAt: first.data.savedAt });
    const full = await api("GET", "/api/workspace", { token: accountant });
    assert.equal(full.status, 200);
    assert.equal(full.data.version, 1);
    assert.equal(full.data.revision, 1);
    assert.equal(full.data.data.note, "bản dùng chung kiểm thử");
    const second = await api("PUT", "/api/workspace", { token: accountant, body: { version: 1, baseRevision: 1, data: { ...blob, note: "kế toán cập nhật" } } });
    assert.equal(second.status, 200);
    assert.equal(second.data.revision, 2);
    const syncEvents = store.journal.filter((event) => event.action === "workspace.sync");
    assert.equal(syncEvents.length, 2);
    assert.ok(syncEvents.every((event) => event.kind === "activity" && /bản dữ liệu dùng chung/.test(event.summary || "")));
    assert.ok(syncEvents.every((event) => event.entity === "sharedWorkspace" && !event.changes));
    const reopened = createApp(dataDir, { logging: false });
    reopened.store.refresh();
    assert.equal(readSharedWorkspace(reopened.store).revision, 2);
    reopened.store.close();
  });
});
