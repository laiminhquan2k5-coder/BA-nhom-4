state.ui = {
  orderFilter: "all",
  orderSearch: "",
  quoteFilter: "all",
  quoteSearch: "",
  contractFilter: "all",
  contractSearch: "",
  paymentFilter: "all",
  customerFilter: "all",
  customerSearch: "",
  productFilter: "all",
  productSearch: "",
  approvalFilter: "pending",
  selectedApproval: "AP-001",
  contractTab: "overview",
  stocktakeTab: "count",
  reportTab: "sales",
  reportPeriod: "all",
  reportChannel: "all",
  slowMovingDays: 60,
  stocktakeVarianceOnly: false,
  draftQuote: null
};

function hrefFor(route, param) {
  return param ? `#/${route}/${encodeURIComponent(param)}` : `#/${route}`;
}

function pageHead(options) {
  const breadcrumb = options.breadcrumb
    ? `<div class="breadcrumb">${options.breadcrumb}</div>`
    : "";
  const phase = "";
  const status = options.status || "";
  return `<div class="page-head">
    <div class="page-head-main">
      ${breadcrumb}
      <div class="page-title-line">
        <h1 class="page-title">${options.title}</h1>
        ${phase}
        ${status}
      </div>
      ${options.subtitle ? `<p class="page-sub">${options.subtitle}</p>` : ""}
    </div>
    ${options.actions ? `<div class="page-actions">${options.actions}</div>` : ""}
  </div>`;
}

function card(options) {
  return `<section class="card ${options.className || ""}">
    ${options.title ? `<div class="card-head">
      <div>
        <div class="card-title">${options.iconName ? icon(options.iconName) : ""}${options.title}</div>
        ${options.subtitle ? `<div class="card-sub">${options.subtitle}</div>` : ""}
      </div>
      ${options.actions ? `<div class="flex items-center gap-8">${options.actions}</div>` : ""}
    </div>` : ""}
    <div class="card-body ${options.flush ? "flush" : ""}">${options.body}</div>
    ${options.footer ? `<div class="card-foot">${options.footer}</div>` : ""}
  </section>`;
}

function emptyState(iconName, title, text, action) {
  return `<div class="empty-state">
    <div class="empty-icon">${icon(iconName)}</div>
    <div class="empty-title">${title}</div>
    <div class="empty-text">${text}</div>
    ${action || ""}
  </div>`;
}

function dataTable(columns, rows, options) {
  const settings = options || {};
  const minWidth = settings.minWidth || 780;
  const head = columns.map((column) => `<th class="${column.align || ""}">${column.label}</th>`).join("");
  const body = rows.length
    ? rows.map((row) => `<tr ${row.href ? `data-href="${row.href}"` : ""}>${row.cells.map((cell, index) => `<td class="${columns[index].align || ""}">${cell}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${columns.length}">${settings.empty || tableEmptyState()}</td></tr>`;
  return `<div class="table-wrap"><table class="data" style="min-width:${minWidth}px"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function filterTabs(group, items, active) {
  return `<div class="filter-tabs" aria-label="Lọc danh sách">${items.map((item) => `<button class="filter-tab ${item.value === active ? "active" : ""}" aria-pressed="${item.value === active}" data-filter-group="${group}" data-filter-value="${item.value}">${item.label}${item.count !== undefined ? `<span class="count">${item.count}</span>` : ""}</button>`).join("")}</div>`;
}

function tabsBar(group, items, active) {
  return `<div class="tabs" role="tablist" aria-label="Chọn nội dung">${items.map((item) => `<button class="tab ${item.key === active ? "active" : ""}" role="tab" aria-selected="${item.key === active}" data-tab-group="${group}" data-tab-value="${item.key}">${item.label}${item.count !== undefined ? `<span class="tab-count">${item.count}</span>` : ""}</button>`).join("")}</div>`;
}

function sparkline(values, tone) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 118 + 1;
    const y = 24 - ((value - min) / range) * 19;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return `<svg class="spark ${tone || ""}" viewBox="0 0 120 28" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function lineChart(values, labels, id) {
  const width = 640;
  const height = 230;
  const left = 44;
  const right = 14;
  const top = 18;
  const bottom = 32;
  const maxValue = Math.max(1, Math.ceil(Math.max(...values) / 50) * 50);
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const points = values.map((value, index) => {
    const x = left + (index / (values.length - 1)) * plotWidth;
    const y = top + plotHeight - (value / maxValue) * plotHeight;
    return [x, y];
  });
  const line = points.map((point) => `${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(" ");
  const area = `${left},${top + plotHeight} ${line} ${left + plotWidth},${top + plotHeight}`;
  const gradientId = `chart-fill-${id || "main"}`;
  const grid = [0, 1, 2, 3].map((index) => {
    const value = (maxValue / 3) * index;
    const y = top + plotHeight - (index / 3) * plotHeight;
    return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" class="chart-grid"/><text x="${left - 9}" y="${y + 3}" text-anchor="end" class="chart-axis">${num(Math.round(value))}</text>`;
  }).join("");
  const labelsHtml = labels.map((label, index) => {
    const x = left + (index / (labels.length - 1)) * plotWidth;
    return `<text x="${x}" y="${height - 10}" text-anchor="middle" class="chart-axis">${label}</text>`;
  }).join("");
  const dots = points.map((point) => `<circle cx="${point[0].toFixed(1)}" cy="${point[1].toFixed(1)}" r="3" fill="#FFFFFF" stroke="#211D4F" stroke-width="1.8"/>`).join("");
  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Biểu đồ doanh thu">
    <defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#211D4F" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#211D4F" stop-opacity="0"/>
    </linearGradient></defs>
    ${grid}
    <polygon points="${area}" fill="url(#${gradientId})"/>
    <polyline points="${line}" fill="none" stroke="#211D4F" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}
    ${labelsHtml}
  </svg>`;
}

function productCell(sku) {
  const product = productBySku(sku);
  if (!product) return `<span class="muted">${escapeHtml(sku)}</span>`;
  return `<div class="product-cell">
    <div class="product-thumb">${icon("wine")}</div>
    <div>
      <div class="product-name">${escapeHtml(product.name)}</div>
      <div class="product-meta">${escapeHtml(product.sku)} · ${escapeHtml(product.volume)}</div>
    </div>
  </div>`;
}

function kpiCard(code, label, value, target, tone, series, route) {
  return `<div class="card kpi">
    <div class="kpi-label"><span>${code} · ${label}</span><span class="kpi-dot ${tone}"></span></div>
    <div class="kpi-value">${value}</div>
    <div class="kpi-target">${target}</div>
    ${sparkline(series, tone)}
    <a class="kpi-link" href="#/${route}">Xem nhật ký ${icon("arrow-right")}</a>
  </div>`;
}

function approvalIcon(type) {
  if (type === "discount") return "tag";
  if (type === "purchase") return "clipboard";
  if (type === "payment") return "card";
  return "file-check";
}

function approvalTypeLabel(type) {
  if (type === "discount") return "Chiết khấu";
  if (type === "purchase") return "Mua hàng";
  if (type === "payment") return "Thanh toán";
  return "Hợp đồng";
}

function viewDashboard() {
  const user = currentUser(), pending = pendingApprovalsForRole(state.role), analytics = salesAnalytics();
  const ar = arRecords(), outstanding = ar.reduce((sum, record) => sum + record.remaining, 0);
  const openOrders = state.orders.filter((order) => !["completed", "cancelled"].includes(order.status));
  const notices = allowedNotifications().filter((item) => !item.id.startsWith("approval:"));
  const contractRows = state.contracts.filter((contract) => contract.status === "active").map((contract) => {
    const total = contract.lines.reduce((sum, line) => sum + line.qty, 0);
    const delivered = contract.shipments.filter((shipment) => shipment.status === "delivered").reduce((sum, shipment) => sum + shipment.items.reduce((count, line) => count + line.qty, 0), 0);
    const percent = Math.round(delivered / Math.max(total, 1) * 100);
    return `<div class="progress-row"><a class="progress-label" href="${hrefFor("contracts", contract.code)}">${escapeHtml(contract.code)} · ${escapeHtml(customerName(contract.customerId))}</a><span class="progress-value">${percent}% giao</span><div class="progress"><span style="width:${percent}%"></span></div><span class="progress-label muted full">Đã thu ${money(contract.paid)} / ${money(contract.value)}</span></div>`;
  }).join("");
  return `${pageHead({ title: "Tổng quan điều hành", subtitle: `${new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${user.name} · ${user.label}`, actions: `<button class="btn btn-secondary" data-action="export-dashboard">${icon("download")} Xuất tổng quan</button>` })}
  ${setupChecklist()}
  <div class="stat-grid mb-24">${[["Đơn đang xử lý", openOrders.length, "orders", "cart"], ["Hồ sơ cần quyết định", pending.length, "approvals", "check-circle"], ["Giá trị đơn hoàn tất", money(analytics.total), "reports", "chart"], ["Còn phải thu", money(outstanding), "payments", "card"]].map(([label, value, route, glyph]) => `<article class="stat-card overview-stat"><div class="overview-icon">${icon(glyph)}</div><div class="stat-label">${label}</div><div class="stat-value">${value}</div><a class="kpi-link" href="#/${route}">Xem chi tiết ${icon("arrow-right")}</a></article>`).join("")}</div>
  <div class="grid grid-2 mb-24">
    ${card({ title: "Chờ tôi xử lý", subtitle: "Các hồ sơ cần quyết định thuộc thẩm quyền", iconName: "check-circle", flush: true, body: pending.length ? pending.slice(0, 6).map((approval) => `<a class="approval-mini" href="#/approvals"><span class="approval-mini-icon">${icon(approvalIcon(approval.type))}</span><span class="approval-mini-main"><span class="approval-mini-title">${escapeHtml(approval.title)}</span><span class="approval-mini-sub">${escapeHtml(approval.ref)} · ${money(approval.amount)}</span></span><span class="chip warning">Chờ xử lý</span></a>`).join("") : emptyState("check-circle", "Không có hồ sơ cần quyết định", "Hồ sơ thuộc vai trò của bạn sẽ xuất hiện tại đây khi được gửi đến.") })}
    ${card({ title: "Ưu tiên vận hành", subtitle: "Cảnh báo theo cấu hình thông báo hiện hành", iconName: "alert", flush: true, body: notices.length ? notices.slice(0, 5).map((item) => `<a class="alert-item" href="#/${item.route}"><span class="alert-icon warning">${icon("alert")}</span><span class="alert-main"><strong class="alert-title">${escapeHtml(item.title)}</strong><span class="alert-text">${escapeHtml(item.text)}</span></span>${icon("chevron-right")}</a>`).join("") : emptyState("shield", "Không có cảnh báo cần xử lý", "Hệ thống theo dõi tồn kho, lịch giao và hiệu lực báo giá từ dữ liệu đã lưu.") })}
  </div>
  <div class="grid grid-2 mb-24">
    ${card({ title: "Giá trị đơn hoàn tất", subtitle: "6 tháng gần nhất · triệu đồng", iconName: "chart", actions: `<a class="link-btn" href="#/reports">Báo cáo chi tiết</a>`, body: analytics.orders.length ? `${lineChart(analytics.months.map((month) => month.value / 1000000), analytics.months.map((month) => month.label), "dashboard")}<p class="hint">Chỉ tính đơn có trạng thái Hoàn tất; không thay thế báo cáo ghi nhận doanh thu kế toán.</p>` : emptyState("chart", "Chưa có đơn hàng hoàn tất", "Biểu đồ được tính từ các đơn đã giao đủ. Không suy đoán số liệu khi chưa có giao dịch.", `<a class="btn btn-secondary btn-sm" href="#/orders">Quản lý đơn hàng</a>`) })}
    ${card({ title: "Tiến độ hợp đồng", subtitle: "Theo dõi giao hàng và thanh toán độc lập", iconName: "file-check", body: contractRows || emptyState("file-check", "Chưa có hợp đồng đang thực hiện", "Tạo hợp đồng từ báo giá đã được duyệt và khách hàng xác nhận."), footer: '<a class="link-btn" href="#/contracts">Xem hợp đồng</a>' })}
  </div>
  <section class="metrics-section mb-24"><div class="section-heading"><div><h2>Chất lượng vận hành</h2><p>Đo lường từ thời điểm và chứng từ đã ghi nhận. Dấu “—” cho biết chưa đủ dữ liệu.</p></div></div>${metricCards()}</section>
  ${card({ title: "Hoạt động gần đây", iconName: "history", actions: '<a class="link-btn" href="#/audit">Nhật ký hoạt động</a>', body: state.audit.length ? `<div class="timeline">${state.audit.slice(0, 5).map((entry) => `<div class="timeline-item ${entry.tone}"><div class="timeline-title"><strong>${escapeHtml(entry.action)}</strong> · ${escapeHtml(entry.object)}</div><div class="timeline-date">${escapeHtml(entry.time)} · ${escapeHtml(entry.actor)}</div></div>`).join("")}</div>` : emptyState("history", "Chưa có hoạt động", "Các thay đổi và quyết định của nhân sự được ghi lại tại đây để đối chiếu.") })}`;
}

function ordersTableHtml(list) {
  const rows = list.map((order) => ({
    href: hrefFor("orders", order.code),
    cells: [
      `<span class="row-link">${escapeHtml(order.code)}</span><div class="cell-sub">${escapeHtml(order.created)}</div>`,
      `<div class="cell-main"><span class="strong">${escapeHtml(customerName(order.customerId))}</span><span class="cell-sub">${escapeHtml(order.channel)}</span></div>`,
      `<span class="chip ${order.type === "Bán sỉ" ? "accent" : "neutral"}">${escapeHtml(order.type)}</span>`,
      `<span class="num strong">${money(order.total)}</span>`,
      `<div class="cell-main">${statusChip(orderPaidStatus(order))}<span class="cell-sub">${money(order.paid)} đã thu</span></div>`,
      statusChip(order.status),
      `<span>${escapeHtml(order.owner)}</span>`,
      `<div class="row-actions"><a class="btn btn-ghost btn-sm" href="${hrefFor("orders", order.code)}">${icon("chevron-right")}</a></div>`
    ]
  }));
  return dataTable([
    { label: "Mã đơn" },
    { label: "Khách hàng" },
    { label: "Loại" },
    { label: "Giá trị", align: "num" },
    { label: "Thanh toán" },
    { label: "Trạng thái" },
    { label: "Phụ trách" },
    { label: "", align: "num" }
  ], rows, { minWidth: 1080 });
}

function filteredOrders() {
  const filter = state.ui.orderFilter;
  const search = state.ui.orderSearch.trim().toLowerCase();
  const from = state.ui.orderDateFrom || "";
  const to = state.ui.orderDateTo || "";
  return state.orders.filter((order) => {
    const matchesFilter = filter === "all"
      || (filter === "retail" && order.type === "Bán lẻ")
      || (filter === "wholesale" && order.type === "Bán sỉ")
      || (filter === "pending_payment" && order.status === "pending_payment")
      || (filter === "holding" && order.status === "holding")
      || (filter === "overdue" && order.status === "overdue")
      || (filter === "completed" && order.status === "completed");
    const haystack = `${order.code} ${customerName(order.customerId)} ${order.owner} ${order.channel}`.toLowerCase();
    const created = isoDate(order.created);
    return matchesFilter && (!search || haystack.includes(search)) && (!from || (created && created >= from)) && (!to || (created && created <= to));
  });
}

function viewOrders() {
  const list = filteredOrders();
  const tabs = [
    { value: "all", label: "Tất cả", count: state.orders.length },
    { value: "retail", label: "Bán lẻ", count: state.orders.filter((order) => order.type === "Bán lẻ").length },
    { value: "wholesale", label: "Bán sỉ", count: state.orders.filter((order) => order.type === "Bán sỉ").length },
    { value: "pending_payment", label: "Chờ thanh toán", count: state.orders.filter((order) => order.status === "pending_payment").length },
    { value: "holding", label: "Đang giữ", count: state.orders.filter((order) => order.status === "holding").length },
    { value: "overdue", label: "Quá hạn", count: state.orders.filter((order) => order.status === "overdue").length }
  ];
  return `${pageHead({
    title: "Đơn hàng",
    subtitle: "Đơn bán lẻ và đơn bán sỉ liên kết báo giá, hợp đồng, thanh toán và giữ hàng.",
    actions: `<button class="btn btn-secondary" data-action="export-orders">${icon("download")} Xuất danh sách</button>
      <button class="btn btn-primary" data-action="new-order">${icon("plus")} Tạo đơn bán lẻ</button>`
  })}
  <div class="card">
    <div class="table-toolbar">
      <div class="toolbar-left">
        <div class="search-box">${icon("search")}<input type="search" placeholder="Tìm mã đơn, khách hàng, phụ trách…" value="${escapeHtml(state.ui.orderSearch)}" data-list-search="orders" data-list-target="orders-table"></div>
        ${filterTabs("orderFilter", tabs, state.ui.orderFilter)}
      </div>
      <div class="toolbar-right">
        <input type="date" data-orders-date="from" value="${escapeHtml(state.ui.orderDateFrom || "")}" aria-label="Tạo từ ngày">
        <input type="date" data-orders-date="to" value="${escapeHtml(state.ui.orderDateTo || "")}" aria-label="Tạo đến ngày">
        <span class="small muted">Toàn bộ đơn hàng</span>
        <button class="icon-btn" data-action="refresh-orders" aria-label="Làm mới danh sách">${icon("refresh")}</button>
      </div>
    </div>
    <div id="orders-table">${ordersTableHtml(list)}</div>
    <div class="table-footer">
      <span>Hiển thị <strong>${list.length}</strong> / ${state.orders.length} đơn hàng</span>
      <span>Tổng giá trị đang xem: <strong>${money(list.reduce((sum, order) => sum + order.total, 0))}</strong></span>
    </div>
  </div>`;
}

function quoteTableHtml(list) {
  const rows = list.map((quote) => {
    const totals = quoteTotals(quote);
    return {
      href: hrefFor("quotes", quote.code),
      cells: [
        `<span class="row-link">${escapeHtml(quote.code)}</span><div class="cell-sub">v${quote.version} · ${escapeHtml(quote.createdAt)}</div>`,
        `<div class="cell-main"><span class="strong">${escapeHtml(customerName(quote.customerId))}</span><span class="cell-sub">${escapeHtml(quote.channel)}</span></div>`,
        `<span class="num strong">${money(totals.total)}</span>`,
        `<span class="num ${totals.discount ? "" : "muted"}">${totals.discount ? "-" + money(totals.discount) : "—"}</span>`,
        statusChip(quoteStatus(quote)),
        `<span class="${quoteIsExpired(quote) ? "muted" : ""}">${escapeHtml(quote.validUntil)}</span>`,
        `<span>${escapeHtml(quote.owner)}</span>`,
        `<div class="row-actions"><a class="btn btn-ghost btn-sm" href="${hrefFor("quotes", quote.code)}">${icon("chevron-right")}</a></div>`
      ]
    };
  });
  return dataTable([
    { label: "Mã báo giá" },
    { label: "Khách hàng" },
    { label: "Giá trị sau CK", align: "num" },
    { label: "Chiết khấu", align: "num" },
    { label: "Trạng thái" },
    { label: "Hiệu lực" },
    { label: "Phụ trách" },
    { label: "", align: "num" }
  ], rows, { minWidth: 1040 });
}

function filteredQuotes() {
  const filter = state.ui.quoteFilter;
  const search = state.ui.quoteSearch.trim().toLowerCase();
  return state.quotes.filter((quote) => {
    const matchesFilter = filter === "all" || quoteStatus(quote) === filter;
    const haystack = `${quote.code} ${customerName(quote.customerId)} ${quote.owner}`.toLowerCase();
    return matchesFilter && (!search || haystack.includes(search));
  });
}

function viewQuotes() {
  const list = filteredQuotes();
  const tabs = [
    { value: "all", label: "Tất cả", count: state.quotes.length },
    ...[["pending", "Chờ duyệt"], ["approved", "Đã duyệt"], ["rejected", "Từ chối"], ["expired", "Hết hiệu lực"]].map(([value, label]) => ({ value, label, count: state.quotes.filter((quote) => quoteStatus(quote) === value).length }))
  ];
  return `${pageHead({
    title: "Báo giá",
    subtitle: "Lập, điều chỉnh và kiểm soát phiên bản báo giá bán sỉ trước khi chuyển hợp đồng.",
    actions: `<button class="btn btn-secondary" data-action="export-quotes">${icon("download")} Xuất danh sách</button>
      <button class="btn btn-primary" data-action="new-quote">${icon("plus")} Tạo báo giá</button>`
  })}
  <div class="banner info mb-16">${icon("info")}<div><strong>Chiết khấu chỉ có hiệu lực sau khi Giám đốc phê duyệt.</strong> Báo giá hết hiệu lực không được dùng để tạo hợp đồng; hãy tạo phiên bản mới.</div></div>
  <div class="card">
    <div class="table-toolbar">
      <div class="toolbar-left">
        <div class="search-box">${icon("search")}<input type="search" placeholder="Tìm mã báo giá, khách hàng…" value="${escapeHtml(state.ui.quoteSearch)}" data-list-search="quotes" data-list-target="quotes-table"></div>
        ${filterTabs("quoteFilter", tabs, state.ui.quoteFilter)}
      </div>
      <div class="toolbar-right">
        <span class="muted small">${list.length} báo giá</span>
        <button class="icon-btn" data-action="refresh-quotes" aria-label="Làm mới">${icon("refresh")}</button>
      </div>
    </div>
    <div id="quotes-table">${quoteTableHtml(list)}</div>
    <div class="table-footer"><span>Hiển thị <strong>${list.length}</strong> / ${state.quotes.length} báo giá</span><span>Tổng giá trị: <strong>${money(list.reduce((sum, quote) => sum + quoteTotals(quote).total, 0))}</strong></span></div>
  </div>`;
}

function quoteStockBadge(line) {
  const product = productBySku(line.sku);
  if (!product) return "";
  const available = availableOf(product);
  if (available >= line.qty) {
    return `<span class="stock-note ok">${icon("check")} Đủ ${num(available)} ${escapeHtml(product.unit.toLowerCase())}</span>`;
  }
  return `<span class="stock-note low">${icon("alert")} Thiếu ${num(line.qty - available)} ${escapeHtml(product.unit.toLowerCase())}</span>`;
}

function quoteDiscountInputs(discount, basis, label, sku = "") {
  const key = sku ? ` data-sku="${escapeHtml(sku)}"` : "";
  const fixed = discount.mode === "fixed";
  return `<div style="display:grid;gap:4px;min-width:130px">
    <select class="select" data-qfield="discountMode"${key} aria-label="Cách tính ${label}">
      <option value="percent" ${fixed ? "" : "selected"}>Tỷ lệ (%)</option>
      <option value="fixed" ${fixed ? "selected" : ""}>Số tiền (VND)</option>
    </select>
    <div><input class="input" type="number" required min="0" max="${fixed ? basis : 100}" step="${fixed ? 1 : "any"}" value="${escapeHtml(discount.value)}" data-qfield="discount"${key} aria-label="Mức ${label}"></div>
  </div>`;
}

function quoteLinesHtml(quote) {
  if (!quote.lines.length) {
    return `<tr><td colspan="8">${emptyState("wine", "Chưa có dòng hàng", "Thêm sản phẩm rượu hoặc quà tặng để bắt đầu báo giá.", `<button class="btn btn-secondary btn-sm" data-action="add-line">${icon("plus")} Thêm sản phẩm</button>`)}</td></tr>`;
  }
  const editable = quoteEditable(quote);
  return quote.lines.map((line) => {
    const product = productBySku(line.sku);
    const amounts = quoteLineTotals(line);
    const discount = quoteLineDiscount(line);
    const name = escapeHtml(productName(line.sku));
    return `<tr>
      <td>${productCell(line.sku)}</td>
      <td class="muted">${escapeHtml(product?.unit)}</td>
      <td><input class="input qty" type="number" required min="1" max="1000000000" step="1" value="${escapeHtml(line.qty)}" data-qfield="qty" data-sku="${escapeHtml(line.sku)}" aria-label="Số lượng ${name}"></td>
      <td class="num">${money(amounts.price)}</td>
      <td>${editable ? quoteDiscountInputs(discount, amounts.subtotal, `chiết khấu ${name}`, line.sku) : escapeHtml(quoteDiscountLabel(discount))}</td>
      <td class="num strong" data-line-total="${escapeHtml(line.sku)}">${money(amounts.total)}</td>
      <td data-stock-badge="${escapeHtml(line.sku)}">${quoteStockBadge(line)}</td>
      <td><button class="btn btn-ghost btn-sm" data-action="remove-line" data-sku="${escapeHtml(line.sku)}" aria-label="Xóa ${name}">${icon("trash")}</button></td>
    </tr>`;
  }).join("");
}

function viewQuoteBuilder(code) {
  const isNew = code === "new";
  if (isNew && (!state.customers.length || !state.products.length)) return `${pageHead({ title: "Tạo báo giá" })}<section class="card">${emptyState("file", "Hoàn thiện danh mục trước khi lập báo giá", "Cần ít nhất một khách hàng và một sản phẩm đang kinh doanh.", '<a class="btn btn-primary" href="#/customers">Quản lý khách hàng</a><a class="btn btn-secondary" href="#/products">Quản lý sản phẩm</a>')}</section>`;
  if (isNew && !state.ui.draftQuote) {
    state.ui.draftQuote = {
      code: nextCode(state.quotes, "code", `BG-${new Date().getFullYear()}-`),
      customerId: state.customers[0].id,
      channel: "Bán sỉ",
      owner: currentUser().name,
      validUntil: new Date(Date.now() + state.settings.rules.quoteValidityDays * 86400000).toLocaleDateString("en-GB"),
      status: "draft",
      version: 1,
      createdAt: todayText(),
      lines: [],
      note: "",
      confirmed: false,
      approvalId: null,
      isNew: true
    };
  }
  const quote = isNew ? state.ui.draftQuote : quoteForEditing(code);
  if (!quote) {
    return pageHead({ title: "Không tìm thấy báo giá" }) + card({ body: emptyState("file", "Báo giá không tồn tại", "Liên kết có thể đã cũ hoặc báo giá đã bị xóa.", `<a class="btn btn-secondary" href="#/quotes">Quay lại danh sách</a>`) });
  }
  const totals = quoteTotals(quote);
  const wholeDiscount = quoteWholeDiscount(quote);
  const canPrint = ["approved", "confirmed"].includes(quote.status) && !quoteIsExpired(quote);
  const isPending = quote.status === "pending";
  const isExpired = quoteIsExpired(quote);
  const approvalBanner = isExpired
    ? `<div class="banner danger mb-16">${icon("alert")}<div><strong>Báo giá đã hết hiệu lực ${escapeHtml(quote.validUntil)}.</strong> Tạo phiên bản mới trước khi gửi khách hoặc chuyển hợp đồng.</div></div>`
    : isPending
      ? `<div class="banner warning mb-16">${icon("clock")}<div><strong>Đang chờ Giám đốc phê duyệt chiết khấu.</strong> Báo giá chưa được xuất PDF cho khách cho tới khi có quyết định.</div></div>`
      : quote.status === "approved"
        ? `<div class="banner success mb-16">${icon("check-circle")}<div><strong>Chiết khấu đã được phê duyệt.</strong> Báo giá sẵn sàng để xác nhận với khách và xuất PDF.</div></div>`
        : `<div class="banner info mb-16">${icon("file")}<div><strong>Báo giá đang soạn.</strong> Nội dung được lưu để tiếp tục chỉnh sửa trên thiết bị. Bấm Lưu thay đổi để cập nhật bản ghi hoặc Gửi duyệt khi đã hoàn thiện.</div></div>`;

  return `${pageHead({
    breadcrumb: `<a href="#/quotes">Báo giá</a> ${icon("chevron-right")} <span>${escapeHtml(quote.code)}</span>`,
    title: quote.code,
    status: statusChip(quoteStatus(quote)),
    subtitle: `${customerName(quote.customerId)} · ${quote.channel} · Phiên bản v${quote.version}`,
    actions: `<a class="btn btn-ghost" href="#/quotes">${icon("arrow-left")} Quay lại</a>
      <button class="btn btn-secondary" data-action="duplicate-quote">${icon("plus")} Nhân bản</button>
      ${quote.status === "approved" && !quote.confirmed && !isExpired ? `<button class="btn btn-secondary" data-action="confirm-quote">${icon("check")} Khách xác nhận</button>` : ""}
      <button class="btn btn-secondary" data-action="save-quote">${icon("check")} Lưu thay đổi</button>
      <button class="btn btn-secondary" data-action="print-quote" ${canPrint ? "" : "disabled"}>${icon("printer")} Xuất PDF</button>
      <button class="btn btn-primary" data-action="submit-quote" ${quoteEditable(quote) ? "" : "disabled"}>${icon("check-circle")} Gửi duyệt</button>`
  })}
  ${approvalBanner}
  <div class="grid grid-main">
    <div class="stack">
      ${card({
        title: "Thông tin báo giá",
        iconName: "file",
        body: `<div class="form-grid">
          <div class="field"><label>Khách hàng</label><select class="select" data-qmeta="customerId" ${quote.status === "pending" || quote.status === "approved" ? "disabled" : ""}>${state.customers.filter((customer) => customer.type === "Bán sỉ").map((customer) => `<option value="${customer.id}" ${customer.id === quote.customerId ? "selected" : ""}>${escapeHtml(customer.name)}</option>`).join("")}</select></div>
          <div class="field"><label>Kênh</label><select class="select" data-qmeta="channel"><option ${quote.channel === "Bán sỉ" ? "selected" : ""}>Bán sỉ</option><option ${quote.channel === "Bán lẻ" ? "selected" : ""}>Bán lẻ</option></select></div>
          <div class="field"><label>Hiệu lực đến</label><input class="input" type="text" value="${escapeHtml(quote.validUntil)}" data-qmeta="validUntil" ${quote.status === "pending" || quote.status === "approved" ? "disabled" : ""}></div>
          <div class="field"><label>Phụ trách</label><select class="select" data-qmeta="owner">${state.users.filter((user) => user.status === "user_active" && (user.dept === "Kinh doanh" || user.name === quote.owner)).map((user) => `<option ${user.name === quote.owner ? "selected" : ""}>${escapeHtml(user.name)}</option>`).join("")}</select></div>
          <div class="field full"><label>Bảng giá áp dụng</label><input class="input" value="Giá bán sỉ đã ghi nhận tại thời điểm lập báo giá" readonly></div>
        </div>`
      })}
      ${card({
        title: "Dòng hàng",
        subtitle: `${quote.lines.length} sản phẩm · ${totals.qty} đơn vị`,
        iconName: "wine",
        actions: `<button class="btn btn-secondary btn-sm" data-action="add-line">${icon("plus")} Thêm sản phẩm</button>`,
        flush: true,
        body: `<div class="table-wrap"><table class="data quote-lines" style="min-width:980px"><thead><tr><th>Sản phẩm</th><th>ĐVT</th><th class="num">SL</th><th class="num">Giá sỉ</th><th>Chiết khấu dòng</th><th class="num">Thành tiền</th><th>Tồn kho</th><th></th></tr></thead><tbody>${quoteLinesHtml(quote)}</tbody></table></div>`
      })}
      ${card({
        title: "Ghi chú & điều khoản",
        iconName: "edit",
        body: `<div class="field"><label>Điều khoản trao đổi với khách</label><textarea class="textarea" data-qmeta="note" placeholder="Ví dụ: Giao 2 đợt · Thanh toán 50/50 theo hợp đồng">${escapeHtml(quote.note)}</textarea><div class="hint">Nội dung này xuất hiện trên bản PDF gửi khách.</div></div>`
      })}
    </div>
    <div class="stack">
      ${card({
        title: "Tổng hợp báo giá",
        iconName: "card",
        body: `${quoteEditable(quote) ? `<div class="field mb-16"><label>Chiết khấu toàn báo giá</label>
          ${quoteDiscountInputs(wholeDiscount, totals.afterLines, "chiết khấu toàn báo giá")}
          <div class="hint">Tính trên số tiền còn lại sau chiết khấu từng dòng.</div></div>` : ""}
        <div class="summary-list" aria-live="polite">
          <div class="summary-row"><span>Tạm tính</span><span class="value" id="q-subtotal">${money(totals.subtotal)}</span></div>
          <div class="summary-row"><span>Chiết khấu dòng</span><span class="value discount" id="q-line-discount">${discountMoney(totals.lineDiscount)}</span></div>
          <div class="summary-row"><span>Sau chiết khấu dòng</span><span class="value" id="q-after-lines">${money(totals.afterLines)}</span></div>
          <div class="summary-row"><span>Chiết khấu toàn báo giá${!quoteEditable(quote) && wholeDiscount.mode === "percent" && wholeDiscount.value ? ` (${escapeHtml(quoteDiscountLabel(wholeDiscount))})` : ""}</span><span class="value discount" id="q-whole-discount">${discountMoney(totals.wholeDiscount)}</span></div>
          <div class="summary-row"><span>Tổng chiết khấu</span><span class="value discount" id="q-discount">${discountMoney(totals.discount)}</span></div>
          <div class="summary-row total"><span>Tổng cộng</span><span class="value" id="q-total">${money(totals.total)}</span></div>
        </div>
        <label class="checkline mt-16"><input type="checkbox" data-qcheck="confirmed" ${quote.confirmed ? "checked" : ""}> Khách đã xác nhận nội dung báo giá</label>
        <div class="card-foot" style="padding:14px 0 0;border-top:0">
           <button class="btn btn-primary btn-block" data-action="submit-quote" ${quoteEditable(quote) ? "" : "disabled"}>${icon("check-circle")} Gửi duyệt chiết khấu</button>
        </div>
        <div class="hint mt-8">Mức chiết khấu chỉ có hiệu lực sau khi được Giám đốc phê duyệt.</div>`
      })}
      ${card({
        title: "Phiên bản & phê duyệt",
        iconName: "history",
        body: `<div class="timeline">
           <div class="timeline-item info"><div class="timeline-title">Tạo báo giá v${quote.version}</div><div class="timeline-date">${escapeHtml(quote.createdAt)} · ${escapeHtml(quote.owner)}</div></div>
           <div class="timeline-item ${quote.status === "approved" ? "success" : "info"}"><div class="timeline-title">${escapeHtml(STATUS_META[quote.status]?.label || quote.status)}</div><div class="timeline-date">v${quote.version} · ${quote.status === "approved" ? "Được phép xuất báo giá" : "Chỉ gửi khách sau khi được duyệt"}</div></div>
           ${quote.approvalId ? `<div class="timeline-item info"><div class="timeline-title">Hồ sơ phê duyệt ${escapeHtml(quote.approvalId)}</div><div class="timeline-date">Xem quyết định tại Trung tâm phê duyệt</div></div>` : ""}
        </div>`
      })}
      ${card({
        title: "Kiểm soát trước khi gửi",
        iconName: "shield",
        body: `<div class="rule-list">
          <div class="rule-item">${icon("check-circle")}<div class="rule-main"><div class="rule-title">Chiết khấu hợp lệ</div><div class="rule-sub">Tỷ lệ từ 0 đến 100%; số tiền VND không âm và không vượt giá trị áp dụng.</div></div></div>
          <div class="rule-item">${icon("check-circle")}<div class="rule-main"><div class="rule-title">Tồn khả dụng được kiểm tra theo từng dòng</div><div class="rule-sub">Cảnh báo nếu số lượng đặt vượt tồn khả dụng hiện tại.</div></div></div>
          <div class="rule-item">${icon("shield")}<div class="rule-main"><div class="rule-title">Không xuất PDF khi chưa duyệt</div><div class="rule-sub">Chỉ báo giá đã duyệt hoặc đã xác nhận mới được gửi khách.</div></div></div>
        </div>`
      })}
    </div>
  </div>`;
}

function orderTimeline(order) {
  const events = [];
  events.push({ tone: "info", title: `Tạo đơn ${order.code}`, date: `${order.created} · ${order.owner}` });
  if (order.quote) events.push({ tone: "success", title: `Liên kết báo giá ${order.quote}`, date: "Báo giá đã được duyệt" });
  if (order.contract) events.push({ tone: "success", title: `Liên kết hợp đồng ${order.contract}`, date: "Điều khoản đã được xác nhận" });
  if (order.paid > 0) events.push({ tone: "success", title: `Ghi nhận thanh toán ${money(order.paid)}`, date: `Được xác nhận bởi ${[...new Set(state.payments.filter((payment) => payment.status === "confirmed" && [order.code, order.contract].includes(payment.record)).map((payment) => payment.confirmedBy))].filter(Boolean).join(", ") || "người phụ trách"}` });
  const held = order.lines.reduce((sum, line) => sum + line.held, 0);
  if (held > 0) events.push({ tone: "info", title: `Giữ hàng ${held} đơn vị`, date: "Có cọc/thanh toán đủ điều kiện" });
  const shipped = order.lines.reduce((sum, line) => sum + line.shipped, 0);
  if (shipped > 0) events.push({ tone: "success", title: `Xuất kho ${shipped} đơn vị`, date: "Theo phiếu xuất kho" });
  if (order.status === "completed") events.push({ tone: "success", title: "Giao hàng hoàn tất", date: "Khách đã xác nhận nhận hàng" });
  if (order.status === "overdue") events.push({ tone: "danger", title: "Công nợ quá hạn", date: "Cần Kế toán theo dõi và nhắc thanh toán" });
  state.audit.filter((entry) => entry.object === order.code).forEach((entry) => {
    events.push({ tone: entry.tone, title: entry.action, date: `${entry.time} · ${entry.actor}` });
  });
  return `<div class="timeline">${events.map((event) => `<div class="timeline-item ${event.tone}"><div class="timeline-title">${escapeHtml(event.title)}</div><div class="timeline-date">${escapeHtml(event.date)}</div></div>`).join("")}</div>`;
}

function viewOrderDetail(code) {
  const order = orderByCode(code);
  if (!order) {
    return pageHead({ title: "Không tìm thấy đơn hàng" }) + card({ body: emptyState("cart", "Đơn hàng không tồn tại", "Liên kết có thể đã cũ hoặc đơn hàng đã bị xóa.", `<a class="btn btn-secondary" href="#/orders">Quay lại danh sách</a>`) });
  }
  const quote = order.quote ? quoteByCode(order.quote) : null;
  const contract = order.contract ? contractByCode(order.contract) : null;
  const remaining = Math.max(0, order.total - order.paid);
  const totalHeld = order.lines.reduce((sum, line) => sum + line.held, 0);
  const totalShipped = order.lines.reduce((sum, line) => sum + line.shipped, 0);
  const eligible = orderEligible(order);
  const lock = stockLock(order.lines.filter((line) => line.held > 0).map((line) => line.sku));
  const plan = issuePlan(order);
  const hasRequest = order.issueRequest?.status === "pending";
  const requestMatches = hasRequest && order.issueRequest.key === issuePlanKey(plan);
  const delivery = state.deliveries.find((item) => item.order === order.code);
  const paymentProgress = order.total ? Math.round((order.paid / order.total) * 100) : 0;
  const blockedReason = lock
    ? `Kho đang khóa kiểm kê ${lock.code}; không thể lập phiếu xuất.`
    : plan.error || (!requestMatches ? "Chưa có yêu cầu xuất hợp lệ từ Bán hàng." : "");
  const trace = [
    { label: "Báo giá", code: order.quote || "—", status: quote ? quote.status : "planned", tone: quote && quote.status === "approved" ? "done" : "blocked" },
    { label: "Hợp đồng", code: order.contract || "—", status: contract ? contract.status : "planned", tone: contract && (contract.status === "active" || contract.status === "signed") ? "done" : "blocked" },
    { label: "Đơn hàng", code: order.code, status: order.status, tone: "current" },
    { label: "Thanh toán", code: money(order.paid), status: orderPaidStatus(order), tone: order.paid > 0 ? "done" : "blocked" },
    { label: "Giữ hàng", code: totalHeld ? `${num(totalHeld)} đv` : "—", status: totalHeld ? "holding" : "planned", tone: totalHeld ? "done" : "blocked" },
    { label: "Xuất kho", code: totalShipped ? `${num(totalShipped)} đv` : "—", status: totalShipped ? "issued" : "planned", tone: totalShipped ? "done" : "blocked" },
    { label: "Giao nhận", code: delivery ? delivery.code : "—", status: delivery ? delivery.status : "planned", tone: delivery && delivery.status === "delivered" ? "done" : "blocked" }
  ];

  return `${pageHead({
    breadcrumb: `<a href="#/orders">Đơn hàng</a> ${icon("chevron-right")} <span>${escapeHtml(order.code)}</span>`,
    title: order.code,
    status: statusChip(order.status),
    subtitle: `${customerName(order.customerId)} · ${order.type} · ${order.channel}`,
    actions: `<a class="btn btn-ghost" href="#/orders">${icon("arrow-left")} Quay lại</a>
      <button class="btn btn-secondary" data-action="print-order" data-code="${escapeHtml(order.code)}">${icon("printer")} In đơn</button>
      ${canChangeOrder(order) && ACTION_ROLES["edit-order"].includes(state.role) ? `<button class="btn btn-secondary" data-action="edit-order" data-code="${escapeHtml(order.code)}">${icon("edit")} Sửa đơn</button><button class="btn btn-secondary" data-action="cancel-order" data-code="${escapeHtml(order.code)}">Hủy đơn</button>` : ""}
      <button class="btn btn-secondary" data-action="open-payment" data-record="${escapeHtml(order.code)}" ${remaining <= 0 || order.status === "cancelled" ? "disabled" : ""}>${icon("card")} Ghi nhận thanh toán</button>
      ${ACTION_ROLES["request-issue"].includes(state.role) ? `<button class="btn btn-primary" data-action="request-issue" data-code="${escapeHtml(order.code)}" ${plan.error || hasRequest ? "disabled" : ""} title="${escapeHtml(plan.error || "")}">${icon("package")} Yêu cầu xuất kho</button>` : ""}
      ${hasRequest && ACTION_ROLES["cancel-issue-request"].includes(state.role) ? `<button class="btn btn-secondary" data-action="cancel-issue-request" data-code="${escapeHtml(order.code)}">Hủy yêu cầu xuất</button>` : ""}
      ${ACTION_ROLES["issue-order"].includes(state.role) ? `<button class="btn btn-primary" data-action="issue-order" data-code="${escapeHtml(order.code)}" ${blockedReason ? "disabled" : ""} title="${escapeHtml(blockedReason)}">${icon("package")} Xác nhận xuất kho</button>` : ""}`
  })}
   ${lock ? `<div class="banner locked mb-16">${icon("lock")}<div><strong>Có hàng đang thuộc kỳ kiểm kê ${escapeHtml(lock.code)}.</strong> Không xác nhận xuất các SKU đang khóa cho tới khi kỳ được đóng.</div><a class="banner-link" href="${hrefFor("stocktakes", lock.code)}">Mở kỳ kiểm kê</a></div>` : ""}
   ${order.status === "cancelled" ? `<div class="banner warning mb-16"><strong>Đơn đã hủy.</strong> ${escapeHtml(order.cancelReason || "")}</div>` : !eligible ? `<div class="banner warning mb-16">${icon("alert")}<div><strong>Chưa đủ điều kiện giữ hàng.</strong> ${escapeHtml(orderEligibilityReason(order))}.</div><a class="banner-link" href="#/payments">Ghi nhận thanh toán</a></div>` : ""}
   ${order.paymentAdjustment ? `<div class="banner warning mb-16"><strong>Tiền chờ Kế toán đối chiếu: ${money(order.paymentAdjustment)}.</strong> Chưa ghi nhận hoàn tiền.</div>` : ""}
   ${hasRequest ? `<div class="banner ${requestMatches ? "info" : "warning"} mb-16"><div><strong>Yêu cầu xuất của ${escapeHtml(order.issueRequest.requestedBy)}.</strong> ${requestMatches ? "Chờ Thủ kho xác nhận; chưa giảm tồn." : "Lượng giữ không còn khớp. Hủy yêu cầu và lập lại."}</div></div>` : !plan.error ? `<div class="banner success mb-16"><div><strong>Đủ điều kiện yêu cầu xuất kho.</strong> Bán hàng gửi yêu cầu trước khi Thủ kho ghi xuất.</div></div>` : ""}
  <div class="card mb-16"><div style="padding:14px 16px"><div class="trace">${trace.map((step) => `<div class="trace-step ${step.tone}"><span class="t-label">${escapeHtml(step.label)}</span><span class="t-code">${escapeHtml(step.code)}</span><span class="t-status">${STATUS_META[step.status] ? escapeHtml(STATUS_META[step.status].label) : escapeHtml(step.status)}</span></div>`).join("")}</div></div></div>

  <div class="stat-grid mb-16">
    <div class="stat-card"><div class="stat-label">Giá trị đơn</div><div class="stat-value">${money(order.total)}</div><div class="stat-note">${escapeHtml(order.type)}</div></div>
    <div class="stat-card"><div class="stat-label">Đã thanh toán</div><div class="stat-value">${money(order.paid)}</div><div class="stat-note">${paymentProgress}% · còn ${money(remaining)}</div></div>
    <div class="stat-card"><div class="stat-label">Đang giữ</div><div class="stat-value">${num(totalHeld)}</div><div class="stat-note">đơn vị đã cam kết</div></div>
    <div class="stat-card"><div class="stat-label">Đã xuất / giao</div><div class="stat-value">${num(totalShipped)}</div><div class="stat-note">${totalShipped ? "đã bàn giao" : "chưa xuất kho"}</div></div>
  </div>

  <div class="grid grid-main">
    <div class="stack">
      ${card({
        title: "Hàng hóa trên đơn",
        subtitle: `${order.lines.length} dòng hàng`,
        iconName: "wine",
        flush: true,
        body: dataTable([
          { label: "Sản phẩm" },
          { label: "Đặt", align: "num" },
          { label: "Đang giữ", align: "num" },
          { label: "Đã xuất", align: "num" },
          { label: "Còn lại", align: "num" },
          { label: "Tồn khả dụng", align: "num" }
        ], order.lines.map((line) => {
          const product = productBySku(line.sku);
          return {
            cells: [
              productCell(line.sku),
              `<span class="num">${num(line.qty)}</span>`,
              `<span class="num">${num(line.held)}</span>`,
              `<span class="num">${num(line.shipped)}</span>`,
              `<span class="num strong">${num(line.qty - line.shipped)}</span>`,
              `<span class="num">${num(availableOf(product))}</span>`
            ]
          };
        }), { minWidth: 760 })
      })}
      ${card({
        title: "Lịch sử xử lý",
        subtitle: "Dòng thời gian trạng thái và phê duyệt",
        iconName: "history",
        body: orderTimeline(order)
      })}
    </div>
    <div class="stack">
      ${card({
        title: "Điều kiện thực hiện",
        iconName: "shield",
        body: `<div class="summary-list">
          <div class="summary-row"><span>Điều kiện thanh toán</span><span class="value">${order.type === "Bán lẻ" ? "100%" : contract ? contract.scheme : "Theo hợp đồng"}</span></div>
          <div class="summary-row"><span>Đã thanh toán</span><span class="value">${money(order.paid)}</span></div>
          <div class="summary-row"><span>Còn phải thu</span><span class="value ${remaining ? "discount" : ""}">${money(remaining)}</span></div>
          <div class="summary-row"><span>Giữ hàng</span><span class="value">${totalHeld ? `${num(totalHeld)} đơn vị` : "Chưa giữ"}</span></div>
        </div>
        <div class="progress-row mt-16"><span class="progress-label">Tiến độ thanh toán</span><span class="progress-value">${paymentProgress}%</span><div class="progress ${paymentProgress >= 100 ? "success" : ""}"><span style="width:${paymentProgress}%"></span></div></div>
        ${remaining > 0 ? `<button class="btn btn-secondary btn-block mt-16" data-action="open-payment" data-record="${escapeHtml(order.code)}">${icon("card")} Ghi nhận thanh toán</button>` : ""}`
      })}
      ${card({
        title: "Liên kết nghiệp vụ",
        iconName: "file-check",
        body: `<div class="summary-list">
          <div class="summary-row"><span>Báo giá</span><span class="value">${order.quote ? `<a href="${hrefFor("quotes", order.quote)}">${escapeHtml(order.quote)}</a>` : "—"}</span></div>
          <div class="summary-row"><span>Hợp đồng</span><span class="value">${order.contract ? `<a href="${hrefFor("contracts", order.contract)}">${escapeHtml(order.contract)}</a>` : "—"}</span></div>
          <div class="summary-row"><span>Giữ hàng</span><span class="value"><a href="#/reservations">Xem ${state.reservations.filter((item) => item.order === order.code).length} bản ghi</a></span></div>
          <div class="summary-row"><span>Giao nhận</span><span class="value">${delivery ? `<a href="#/deliveries">${escapeHtml(delivery.code)}</a>` : "Chưa tạo"}</span></div>
        </div>`
      })}
      ${card({
        title: "Ghi chú",
        iconName: "edit",
        body: `<p class="small muted">${escapeHtml(order.note || "Chưa có ghi chú.")}</p>`
      })}
    </div>
  </div>`;
}

function contractTableHtml(list) {
  const rows = list.map((contract) => {
    const remaining = Math.max(0, contract.value - contract.paid);
    return {
      href: hrefFor("contracts", contract.code),
      cells: [
        `<span class="row-link">${escapeHtml(contract.code)}</span><div class="cell-sub">${contract.quote ? escapeHtml(contract.quote) : "Không qua báo giá"}</div>`,
        `<span class="strong">${escapeHtml(customerName(contract.customerId))}</span><div class="cell-sub">${escapeHtml(contract.owner)}</div>`,
        `<span class="num strong">${money(contract.value)}</span>`,
        `<span class="num">${money(contract.paid)}</span>`,
        `<span class="num ${remaining ? "" : "muted"}">${money(remaining)}</span>`,
        statusChip(contract.status),
        `<span>${escapeHtml(contract.scheme)}</span>`,
        `<div class="row-actions"><a class="btn btn-ghost btn-sm" href="${hrefFor("contracts", contract.code)}">${icon("chevron-right")}</a></div>`
      ]
    };
  });
  return dataTable([
    { label: "Hợp đồng" },
    { label: "Khách hàng" },
    { label: "Giá trị", align: "num" },
    { label: "Đã thu", align: "num" },
    { label: "Còn lại", align: "num" },
    { label: "Trạng thái" },
    { label: "Thanh toán" },
    { label: "", align: "num" }
  ], rows, { minWidth: 1040 });
}

function filteredContracts() {
  const filter = state.ui.contractFilter;
  const search = state.ui.contractSearch.trim().toLowerCase();
  return state.contracts.filter((contract) => {
    const matchesFilter = filter === "all" || contract.status === filter;
    const haystack = `${contract.code} ${customerName(contract.customerId)} ${contract.owner}`.toLowerCase();
    return matchesFilter && (!search || haystack.includes(search));
  });
}

function viewContracts() {
  const list = filteredContracts();
  const tabs = [
    { value: "all", label: "Tất cả", count: state.contracts.length },
    { value: "active", label: "Đang thực hiện", count: state.contracts.filter((contract) => contract.status === "active").length },
    { value: "pending_sign", label: "Chờ ký", count: state.contracts.filter((contract) => contract.status === "pending_sign").length },
    { value: "liquidated", label: "Đã thanh lý", count: state.contracts.filter((contract) => contract.status === "liquidated").length }
  ];
  return `${pageHead({
    title: "Hợp đồng bán sỉ",
    subtitle: "Quản lý ký kết, đợt giao, thanh toán và chứng từ theo từng hợp đồng.",
    actions: `<button class="btn btn-secondary" data-action="export-contracts">${icon("download")} Xuất danh sách</button>
      <button class="btn btn-primary" data-action="new-contract">${icon("plus")} Tạo hợp đồng</button>`
  })}
  <div class="banner info mb-16">${icon("file-check")}<div><strong>Lịch giao hàng và lịch thanh toán là hai thông tin độc lập.</strong> Hệ thống không tự sinh đợt thanh toán theo từng đợt giao.</div></div>
  <div class="card">
    <div class="table-toolbar">
      <div class="toolbar-left">
        <div class="search-box">${icon("search")}<input type="search" placeholder="Tìm mã hợp đồng, khách hàng…" value="${escapeHtml(state.ui.contractSearch)}" data-list-search="contracts" data-list-target="contracts-table"></div>
        ${filterTabs("contractFilter", tabs, state.ui.contractFilter)}
      </div>
      <div class="toolbar-right"><span class="muted small">${list.length} hợp đồng</span><button class="icon-btn" data-action="refresh-contracts" aria-label="Làm mới">${icon("refresh")}</button></div>
    </div>
    <div id="contracts-table">${contractTableHtml(list)}</div>
    <div class="table-footer"><span>Hiển thị <strong>${list.length}</strong> / ${state.contracts.length} hợp đồng</span><span>Tổng giá trị: <strong>${money(list.reduce((sum, contract) => sum + contract.value, 0))}</strong></span></div>
  </div>`;
}

const CONTRACT_CHECKS = [
  ["accountantCheck", "Kế toán kiểm tra điều khoản"],
  ["customerConfirm", "Khách xác nhận nội dung hợp đồng"],
  ["directorSign", "Giám đốc ký, đóng dấu"],
  ["customerSign", "Khách hoàn tất ký"],
  ["scan", "Bản scan đủ chữ ký đã tải lên"]
];

function checklistHtml(contract) {
  const requestChange = !contract.changeRequestResolved && contract.status === "checking" && state.role === "accountant" && !contract.checklist.accountantCheck;
  return `${contract.changeRequest && !contract.changeRequestResolved ? `<div class="banner warning mb-16"><div><strong>Kế toán yêu cầu chỉnh sửa (${escapeHtml(contract.changeRequest.by)} · ${escapeHtml(contract.changeRequest.at)}).</strong> ${escapeHtml(contract.changeRequest.note)} Cần cập nhật hồ sơ và trình lại để Kế toán kiểm tra.</div></div>` : ""}<div class="checklist">${CONTRACT_CHECKS.map(([key, label]) => `<button class="check-item ${contract.checklist[key] ? "checked" : ""}" data-action="contract-check" data-code="${escapeHtml(contract.code)}" data-field="${key}" ${contractCheckError(contract, key) ? "disabled" : ""}>
    <span class="check-box">${icon("check")}</span>
    <span>${escapeHtml(label)}${key === "scan" ? `<span class="check-note">Bắt buộc trước khi chuyển sang Đã ký</span>` : ""}</span>
  </button>`).join("")}${requestChange ? `<button class="btn btn-secondary btn-block mt-12" data-action="request-contract-changes" data-code="${escapeHtml(contract.code)}">${icon("edit")} Yêu cầu chỉnh sửa</button>` : ""}</div>`;
}

function contractShipmentsHtml(contract) {
  return dataTable([
    { label: "Đợt" },
    { label: "Ngày dự kiến" },
    { label: "Hàng hóa" },
    { label: "Số lượng", align: "num" },
    { label: "Trạng thái" },
    { label: "Ghi chú" }
  ], contract.shipments.map((shipment) => {
    const qty = shipment.items.reduce((sum, item) => sum + item.qty, 0);
    return {
      cells: [
        `<span class="strong">${escapeHtml(shipment.id)}</span>`,
        `<span>${escapeHtml(shipment.date)}</span>`,
        `<div class="cell-main">${shipment.items.map((item) => `<span>${num(item.qty)} × ${escapeHtml(productName(item.sku))}</span>`).join("")}</div>`,
        `<span class="num strong">${num(qty)}</span>`,
        statusChip(shipment.status),
        `<span class="muted">${escapeHtml(shipment.note || "")}</span>`
      ]
    };
  }), { minWidth: 860, empty: emptyState("truck", "Chưa có lịch giao hàng", "Lập từng đợt giao theo số lượng và thời gian đã thỏa thuận trong hợp đồng.", contract.status === "active" ? `<button class="btn btn-secondary btn-sm" data-action="add-shipment" data-code="${contract.code}">Lập đợt giao</button>` : "") });
}

function paymentScheduleHtml(contract) {
  const milestones = contract.scheme === "50/50"
    ? [
        { label: "Đợt 1 · 50%", amount: Math.round(contract.value * 0.5), due: contract.signedAt || "Theo thỏa thuận", paid: Math.min(contract.paid, Math.round(contract.value * 0.5)) },
        { label: "Đợt 2 · 50%", amount: contract.value - Math.round(contract.value * 0.5), due: contract.due, paid: Math.max(0, contract.paid - Math.round(contract.value * 0.5)) }
      ]
    : [ { label: "Thanh toán 100%", amount: contract.value, due: contract.due, paid: contract.paid } ];
  return `<div class="table-wrap"><table class="data" style="min-width:700px"><thead><tr><th>Đợt thanh toán</th><th class="num">Số tiền</th><th>Hạn</th><th class="num">Đã thu</th><th>Trạng thái</th></tr></thead><tbody>${milestones.map((milestone) => `<tr><td class="strong">${escapeHtml(milestone.label)}</td><td class="num">${money(milestone.amount)}</td><td>${escapeHtml(milestone.due)}</td><td class="num">${money(milestone.paid)}</td><td>${statusChip(milestone.paid >= milestone.amount ? "paid" : milestone.paid > 0 ? "partial" : "unpaid")}</td></tr>`).join("")}</tbody></table></div>`;
}

function contractDocumentsHtml(contract) {
  const docs = state.documents.filter((document) => document.record === contract.code);
  return dataTable([
    { label: "Mã chứng từ" },
    { label: "Loại" },
    { label: "Ngày" },
    { label: "Tệp" },
    { label: "Người tạo" },
    { label: "", align: "num" }
  ], docs.map((document) => ({
    cells: [
      `<span class="strong">${escapeHtml(document.code)}</span>`,
      `<span>${escapeHtml(document.type)}</span>`,
      `<span>${escapeHtml(document.date)}</span>`,
          document.fileId ? `<button class="file-chip" data-action="view-attachment" data-id="${document.fileId}">${icon("file")}${escapeHtml(document.file)}</button>` : attachmentChip(document.file, document.record),
      `<span>${escapeHtml(document.owner)}</span>`,
      `<button class="btn btn-ghost btn-sm" data-action="print-document" data-code="${escapeHtml(document.code)}">${icon("printer")} In</button>`
    ]
  })), { minWidth: 760, empty: emptyState("file", "Chưa có chứng từ đính kèm", "Tệp hợp đồng được bổ sung ở checklist ký kết; hóa đơn và phiếu thu được liên kết theo giao dịch.") });
}

function contractHistoryHtml(contract) {
  const events = [
    { tone: "info", title: `Tạo hợp đồng từ ${contract.quote || "báo giá đã duyệt"}`, date: contract.signedAt || "Chưa ký" },
    { tone: contract.checklist.accountantCheck ? "success" : "warning", title: "Kế toán kiểm tra điều khoản", date: contract.checklist.accountantCheck ? "Đã xác nhận hợp lệ" : "Chưa thực hiện" },
    { tone: contract.checklist.directorSign ? "success" : "warning", title: "Giám đốc ký, đóng dấu", date: contract.checklist.directorSign ? "Đã hoàn tất" : "Chưa thực hiện" },
    { tone: contract.checklist.customerSign ? "success" : "warning", title: "Khách hoàn tất ký", date: contract.checklist.customerSign ? "Đã hoàn tất" : "Chưa thực hiện" },
    { tone: contract.checklist.scan ? "success" : "warning", title: "Lưu bản scan hợp đồng", date: contract.checklist.scan ? "Đã tải lên" : "Chưa có tệp" }
  ];
  state.audit.filter((entry) => entry.object === contract.code).forEach((entry) => {
    events.push({ tone: entry.tone, title: entry.action, date: `${entry.time} · ${entry.actor}` });
  });
  return `<div class="timeline">${events.map((event) => `<div class="timeline-item ${event.tone}"><div class="timeline-title">${escapeHtml(event.title)}</div><div class="timeline-date">${escapeHtml(event.date)}</div></div>`).join("")}</div>`;
}

function viewContractDetail(code) {
  const contract = contractByCode(code);
  if (!contract) {
    return pageHead({ title: "Không tìm thấy hợp đồng" }) + card({ body: emptyState("file-check", "Hợp đồng không tồn tại", "Liên kết có thể đã cũ hoặc hợp đồng đã bị xóa.", `<a class="btn btn-secondary" href="#/contracts">Quay lại danh sách</a>`) });
  }
  const remaining = Math.max(0, contract.value - contract.paid);
  const paidPercent = contract.value ? Math.round((contract.paid / contract.value) * 100) : 0;
  const totalQty = contract.lines.reduce((sum, line) => sum + line.qty, 0);
  const delivered = contract.lines.reduce((sum, line) => sum + Math.min(line.qty, deliveredContractQty(contract, line.sku)), 0);
  const deliveryPercent = totalQty ? Math.round((delivered / totalQty) * 100) : 0;
  const activeTab = state.ui.contractTab;
  const tabs = [
    { key: "overview", label: "Tổng quan" },
    { key: "shipments", label: "Đợt giao", count: contract.shipments.length },
    { key: "payments", label: "Thanh toán" },
    { key: "documents", label: "Chứng từ", count: state.documents.filter((document) => document.record === contract.code).length },
    { key: "history", label: "Lịch sử" }
  ];
  const content = activeTab === "shipments"
    ? card({ title: "Kế hoạch giao hàng", subtitle: "Tổng lượng các đợt không vượt hợp đồng", iconName: "truck", actions: contract.status !== "pending_sign" ? `<button class="btn btn-secondary btn-sm" data-action="add-shipment" data-code="${escapeHtml(contract.code)}">${icon("plus")} Lập đợt giao</button>` : "", flush: true, body: contractShipmentsHtml(contract) })
    : activeTab === "payments"
      ? card({ title: "Thanh toán theo hợp đồng", subtitle: "Độc lập với tiến độ giao hàng", iconName: "card", flush: true, body: `${paymentScheduleHtml(contract)}<div class="card-body"><div class="progress-row"><span class="progress-label">Đã thu</span><span class="progress-value">${money(contract.paid)} / ${money(contract.value)}</span><div class="progress success"><span style="width:${paidPercent}%"></span></div></div><button class="btn btn-secondary mt-16" data-action="open-payment" data-record="${escapeHtml(contract.code)}">${icon("card")} Ghi nhận thanh toán</button></div>` })
      : activeTab === "documents"
        ? card({ title: "Chứng từ liên quan", subtitle: "Hợp đồng, báo giá, phiếu thu và hóa đơn", iconName: "file", flush: true, body: contractDocumentsHtml(contract) })
        : activeTab === "history"
          ? card({ title: "Lịch sử xử lý", iconName: "history", body: contractHistoryHtml(contract) })
          : `<div class="grid grid-main">
              <div class="stack">
                ${card({
                  title: "Thông tin hợp đồng",
                  iconName: "file-check",
                  body: `<div class="kv-grid">
                    <div><div class="kv-label">Khách hàng</div><div class="kv-value">${escapeHtml(customerName(contract.customerId))}</div></div>
                    <div><div class="kv-label">Phụ trách</div><div class="kv-value">${escapeHtml(contract.owner)}</div></div>
                    <div><div class="kv-label">Báo giá nguồn</div><div class="kv-value">${contract.quote ? `<a href="${hrefFor("quotes", contract.quote)}">${escapeHtml(contract.quote)}</a>` : "—"}</div></div>
                    <div><div class="kv-label">Phương án thanh toán</div><div class="kv-value">${escapeHtml(contract.scheme)}</div></div>
                    <div><div class="kv-label">Hạn thanh toán</div><div class="kv-value">${escapeHtml(contract.due)}</div></div>
                    <div><div class="kv-label">Ngày ký</div><div class="kv-value">${escapeHtml(contract.signedAt || "Chưa ký")}</div></div>
                  </div>`
                })}
                ${card({
                  title: "Hàng hóa",
                  iconName: "wine",
                  flush: true,
                  body: dataTable([
                    { label: "Sản phẩm" },
                    { label: "Số lượng hợp đồng", align: "num" },
                    { label: "ĐVT" }
                  ], contract.lines.map((line) => ({
                    cells: [productCell(line.sku), `<span class="num">${num(line.qty)}</span>`, `<span class="muted">${escapeHtml(productBySku(line.sku).unit)}</span>`]
                  })), { minWidth: 560 })
                })}
                ${card({
                  title: "Tiến độ giao hàng",
                  actions: `<button class="btn btn-ghost btn-sm" data-tab-group="contract" data-tab-value="shipments">Xem chi tiết</button>`,
                  flush: true,
                  body: contractShipmentsHtml(contract)
                })}
              </div>
              <div class="stack">
                ${card({
                  title: "Tổng quan thực hiện",
                  iconName: "chart",
                  body: `<div class="summary-list">
                    <div class="summary-row"><span>Giá trị hợp đồng</span><span class="value">${money(contract.value)}</span></div>
                    <div class="summary-row"><span>Đã thu</span><span class="value">${money(contract.paid)}</span></div>
                    <div class="summary-row"><span>Còn phải thu</span><span class="value">${money(remaining)}</span></div>
                    <div class="summary-row"><span>Đã giao / tổng</span><span class="value">${num(delivered)} / ${num(totalQty)}</span></div>
                  </div>
                  <div class="progress-row mt-16"><span class="progress-label">Giao hàng</span><span class="progress-value">${deliveryPercent}%</span><div class="progress"><span style="width:${deliveryPercent}%"></span></div></div>
                  <div class="progress-row mt-12"><span class="progress-label">Thanh toán</span><span class="progress-value">${paidPercent}%</span><div class="progress success"><span style="width:${paidPercent}%"></span></div></div>`
                })}
                ${card({
                  title: "Checklist ký kết",
                  subtitle: ["pending_sign", "checking"].includes(contract.status) ? "Từng vai trò xác nhận bước thuộc thẩm quyền" : "Đã hoàn tất",
                  iconName: "shield",
                  body: checklistHtml(contract) + (contract.status === "pending_sign" ? `<button class="btn btn-secondary btn-block mt-12" data-action="upload-scan" data-code="${escapeHtml(contract.code)}" ${contractCheckError(contract, "scan") ? "disabled" : ""}>${icon("upload")} Tải bản scan hợp đồng</button>` : "")
                })}
                ${contract.status === "pending_sign" ? `<div class="banner warning">${icon("alert")}<div><strong>Chưa thể thực hiện giao hàng.</strong> Hợp đồng cần đủ chữ ký và bản scan trước khi chuyển sang trạng thái Đang thực hiện.</div></div>` : ""}
              </div>
            </div>`;

  return `${pageHead({
    breadcrumb: `<a href="#/contracts">Hợp đồng</a> ${icon("chevron-right")} <span>${escapeHtml(contract.code)}</span>`,
    title: contract.code,
    status: statusChip(contract.status),
    subtitle: `${customerName(contract.customerId)} · ${contract.scheme} · ${contract.owner}`,
    actions: `<a class="btn btn-ghost" href="#/contracts">${icon("arrow-left")} Quay lại</a>
      <button class="btn btn-secondary" data-action="print-contract" data-code="${escapeHtml(contract.code)}">${icon("printer")} In hợp đồng</button>
      ${contract.status === "active" ? `<button class="btn btn-primary" data-action="create-wholesale-order" data-code="${escapeHtml(contract.code)}">${icon("cart")}${state.orders.some((order) => order.contract === contract.code) ? "Mở đơn thực hiện" : "Tạo đơn thực hiện"}</button>` : ""}
      <button class="btn btn-secondary" data-action="open-payment" data-record="${escapeHtml(contract.code)}" ${contract.status === "pending_sign" ? "disabled" : ""}>${icon("card")} Ghi nhận thanh toán</button>
      <button class="btn ${contract.status === "active" ? "btn-primary" : "btn-ghost"}" data-action="liquidate-contract" data-code="${escapeHtml(contract.code)}" ${canLiquidateContract(contract) ? "" : "disabled"}>${icon("check-circle")} Thanh lý</button>`
  })}
  <div class="card mb-16"><div style="padding:14px 16px"><div class="trace">
    <div class="trace-step done"><span class="t-label">Báo giá</span><span class="t-code">${escapeHtml(contract.quote || "—")}</span><span class="t-status">Đã duyệt</span></div>
    <div class="trace-step current"><span class="t-label">Hợp đồng</span><span class="t-code">${escapeHtml(contract.code)}</span><span class="t-status">${STATUS_META[contract.status].label}</span></div>
    <div class="trace-step ${contract.paid > 0 ? "done" : "blocked"}"><span class="t-label">Thanh toán</span><span class="t-code">${money(contract.paid)}</span><span class="t-status">${contract.paid >= contract.value ? "Đã thu đủ" : "Còn phải thu"}</span></div>
    <div class="trace-step ${delivered > 0 ? "done" : "blocked"}"><span class="t-label">Giao hàng</span><span class="t-code">${num(delivered)} / ${num(totalQty)}</span><span class="t-status">${deliveryPercent}%</span></div>
    <div class="trace-step ${contract.checklist.scan ? "done" : "blocked"}"><span class="t-label">Chứng từ</span><span class="t-code">${contract.checklist.scan ? "Đủ chữ ký" : "Thiếu scan"}</span><span class="t-status">${contract.checklist.scan ? "Đã lưu" : "Cần bổ sung"}</span></div>
  </div></div></div>
  <div class="card">
    ${tabsBar("contract", tabs, activeTab)}
    <div class="card-body" style="padding:0">${content}</div>
  </div>`;
}
