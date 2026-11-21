const ROLES = {
  director: { label: "Giám đốc", name: "Nguyễn Như Quỳnh", initials: "NQ", dept: "Ban Giám đốc" },
  accountant: { label: "Kế toán", name: "Nguyễn Thị Mỹ Hạnh", initials: "MH", dept: "Kế toán" },
  sales_manager: { label: "Quản lý bán hàng", name: "Phạm Hà Thu", initials: "HT", dept: "Kinh doanh" },
  sales_staff: { label: "Nhân viên bán hàng", name: "Phạm Thị Khánh Huyền", initials: "KH", dept: "Kinh doanh" },
  warehouse_manager: { label: "Quản lý kho", name: "Nguyễn Như Quỳnh", initials: "NQ", dept: "Kho" },
  warehouse_staff: { label: "Nhân viên kho", name: "Phạm Kim Ngân", initials: "KN", dept: "Kho" }
};
const ALL_ROLES = Object.keys(ROLES);
const NAV_GROUPS = [
  { label: "Không gian làm việc", items: [{ route: "dashboard", label: "Tổng quan", icon: "dashboard", roles: ALL_ROLES, match: ["dashboard"] }] },
  { label: "Danh mục", items: [
    { route: "customers", label: "Khách hàng", icon: "users", roles: ALL_ROLES.filter((role) => role !== "warehouse_staff"), match: ["customers"] },
    { route: "products", label: "Sản phẩm & giá bán", icon: "wine", roles: ALL_ROLES, match: ["products"] },
    { route: "accounts", label: "Nhân sự", icon: "user", roles: ["director"], match: ["accounts"] },
    { route: "roles", label: "Vai trò & quyền hạn", icon: "shield", roles: ["director"], match: ["roles"] }
  ] },
  { label: "Kinh doanh", items: [
    { route: "orders", label: "Đơn hàng", icon: "cart", roles: ALL_ROLES.filter((role) => role !== "warehouse_staff"), match: ["orders"] },
    { route: "quotes", label: "Báo giá", icon: "file", roles: ["director", "accountant", "sales_manager", "sales_staff"], match: ["quotes"] },
    { route: "approvals", label: "Phê duyệt", icon: "check-circle", roles: ["director", "accountant", "sales_manager"], match: ["approvals"], badge: "approvals" },
    { route: "contracts", label: "Hợp đồng", icon: "file-check", roles: ["director", "accountant", "sales_manager", "sales_staff"], match: ["contracts"] },
    { route: "payments", label: "Thanh toán & công nợ", icon: "card", roles: ["director", "accountant", "sales_manager", "sales_staff"], match: ["payments"] },
    { route: "documents", label: "Chứng từ", icon: "file", roles: ["director", "accountant", "sales_manager"], match: ["documents"] }
  ] },
  { label: "Kho hàng", items: [
    { route: "availability", label: "Tồn kho khả dụng", icon: "box", roles: ALL_ROLES, match: ["availability"] },
    { route: "reservations", label: "Giữ hàng", icon: "lock", roles: ALL_ROLES.filter((role) => role !== "accountant"), match: ["reservations"] },
    { route: "issues", label: "Phiếu xuất kho", icon: "package", roles: ALL_ROLES, match: ["issues"] },
    { route: "movements", label: "Thẻ kho", icon: "history", roles: ALL_ROLES.filter((role) => role !== "sales_staff"), match: ["movements"] },
    { route: "stocktakes", label: "Kiểm kê", icon: "clipboard", roles: ["director", "accountant", "warehouse_manager", "warehouse_staff"], match: ["stocktakes"], badge: "stocktake" }
  ] },
  { label: "Mua hàng & giao nhận", items: [
    { route: "suppliers", label: "Nhà cung cấp", icon: "building", roles: ["director", "accountant", "warehouse_manager"], match: ["suppliers"] },
    { route: "purchase-requests", label: "Yêu cầu mua", icon: "clipboard", roles: ["director", "accountant", "warehouse_manager"], match: ["purchase-requests"] },
    { route: "purchase-orders", label: "Đơn đặt hàng", icon: "file", roles: ["director", "accountant", "warehouse_manager"], match: ["purchase-orders"] },
    { route: "receipts", label: "Tiếp nhận hàng", icon: "truck", roles: ["director", "accountant", "warehouse_manager", "warehouse_staff"], match: ["receipts"] },
    { route: "deliveries", label: "Giao nhận", icon: "truck", roles: ALL_ROLES.filter((role) => role !== "warehouse_staff"), match: ["deliveries"] },
    { route: "returns", label: "Đổi trả", icon: "refresh", roles: ALL_ROLES.filter((role) => role !== "warehouse_staff"), match: ["returns"] }
  ] },
  { label: "Quản trị", items: [
    { route: "reports", label: "Báo cáo & phân tích", icon: "chart", roles: ["director", "accountant", "sales_manager", "warehouse_manager"], match: ["reports"] },
    { route: "audit", label: "Nhật ký hoạt động", icon: "history", roles: ["director", "accountant", "sales_manager"], match: ["audit"] },
    { route: "settings", label: "Cài đặt", icon: "settings", roles: ALL_ROLES, match: ["settings"] }
  ] }
];
const STATUS_META = {
  draft: { label: "Đang soạn", tone: "neutral" }, pending: { label: "Chờ duyệt", tone: "warning" },
  approved: { label: "Đã duyệt", tone: "success" }, confirmed: { label: "Đã xác nhận", tone: "success" },
  rejected: { label: "Từ chối", tone: "danger" }, expired: { label: "Hết hiệu lực", tone: "neutral" },
  converted: { label: "Đã chuyển hợp đồng", tone: "accent" }, checking: { label: "Chờ Kế toán kiểm tra", tone: "warning" },
  revision: { label: "Cần chỉnh sửa", tone: "danger" }, pending_sign: { label: "Chờ ký", tone: "warning" },
  signed: { label: "Đã ký", tone: "success" }, active: { label: "Đang thực hiện", tone: "info" },
  liquidated: { label: "Đã thanh lý", tone: "neutral" }, cancelled: { label: "Đã hủy", tone: "neutral" },
  holding: { label: "Đang giữ", tone: "info" }, pending_payment: { label: "Chờ thanh toán", tone: "warning" },
  eligible: { label: "Đủ điều kiện giữ", tone: "info" }, issued: { label: "Đã xuất kho", tone: "info" },
  shipping: { label: "Đang giao", tone: "info" }, completed: { label: "Hoàn tất", tone: "success" },
  failed: { label: "Giao thất bại", tone: "danger" }, overdue: { label: "Quá hạn", tone: "danger" },
  unpaid: { label: "Chưa thanh toán", tone: "neutral" }, deposit: { label: "Đã cọc", tone: "info" },
  partial: { label: "Thanh toán một phần", tone: "warning" }, paid: { label: "Đã thanh toán đủ", tone: "success" },
  due: { label: "Sắp đến hạn", tone: "warning" }, planned: { label: "Chưa giao", tone: "neutral" },
  delivered: { label: "Đã giao", tone: "success" }, counting: { label: "Đang đếm", tone: "warning" },
  reconciling: { label: "Chờ đối chiếu", tone: "warning" }, reported: { label: "Đã báo cáo", tone: "info" },
  adjustment: { label: "Chờ điều chỉnh", tone: "warning" }, returned: { label: "Đã trả lô", tone: "danger" },
  released: { label: "Đã nhả giữ", tone: "neutral" }, receiving: { label: "Đang tiếp nhận", tone: "warning" },
  pending_confirm: { label: "Chờ xác nhận", tone: "warning" }, inspecting: { label: "Đang kiểm tra", tone: "warning" },
  product_active: { label: "Đang kinh doanh", tone: "success" }, product_inactive: { label: "Ngừng kinh doanh", tone: "neutral" },
  user_active: { label: "Đang hoạt động", tone: "success" }, user_locked: { label: "Đã khóa", tone: "danger" },
  delivery_pending: { label: "Chờ giao", tone: "neutral" }, low: { label: "Dưới định mức", tone: "warning" },
  out: { label: "Cạn hàng", tone: "danger" }
};
const ENTITY_KEYS = ["customers", "products", "quotes", "orders", "contracts", "reservations", "approvals", "payments", "receipts", "purchaseRequests", "purchaseOrders", "suppliers", "deliveries", "returns", "documents", "issues", "movements", "stocktakes", "audit", "users"];
const state = {
  role: "director", activeUserId: "U-001", loggedIn: false, route: "dashboard", routeParam: "",
  collapsed: false, sidebarOpen: false, lastRefresh: "", attachments: {}, credentials: [],
  ...Object.fromEntries(ENTITY_KEYS.map((key) => [key, []]))
};
state.users = [
  { id: "U-001", name: "Nguyễn Như Quỳnh", email: "quynh.nguyen@soulwine.vn", phone: "", dept: "Ban Giám đốc", role: "Giám đốc / Quản lý kho", roleIds: ["director", "warehouse_manager"], status: "user_active" },
  { id: "U-002", name: "Nguyễn Thị Mỹ Hạnh", email: "hanh.nguyen@soulwine.vn", phone: "", dept: "Kế toán", role: "Kế toán", roleIds: ["accountant"], status: "user_active" },
  { id: "U-003", name: "Phạm Hà Thu", email: "thu.pham@soulwine.vn", phone: "", dept: "Kinh doanh", role: "Quản lý bán hàng", roleIds: ["sales_manager"], status: "user_active" },
  { id: "U-004", name: "Phạm Thị Khánh Huyền", email: "huyen.pham@soulwine.vn", phone: "", dept: "Kinh doanh", role: "Nhân viên bán hàng", roleIds: ["sales_staff"], status: "user_active" },
  { id: "U-005", name: "Phạm Kim Ngân", email: "ngan.pham@soulwine.vn", phone: "", dept: "Kho", role: "Nhân viên kho", roleIds: ["warehouse_staff"], status: "user_active" }
];

function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
function icon(name, className) { return `<svg class="icon${className ? " " + className : ""}" aria-hidden="true"><use href="#i-${name}"></use></svg>`; }
const formatter = new Intl.NumberFormat("vi-VN");
function num(value) { return formatter.format(Number(value) || 0); }
function money(value) { return `${num(value)} ₫`; }
function pct(value, digits = 1) { return `${Number(value).toFixed(digits).replace(".", ",")}%`; }
function productBySku(sku) { return state.products.find((item) => item.sku === sku); }
function customerById(id) { return state.customers.find((item) => item.id === id); }
function quoteByCode(code) { return state.quotes.find((item) => item.code === code); }
function orderByCode(code) { return state.orders.find((item) => item.code === code); }
function contractByCode(code) { return state.contracts.find((item) => item.code === code); }
function receiptByCode(code) { return state.receipts.find((item) => item.code === code); }
function stocktakeByCode(code) { return state.stocktakes.find((item) => item.code === code); }
function availableOf(product) { return Math.max(0, product.physical - product.held - product.damaged); }
function quoteTotals(quote) {
  let subtotal = 0, discount = 0, qty = 0;
  quote.lines.forEach((line) => { const product = productBySku(line.sku); if (!product) return; const gross = (line.price ?? product.wholesale) * line.qty; subtotal += gross; discount += Math.round(gross * ((line.discount || 0) / 100)); qty += line.qty; });
  return { subtotal, discount, total: subtotal - discount, qty };
}
function quoteLineTotal(line) { const product = productBySku(line.sku); const gross = (line.price ?? product.wholesale) * line.qty; return gross - Math.round(gross * ((line.discount || 0) / 100)); }
function orderPaidStatus(order) { return order.paid >= order.total ? "paid" : order.paid > 0 ? "partial" : "unpaid"; }
function orderEligible(order) {
  if (order.type === "Bán lẻ") return order.paid >= order.total;
  if (order.contract && !["signed", "active"].includes(contractByCode(order.contract)?.status)) return false;
  return order.paid > 0;
}
function orderEligibilityReason(order) {
  if (order.type === "Bán lẻ") return order.paid >= order.total ? "Đã thanh toán đủ 100%" : "Đơn bán lẻ cần thanh toán đủ 100% trước khi giữ hàng";
  if (order.contract && !["signed", "active"].includes(contractByCode(order.contract)?.status)) return "Hợp đồng chưa đủ chữ ký và hồ sơ";
  return order.paid > 0 ? "Đã có cọc/thanh toán theo hợp đồng" : "Chưa ghi nhận cọc hoặc thanh toán";
}
function arRecords() {
  const list = state.contracts.filter((contract) => contract.value > 0 && ["signed", "active", "liquidated"].includes(contract.status)).map((contract) => ({ id: contract.code, kind: "Hợp đồng", customerId: contract.customerId, total: contract.value, paid: contract.paid, remaining: Math.max(0, contract.value - contract.paid), due: contract.due, status: contract.paid >= contract.value ? "paid" : contract.paid > 0 ? "partial" : "unpaid", owner: contract.owner }));
  state.orders.filter((order) => order.type === "Bán lẻ" && order.total > order.paid && order.status !== "cancelled").forEach((order) => list.push({ id: order.code, kind: "Đơn bán lẻ", customerId: order.customerId, total: order.total, paid: order.paid, remaining: order.total - order.paid, due: order.created, status: "unpaid", owner: order.owner }));
  const today = new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Ho_Chi_Minh" }).split("/").reverse().join("-");
  list.forEach((record) => { if (record.remaining > 0 && record.kind === "Hợp đồng" && record.due?.split("/").reverse().join("-") < today) record.status = "overdue"; });
  return list;
}
function pendingApprovalsForRole(role) { return state.approvals.filter((item) => item.status === "pending" && item.assignee === role); }
function unreadNotifications() { return allowedNotifications().filter((item) => item.unread).length; }
function stockLock() { return state.stocktakes.find((item) => item.locked && item.status !== "completed"); }
function currentUser() {
  const user = state.users.find((item) => item.id === state.activeUserId);
  const role = ROLES[state.role];
  return { ...role, ...(user ? { name: user.name, initials: user.name.split(/\s+/).slice(-2).map((part) => part[0]).join("").toUpperCase() } : {}) };
}
function isRoleAllowed(roles) { return roles.includes(state.role); }
function statusChip(key, labelOverride) { const meta = STATUS_META[key] || { label: key, tone: "neutral" }; return `<span class="chip ${meta.tone}"><span class="dot"></span>${escapeHtml(labelOverride || meta.label)}</span>`; }
function productName(sku) { return productBySku(sku)?.name || sku; }
function customerName(id) { return customerById(id)?.name || id; }
function stockTone(product) { return availableOf(product) <= 0 ? "out" : availableOf(product) < product.min ? "low" : "ok"; }
function nowStamp() { return new Date().toLocaleString("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour12: false }).replace(",", "").slice(0, 16); }
function nowTime() { return new Date().toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false }); }
function addAudit(action, object, detail, tone = "info") {
  state.audit.unshift({ id: nextCode(state.audit, "id", "A-", 4), time: nowStamp(), timestamp: new Date().toISOString(), actorId: state.activeUserId, actor: currentUser().name, roleKey: state.role, role: currentUser().label, action, object, detail, tone });
}
function addMovement(type, sku, qty, physical, held, ref, note = "") {
  state.movements.unshift({ id: nextCode(state.movements, "id", "MV-", 4), time: nowStamp(), timestamp: new Date().toISOString(), sku, type, qty, physical, held, ref, by: state.activeUserId, user: currentUser().name, note });
}
