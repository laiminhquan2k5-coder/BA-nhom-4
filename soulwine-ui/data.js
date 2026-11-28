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
    { route: "returns", label: "Đổi trả", icon: "refresh", roles: ALL_ROLES, match: ["returns"] }
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
  delivery_pending: { label: "Chờ giao", tone: "neutral" }, delivery_partial: { label: "Giao một phần", tone: "warning" }, return_received: { label: "Đã nhận · Chờ nhập", tone: "warning" }, low: { label: "Dưới định mức", tone: "warning" },
  out: { label: "Cạn hàng", tone: "danger" }, return_finance_pending: { label: "Chờ xử lý tài chính", tone: "warning" }
};
const ENTITY_KEYS = ["customers", "products", "quotes", "orders", "contracts", "reservations", "approvals", "payments", "receipts", "purchaseRequests", "purchaseOrders", "suppliers", "deliveries", "returns", "documents", "issues", "movements", "stocktakes", "audit", "users"];
const state = {
  role: "director", activeUserId: "U-001", loggedIn: false, route: "dashboard", routeParam: "",
  collapsed: false, sidebarOpen: false, lastRefresh: "", attachments: {}, credentials: [],
  ...Object.fromEntries(ENTITY_KEYS.map((key) => [key, []]))
};
const WAREHOUSE_DEMO_ACCOUNT = { id: "U-THUKHO", name: "Thủ kho", email: "thukho@soulwine.vn", phone: "", dept: "Kho", role: "Quản lý kho", roleIds: ["warehouse_manager"], status: "user_active" };
state.users = [
  { id: "U-001", name: "Nguyễn Như Quỳnh", email: "quynh.nguyen@soulwine.vn", phone: "", dept: "Ban Giám đốc", role: "Giám đốc", roleIds: ["director"], status: "user_active" },
  { id: "U-002", name: "Nguyễn Thị Mỹ Hạnh", email: "hanh.nguyen@soulwine.vn", phone: "", dept: "Kế toán", role: "Kế toán", roleIds: ["accountant"], status: "user_active" },
  { id: "U-003", name: "Phạm Hà Thu", email: "thu.pham@soulwine.vn", phone: "", dept: "Kinh doanh", role: "Quản lý bán hàng", roleIds: ["sales_manager"], status: "user_active" },
  { id: "U-004", name: "Phạm Thị Khánh Huyền", email: "huyen.pham@soulwine.vn", phone: "", dept: "Kinh doanh", role: "Nhân viên bán hàng", roleIds: ["sales_staff"], status: "user_active" },
  { id: "U-005", name: "Phạm Kim Ngân", email: "ngan.pham@soulwine.vn", phone: "", dept: "Kho", role: "Nhân viên kho", roleIds: ["warehouse_staff"], status: "user_active" },
  structuredClone(WAREHOUSE_DEMO_ACCOUNT)
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
function returnIsPosted(item) {
  // Legacy completed records already changed stock; never replay their posting.
  return !!(item.postedAt || ["completed", "return_finance_pending"].includes(item.status) || state.movements.some((move) => move.type === "Hàng hoàn" && move.ref === item.code));
}
function returnFinanceEvidence(item) {
  return (item.resolutionEvidence || []).filter((entry) => {
    const file = state.attachments[entry.evidenceId];
    return entry.track === "finance" && entry.actorRole === "accountant" && !!entry.actorId && typeof entry.reference === "string" && !!entry.reference.trim() && entry.reference.length <= 120 && typeof entry.note === "string" && !!entry.note.trim() && entry.note.length <= 240 && Number.isFinite(Date.parse(entry.recordedAt)) && file?.reference === item.code && file.size > 0 && typeof file.content === "string" && !!file.content;
  });
}
function returnFinanciallyResolved(item) {
  const resolution = item.financialResolution;
  if (!returnIsPosted(item) || resolution?.status !== "resolved" || resolution.authorized !== true || resolution.verified !== true || resolution.actorRole !== "accountant" || !resolution.actorId || !Number.isFinite(Date.parse(resolution.resolvedAt))) return false;
  if (typeof resolution.authorizationReference !== "string" || !resolution.authorizationReference.trim() || resolution.authorizationReference.length > 120 || typeof resolution.note !== "string" || !resolution.note.trim() || resolution.note.length > 240) return false;
  const matches = returnFinanceEvidence(item).filter((entry) => entry.evidenceId === resolution.evidenceId && entry.reference === resolution.reference && Date.parse(entry.recordedAt) <= Date.parse(resolution.resolvedAt));
  return matches.length === 1 && (!item.postedAt || Date.parse(item.postedAt) <= Date.parse(resolution.resolvedAt));
}
function returnStatus(item) {
  return returnIsPosted(item) ? returnFinanciallyResolved(item) ? "completed" : "return_finance_pending" : item.status;
}
function availableOf(product) { return Math.max(0, product.physical - product.held - product.damaged); }
function quoteLineDiscount(line) {
  return line.discountAmount === undefined ? { mode: "percent", value: line.discount ?? 0 } : { mode: "fixed", value: line.discountAmount };
}
function quoteWholeDiscount(quote) { return quote.quoteDiscount ?? { mode: "percent", value: 0 }; }
function quoteDiscountValid({ mode, value }, basis) {
  return Number.isFinite(value) && value >= 0 && (mode === "percent" ? value <= 100 : mode === "fixed" && Number.isSafeInteger(value) && value <= basis);
}
function quoteDiscountVnd(discount, basis) {
  if (!quoteDiscountValid(discount, basis)) return 0;
  return discount.mode === "fixed" ? discount.value : Math.round(basis * (discount.value / 100));
}
function quoteDiscountLabel({ mode, value }) {
  if (!value) return "—";
  return mode === "fixed" ? money(value) : `${String(value).replace(".", ",")}%`;
}
function discountMoney(value) { return `${value ? "-" : ""}${money(value)}`; }
function quoteLineTotals(line) {
  const price = line.price ?? productBySku(line.sku)?.wholesale;
  const subtotal = (price ?? 0) * line.qty;
  const discount = quoteDiscountVnd(quoteLineDiscount(line), subtotal);
  return { price, subtotal, discount, total: subtotal - discount };
}
function quoteTotals(quote) {
  let subtotal = 0, lineDiscount = 0, qty = 0;
  for (const line of quote.lines) {
    const amounts = quoteLineTotals(line);
    subtotal += amounts.subtotal;
    lineDiscount += amounts.discount;
    qty += line.qty;
  }
  const afterLines = subtotal - lineDiscount;
  const wholeDiscount = quoteDiscountVnd(quoteWholeDiscount(quote), afterLines);
  return { subtotal, lineDiscount, afterLines, wholeDiscount, discount: lineDiscount + wholeDiscount, total: afterLines - wholeDiscount, qty };
}
function orderPaidStatus(order) { return order.paid >= order.total ? "paid" : order.paid > 0 ? "partial" : "unpaid"; }
function quoteIsExpired(quote) {
  if (quote.status === "expired") return true;
  if (!quote.validUntil) return true;
  const iso = isoDate(quote.validUntil);
  const day = new Date(`${iso}T12:00:00Z`);
  return !Number.isFinite(day.valueOf()) || day.toISOString().slice(0, 10) !== iso || iso < isoDate(todayText());
}
function quoteStatus(quote) {
  return !["draft", "rejected", "converted"].includes(quote.status) && quoteIsExpired(quote) ? "expired" : quote.status;
}
function orderEligible(order) {
  if (!order || order.status === "cancelled") return false;
  if (order.type === "Bán lẻ") return Number.isSafeInteger(order.total) && order.total > 0 && order.paid >= order.total;
  const contract = contractByCode(order.contract);
  if (!contract || !["signed", "active"].includes(contract.status) || !["50/50", "100%"].includes(contract.scheme) || !Number.isSafeInteger(contract.value) || contract.value <= 0) return false;
  return Number.isSafeInteger(contract.paid) && contract.paid >= (contract.scheme === "100%" ? contract.value : Math.ceil(contract.value / 2));
}
function orderEligibilityReason(order) {
  if (!order || order.status === "cancelled") return "Đơn không còn được thực hiện";
  if (order.type === "Bán lẻ") return orderEligible(order) ? "Đã thanh toán đủ 100%" : "Đơn bán lẻ cần thanh toán đủ 100% trước khi giữ hàng";
  const contract = contractByCode(order.contract);
  if (!contract || !["signed", "active"].includes(contract.status)) return "Hợp đồng chưa đủ chữ ký và hồ sơ";
  if (orderEligible(order)) return "Đã đủ cọc/thanh toán theo hợp đồng";
  if (contract.scheme === "100%") return "Hợp đồng yêu cầu thanh toán đủ 100% trước khi giữ hoặc xuất hàng";
  if (contract.scheme === "50/50") return "Hợp đồng yêu cầu khoản thu đợt đầu đủ 50% trước khi giữ hoặc xuất hàng";
  return "Chưa có phương án thanh toán hợp lệ";
}
function deliveredContractQty(contract, sku) {
  const shipmentIds = new Set(contract.shipments.map((shipment) => shipment.id));
  return state.deliveries.filter((delivery) => delivery.contract === contract.code && shipmentIds.has(delivery.shipmentId)).reduce((sum, delivery) => sum + deliveryAcceptedQty(delivery, sku), 0);
}
function canLiquidateContract(contract) {
  return contract?.status === "active" && contract.paid >= contract.value && contract.lines.length > 0 && contract.lines.every((line) => deliveredContractQty(contract, line.sku) >= line.qty);
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
function isStocktakeLocked(period) { return !!period.locked && !["completed", "cancelled"].includes(period.status); }
function isGroupStocktake(period) {
  return period.scopeType === "group" && typeof period.category === "string" && !!period.category.trim() && Array.isArray(period.lines) && period.lines.length > 0 && period.lines.every((line) => typeof line?.sku === "string" && line.sku.length > 0);
}
function stockLock(skuOrSkus) {
  const skus = skuOrSkus === undefined ? null : new Set(Array.isArray(skuOrSkus) ? skuOrSkus : [skuOrSkus]);
  if (skus && !skus.size) return;
  // Legacy periods have no structured scope; their existing lock stays warehouse-wide.
  return state.stocktakes.find((period) => isStocktakeLocked(period) && (!skus || !isGroupStocktake(period) || period.lines.some((line) => skus.has(line.sku))));
}
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
