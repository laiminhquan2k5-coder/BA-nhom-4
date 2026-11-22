const viewElement = document.getElementById("view");
let activeDialog = null;
let lastDialogFocus = null;
let activePopover = "";
let popoverTrigger = null;
let searchSelection = 0;
let searchResults = [];
let lastSearchFocus = null;
let lastRenderedHash = location.hash || "#/dashboard";

function toast(message, tone = "success") {
  const element = document.createElement("div");
  element.className = `toast ${tone}`;
  element.setAttribute("role", tone === "error" ? "alert" : "status");
  if (tone === "success" && (workspaceStatus.error || workspaceStatus.conflict)) { tone = "warning"; message += " Thay đổi chưa được lưu trên thiết bị; kiểm tra trạng thái lưu trữ."; }
  element.className = `toast ${tone}`;
  element.innerHTML = `${icon(tone === "error" || tone === "warning" ? "alert" : tone === "info" ? "file" : "check-circle")}<span>${escapeHtml(message)}</span><button class="toast-close" aria-label="Đóng thông báo">${icon("x")}</button>`;
  document.getElementById("toast-root").append(element);
  element.querySelector("button").addEventListener("click", () => element.remove());
  let timer = setTimeout(() => element.remove(), tone === "error" ? 12000 : 6500);
  element.addEventListener("mouseenter", () => clearTimeout(timer));
  element.addEventListener("mouseleave", () => timer = setTimeout(() => element.remove(), 4000));
}

function navigate(route) {
  if (activeDialog?.dirty && !activeDialog.submitting) return requestDiscard(() => { closeDialog(true); navigate(route); });
  if (state.ui.settingsDirty) return requestSettingsDiscard(() => navigate(route));
  const hash = route.startsWith("#") ? route : `#/${route}`;
  closePopover();
  closeSearch();
  closeDialog(true);
  state.sidebarOpen = false;
  if (location.hash === hash) render();
  else location.hash = hash;
}

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  try {
    return { route: parts[0] || "dashboard", param: decodeURIComponent(parts.slice(1).join("/")) };
  } catch {
    return { route: "not-found", param: "" };
  }
}

function routeAllowed(route) {
  return NAV_GROUPS.some((group) => group.items.some((item) => item.route === route && item.roles.includes(state.role)));
}

function renderShell() {
  document.getElementById("shell").classList.toggle("collapsed", state.collapsed);
  document.getElementById("shell").classList.toggle("sidebar-open", state.sidebarOpen);
  document.getElementById("menu-btn").setAttribute("aria-expanded", String(innerWidth <= 980 ? state.sidebarOpen : !state.collapsed));
  document.getElementById("nav").innerHTML = NAV_GROUPS.map((group) => {
    const items = group.items.filter((item) => item.roles.includes(state.role));
    if (!items.length) return "";
    return `<div class="nav-group"><div class="nav-label"><span>${escapeHtml(group.label)}</span></div>${items.map((item) => {
      const active = item.match.includes(state.route);
      let badge = "";
      if (item.badge === "approvals") {
        const count = pendingApprovalsForRole(state.role).length;
        if (count) badge = `<span class="nav-badge">${count}</span>`;
      }
      if (item.badge === "stocktake" && stockLock()) badge = '<span class="nav-badge lock">Khóa</span>';
      return `<a class="nav-item ${active ? "active" : ""}" href="#/${item.route}" title="${escapeHtml(item.label)}" ${active ? 'aria-current="page"' : ""}>${icon(item.icon)}<span class="nav-item-text">${escapeHtml(item.label)}</span>${badge}</a>`;
    }).join("")}</div>`;
  }).join("");
  const user = currentUser();
  document.getElementById("user-initials").textContent = user.initials;
  document.getElementById("user-role").textContent = user.label;
  document.getElementById("user-name").textContent = user.name;
  const badge = document.getElementById("notif-count");
  badge.textContent = unreadNotifications();
  badge.classList.toggle("hidden", !unreadNotifications());
  document.getElementById("login-screen").classList.toggle("hidden", state.loggedIn);
  renderLoginScreen();
  document.documentElement.dataset.density = state.settings.display.density;
  renderStorageStatus();
  document.getElementById("shell").inert = !state.loggedIn || !!activeDialog;
}

function render(preserveScroll = false) {
  const scroll = window.scrollY;
  const { route, param } = parseRoute();
  if (state.route !== route || state.routeParam !== param) {
    state.ui.contractTab = "overview";
    state.ui.stocktakeTab = "count";
  }
  state.route = route;
  state.routeParam = param;
  syncCustomerBalances();
  recalculateNotifications();
  persistWorkspace();
  renderShell();
  const pages = {
    dashboard: viewDashboard,
    orders: () => param ? viewOrderDetail(param) : viewOrders(),
    quotes: () => param ? viewQuoteBuilder(param) : viewQuotes(),
    contracts: () => param ? viewContractDetail(param) : viewContracts(),
    availability: viewAvailability,
    reservations: viewReservations,
    payments: viewPayments,
    approvals: viewApprovals,
    receipts: () => param ? viewReceiptDetail(param) : viewReceipts(),
    stocktakes: () => param ? viewStocktakeDetail(param) : viewStocktakes(),
    customers: viewCustomers,
    products: viewProducts,
    reports: viewReports,
    audit: viewAudit,
    suppliers: viewSuppliers,
    "purchase-requests": viewPurchaseRequests,
    "purchase-orders": viewPurchaseOrders,
    deliveries: viewDeliveries,
    returns: viewReturns,
    documents: viewDocuments,
    issues: viewIssues,
    movements: viewMovements,
    accounts: viewAccounts,
    roles: viewRoles,
    settings: viewSettings
  };
  try {
    viewElement.innerHTML = workspaceStatus.error === "corrupt" ? storageRecoveryView() : !routeAllowed(route) && pages[route] ? permissionView() : (pages[route] || viewNotFound)();
  } catch (error) {
    console.error("Không thể hiển thị màn hình", error);
    viewElement.innerHTML = `${pageHead({ title: "Chưa thể mở nội dung" })}<section class="card">${emptyState("alert", "Có lỗi khi hiển thị dữ liệu", "Các dữ liệu đã lưu không bị thay đổi. Thử mở lại nội dung hoặc tải bản sao lưu để kiểm tra.", '<button class="btn btn-primary" data-action="retry-view">Thử lại</button><button class="btn btn-secondary" data-action="backup-workspace">Tải bản sao lưu</button>')}</section>`;
  }
  viewElement.querySelectorAll("[data-action]").forEach((element) => {
    const roles = actionRoles(element.dataset.action);
    if (roles && !roles.includes(state.role)) {
      element.disabled = true;
      element.title = roles.length ? `Thao tác thuộc quyền ${roles.map((role) => ROLES[role].label).join(" / ")}.` : "Thao tác đã bị tắt trong ma trận quyền.";
    }
  });
  if (route === "quotes" && param) lockQuoteEditor();
  if (route === "stocktakes" && param) {
    const record = stocktakeByCode(param);
    viewElement.querySelectorAll("[data-st-field]").forEach((input) => input.disabled = !["warehouse_manager", "warehouse_staff"].includes(state.role) || record?.status !== "counting");
  }
  if (route === "receipts" && param) viewElement.querySelectorAll("[data-rc-field]").forEach((input) => input.disabled = !["warehouse_manager", "warehouse_staff"].includes(state.role) || receiptByCode(param)?.status !== "receiving");
  enhanceAccessibility(viewElement);
  decorateTables(viewElement);
  lastRenderedHash = location.hash || "#/dashboard";
  renderStorageStatus();
  const title = viewElement.querySelector("h1")?.textContent || "SoulWine";
  document.title = `${title} | SoulWine`;
  if (preserveScroll) window.scrollTo(0, scroll);
  else {
    window.scrollTo(0, 0);
    viewElement.focus({ preventScroll: true });
  }
}

function enhanceAccessibility(root) {
  root.querySelectorAll(".field").forEach((field, index) => {
    const label = field.querySelector("label");
    const control = field.querySelector("input, select, textarea");
    if (!label || !control) return;
    if (!control.id) control.id = `field-${root.id || "ui"}-${index}`;
    label.htmlFor = control.id;
  });
  root.querySelectorAll("button, a.btn").forEach((element) => {
    if (!element.textContent.trim() && !element.hasAttribute("aria-label")) {
      element.setAttribute("aria-label", element.title || (element.dataset.action?.startsWith("open-") ? "Xem chi tiết" : "Mở bản ghi"));
    }
  });
  root.querySelectorAll("input,select,textarea").forEach((element) => {
    if (element.hasAttribute("aria-label") || element.labels?.length) return;
    const column = element.closest("td");
    const row = element.closest("tr");
    const table = element.closest("table");
    const heading = column && table ? table.querySelectorAll("thead th")[column.cellIndex]?.textContent : "";
    element.setAttribute("aria-label", [heading, row?.querySelector("td")?.textContent?.trim(), element.placeholder].filter(Boolean).join(" · ") || "Chọn giá trị");
  });
  root.querySelectorAll("[data-href]").forEach((row) => { row.tabIndex = 0; row.setAttribute("role", "link"); row.setAttribute("aria-label", `Mở ${row.querySelector("td")?.textContent.trim() || "chi tiết"}`); });
}

function openPopover(kind, anchor, body, className = "") {
  if (activePopover === kind) return closePopover();
  activePopover = kind;
  popoverTrigger = anchor;
  const root = document.getElementById("popover-root");
  root.innerHTML = `<div class="popover ${className}">${body}</div>`;
  const element = root.firstElementChild;
  element.setAttribute("role", "dialog");
  element.setAttribute("aria-label", kind === "roles" ? "Hồ sơ và vai trò" : kind === "notifications" ? "Thông báo" : "Tạo mới nhanh");
  const rect = anchor.getBoundingClientRect();
  element.style.top = `${rect.bottom + 8}px`;
  element.style.left = `${Math.max(12, Math.min(innerWidth - element.offsetWidth - 12, rect.right - element.offsetWidth))}px`;
  anchor.setAttribute("aria-expanded", "true");
  anchor.setAttribute("aria-haspopup", "dialog");
  element.querySelector("button:not([disabled]),a[href]")?.focus();
}

function closePopover(restoreFocus = false) {
  activePopover = "";
  document.getElementById("popover-root").innerHTML = "";
  ["quick-btn", "role-btn", "notif-btn"].forEach((id) => document.getElementById(id).setAttribute("aria-expanded", "false"));
  if (restoreFocus && popoverTrigger?.isConnected) popoverTrigger.focus();
}

function showRoles() {
  const user = state.users.find((item) => item.id === state.activeUserId);
  openPopover("roles", document.getElementById("role-btn"), `<div class="profile-menu-head"><strong>${escapeHtml(currentUser().name)}</strong><small>${escapeHtml(user?.email || currentUser().dept)}</small></div><div class="menu-label">Vai trò được phân công</div>${(user?.roleIds || [state.role]).map((key) => `<button class="menu-item ${key === state.role ? "active" : ""}" data-role="${key}">${icon("user")}<span>${ROLES[key].label}</span>${key === state.role ? '<span class="menu-check">Đang dùng</span>' : ""}</button>`).join("")}<div class="menu-divider"></div><button class="menu-item" data-action="change-password">${icon("shield")}Đổi mật khẩu</button><button class="menu-item" data-action="open-help">${icon("help")}Trợ giúp sử dụng</button><button class="menu-item" data-action="logout">${icon("logout")}Đăng xuất</button>`, "wide");
}

function showQuickCreate() {
  const items = [
    ["new-quote", "file", "Tạo báo giá"],
    ["new-order", "cart", "Tạo đơn bán lẻ"],
    ["new-customer", "users", "Thêm khách hàng"],
    ["open-payment", "card", "Ghi nhận thanh toán"]
  ].filter(([action]) => !ACTION_ROLES[action] || ACTION_ROLES[action].includes(state.role));
  openPopover("quick", document.getElementById("quick-btn"), `<div class="menu-label">Tạo mới nhanh</div>${items.map(([action, glyph, label]) => `<button class="menu-item" data-action="${action}">${icon(glyph)}${label}</button>`).join("") || '<div class="menu-label">Không có thao tác tạo cho vai trò này</div>'}`);
}

function showNotifications() {
  const items = allowedNotifications();
  openPopover("notifications", document.getElementById("notif-btn"), `<div class="notif-head"><span class="notif-title">Thông báo <span class="muted small">(${items.filter((item) => item.unread).length} chưa đọc)</span></span><button class="link-btn" data-action="mark-all-read" ${!items.length ? "disabled" : ""}>Đọc tất cả</button></div><div class="notif-list">${items.length ? items.map((item) => `<button class="notif-item ${item.unread ? "unread" : ""}" data-notif="${item.id}"><span class="notif-dot ${item.unread ? "" : "read"}"></span><span class="notif-main"><span class="notif-text">${escapeHtml(item.title)}</span><span class="notif-time">${escapeHtml(item.time)}</span></span></button>`).join("") : emptyState("bell", "Bạn đã cập nhật mọi thông tin", "Các thông báo liên quan đến vai trò sẽ xuất hiện tại đây.")}<a class="notification-settings" href="#/settings">Cấu hình thông báo</a></div>`, "notifications");
}

function syncOverlayState() {
  const searchOpen = !document.getElementById("search-overlay").classList.contains("hidden");
  document.body.classList.toggle("no-scroll", !!activeDialog || searchOpen || !state.loggedIn);
  document.getElementById("shell").inert = !!activeDialog || searchOpen || !state.loggedIn;
  document.getElementById("login-screen").inert = !!activeDialog;
}

function closeDialog(force = false) {
  if (!activeDialog) return true;
  if (!force && activeDialog.dirty && !activeDialog.submitting) { requestDiscard(() => closeDialog(true)); return false; }
  activeDialog = null;
  ["overlay-root", "drawer-root", "modal-root"].forEach((id) => document.getElementById(id).innerHTML = "");
  syncOverlayState();
  if (lastDialogFocus?.isConnected) lastDialogFocus.focus();
  return true;
}

function showDialog(options) {
  const previousFocus = document.activeElement;
  closePopover();
  if (!closeDialog()) return;
  lastDialogFocus = previousFocus;
  activeDialog = options;
  const head = `<div><h2 class="drawer-title" id="dialog-title">${escapeHtml(options.title)}</h2>${options.subtitle ? `<p class="drawer-sub">${escapeHtml(options.subtitle)}</p>` : ""}</div><button class="icon-btn" data-action="close-dialog" aria-label="Đóng">${icon("x")}</button>`;
  if (options.drawer) {
    document.getElementById("overlay-root").innerHTML = '<div class="drawer-overlay" data-dismiss-dialog></div>';
    document.getElementById("drawer-root").innerHTML = `<section class="drawer ${options.wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div class="drawer-head">${head}</div><div class="drawer-body">${options.body}</div>${options.footer ? `<div class="drawer-foot">${options.footer}</div>` : ""}</section>`;
  } else {
    document.getElementById("modal-root").innerHTML = `<div class="modal" data-dismiss-dialog><section class="modal-card ${options.small ? "sm" : ""}" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div class="modal-head">${head}</div><div class="modal-body">${options.body}</div>${options.footer ? `<div class="modal-foot">${options.footer}</div>` : ""}</section></div>`;
  }
  const dialog = document.querySelector('[aria-labelledby="dialog-title"]');
  enhanceAccessibility(dialog);
  syncOverlayState();
  requestAnimationFrame(() => (dialog.querySelector("input:not([type=hidden]),select,textarea") || dialog.querySelector("button")).focus());
}

function showForm(title, fields, onSubmit, options = {}) {
  showDialog({
    title,
    subtitle: options.subtitle || "Hoàn thiện các trường bắt buộc trước khi lưu.",
    drawer: options.drawer !== false,
    body: `<form id="action-form" novalidate>${fields}<div class="banner danger hidden mt-16" id="form-error" role="alert" tabindex="-1"></div></form>`,
    footer: `<button class="btn btn-secondary" data-action="close-dialog">Hủy</button><button class="btn btn-primary" type="submit" form="action-form">${icon("check")}${escapeHtml(options.submitLabel || "Lưu")}</button>`,
    submit: onSubmit,
    input: options.input
  });
  if (options.input) options.input();
}

function formError(message) {
  const element = document.getElementById("form-error");
  if (element) {
    element.classList.remove("hidden");
    element.textContent = message;
    element.focus();
  } else toast(message, "error");
  return false;
}

function confirmAction(title, message, confirm, danger = false, confirmLabel = "Xác nhận") {
  showDialog({
    title,
    small: true,
    body: `<p class="small muted">${escapeHtml(message)}</p>`,
    footer: `<button class="btn btn-secondary" data-action="close-dialog">Hủy</button><button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-action="confirm-dialog">${escapeHtml(confirmLabel)}</button>`,
    confirm
  });
}

function openSearch() {
  if (!state.loggedIn || activeDialog) return;
  closePopover();
  lastSearchFocus = document.activeElement;
  document.getElementById("search-overlay").classList.remove("hidden");
  const input = document.getElementById("search-input");
  input.value = "";
  searchSelection = 0;
  renderSearch("");
  syncOverlayState();
  input.focus();
}

function closeSearch() {
  const wasOpen = !document.getElementById("search-overlay").classList.contains("hidden");
  document.getElementById("search-overlay").classList.add("hidden");
  syncOverlayState();
  if (wasOpen && lastSearchFocus?.isConnected) lastSearchFocus.focus({ preventScroll: true });
}

function renderSearch(query) {
  const index = [];
  NAV_GROUPS.forEach((group) => group.items.filter((item) => item.roles.includes(state.role)).forEach((item) => index.push({ title: item.label, subtitle: group.label, route: item.route, glyph: item.icon })));
  state.orders.forEach((item) => index.push({ title: item.code, subtitle: customerName(item.customerId), route: `orders/${encodeURIComponent(item.code)}`, glyph: "cart" }));
  state.quotes.forEach((item) => index.push({ title: item.code, subtitle: customerName(item.customerId), route: `quotes/${encodeURIComponent(item.code)}`, glyph: "file" }));
  state.contracts.forEach((item) => index.push({ title: item.code, subtitle: customerName(item.customerId), route: `contracts/${encodeURIComponent(item.code)}`, glyph: "file-check" }));
  state.customers.forEach((item) => index.push({ title: item.name, subtitle: `${item.id} · ${item.phone}`, route: "customers", glyph: "users", customer: item.id }));
  state.products.forEach((item) => index.push({ title: item.name, subtitle: item.sku, route: "products", glyph: "wine", sku: item.sku }));
  const normalize = (text) => text.toLocaleLowerCase("vi").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
  const term = normalize(query.trim());
  searchResults = index.filter((item) => routeAllowed(item.route.split("/")[0]) && (!term || normalize(`${item.title} ${item.subtitle}`).includes(term))).slice(0, 18);
  searchSelection = Math.min(searchSelection, Math.max(0, searchResults.length - 1));
  document.getElementById("search-results").innerHTML = searchResults.length ? `<div class="search-group-label">${term ? "Kết quả tìm kiếm" : "Truy cập nhanh"}</div>${searchResults.map((item, position) => `<button class="search-result ${position === searchSelection ? "active" : ""}" data-search-index="${position}"><span class="search-result-icon">${icon(item.glyph)}</span><span class="search-result-main"><span class="search-result-title">${escapeHtml(item.title)}</span><span class="search-result-sub">${escapeHtml(item.subtitle)}</span></span>${icon("arrow-right")}</button>`).join("")}` : '<div class="search-empty">Không tìm thấy kết quả. Thử mã đơn, tên khách hàng hoặc SKU.</div>';
}

function chooseSearch(index) {
  const item = searchResults[index];
  if (!item) return;
  navigate(item.route);
  if (item.customer) setTimeout(() => showCustomer(item.customer), 0);
  if (item.sku) setTimeout(() => showProduct(item.sku), 0);
}

function refreshList(kind) {
  const renderers = {
    orders: () => ordersTableHtml(filteredOrders()),
    quotes: () => quoteTableHtml(filteredQuotes()),
    contracts: () => contractTableHtml(filteredContracts()),
    customers: () => customersTableHtml(filteredCustomers()),
    products: () => productsTableHtml(filteredProducts()),
    availability: () => availabilityTableHtml(filteredAvailability()),
    audit: () => auditTableHtml(filteredAudit()),
    movements: () => movementsTableHtml(filteredMovements())
  };
  const target = document.getElementById(`${kind}-table`);
  if (target && renderers[kind]) {
    target.parentElement.querySelectorAll(".pagination").forEach((element) => element.remove());
    target.innerHTML = renderers[kind]();
    enhanceAccessibility(target);
    Object.keys(state.ui.tableViews || {}).filter((key) => key.startsWith(`${state.route}:${state.routeParam}:`)).forEach((key) => delete state.ui.tableViews[key]);
    decorateTables(target);
    const footer = target.parentElement.querySelector(".table-footer");
    if (footer) {
      const rows = target.querySelectorAll("tbody tr");
      const count = target.querySelector(".empty-state") ? 0 : rows.length;
      footer.firstElementChild.textContent = `${count} bản ghi phù hợp với bộ lọc`;
      const totalFunctions = { orders: () => filteredOrders().reduce((sum, item) => sum + item.total, 0), quotes: () => filteredQuotes().reduce((sum, item) => sum + quoteTotals(item).total, 0), contracts: () => filteredContracts().reduce((sum, item) => sum + item.value, 0), customers: () => filteredCustomers().reduce((sum, item) => sum + item.ar, 0) };
      if (totalFunctions[kind]) footer.lastElementChild.textContent = `Tổng đang xem: ${money(totalFunctions[kind]())}`;
    }
  }
}

function canUseReport(roles) {
  return state.loggedIn && roles.includes(state.role) && state.users.some((user) => user.id === state.activeUserId && user.status === "user_active" && user.roleIds?.includes(state.role));
}

function canViewInventoryReport() { return canUseReport(["director", "accountant", "warehouse_manager"]); }
function canExportApprovalHistory() { return canUseReport(["director", "accountant"]); }

const inventoryDayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" });
const inventoryReportFields = ["opening", "initialized", "incoming", "outgoing", "adjustment", "closing"];
const inventoryReportColumns = ["SKU", "Sản phẩm", "Nhóm sản phẩm", "Tồn đầu", "Số dư khởi tạo", "Nhập", "Xuất", "Điều chỉnh", "Tồn cuối"];
const inventoryBalanceNote = "Tồn đầu + số dư khởi tạo + nhập (gồm hàng hoàn) − xuất + điều chỉnh = tồn cuối. Ngày giao dịch theo giờ Việt Nam; tính cả ngày bắt đầu và ngày kết thúc.";

function validReportDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}

function inventoryLocalDay(date) { return inventoryDayFormat.format(date).split("/").reverse().join("-"); }

function inventoryMoveDay(move) {
  for (const stamp of [move.timestamp, move.at, move.time]) {
    if (typeof stamp !== "string") continue;
    const legacy = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s|$)/.exec(stamp);
    const date = legacy ? `${legacy[3]}-${legacy[2]}-${legacy[1]}` : stamp.slice(0, 10);
    if (!validReportDay(date)) continue;
    if (!legacy && /T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(stamp)) {
      const instant = new Date(stamp);
      if (Number.isFinite(+instant)) return inventoryLocalDay(instant);
    } else if (legacy || stamp === date || /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(stamp)) return date;
  }
  return "";
}

function inventoryReport() {
  const { from = "", to = "", category = "" } = state.ui.inventoryReportFilter || {};
  const categories = [...new Set(state.products.map((product) => product.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi"));
  const rows = state.products.filter((product) => !category || product.category === category).map((product) => ({ product, after: 0, initialized: 0, incoming: 0, outgoing: 0, adjustment: 0, incomplete: false }));
  const bySku = new Map(rows.map((row) => [row.product.sku, row]));
  const hasPeriod = Boolean(from || to);
  for (const move of state.movements) {
    const row = bySku.get(move.sku);
    if (!row) continue;
    const isInitialization = move.type === "Tồn đầu kỳ" || (move.type === "Nhập kho" && move.note === "Số dư đầu kỳ");
    const field = isInitialization ? "initialized" : ["Nhập kho", "Hàng hoàn"].includes(move.type) ? "incoming" : move.type === "Xuất kho" ? "outgoing" : "adjustment";
    const legacyDelta = field === "outgoing" ? -Math.abs(move.qty) : field !== "adjustment" || move.type === "Điều chỉnh tồn" ? move.qty : 0;
    const delta = move.physicalDelta ?? legacyDelta;
    if (delta === 0) continue;
    const day = hasPeriod ? inventoryMoveDay(move) : "";
    if (!Number.isSafeInteger(delta) || (hasPeriod && !day)) { row.incomplete = true; continue; }
    if (from && day < from) continue;
    if (to && day > to) row.after += delta;
    else row[field] += field === "outgoing" ? -delta : delta;
  }

  // Roll back the live physical balance past the end date, then undo just the in-period movement.
  for (const row of rows) {
    row.closing = row.product.physical - row.after;
    row.opening = row.closing - row.initialized - row.incoming + row.outgoing - row.adjustment;
    row.incomplete ||= !Number.isSafeInteger(row.opening) || !Number.isSafeInteger(row.closing) || row.opening < 0 || row.closing < 0;
  }
  const incomplete = rows.some((row) => row.incomplete);
  const totals = Object.fromEntries(inventoryReportFields.map((field) => [field, incomplete ? null : rows.reduce((sum, row) => sum + row[field], 0)]));
  const formatDay = (value) => value.split("-").reverse().join("/");
  const range = !hasPeriod ? "Toàn bộ thời gian" : `${from ? `Từ ${formatDay(from)}` : "Từ đầu dữ liệu"} ${to ? `đến ${formatDay(to)}` : "đến hiện tại"}`;
  const filters = `Kỳ: ${range} · Nhóm sản phẩm: ${category || "Tất cả"}`;
  const notes = [inventoryBalanceNote];
  if (incomplete) notes.push("Không thể đối chiếu các SKU đánh dấu ‘—’ do biến động kho thiếu dữ liệu hoặc số dư không hợp lệ. Tổng kỳ được ẩn khi còn SKU chưa đối chiếu được.");
  const cells = rows.map((row) => [row.product.sku, row.product.name, row.product.category || "—", ...inventoryReportFields.map((field) => row.incomplete ? "—" : row[field])]);
  return { from, to, category, categories, rows, totals, filters, notes, cells };
}

function inventoryReportView(report) {
  const { from, to, category, categories, rows, totals, filters, notes, cells } = report;
  const snapshot = (value) => value === null ? "—" : num(value);
  const products = rows.map((row) => row.product);
  const skuSet = new Set(products.map((product) => product.sku));
  const low = products.filter((product) => availableOf(product) < product.min);
  const holding = state.reservations.filter((reservation) => reservation.status === "holding" && skuSet.has(reservation.sku));
  const slow = slowMovingInventory(category);
  return `<div class="card-body">
    <form id="inventory-report-filters" class="form-grid three mb-16">
      <div class="field"><label for="inventory-report-from">Từ ngày</label><input class="input" id="inventory-report-from" name="from" type="date" value="${escapeHtml(from)}"></div>
      <div class="field"><label for="inventory-report-to">Đến ngày</label><input class="input" id="inventory-report-to" name="to" type="date" value="${escapeHtml(to)}"></div>
      <div class="field"><label for="inventory-report-category">Nhóm sản phẩm</label><select class="select" id="inventory-report-category" name="category"><option value="">Tất cả nhóm</option>${categories.map((name) => `<option value="${escapeHtml(name)}" ${category === name ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></div>
      <button class="btn btn-primary" type="submit">Áp dụng bộ lọc</button>
    </form>
    <p class="hint mb-12">Bộ lọc đang áp dụng cho bảng và tệp xuất: ${escapeHtml(filters)} · ${rows.length} SKU</p>
    <div class="stat-strip mb-16">${[["Tồn đầu kỳ", "opening"], ["Nhập trong kỳ", "incoming"], ["Xuất trong kỳ", "outgoing"], ["Tồn cuối kỳ", "closing"]].map(([label, field]) => `<div><div class="label">${label}</div><div class="value">${snapshot(totals[field])}</div></div>`).join("")}</div>
    ${notes.map((note) => `<p class="hint mb-12">${escapeHtml(note)}</p>`).join("")}
    ${dataTable(inventoryReportColumns.map((label, index) => ({ label, align: index >= 3 ? "num" : "" })), cells.map((row) => ({ cells: row.map((value) => typeof value === "number" ? num(value) : escapeHtml(value)) })), { minWidth: 980, empty: emptyState("box", "Không có SKU trong bộ lọc", "Đổi nhóm sản phẩm để xem dữ liệu.") })}
    ${rows.length ? `<p class="hint mt-24 mb-12">Thông tin tồn hiện tại của nhóm đang chọn, không tính theo kỳ báo cáo và không đưa vào tệp xuất.</p>
    <div class="grid grid-even">
      <div>${card({ title: "Sản phẩm dưới định mức hiện tại", iconName: "alert", body: low.length ? `<div class="rule-list">${low.map((product) => `<div class="rule-item">${productCell(product.sku)}<strong>${num(availableOf(product))} / ${num(product.min)}</strong></div>`).join("")}</div>` : emptyState("shield", "Không có SKU dưới định mức", "Cảnh báo được tính từ tồn khả dụng hiện tại.") })}</div>
      <div>${card({ title: "Hàng hiện đang giữ theo đơn", iconName: "lock", body: holding.length ? `<div class="bar-list">${holding.map((reservation) => `<div class="bar-row"><span class="bar-label">${escapeHtml(reservation.order)} · ${escapeHtml(productName(reservation.sku))}</span><span class="bar-value">${num(reservation.qty)}</span></div>`).join("")}</div>` : emptyState("lock", "Chưa có hàng đang giữ", "Chỉ tính hàng đang giữ của nhóm được chọn.") })}</div>
    </div>` : ""}
    <div class="mt-24">${card({ title: "Hàng chậm luân chuyển", iconName: "clock", body: `<div class="flex gap-8 flex-wrap mb-16"><label for="slow-moving-days">Thời gian không xuất</label><select class="select-sm" id="slow-moving-days" data-slow-moving-days>${[30, 60, 90, 180].map((days) => `<option value="${days}" ${slow.minimum === days ? "selected" : ""}>≥ ${days} ngày không xuất</option>`).join("")}</select></div>${dataTable([{ label: "Sản phẩm" }, { label: "Tồn vật lý", align: "num" }, { label: "Xuất gần nhất" }, { label: "Số ngày", align: "num" }], slow.rows.map((row) => ({ cells: [productCell(row.product.sku), num(row.product.physical), row.lastOut ? escapeHtml(displayDate(row.lastOut)) : "Chưa xuất", num(row.days)] })), { minWidth: 650, empty: emptyState("clock", "Không có sản phẩm phù hợp", "Chỉ tính SKU còn tồn thuộc nhóm đã chọn và đủ số ngày không xuất.") })}<p class="hint mt-12">Theo tồn hiện tại và ngày xuất gần nhất. SKU chưa xuất được tính từ mốc nhập đầu tiên; SKU thiếu mốc ngày không được tự gán số ngày.</p>` })}</div>
  </div>`;
}

function reportExportActions(action, enabled = true) {
  const disabled = enabled ? "" : " disabled";
  return `<button type="button" class="btn btn-secondary" data-action="${action}"${disabled}>${icon("download")} Xuất Excel (.xlsx)</button><button type="button" class="btn btn-secondary" data-action="${action}-pdf"${disabled}>${icon("file")} In / Lưu PDF</button>`;
}

function zipReportParts(parts) {
  const encoder = new TextEncoder();
  const files = [], directory = [];
  let offset = 0, directorySize = 0;
  for (const [path, contents] of Object.entries(parts)) {
    const name = encoder.encode(path), data = encoder.encode(contents);
    let crc = -1;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc = ~crc;

    // ZIP local file and central directory headers, using the store (uncompressed) method.
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(12, 33, true);
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true); local.setUint16(26, name.length, true);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true); entry.setUint16(4, 20, true); entry.setUint16(6, 20, true); entry.setUint16(14, 33, true);
    entry.setUint32(16, crc, true); entry.setUint32(20, data.length, true); entry.setUint32(24, data.length, true); entry.setUint16(28, name.length, true); entry.setUint32(42, offset, true);
    files.push(local.buffer, name, data);
    directory.push(entry.buffer, name);
    offset += 30 + name.length + data.length;
    directorySize += 46 + name.length;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, directory.length / 2, true); end.setUint16(10, directory.length / 2, true);
  end.setUint32(12, directorySize, true); end.setUint32(16, offset, true);
  return new Blob([...files, ...directory, end.buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function reportWorkbook({ title, filters, notes = [], columns, rows }) {
  const xml = (value) => escapeHtml(String(value ?? "").replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, ""));
  const sheetColumns = columns.map((label, index) => {
    const width = rows.reduce((max, row) => Math.max(max, Math.min(48, String(row[index] ?? "").length + 2)), Math.max(10, label.length + 2));
    return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
  }).join("");
  const sheetRows = [[title], ...(filters ? [[filters]] : []), ...notes.map((note) => [note]), [], columns, ...rows];
  const sheetData = sheetRows.map((row, index) => `<row r="${index + 1}">${row.map((value, column) => {
    const ref = `${String.fromCharCode(65 + column)}${index + 1}`;
    // Inline strings are never interpreted as Excel formulas, even when they start with '='.
    return typeof value === "number" && Number.isFinite(value) ? `<c r="${ref}"><v>${value}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  }).join("")}</row>`).join("");
  const spreadsheet = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const officeRelationships = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const packageRelationships = "http://schemas.openxmlformats.org/package/2006/relationships";
  return zipReportParts({
    "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    "_rels/.rels": `<Relationships xmlns="${packageRelationships}"><Relationship Id="rId1" Type="${officeRelationships}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<workbook xmlns="${spreadsheet}" xmlns:r="${officeRelationships}"><sheets><sheet name="Báo cáo" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="${packageRelationships}"><Relationship Id="rId1" Type="${officeRelationships}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": `<worksheet xmlns="${spreadsheet}"><cols>${sheetColumns}</cols><sheetData>${sheetData}</sheetData></worksheet>`
  });
}

function printReport({ title, filters, notes = [], columns, rows }) {
  const popup = window.open("", "_blank");
  if (!popup) return toast("Trình duyệt đã chặn cửa sổ in. Cho phép cửa sổ bật lên rồi thử lại.", "warning");
  popup.opener = null;
  const text = escapeHtml;
  popup.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${text(title)}</title><style>
    body{font:13px/1.5 'Segoe UI',sans-serif;color:#211d4f;margin:24px}h1{margin:8px 0}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border:1px solid #999;padding:6px;text-align:left;overflow-wrap:anywhere}th{background:#eeecf5}.num{text-align:right}button{padding:8px 12px;cursor:pointer}
    @page{size:A4 landscape;margin:12mm}@media print{body{margin:0}button{display:none}thead{display:table-header-group}tr{break-inside:avoid}}
    </style></head><body><b>${text(state.settings.organization.name)}</b><h1>${text(title)}</h1>
    ${filters ? `<p>${text(filters)}</p>` : ""}${notes.map((note) => `<p>${text(note)}</p>`).join("")}
    <p>Ngày xuất: ${text(nowStamp())} · ${rows.length} bản ghi</p><button type="button" onclick="window.print()">In / Lưu thành PDF</button>
    <table><thead><tr>${columns.map((column) => `<th scope="col">${text(column)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((value) => typeof value === "number" ? `<td class="num">${num(value)}</td>` : `<td>${text(value)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`);
  popup.document.close();
}

function exportReportDocument(action, format) {
  let data;
  if (action === "export-inventory") {
    if (!canViewInventoryReport()) return toast("Bạn không có quyền xuất báo cáo tồn kho.", "warning");
    const report = inventoryReport();
    data = { title: "Nhập - xuất - tồn", filters: report.filters, notes: report.notes, columns: inventoryReportColumns, rows: report.cells };
  } else {
    if (!canExportApprovalHistory()) return toast("Bạn không có quyền xuất lịch sử phê duyệt.", "warning");
    if (action === "export-audit") {
      const error = auditFilterError();
      if (error) return toast(error, "warning");
      data = { title: "Nhật ký xử lý và phê duyệt", filters: auditFilterSummary(), columns: ["Thời điểm", "Nhân sự", "Vai trò", "Hành động", "Đối tượng", "Chi tiết"], rows: filteredAudit().map((item) => [item.time, item.actor, item.role, item.action, item.object, item.detail]) };
    } else if (action === "export-approvals") {
      const scope = state.role === "director" ? "Mọi vai trò xử lý" : "Hồ sơ do Kế toán xử lý";
      const status = { pending: "Chờ xử lý", resolved: "Đã xử lý", all: "Tất cả" }[state.ui.approvalFilter];
      data = { title: "Lịch sử phê duyệt", filters: `Phạm vi: ${scope} · Trạng thái: ${status || "Tất cả"}`, columns: ["Mã", "Loại", "Tham chiếu", "Người gửi", "Trạng thái", "Lý do"], rows: visibleApprovals().map((item) => [item.id, item.title, item.ref, item.requester, STATUS_META[item.status]?.label, item.decisionNote]) };
    }
  }
  if (!data) return;
  if (!data.rows.length) return toast("Không có dữ liệu trong phạm vi đang chọn để xuất.", "info");
  if (format === "pdf") return printReport(data);
  downloadBlob(reportWorkbook(data), `SoulWine-${data.title}.xlsx`);
  toast("Đã xuất tệp Excel (.xlsx).");
}

function exportData(action) {
  const documentAction = action.replace(/-pdf$/, "");
  if (["export-inventory", "export-audit", "export-approvals"].includes(documentAction)) return exportReportDocument(documentAction, action.endsWith("-pdf") ? "pdf" : "xlsx");
  const collections = {
    "export-orders": ["Đơn hàng", ["Mã", "Khách hàng", "Loại", "Giá trị", "Đã thu", "Trạng thái"], filteredOrders().map((item) => [item.code, customerName(item.customerId), item.type, item.total, item.paid, STATUS_META[item.status]?.label])],
    "export-quotes": ["Báo giá", ["Mã", "Khách hàng", "Tạm tính", "Chiết khấu", "Tổng", "Trạng thái"], filteredQuotes().map((item) => [item.code, customerName(item.customerId), quoteTotals(item).subtotal, quoteTotals(item).discount, quoteTotals(item).total, STATUS_META[item.status]?.label])],
    "export-contracts": ["Hợp đồng", ["Mã", "Khách hàng", "Giá trị", "Đã thu", "Còn lại"], filteredContracts().map((item) => [item.code, customerName(item.customerId), item.value, item.paid, item.value - item.paid])],
    "export-payments": ["Thanh toán", ["Mã", "Liên kết", "Số tiền", "Ngày", "Phương thức", "Trạng thái"], state.payments.map((item) => [item.id, item.record, item.amount, item.date, item.method, STATUS_META[item.status]?.label])],
    "export-reservations": ["Giữ hàng", ["Mã", "Đơn", "SKU", "Số lượng", "Ngày", "Trạng thái"], state.reservations.map((item) => [item.id, item.order, item.sku, item.qty, item.since, STATUS_META[item.status]?.label])],
    "export-customers": ["Khách hàng", ["Mã", "Tên", "Nhóm", "Điện thoại", "Email", "Địa chỉ"], filteredCustomers().map((item) => [item.id, item.name, item.type, item.phone, item.email, item.address])],
    "export-products": ["Sản phẩm", ["SKU", "Tên", "Giá lẻ", "Giá sỉ", "ĐVT", "Xuất xứ"], filteredProducts().map((item) => [item.sku, item.name, item.retail, item.wholesale, item.unit, item.origin])],
    "export-availability": ["Tồn kho", ["SKU", "Tên", "Tồn vật lý", "Giữ", "Lỗi", "Khả dụng"], filteredAvailability().map((item) => [item.sku, item.name, item.physical, item.held, item.damaged, availableOf(item)])],
    "export-movements": ["Thẻ kho", ["Thời gian", "SKU", "Loại", "SL", "Tồn vật lý", "Giữ", "Chứng từ", "Nhân sự"], filteredMovements().map((item) => [item.time, item.sku, item.type, item.qty, item.physical, item.held, item.ref, item.user])]
  };
  const otherCollections = {
    "export-receipts": state.receipts,
    "export-stocktakes": state.stocktakes,
    "export-suppliers": state.suppliers,
    "export-requests": state.purchaseRequests,
    "export-po": state.purchaseOrders,
    "export-deliveries": state.deliveries,
    "export-returns": state.returns.map((item) => ({ ...item, status: STATUS_META[returnStatus(item)]?.label || returnStatus(item) })),
    "export-documents": state.documents,
    "export-issues": state.issues,
    "export-roles": Object.entries(ROLES).map(([id, role]) => ({ id, ...role }))
  };
  let data = collections[action];
  if (!data && otherCollections[action]) {
    const list = otherCollections[action];
    const keys = [...new Set(list.flatMap((item) => Object.keys(item)))].filter((key) => !list.some((item) => typeof item[key] === "object"));
    data = [action.replace("export-", ""), keys, list.map((item) => keys.map((key) => item[key]))];
  }
  if (action === "export-report" && state.ui.reportTab === "sales") data = ["Bán hàng", ["Đơn hàng", "Ngày", "Khách hàng", "Kênh", "Giá trị hoàn tất"], salesAnalytics().orders.map((order) => [order.code, order.created, customerName(order.customerId), order.channel, order.total])];
  if (action === "export-roles") {
    const table = document.querySelector("table.matrix");
    if (table) data = ["Vai trò và quyền hạn", [...table.querySelectorAll("thead th")].map((cell) => cell.textContent.trim()), [...table.querySelectorAll("tbody tr")].map((row) => [...row.cells].map((cell) => cell.textContent.trim()))];
  }
  if (action === "export-report" && state.ui.reportTab === "management") data = ["Chất lượng vận hành", ["Chỉ tiêu", "Tên", "Kết quả", "Số bản ghi đo lường", "Mục tiêu"], operationalMetrics().map((metric) => [metric.code, metric.label, metric.value ?? "Chưa đủ dữ liệu", metric.count, metric.target])];
  if (!data) return;
  if (!data[2].length) return toast("Không có dữ liệu trong phạm vi đang chọn để xuất.", "info");
  const cell = (value) => {
    let text = String(value ?? "");
    if (typeof value !== "number" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const blob = new Blob(["\uFEFF", [data[1], ...data[2]].map((row) => row.map(cell).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `SoulWine-${data[0]}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Đã xuất CSV UTF-8. Có thể mở bằng Excel.");
}

function printRecord(kind, code) {
  let title = "CHỨNG TỪ";
  let meta = "";
  let rows = [];
  let columns = ["Sản phẩm", "Đơn vị", "Số lượng"];
  let total = "";
  const text = (value) => escapeHtml(value);
  if (kind === "document") {
    const document = state.documents.find((item) => item.code === code);
    if (!document) return toast("Không tìm thấy chứng từ.", "error");
    const types = { "Hợp đồng": "contract", "Báo giá": "quote", "Phiếu xuất kho": "issue", "Phiếu nhập kho": "receipt" };
    if (types[document.type]) return printRecord(types[document.type], document.code);
    title = `THÔNG TIN ${document.type.toLocaleUpperCase("vi")}`;
    meta = `<p>Mã: <b>${text(document.code)}</b> · Ngày: ${text(document.date)}</p><p>Liên kết: ${text(document.record)}</p><p>Tệp đính kèm: ${text(document.file)}</p>`;
  } else if (kind === "quote") {
    const quote = quoteByCode(code);
    if (!quote || !["approved", "confirmed"].includes(quote.status)) return toast("Chỉ xuất báo giá đã duyệt / xác nhận.", "warning");
    if (quoteIsExpired(quote)) return toast("Báo giá đã hết hiệu lực. Tạo phiên bản mới trước khi xuất.", "warning");
    title = "BÁO GIÁ";
    meta = `<p>Khách hàng: <b>${text(customerName(quote.customerId))}</b></p><p>Số: ${text(code)} · Hiệu lực: ${text(quote.validUntil)} · Phiên bản v${quote.version}</p>`;
    columns = ["Sản phẩm", "ĐVT", "SL", "Giá niêm yết", "Chiết khấu dòng", "Thành tiền"];
    rows = quote.lines.map((line) => {
      const amounts = quoteLineTotals(line);
      return [productName(line.sku), productBySku(line.sku)?.unit, line.qty, money(amounts.price), quoteDiscountLabel(quoteLineDiscount(line)), money(amounts.total)];
    });
    const totals = quoteTotals(quote);
    const whole = quoteWholeDiscount(quote);
    const rate = whole.mode === "percent" && whole.value ? ` (${text(quoteDiscountLabel(whole))})` : "";
    total = `<p>Tạm tính: ${money(totals.subtotal)}<br>Chiết khấu dòng: ${discountMoney(totals.lineDiscount)}<br>Sau chiết khấu dòng: ${money(totals.afterLines)}<br>Chiết khấu toàn báo giá${rate}: ${discountMoney(totals.wholeDiscount)}</p><p class="total">Tổng cộng: ${money(totals.total)}</p><p>Điều khoản: ${text(quote.note)}</p>`;
  } else if (kind === "contract") {
    const contract = contractByCode(code);
    if (!contract) return;
    title = "HỢP ĐỒNG BÁN HÀNG";
    meta = `<p>Số: <b>${text(code)}</b></p><p>Bên bán: Công ty SoulWine</p><p>Bên mua: ${text(customerName(contract.customerId))}</p><p>Phương án thanh toán: ${text(contract.scheme)} · Hạn: ${text(contract.due)}</p>`;
    rows = contract.lines.map((line) => [productName(line.sku), productBySku(line.sku).unit, line.qty]);
    total = `<p class="total">Giá trị hợp đồng: ${money(contract.value)}</p><p>Lịch giao: ${contract.shipments.map((shipment) => `${text(shipment.id)}: ${text(shipment.date)}`).join("; ")}</p>`;
  } else if (kind === "stocktake") {
    const stocktake = stocktakeByCode(code);
    if (!stocktake) return;
    title = "BIÊN BẢN KIỂM KÊ";
    meta = `<p>Số: ${text(code)} · Phạm vi: ${text(stocktake.scope)}</p><p>Bắt đầu: ${text(stocktake.started)} · Trạng thái: ${text(STATUS_META[stocktake.status]?.label || stocktake.status)}</p>${stocktake.status === "cancelled" ? `<p>Kỳ đã hủy, không điều chỉnh tồn. Lý do: ${text(stocktake.cancellationReason || "")}</p>` : ""}`;
    columns = ["SKU", "Sản phẩm", "Sổ sách", "Thực tế", "Chênh lệch", "Ghi chú"];
    rows = stocktake.lines.map((line) => [line.sku, productName(line.sku), line.system, line.count ?? "Chưa đếm", line.count === null ? "—" : line.count - line.system, line.note]);
  } else if (kind === "receipt") {
    const receipt = receiptByCode(code);
    if (!receipt) return;
    title = "PHIẾU TIẾP NHẬN HÀNG";
    meta = receipt.source ? `<p>Số: ${text(code)} · Chứng từ nguồn: ${text(receipt.source)}</p><p>Kết quả đối chiếu: ${text(receipt.note)}</p>` : `<p>Số: ${text(code)} · Đơn đặt hàng: ${text(receipt.po)}</p><p>Nhà cung cấp: ${text(supplierName(receipt.supplier))}</p>`;
    columns = ["Sản phẩm", "Đặt", "Thực nhận", "Hàng đạt", "Hư hỏng"];
    rows = receipt.lines.map((line) => [productName(line.sku), line.ordered, line.received, line.good, line.damaged]);
  } else {
    const record = kind === "issue" ? state.issues.find((item) => item.code === code) : orderByCode(code);
    if (!record) return;
    title = kind === "issue" ? "PHIẾU XUẤT KHO" : "XÁC NHẬN ĐƠN HÀNG";
    meta = `<p>Số: ${text(code)} · Khách hàng: ${text(customerName(record.customerId))}</p>`;
    rows = record.lines.map((line) => [productName(line.sku), productBySku(line.sku).unit, line.qty]);
    if (record.total) total = `<p class="total">Giá trị: ${money(record.total)}</p>`;
  }
  const popup = window.open("", "_blank");
  if (!popup) return toast("Trình duyệt đã chặn cửa sổ in. Cho phép cửa sổ bật lên cho SoulWine rồi thử lại.", "warning");
  popup.opener = null;
  const organization = state.settings.organization;
  const fontUrl = document.querySelector('link[href*="fonts.googleapis.com/css"]')?.href;
  const fontLink = fontUrl ? `<link rel="stylesheet" href="${text(fontUrl)}">` : "";
  popup.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${text(title)} ${text(code)}</title>${fontLink}<style>
    body{font:13px/1.65 'Nunito Sans','Segoe UI',sans-serif;color:#1b1a22;max-width:760px;margin:35px auto;padding:20px}
    header{display:flex;justify-content:space-between;border-bottom:2px solid #211d4f;padding-bottom:15px;gap:24px}h1{font:600 30px 'Cormorant Garamond',Georgia,serif;color:#211d4f;text-align:center;margin:32px 0}.print-brand{font:600 30px 'Cormorant Garamond',Georgia,serif;color:#211d4f}
    table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border:1px solid #e4e2dc;padding:9px;text-align:left}th{background:#f0efec}.total{text-align:right;font-weight:700;font-size:17px}
    .signatures{display:flex;justify-content:space-between;text-align:center;margin:45px 20px 90px}.print-meta{font-size:11px;color:#555363;text-align:right}button{background:#211d4f;color:white;padding:10px 18px;border:0;border-radius:10px;cursor:pointer;font:600 13px 'Nunito Sans','Segoe UI',sans-serif}
    footer{border-top:1px solid #e4e2dc;margin-top:90px;padding-top:10px;color:#555363;font-size:11px}@page{size:A4;margin:18mm}@media print{body{margin:0;padding:0}button{display:none}th{print-color-adjust:exact}tr{break-inside:avoid}}
    </style></head><body><header><div><b class="print-brand">${text(organization.name)}</b>${organization.address ? `<br>${text(organization.address)}` : ""}${organization.taxId ? `<br>MST: ${text(organization.taxId)}` : ""}</div><div class="print-meta">${text(code)}<br>Ngày xuất: ${text(nowStamp())}</div></header><h1>${title}</h1>${meta}${rows.length ? `<table><thead><tr>${columns.map((column) => `<th>${text(column)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((value) => `<td>${text(value)}</td>`).join("")}</tr>`).join("")}</tbody></table>` : ""}${total}<div class="signatures"><div><b>Đại diện ${text(organization.name)}</b><br><small>(Ký, ghi rõ họ tên)</small></div><div><b>Đại diện khách hàng / đối tác</b><br><small>(Ký, ghi rõ họ tên)</small></div></div><button type="button" onclick="window.print()">In / Lưu thành PDF</button><footer>Được xuất từ SoulWine Operations · ${text(nowStamp())}</footer></body></html>`);
  popup.document.close();
}

document.getElementById("menu-btn").addEventListener("click", () => {
  if (innerWidth <= 980) state.sidebarOpen = !state.sidebarOpen;
  else state.collapsed = !state.collapsed;
  renderShell();
});
document.getElementById("sidebar-overlay").addEventListener("click", () => { state.sidebarOpen = false; renderShell(); });
document.getElementById("quick-btn").addEventListener("click", showQuickCreate);
document.getElementById("role-btn").addEventListener("click", showRoles);
document.getElementById("notif-btn").addEventListener("click", showNotifications);
document.getElementById("search-trigger").addEventListener("click", openSearch);
document.getElementById("search-close").addEventListener("click", closeSearch);
document.getElementById("search-input").addEventListener("input", (event) => { searchSelection = 0; renderSearch(event.target.value); });
document.getElementById("search-overlay").addEventListener("click", (event) => { if (event.target.id === "search-overlay") closeSearch(); });

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest(".skip-link")) { event.preventDefault(); viewElement.focus(); return; }
  if (target.hasAttribute("data-dismiss-dialog")) return closeDialog();
  const role = target.closest("[data-role]");
  if (role) {
    if (!state.users.find((user) => user.id === state.activeUserId)?.roleIds.includes(role.dataset.role)) return;
    state.role = role.dataset.role;
    closePopover();
    if (!routeAllowed(state.route)) navigate("dashboard");
    else render(true);
    try { sessionStorage.setItem(PROFILE_KEY, JSON.stringify({ user: state.activeUserId, role: state.role })); } catch {}
    toast(`Vai trò đang sử dụng: ${currentUser().label}.`, "info");
    return;
  }
  const notification = target.closest("[data-notif]");
  if (notification) {
    const item = state.notifications.find((entry) => entry.id === notification.dataset.notif);
    item.unread = false;
    return navigate(item.route);
  }
  const result = target.closest("[data-search-index]");
  if (result) return chooseSearch(Number(result.dataset.searchIndex));
  if (target.closest("[data-audit-reset]")) {
    if (!state.loggedIn) return;
    state.ui.auditFilter = {};
    state.ui.auditSearch = "";
    render(true);
    document.querySelector("[data-audit-reset]")?.focus({ preventScroll: true });
    return;
  }
  const filter = target.closest("[data-filter-group]");
  if (filter) { state.ui[filter.dataset.filterGroup] = filter.dataset.filterValue; return render(true); }
  const tab = target.closest("[data-tab-group]");
  if (tab) {
    const change = () => { state.ui[`${tab.dataset.tabGroup}Tab`] = tab.dataset.tabValue; render(true); };
    if (state.ui.settingsDirty) return requestSettingsDiscard(change);
    change(); return;
  }
  const action = target.closest("[data-action]");
  if (action && !action.disabled && action.tagName !== "SELECT" && action.tagName !== "INPUT") {
    event.preventDefault();
    if (!state.loggedIn && !["restore-backup", "download-recovery", "close-dialog", "confirm-dialog", "discard-dialog", "keep-editing"].includes(action.dataset.action)) return;
    dispatchAction(action.dataset.action, action.dataset);
    return;
  }
  const row = target.closest("[data-href]");
  if (row && !target.closest("button,a,input,select,textarea,label")) return navigate(row.dataset.href);
  const anchor = target.closest('a[href^="#/"]');
  if (anchor) { event.preventDefault(); return navigate(anchor.getAttribute("href")); }
  if (!target.closest(".popover,#quick-btn,#role-btn,#notif-btn")) closePopover();
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (!state.loggedIn) return;
  if (target.dataset.listSearch === "audit") {
    state.ui.auditSearch = target.value;
    const { selectionStart, selectionEnd } = target;
    render(true);
    const search = document.querySelector('[data-list-search="audit"]');
    search?.focus({ preventScroll: true });
    if (search && selectionStart !== null) search.setSelectionRange(selectionStart, selectionEnd);
    return;
  }
  if (target.dataset.listSearch) {
    const keys = { orders: "orderSearch", quotes: "quoteSearch", contracts: "contractSearch", customers: "customerSearch", products: "productSearch", availability: "availabilitySearch", audit: "auditSearch", movements: "movementSearch" };
    state.ui[keys[target.dataset.listSearch]] = target.value;
    return refreshList(target.dataset.listSearch);
  }
  if (target.dataset.qfield) return updateQuoteLine(target);
  if (target.dataset.qmeta === "note" && currentQuote() && quoteEditable(currentQuote())) { currentQuote().note = target.value; scheduleWorkspaceSave(); }
  if (target.dataset.stField) return updateStocktakeInput(target);
  if (target.dataset.rcField) return updateReceiptInput(target);
  if (target.closest("#action-form") && activeDialog) { activeDialog.dirty = true; if (activeDialog.input) activeDialog.input(); }
  if (target.closest("#settings-form") && !target.dataset.syncField) { state.ui.settingsDirty = true; const note = document.getElementById("settings-save-note"); if (note) note.textContent = "Có thay đổi chưa lưu"; }
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (!state.loggedIn) return;
  if (["from", "to", "actor", "type", "result"].includes(target.dataset.auditFilter)) {
    state.ui.auditFilter = { ...state.ui.auditFilter, [target.dataset.auditFilter]: target.value };
    render(true);
    document.getElementById(target.id)?.focus({ preventScroll: true });
    return;
  }
  if (target.dataset.qmeta && quoteEditable(currentQuote())) {
    currentQuote()[target.dataset.qmeta] = target.value;
    if (target.dataset.qmeta !== "note") render(true);
  }
  if (target.dataset.qcheck && quoteEditable(currentQuote())) currentQuote().confirmed = target.checked;
  if (target.dataset.qcheck) scheduleWorkspaceSave();
  if (target.dataset.action === "toggle-variance") { state.ui.stocktakeVarianceOnly = target.checked; render(true); }
  if (target.hasAttribute("data-report-period")) { state.ui.reportPeriod = target.value; render(true); }
  if (target.hasAttribute("data-report-channel")) { state.ui.reportChannel = target.value; render(true); }
  if (target.hasAttribute("data-slow-moving-days")) { state.ui.slowMovingDays = Number(target.value); render(true); }
  if (target.closest("#action-form") && activeDialog) { activeDialog.dirty = true; if (activeDialog.input) activeDialog.input(); }
  if (target.closest("#settings-form") && !target.dataset.syncField) { state.ui.settingsDirty = true; const note = document.getElementById("settings-save-note"); if (note) note.textContent = "Có thay đổi chưa lưu"; }
});

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (form.id === "inventory-report-filters") {
    event.preventDefault();
    if (!canViewInventoryReport()) return;
    const data = new FormData(form);
    const from = String(data.get("from") || ""), to = String(data.get("to") || ""), category = String(data.get("category") || "");
    if ((from && !validReportDay(from)) || (to && !validReportDay(to)) || (from && to && from > to)) return toast("Kiểm tra khoảng ngày. Ngày bắt đầu không được sau ngày kết thúc.", "warning");
    state.ui.inventoryReportFilter = { from, to, category };
    render(true);
    document.querySelector('#inventory-report-filters [type="submit"]')?.focus();
    return;
  }
  if (form.id === "settings-form") { event.preventDefault(); if (validateForm(form)) saveSettings(form); return; }
  if (form.id === "action-form" && activeDialog?.submit) {
    event.preventDefault();
    if (!state.loggedIn && workspaceStatus.error !== "corrupt") return;
    if (!validateForm(form) || activeDialog.submitting) return;
    if (workspaceStatus.conflict && !["bulk-results"].some((id) => document.getElementById(id))) return formError("Có dữ liệu mới ở cửa sổ khác. Tải dữ liệu mới trước khi lưu.");
    const dialog = activeDialog;
    dialog.submitting = true;
    const buttons = [...document.querySelectorAll('button[form="action-form"]')];
    buttons.forEach((button) => { button.disabled = true; button.setAttribute("aria-busy", "true"); });
    const error = document.getElementById("form-error");
    if (error) error.classList.add("hidden");
    try { await dialog.submit(new FormData(form), form); persistWorkspace(); renderStorageStatus(); }
    catch (error) { formError(error.message || "Chưa thể lưu nội dung. Kiểm tra dữ liệu và thử lại."); }
    finally { if (activeDialog === dialog) { dialog.submitting = false; buttons.forEach((button) => { button.disabled = false; button.removeAttribute("aria-busy"); }); } }
  }
});

document.addEventListener("keydown", (event) => {
  if (activePopover && event.target.closest?.(".popover")) {
    const controls = [...document.querySelectorAll(".popover button:not([disabled]),.popover a[href]")];
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const position = event.key === "Home" ? 0 : event.key === "End" ? controls.length - 1 : (controls.indexOf(event.target) + (event.key === "ArrowDown" ? 1 : -1) + controls.length) % controls.length;
      controls[position]?.focus(); return;
    }
    if (["Escape", "Tab"].includes(event.key)) { if (event.key === "Escape") event.preventDefault(); closePopover(true); return; }
  }
  if (["Enter", " "].includes(event.key) && event.target instanceof Element && event.target.hasAttribute("data-href")) { event.preventDefault(); return navigate(event.target.dataset.href); }
  const editing = event.target instanceof Element && event.target.matches("input,textarea,select,[contenteditable]");
  if ((event.key === "/" && !editing) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k")) { event.preventDefault(); openSearch(); }
  if (event.key === "Escape") {
    if (document.getElementById("discard-guard")) { keepDialogEditing(); return; }
    closeDialog(); closeSearch(); closePopover(); state.sidebarOpen = false; renderShell();
  }
  const searchOpen = !document.getElementById("search-overlay").classList.contains("hidden");
  if (searchOpen && event.target.id === "search-input" && ["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) {
    event.preventDefault();
    if (event.key === "Enter") return chooseSearch(searchSelection);
    searchSelection = Math.max(0, Math.min(searchResults.length - 1, searchSelection + (event.key === "ArrowDown" ? 1 : -1)));
    renderSearch(document.getElementById("search-input").value);
    document.querySelector(".search-result.active")?.scrollIntoView({ block: "nearest" });
  }
  if (searchOpen && event.key === "Tab") {
    const controls = [...document.querySelectorAll('#search-overlay input,#search-overlay button')].filter((element) => !element.disabled && element.offsetParent !== null);
    if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
  }
  if (event.target.getAttribute?.("role") === "tab" && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const tabs = [...event.target.closest('[role="tablist"]').querySelectorAll('[role="tab"]')];
    const index = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (tabs.indexOf(event.target) + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    const { tabGroup, tabValue } = tabs[index].dataset; tabs[index].click();
    document.querySelector(`[data-tab-group="${tabGroup}"][data-tab-value="${tabValue}"]`)?.focus();
  }
  if (activeDialog && event.key === "Tab") {
    const dialog = document.querySelector('[aria-labelledby="dialog-title"]');
    const focusable = [...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),a[href]')].filter((element) => !element.closest("[inert]") && element.offsetParent !== null);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});

window.addEventListener("hashchange", () => {
  if ((activeDialog?.dirty && !activeDialog.submitting) || state.ui.settingsDirty) {
    const intended = location.hash;
    history.replaceState(null, "", lastRenderedHash);
    if (activeDialog?.dirty) requestDiscard(() => { closeDialog(true); navigate(intended); });
    else requestSettingsDiscard(() => navigate(intended));
    return;
  }
  closeDialog(true); closePopover(); render();
});
window.addEventListener("beforeunload", (event) => {
  persistWorkspace();
  if (activeDialog?.dirty || state.ui.settingsDirty || workspaceStatus.error || workspaceStatus.conflict) { event.preventDefault(); event.returnValue = ""; }
});
window.addEventListener("storage", (event) => {
  if (event.key !== WORKSPACE_KEY || !event.newValue) return;
  try { const payload = JSON.parse(event.newValue); if (payload.revision > workspaceStatus.revision) { workspaceStatus.conflict = true; renderStorageStatus(); } } catch { workspaceStatus.conflict = true; renderStorageStatus(); }
});
window.addEventListener("resize", closePopover);
loadWorkspace();
initServerSync();
ensureSeedCredentials().then(async () => {
  if (serverSync.enabled && serverSync.token) await serverSyncResumeSession();
  if (workspaceStatus.error || workspaceStatus.conflict) return;
  try { installLinkedSampleData({ automatic: true }); }
  catch (error) { toast(error.message, "warning"); }
}).catch(() => { authBootError = "Trình duyệt không hỗ trợ lưu mật khẩu đã băm (cần Web Crypto). Đăng nhập không khả dụng trên thiết bị này."; }).finally(() => {
  render();
  syncOverlayState();
});
