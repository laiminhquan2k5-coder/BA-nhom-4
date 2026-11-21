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
    const roles = ACTION_ROLES[element.dataset.action];
    if (roles && !roles.includes(state.role)) {
      element.disabled = true;
      element.title = `Thao tác thuộc quyền ${roles.map((role) => ROLES[role].label).join(" / ")}.`;
    }
  });
  if (route === "quotes" && param) lockQuoteEditor();
  if (route === "dashboard") viewElement.querySelector(".page-head")?.insertAdjacentHTML("afterend", sampleDataNotice());
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

function exportData(action) {
  const collections = {
    "export-orders": ["Đơn hàng", ["Mã", "Khách hàng", "Loại", "Giá trị", "Đã thu", "Trạng thái"], filteredOrders().map((item) => [item.code, customerName(item.customerId), item.type, item.total, item.paid, STATUS_META[item.status]?.label])],
    "export-quotes": ["Báo giá", ["Mã", "Khách hàng", "Tạm tính", "Chiết khấu", "Tổng", "Trạng thái"], filteredQuotes().map((item) => [item.code, customerName(item.customerId), quoteTotals(item).subtotal, quoteTotals(item).discount, quoteTotals(item).total, STATUS_META[item.status]?.label])],
    "export-contracts": ["Hợp đồng", ["Mã", "Khách hàng", "Giá trị", "Đã thu", "Còn lại"], filteredContracts().map((item) => [item.code, customerName(item.customerId), item.value, item.paid, item.value - item.paid])],
    "export-payments": ["Thanh toán", ["Mã", "Liên kết", "Số tiền", "Ngày", "Phương thức", "Trạng thái"], state.payments.map((item) => [item.id, item.record, item.amount, item.date, item.method, STATUS_META[item.status]?.label])],
    "export-reservations": ["Giữ hàng", ["Mã", "Đơn", "SKU", "Số lượng", "Ngày", "Trạng thái"], state.reservations.map((item) => [item.id, item.order, item.sku, item.qty, item.since, STATUS_META[item.status]?.label])],
    "export-customers": ["Khách hàng", ["Mã", "Tên", "Nhóm", "Điện thoại", "Email", "Địa chỉ"], filteredCustomers().map((item) => [item.id, item.name, item.type, item.phone, item.email, item.address])],
    "export-products": ["Sản phẩm", ["SKU", "Tên", "Giá lẻ", "Giá sỉ", "ĐVT", "Xuất xứ"], filteredProducts().map((item) => [item.sku, item.name, item.retail, item.wholesale, item.unit, item.origin])],
    "export-availability": ["Tồn kho", ["SKU", "Tên", "Tồn vật lý", "Giữ", "Lỗi", "Khả dụng"], filteredAvailability().map((item) => [item.sku, item.name, item.physical, item.held, item.damaged, availableOf(item)])],
    "export-audit": ["Nhật ký", ["Thời điểm", "Nhân sự", "Vai trò", "Hành động", "Đối tượng", "Chi tiết"], filteredAudit().map((item) => [item.time, item.actor, item.role, item.action, item.object, item.detail])],
    "export-approvals": ["Phê duyệt", ["Mã", "Loại", "Tham chiếu", "Người gửi", "Trạng thái", "Lý do"], state.approvals.map((item) => [item.id, item.title, item.ref, item.requester, STATUS_META[item.status]?.label, item.decisionNote])],
    "export-movements": ["Thẻ kho", ["Thời gian", "SKU", "Loại", "SL", "Tồn vật lý", "Giữ", "Chứng từ", "Nhân sự"], filteredMovements().map((item) => [item.time, item.sku, item.type, item.qty, item.physical, item.held, item.ref, item.user])]
  };
  const otherCollections = {
    "export-receipts": state.receipts,
    "export-stocktakes": state.stocktakes,
    "export-suppliers": state.suppliers,
    "export-requests": state.purchaseRequests,
    "export-po": state.purchaseOrders,
    "export-deliveries": state.deliveries,
    "export-returns": state.returns,
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
  if (action === "export-report" && state.ui.reportTab === "inventory") data = ["Nhập xuất tồn", ["SKU", "Sản phẩm", "Tồn đầu", "Nhập", "Xuất", "Điều chỉnh", "Tồn cuối", "Giữ", "Khả dụng"], inventoryReportRows().map((row) => [row.product.sku, row.product.name, row.opening, row.incoming, row.outgoing, row.adjustment, row.product.physical, row.product.held, availableOf(row.product)])];
  if (!data) data = ["Chất lượng vận hành", ["Chỉ tiêu", "Tên", "Kết quả", "Số bản ghi đo lường", "Mục tiêu"], operationalMetrics().map((metric) => [metric.code, metric.label, metric.value ?? "Chưa đủ dữ liệu", metric.count, metric.target])];
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
    title = "BÁO GIÁ";
    meta = `<p>Khách hàng: <b>${text(customerName(quote.customerId))}</b></p><p>Số: ${text(code)} · Hiệu lực: ${text(quote.validUntil)} · Phiên bản v${quote.version}</p>`;
    columns = ["Sản phẩm", "ĐVT", "SL", "Giá niêm yết", "CK %", "Thành tiền"];
    rows = quote.lines.map((line) => { const product = productBySku(line.sku); const price = line.price ?? product.wholesale; return [product.name, product.unit, line.qty, money(price), line.discount, money(quoteLineTotal(line))]; });
    total = `<p class="total">Tổng cộng: ${money(quoteTotals(quote).total)}</p><p>Điều khoản: ${text(quote.note)}</p>`;
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
    meta = `<p>Số: ${text(code)} · Phạm vi: ${text(stocktake.scope)}</p><p>Bắt đầu: ${text(stocktake.started)}</p>`;
    columns = ["SKU", "Sản phẩm", "Sổ sách", "Thực tế", "Chênh lệch", "Ghi chú"];
    rows = stocktake.lines.map((line) => [line.sku, productName(line.sku), line.system, line.count ?? "Chưa đếm", line.count === null ? "—" : line.count - line.system, line.note]);
  } else if (kind === "receipt") {
    const receipt = receiptByCode(code);
    if (!receipt) return;
    title = "PHIẾU TIẾP NHẬN HÀNG";
    meta = `<p>Số: ${text(code)} · Đơn đặt hàng: ${text(receipt.po)}</p><p>Nhà cung cấp: ${text(supplierName(receipt.supplier))}</p>`;
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
  popup.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${text(title)} ${text(code)}</title><style>
    body{font:13px/1.65 'Segoe UI',sans-serif;color:#1f1b18;max-width:760px;margin:35px auto;padding:20px}
    header{display:flex;justify-content:space-between;border-bottom:2px solid #6a1f2b;padding-bottom:15px;gap:24px}h1{font:600 25px Georgia,serif;color:#6a1f2b;text-align:center;margin:32px 0}
    table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border:1px solid #d8cfc2;padding:9px;text-align:left}th{background:#f6f1e9}.total{text-align:right;font-weight:700;font-size:17px}
    .signatures{display:flex;justify-content:space-between;text-align:center;margin:45px 20px 90px}.print-meta{font-size:11px;color:#625c55;text-align:right}button{background:#6a1f2b;color:white;padding:10px 18px;border:0;border-radius:7px;cursor:pointer}
    footer{border-top:1px solid #ddd;margin-top:90px;padding-top:10px;color:#625c55;font-size:11px}@page{size:A4;margin:18mm}@media print{body{margin:0;padding:0}button{display:none}th{print-color-adjust:exact}tr{break-inside:avoid}}
    </style></head><body><header><div><b style="font:600 25px Georgia;color:#6a1f2b">${text(organization.name)}</b>${organization.address ? `<br>${text(organization.address)}` : ""}${organization.taxId ? `<br>MST: ${text(organization.taxId)}` : ""}</div><div class="print-meta">${text(code)}<br>Ngày xuất: ${text(nowStamp())}</div></header><h1>${title}</h1>${meta}${rows.length ? `<table><thead><tr>${columns.map((column) => `<th>${text(column)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((value) => `<td>${text(value)}</td>`).join("")}</tr>`).join("")}</tbody></table>` : ""}${total}<div class="signatures"><div><b>Đại diện ${text(organization.name)}</b><br><small>(Ký, ghi rõ họ tên)</small></div><div><b>Đại diện khách hàng / đối tác</b><br><small>(Ký, ghi rõ họ tên)</small></div></div><button type="button" onclick="window.print()">In / Lưu thành PDF</button><footer>Được xuất từ SoulWine Operations · ${text(nowStamp())}</footer></body></html>`);
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
  if (target.closest("#settings-form")) { state.ui.settingsDirty = true; document.getElementById("settings-save-note").textContent = "Có thay đổi chưa lưu"; }
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (!state.loggedIn) return;
  if (target.dataset.qmeta && quoteEditable(currentQuote())) {
    currentQuote()[target.dataset.qmeta] = target.value;
    if (target.dataset.qmeta !== "note") render(true);
  }
  if (target.dataset.qcheck && quoteEditable(currentQuote())) currentQuote().confirmed = target.checked;
  if (target.dataset.qcheck) scheduleWorkspaceSave();
  if (target.dataset.action === "toggle-variance") { state.ui.stocktakeVarianceOnly = target.checked; render(true); }
  if (target.hasAttribute("data-report-period")) { state.ui.reportPeriod = target.value; render(true); }
  if (target.closest("#action-form") && activeDialog) { activeDialog.dirty = true; if (activeDialog.input) activeDialog.input(); }
  if (target.closest("#settings-form")) { state.ui.settingsDirty = true; const note = document.getElementById("settings-save-note"); if (note) note.textContent = "Có thay đổi chưa lưu"; }
});

document.addEventListener("submit", async (event) => {
  const form = event.target;
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
ensureSeedCredentials().then(() => {
  if (workspaceStatus.error || workspaceStatus.conflict) return;
  try { installLinkedSampleData({ automatic: true }); }
  catch (error) { toast(error.message, "warning"); }
}).catch(() => { authBootError = "Trình duyệt không hỗ trợ lưu mật khẩu đã băm (cần Web Crypto). Đăng nhập không khả dụng trên thiết bị này."; }).finally(() => {
  render();
  syncOverlayState();
});
