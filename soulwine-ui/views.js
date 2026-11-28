state.ui.availabilitySearch = state.ui.availabilitySearch || "";
state.ui.auditSearch = state.ui.auditSearch || "";
state.ui.movementSearch = state.ui.movementSearch || "";
state.ui.movementType = state.ui.movementType || "all";
state.ui.docFilter = state.ui.docFilter || "all";
state.ui.docSearch = state.ui.docSearch || "";

function supplierName(id) {
  const supplier = state.suppliers.find((item) => item.id === id);
  return supplier ? supplier.name : id;
}

function stockChip(product) {
  const available = availableOf(product);
  if (available <= 0) return statusChip("out");
  if (available < product.min) return statusChip("low");
  return `<span class="chip success"><span class="dot"></span>Đủ hàng</span>`;
}

function availabilityTableHtml(list) {
  return dataTable([
    { label: "Sản phẩm" },
    { label: "Tồn vật lý", align: "num" },
    { label: "Đang giữ", align: "num" },
    { label: "Lỗi / chờ xử lý", align: "num" },
    { label: "Tồn khả dụng", align: "num" },
    { label: "Định mức tối thiểu", align: "num" },
    { label: "Trạng thái" },
    { label: "", align: "num" }
  ], list.map((product) => ({
    cells: [
      productCell(product.sku),
      `<span class="num">${num(product.physical)}</span>`,
      `<span class="num">${num(product.held)}</span>`,
      `<span class="num">${num(product.damaged)}</span>`,
      `<span class="num strong" style="color:${availableOf(product) < product.min ? "var(--danger)" : "var(--ink-900)"}">${num(availableOf(product))}</span>`,
      `<span class="num muted">${num(product.min)}</span>`,
      stockChip(product),
      `<button class="btn btn-secondary btn-sm" data-action="open-reserve" data-sku="${escapeHtml(product.sku)}" ${product.status !== "product_active" ? "disabled" : ""}>${icon("lock")} Giữ hàng</button>`
    ]
  })), { minWidth: 1080 });
}

function filteredAvailability() {
  const search = state.ui.availabilitySearch.trim().toLowerCase();
  return state.products.filter((product) => {
    const haystack = `${product.sku} ${product.name} ${product.category} ${product.origin}`.toLowerCase();
    return !search || haystack.includes(search);
  });
}

function viewAvailability() {
  const list = filteredAvailability();
  const totalAvailable = state.products.reduce((sum, product) => sum + availableOf(product), 0);
  const totalHeld = state.products.reduce((sum, product) => sum + product.held, 0);
  const low = state.products.filter((product) => product.status === "product_active" && availableOf(product) < product.min).length;
  const reservations = state.reservations.filter((reservation) => reservation.status === "holding");
  return `${pageHead({
    title: "Tồn kho khả dụng",
    subtitle: `Số liệu cập nhật lúc ${state.lastRefresh} · đơn vị tính theo từng sản phẩm.`,
    actions: `<button class="btn btn-secondary" data-action="opening-stock">${icon("plus")} Tồn đầu kỳ</button><button class="btn btn-secondary" data-action="refresh-availability">${icon("refresh")} Làm mới</button>
      <button class="btn btn-secondary" data-action="bulk-check">${icon("check-circle")} Kiểm tra hàng loạt</button>
      <button class="btn btn-primary" data-action="export-availability">${icon("download")} Xuất tồn kho</button>`
  })}
  <div class="banner info mb-16">${icon("box")}<div><strong>Tồn khả dụng = tồn vật lý − đang giữ − hàng lỗi/chờ xử lý.</strong> Chỉ số lượng khả dụng mới được dùng để cam kết bán; mọi thay đổi giữ hàng đều được ghi thẻ kho.</div></div>
  <div class="stat-grid mb-16">
    <div class="stat-card"><div class="stat-label">Tồn khả dụng</div><div class="stat-value">${num(totalAvailable)}</div><div class="stat-note">đơn vị có thể bán</div></div>
    <div class="stat-card"><div class="stat-label">Đang giữ</div><div class="stat-value">${num(totalHeld)}</div><div class="stat-note">${reservations.length} bản ghi giữ hàng</div></div>
    <div class="stat-card"><div class="stat-label">SKU dưới định mức</div><div class="stat-value" style="color:${low ? "var(--danger)" : "var(--success)"}">${low}</div><div class="stat-note">cần xem xét bổ sung</div></div>
    <div class="stat-card"><div class="stat-label">Kỳ kiểm kê</div><div class="stat-value" style="color:${stockLock() ? "var(--warning)" : "var(--success)"}">${stockLock() ? "Đang khóa" : "Mở"}</div><div class="stat-note">${stockLock() ? stockLock().code : "Không có khóa giao dịch"}</div></div>
  </div>
  <div class="card">
    <div class="table-toolbar">
      <div class="toolbar-left">
        <div class="search-box">${icon("search")}<input type="search" placeholder="Tìm SKU, tên sản phẩm, xuất xứ…" value="${escapeHtml(state.ui.availabilitySearch)}" data-list-search="availability" data-list-target="availability-table"></div>
      </div>
      <div class="toolbar-right"><span class="muted small">${list.length} SKU · ${state.lastRefresh}</span></div>
    </div>
    <div id="availability-table">${availabilityTableHtml(list)}</div>
    <div class="table-footer"><span>Đang hiển thị <strong>${list.length}</strong> / ${state.products.length} SKU</span><a class="link-btn" href="#/reservations">Quản lý giữ hàng</a></div>
  </div>`;
}

function viewReservations() {
  const rows = state.reservations.map((reservation) => ({
    cells: [
      `<span class="strong">${escapeHtml(reservation.order)}</span><div class="cell-sub">${escapeHtml(reservation.id)}</div>`,
      `<span>${escapeHtml(customerName(reservation.customerId))}</span>`,
      productCell(reservation.sku),
      `<span class="num strong">${num(reservation.qty)}</span>`,
      `<span>${escapeHtml(reservation.since)}</span>`,
      `<span class="muted">${reservation.expiry ? escapeHtml(reservation.expiry) : "Chưa xác nhận thời hạn"}</span>`,
      statusChip(reservation.status),
      `<button class="btn btn-ghost btn-sm" data-action="release-reservation" data-id="${escapeHtml(reservation.id)}" ${reservation.status !== "holding" ? "disabled" : ""}>${icon("refresh")} Nhả giữ</button>`
    ]
  }));
  const total = state.reservations.filter((reservation) => reservation.status === "holding").reduce((sum, reservation) => sum + reservation.qty, 0);
  return `${pageHead({
    title: "Giữ hàng",
    subtitle: "Bảo vệ lượng hàng đã cam kết cho đơn có cọc hoặc thanh toán đủ điều kiện.",
    actions: `<button class="btn btn-secondary" data-action="export-reservations">${icon("download")} Xuất danh sách</button>
      <button class="btn btn-primary" data-action="open-reserve">${icon("lock")} Tạo giữ hàng</button>`
  })}
  <div class="banner info mb-16">${icon("shield")}<div><strong>Chỉ giữ hàng sau khi có cọc hoặc thanh toán đủ.</strong> Hết thời hạn chỉ là nhắc việc; nhả giữ luôn cần Quản lý kho xác nhận kèm lý do.</div></div>
  <div class="card">
    <div class="table-toolbar">
      <div class="toolbar-left"><span class="strong">${state.reservations.filter((reservation) => reservation.status === "holding").length} bản ghi đang giữ</span><span class="muted small">Tổng ${num(total)} đơn vị</span></div>
      <div class="toolbar-right"><a class="link-btn" href="#/movements">Xem thẻ kho</a></div>
    </div>
    ${dataTable([
      { label: "Đơn hàng" },
      { label: "Khách hàng" },
      { label: "Sản phẩm" },
      { label: "Số lượng", align: "num" },
      { label: "Từ ngày" },
      { label: "Hạn giữ" },
      { label: "Trạng thái" },
      { label: "", align: "num" }
    ], rows, { minWidth: 1040 })}
    <div class="table-footer"><span>Hàng đang giữ không làm tăng/giảm tồn vật lý; chỉ làm giảm tồn khả dụng.</span><span>0 đơn giữ vượt tồn</span></div>
  </div>`;
}

function arStatusKey(record) {
  if (record.remaining <= 0) return "paid";
  if (record.status === "overdue") return "overdue";
  if (record.paid > 0) return "partial";
  return "unpaid";
}

function viewPayments() {
  const ar = arRecords();
  const filter = state.ui.paymentFilter;
  const list = ar.filter((record) => filter === "all" || arStatusKey(record) === filter);
  const total = ar.reduce((sum, record) => sum + record.total, 0);
  const paid = ar.reduce((sum, record) => sum + record.paid, 0);
  const remaining = ar.reduce((sum, record) => sum + record.remaining, 0);
  const overdue = ar.filter((record) => arStatusKey(record) === "overdue").reduce((sum, record) => sum + record.remaining, 0);
  const tabs = [
    { value: "all", label: "Tất cả", count: ar.length },
    { value: "unpaid", label: "Chưa thanh toán", count: ar.filter((record) => arStatusKey(record) === "unpaid").length },
    { value: "partial", label: "Một phần", count: ar.filter((record) => arStatusKey(record) === "partial").length },
    { value: "paid", label: "Đã thu đủ", count: ar.filter((record) => arStatusKey(record) === "paid").length },
    { value: "overdue", label: "Quá hạn", count: ar.filter((record) => arStatusKey(record) === "overdue").length }
  ];
  const rows = list.map((record) => ({
    cells: [
      `<span class="strong">${escapeHtml(record.id)}</span><div class="cell-sub">${escapeHtml(record.kind)}</div>`,
      `<span>${escapeHtml(customerName(record.customerId))}</span>`,
      `<span class="num">${money(record.total)}</span>`,
      `<span class="num">${money(record.paid)}</span>`,
      `<span class="num strong">${money(record.remaining)}</span>`,
      `<span class="${arStatusKey(record) === "overdue" ? "strong" : ""}" style="${arStatusKey(record) === "overdue" ? "color:var(--danger)" : ""}">${escapeHtml(record.due)}</span>`,
      statusChip(arStatusKey(record)),
      `<div class="row-actions"><button class="btn btn-secondary btn-sm" data-action="open-payment" data-record="${escapeHtml(record.id)}" ${record.remaining <= 0 ? "disabled" : ""}>${icon("card")} Ghi nhận TT</button><button class="btn btn-ghost btn-sm" data-action="open-invoice" data-record="${escapeHtml(record.id)}" title="Thông tin hóa đơn">${icon("file")}</button></div>`
    ]
  }));
  const paymentRows = state.payments.map((payment) => ({
    cells: [
      `<span class="strong">${escapeHtml(payment.id)}</span>`,
      `<span>${escapeHtml(payment.record)}</span><div class="cell-sub">${escapeHtml(customerName(payment.customerId))}</div>`,
      `<span class="num strong">${money(payment.amount)}</span>`,
      `<span>${escapeHtml(payment.date)}</span>`,
      `<span>${escapeHtml(payment.method)}</span>`,
      `<span class="mono-code">${escapeHtml(payment.reference)}</span>`,
      statusChip(payment.status),
      `<span>${escapeHtml(payment.confirmedBy || "—")}</span>`
    ]
  }));
  return `${pageHead({
    title: "Thanh toán & công nợ",
    subtitle: "Ghi nhận, xác nhận và đối chiếu thanh toán theo hợp đồng, đơn hàng và kênh bán.",
    actions: `<button class="btn btn-secondary" data-action="export-payments">${icon("download")} Xuất sổ</button>
      <button class="btn btn-primary" data-action="open-payment">${icon("card")} Ghi nhận thanh toán</button>`
  })}
  <div class="banner info mb-16">${icon("card")}<div><strong>Hệ thống chỉ ghi nhận và đối chiếu thanh toán.</strong> Chưa kết nối trực tiếp ngân hàng/cổng thanh toán; chứng từ chuyển khoản do Kế toán xác nhận.</div></div>
  <div class="stat-grid mb-16">
    <div class="stat-card"><div class="stat-label">Tổng phải thu</div><div class="stat-value">${money(total)}</div><div class="stat-note">${ar.length} nghĩa vụ thanh toán</div></div>
    <div class="stat-card"><div class="stat-label">Đã thu</div><div class="stat-value" style="color:var(--success)">${money(paid)}</div><div class="stat-note">${Math.round(paid / Math.max(total, 1) * 100)}% tổng phải thu</div></div>
    <div class="stat-card"><div class="stat-label">Còn phải thu</div><div class="stat-value">${money(remaining)}</div><div class="stat-note">theo hợp đồng và đơn bán lẻ</div></div>
    <div class="stat-card"><div class="stat-label">Quá hạn</div><div class="stat-value" style="color:var(--danger)">${money(overdue)}</div><div class="stat-note">cần Kế toán theo dõi</div></div>
  </div>
  <div class="card mb-16">
    <div class="table-toolbar">
      <div class="toolbar-left">${filterTabs("paymentFilter", tabs, filter)}</div>
      <div class="toolbar-right"><span class="muted small">${list.length} bản ghi</span></div>
    </div>
    ${dataTable([
      { label: "Chứng từ / nghĩa vụ" },
      { label: "Khách hàng" },
      { label: "Tổng giá trị", align: "num" },
      { label: "Đã thu", align: "num" },
      { label: "Còn lại", align: "num" },
      { label: "Hạn" },
      { label: "Trạng thái" },
      { label: "", align: "num" }
    ], rows, { minWidth: 1120 })}
    <div class="table-footer"><span>Hiển thị <strong>${list.length}</strong> / ${ar.length} nghĩa vụ</span><span>Tổng còn lại: <strong>${money(list.reduce((sum, record) => sum + record.remaining, 0))}</strong></span></div>
  </div>
  <div class="card">
    <div class="card-head">
      <div><div class="card-title">${icon("history")}Lịch sử ghi nhận thanh toán</div><div class="card-sub">Theo dõi trạng thái xác nhận và chứng từ</div></div>
      <a class="link-btn" href="#/approvals">Mở trung tâm phê duyệt</a>
    </div>
    ${dataTable([
      { label: "Mã giao dịch" },
      { label: "Liên kết" },
      { label: "Số tiền", align: "num" },
      { label: "Ngày nhận" },
      { label: "Phương thức" },
      { label: "Tham chiếu" },
      { label: "Trạng thái" },
      { label: "Người xác nhận" }
    ], paymentRows, { minWidth: 1120 })}
    <div class="table-footer"><span>${state.payments.filter((payment) => payment.status === "pending_confirm").length} giao dịch chờ Kế toán xác nhận.</span><span>Đối chiếu qua chứng từ và mã tham chiếu</span></div>
  </div>`;
}

function visibleApprovals() {
  let list = state.approvals.filter((approval) => state.role === "director" || approval.assignee === state.role);
  if (state.ui.approvalFilter === "pending") list = list.filter((approval) => approval.status === "pending");
  if (state.ui.approvalFilter === "resolved") list = list.filter((approval) => approval.status !== "pending");
  return list;
}

function approvalDetailHtml(approval) {
  if (!approval) {
    return emptyState("check-circle", "Không có hồ sơ", "Chọn một hồ sơ trong danh sách để xem chi tiết.");
  }
  const canDecide = approval.status === "pending" && approval.assignee === state.role;
  const lines = approval.lines && approval.lines.length
    ? dataTable([
        { label: "Sản phẩm" },
        { label: "Số lượng", align: "num" },
        { label: "Chiết khấu", align: "num" },
        { label: "Thành tiền", align: "num" }
      ], approval.lines.map((line) => {
        const product = productBySku(line.sku);
        const gross = (line.price ?? product.wholesale) * line.qty;
        return {
          cells: [
            productCell(line.sku),
            `<span class="num">${num(line.qty)}</span>`,
            `<span class="num">${line.discount ? pct(line.discount, 0) : "—"}</span>`,
            `<span class="num strong">${money(gross - Math.round(gross * (line.discount || 0) / 100))}</span>`
          ]
        };
      }), { minWidth: 620 })
    : "";
  return `<div class="approval-detail-head">
    <div>
      <div class="approval-detail-title">${escapeHtml(approval.title)} · ${escapeHtml(approval.ref)}</div>
      <div class="approval-detail-sub">${approvalTypeLabel(approval.type)} · Gửi bởi ${escapeHtml(approval.requester)} · ${approvalAge(approval)}</div>
    </div>
    ${statusChip(approval.status)}
  </div>
  <div class="approval-detail-body">
    <div class="kv-grid mb-16">
      <div><div class="kv-label">Giá trị hồ sơ</div><div class="kv-value">${money(approval.amount)}</div></div>
      <div><div class="kv-label">Người xử lý</div><div class="kv-value">${ROLES[approval.assignee] ? ROLES[approval.assignee].label : approval.assignee}</div></div>
      <div><div class="kv-label">Thời điểm gửi</div><div class="kv-value">${escapeHtml(approval.createdAt)}</div></div>
      <div><div class="kv-label">Thời hạn phản hồi</div><div class="kv-value muted">${state.settings.rules.approvalHours ? `${state.settings.rules.approvalHours} giờ làm việc` : "Không đặt thời hạn"}</div></div>
    </div>
    <p class="small" style="line-height:1.65">${escapeHtml(approval.summary)}</p>
    ${lines ? `<div class="mt-16">${lines}</div>` : ""}
    <div class="mt-16"><div class="section-title">Chứng từ & căn cứ</div><div class="flex flex-wrap gap-8">${approval.evidence.map((file) => attachmentChip(file, approval.ref)).join("") || '<span class="hint">Không có tệp đính kèm; đối chiếu thông tin nghiệp vụ trong hồ sơ.</span>'}</div></div>
    ${approval.type === "purchase" && state.purchaseRequests.some((request) => request.code === approval.ref) ? purchaseRequestProcessing(state.purchaseRequests.find((request) => request.code === approval.ref)) : ""}
    ${approval.status === "pending" ? `<div class="decision-box mt-16">
      <div class="flex items-center justify-between gap-12 mb-8"><strong style="font-size:12px">Quyết định phê duyệt</strong>${statusChip("pending")}</div>
      ${canDecide ? `<div class="field"><label for="decision-reason">Lý do / ghi chú (bắt buộc khi từ chối)</label><textarea class="textarea" id="decision-reason" placeholder="Nêu căn cứ hoặc hướng dẫn điều chỉnh…"></textarea><div class="error hidden" id="decision-error">${icon("alert")} Vui lòng nhập lý do trước khi từ chối.</div></div>
      <div class="decision-actions"><button class="btn btn-danger" data-action="reject-approval" data-id="${escapeHtml(approval.id)}">${icon("x")} Từ chối</button><button class="btn btn-primary" data-action="approve-approval" data-id="${escapeHtml(approval.id)}">${icon("check")} Phê duyệt</button></div>`
      : `<div class="banner info">${icon("user")}<div>Hồ sơ này do <strong>${ROLES[approval.assignee] ? ROLES[approval.assignee].label : approval.assignee}</strong> xử lý. Bạn có thể xem nhưng không thay đổi quyết định.</div></div>`}
    </div>` : `<div class="banner success mt-16">${icon("check-circle")}<div><strong>Đã ${approval.status === "approved" ? "phê duyệt" : "từ chối"} bởi ${escapeHtml(approval.decidedBy || "người có thẩm quyền")}.</strong> ${escapeHtml(approval.decisionNote || "")}<br><span class="small">${escapeHtml(approval.decidedAt || "")}</span></div></div>`}
  </div>`;
}

function viewApprovals() {
  const list = visibleApprovals();
  const selected = list.find((approval) => approval.id === state.ui.selectedApproval) || list[0];
  const pending = state.approvals.filter((approval) => approval.status === "pending").length;
  const resolved = state.approvals.filter((approval) => approval.status !== "pending").length;
  const tabs = [
    { value: "pending", label: "Chờ xử lý", count: pending },
    { value: "resolved", label: "Đã xử lý", count: resolved },
    { value: "all", label: "Tất cả", count: state.approvals.length }
  ];
  return `${pageHead({
    title: "Trung tâm phê duyệt",
    subtitle: "Tập trung hồ sơ cần xác nhận, thời gian chờ và kết quả xử lý của từng bên.",
    actions: canExportApprovalHistory() ? reportExportActions("export-approvals", list.length > 0) : ""
  })}
  <div class="banner info mb-16">${icon("shield")}<div>Đối chiếu giá trị, chứng từ và người xử lý trước khi quyết định. Từ chối cần nêu rõ lý do; mọi quyết định được ghi nhật ký.</div></div>
  <div class="card">
    <div class="table-toolbar">
      <div class="toolbar-left">${filterTabs("approvalFilter", tabs, state.ui.approvalFilter)}</div>
      <div class="toolbar-right"><span class="muted small">${pending} hồ sơ đang chờ</span></div>
    </div>
    <div class="approval-layout">
      <div class="approval-list">${list.length ? list.map((approval) => `<button class="approval-item ${selected && selected.id === approval.id ? "active" : ""}" data-action="select-approval" data-id="${escapeHtml(approval.id)}">
        <span class="approval-item-top"><span class="approval-item-code">${escapeHtml(approval.ref)}</span>${statusChip(approval.status)}</span>
        <span class="approval-item-title">${escapeHtml(approval.title)}</span>
        <span class="approval-item-sub">${escapeHtml(approval.requester)} · ${money(approval.amount)}</span>
        <span class="approval-item-meta"><span>${icon("clock")} ${approvalAge(approval)}</span><span>${ROLES[approval.assignee] ? ROLES[approval.assignee].label : approval.assignee}</span></span>
      </button>`).join("") : emptyState("check-circle", "Không có hồ sơ", "Bộ lọc hiện tại không có hồ sơ phù hợp.")}</div>
      <div id="approval-detail">${approvalDetailHtml(selected)}</div>
    </div>
  </div>`;
}

function receiptVariance(line) {
  if (!line.ordered || line.received === null) return 0;
  return ((line.received - line.ordered) / line.ordered) * 100;
}

function receiptOverThreshold(receipt) {
  const threshold = receiptThreshold(receipt);
  return threshold !== null && receipt.lines.some((line) => line.counted && (Math.abs(receiptVariance(line)) > threshold || receiptDefectRate(line) > threshold));
}
function receiptDefectRate(line) { return line.ordered > 0 ? (line.damaged || 0) / line.ordered * 100 : 0; }

function receiptThreshold(receipt) { return receipt.source ? null : receipt.status === "receiving" ? state.settings.rules.receiptTolerance : receipt.threshold ?? state.settings.rules.receiptTolerance; }
function receiptCountsComplete(receipt) { return receipt.lines.every((line) => line.counted && [line.received, line.good, line.damaged].every((value) => Number.isSafeInteger(value) && value >= 0)); }
function receiptHasVariance(receipt) { return !receipt.source && receipt.lines.some((line) => (Number.isSafeInteger(line.received) && line.received !== line.ordered) || line.damaged > 0); }
function purchaseCostReceipt(order) {
  const receipt = order.status === "completed" && receiptByCode(order.receipt);
  return receipt && receipt.po === order.code && !receipt.source && receipt.status === "completed" && receipt.lines.some((line) => line.received !== line.ordered || line.damaged > 0) ? receipt : null;
}
function receiptAssessment(receipt) {
  if (receipt.po && receipt.status === "returned") return '<div class="banner danger">Đã trả lô, không ghi tăng tồn. Giữ nguyên kết quả và chứng từ này để đối chiếu lần giao lại.</div>';
  if (receipt.po && receipt.status === "completed") return '<div class="banner success">Đã xác nhận nhập kho theo kết quả kiểm đếm trên phiếu.</div>';
  if (!receiptCountsComplete(receipt)) return '<div class="banner info">Nhập đủ số lượng thực nhận, hàng đạt và hư hỏng của từng dòng để đối chiếu.</div>';
  if (receipt.lines.some((line) => line.good + line.damaged !== line.received)) return '<div class="banner danger">Tổng hàng đạt + hư hỏng phải bằng số thực nhận ở từng dòng.</div>';
  if (receiptHasVariance(receipt) && !String(receipt.varianceNote || "").trim()) return '<div class="banner warning" role="alert">Ghi loại và nguyên nhân sai lệch trước khi xác nhận kết quả.</div>';
  if (!receipt.source && receiptThreshold(receipt) === null) return '<div class="banner warning">Chưa thiết lập ngưỡng sai lệch tiếp nhận.<a class="banner-link" href="#/settings">Mở cấu hình</a></div>';
  if (!receipt.evidence.length) return '<div class="banner warning">Đính kèm phiếu giao hoặc biên bản kiểm đếm trước khi xác nhận kết quả.</div>';
  if (receipt.source) return `<div class="banner info"><strong>Kết quả đối chiếu chứng từ:</strong> ${escapeHtml(receipt.note)}</div>`;
  return receiptOverThreshold(receipt) ? '<div class="banner danger">Có dòng vượt ngưỡng sai lệch. Trả lô, yêu cầu giao lại; không xác nhận hàng đạt vào kho.</div>' : '<div class="banner success">Kết quả trong ngưỡng tiếp nhận. Quản lý kho kiểm tra chứng từ trước khi ghi nhập.</div>';
}

function viewReceipts() {
  const rows = state.receipts.map((receipt) => ({
    href: hrefFor("receipts", receipt.code),
    cells: [
      `<span class="row-link">${escapeHtml(receipt.code)}</span><div class="cell-sub">${escapeHtml(receipt.eta)}</div>`,
      `<span>${escapeHtml(receipt.po || receipt.source)}</span>`,
      `<span>${escapeHtml(supplierName(receipt.supplier))}</span>`,
      `<span class="num">${receipt.lines.length}</span>`,
      statusChip(receipt.status),
      `<span>${escapeHtml(receipt.owner)}</span>`,
      `<div class="row-actions"><a class="btn btn-ghost btn-sm" href="${hrefFor("receipts", receipt.code)}">${icon("chevron-right")}</a></div>`
    ]
  }));
  return `${pageHead({
    title: "Tiếp nhận hàng",
    subtitle: "Kiểm đếm, đối chiếu với đơn đặt hàng và xử lý sai lệch trước khi ghi nhập kho.",
    actions: `<button class="btn btn-secondary" data-action="export-receipts">${icon("download")} Xuất danh sách</button><button class="btn btn-secondary" data-action="create-basic-receipt">${icon("plus")} Nhập từ chứng từ nguồn</button><button class="btn btn-primary" data-action="create-receipt">${icon("plus")} Tạo phiếu tiếp nhận</button>`
  })}
   ${state.settings.rules.receiptTolerance === null ? '<div class="banner warning mb-16">Nhập theo đơn đặt hàng cần thiết lập ngưỡng sai lệch. Nhập từ chứng từ nguồn không cần cấu hình này.<a class="banner-link" href="#/settings">Mở cấu hình</a></div>' : `<div class="banner info mb-16">Ngưỡng sai lệch khi nhập theo đơn đặt hàng: ${state.settings.rules.receiptTolerance}%. Lô vượt ngưỡng phải được trả lại và yêu cầu giao lại.</div>`}
  <div class="card">
    ${dataTable([
      { label: "Phiếu tiếp nhận" },
      { label: "Đơn đặt hàng / chứng từ nguồn" },
      { label: "Nhà cung cấp" },
      { label: "Số dòng", align: "num" },
      { label: "Trạng thái" },
      { label: "Phụ trách" },
      { label: "", align: "num" }
    ], rows, { minWidth: 900 })}
    <div class="table-footer"><span>${state.receipts.length} phiếu · ${state.receipts.filter((receipt) => receipt.status === "receiving").length} đang tiếp nhận</span><span>Đối chiếu theo đơn đặt hàng</span></div>
  </div>`;
}

function viewReceiptDetail(code) {
  const receipt = receiptByCode(code);
  if (!receipt) {
    return pageHead({ title: "Không tìm thấy phiếu tiếp nhận" }) + card({ body: emptyState("truck", "Phiếu không tồn tại", "Liên kết có thể đã cũ hoặc phiếu đã bị xóa.", `<a class="btn btn-secondary" href="#/receipts">Quay lại</a>`) });
  }
  const lock = receipt.status === "receiving" && stockLock(receipt.lines.map((line) => line.sku));
  const over = receiptOverThreshold(receipt);
  const totalOrdered = receipt.lines.reduce((sum, line) => sum + line.ordered, 0);
  const totalReceived = receipt.lines.reduce((sum, line) => sum + line.received, 0);
  const totalGood = receipt.lines.reduce((sum, line) => sum + line.good, 0);
  const totalDamaged = receipt.lines.reduce((sum, line) => sum + line.damaged, 0);
  const editable = receipt.status === "receiving";
  const order = receipt.po && state.purchaseOrders.find((item) => item.code === receipt.po);
  const nextAttempt = order && state.receipts.find((item) => item.po === order.code && item.previousReceipt === receipt.code);
  const costReceipt = order && purchaseCostReceipt(order) === receipt;
  const rows = receipt.lines.map((line) => {
    const variance = receiptVariance(line);
    const within = receiptThreshold(receipt) !== null && Math.abs(variance) <= receiptThreshold(receipt) && receiptDefectRate(line) <= receiptThreshold(receipt);
    return {
      cells: [
        productCell(line.sku),
        `<span class="num">${num(line.ordered)}</span>`,
        `<input class="input sm num-input" type="number" min="0" step="1" value="${line.received ?? ""}" data-rc-field="received" data-code="${escapeHtml(receipt.code)}" data-sku="${escapeHtml(line.sku)}" ${editable ? "" : "disabled"}>`,
        `<input class="input sm num-input" type="number" min="0" step="1" value="${line.good ?? ""}" data-rc-field="good" data-code="${escapeHtml(receipt.code)}" data-sku="${escapeHtml(line.sku)}" ${editable ? "" : "disabled"}>`,
        `<input class="input sm num-input" type="number" min="0" step="1" value="${line.damaged ?? ""}" data-rc-field="damaged" data-code="${escapeHtml(receipt.code)}" data-sku="${escapeHtml(line.sku)}" ${editable ? "" : "disabled"}>`,
        `<span class="num strong" data-rc-variance="${line.sku}" style="color:${within ? "var(--ink-900)" : "var(--danger)"}">${!line.counted ? "—" : `${variance > 0 ? "+" : ""}${pct(variance)}`}</span>`,
        `<span data-rc-assessment="${line.sku}" class="chip ${!line.counted || receiptThreshold(receipt) === null ? "neutral" : within ? "success" : "danger"}">${!line.counted ? "Chưa đếm" : receiptThreshold(receipt) === null ? "Chưa có ngưỡng" : within ? "Trong ngưỡng" : "Vượt ngưỡng"}</span>`
      ]
    };
  });
  return `${pageHead({
    breadcrumb: `<a href="#/receipts">Tiếp nhận hàng</a> ${icon("chevron-right")} <span>${escapeHtml(receipt.code)}</span>`,
    title: receipt.code,
    status: statusChip(receipt.status),
    subtitle: receipt.source ? `Chứng từ nguồn ${receipt.source} · ${receipt.eta}` : `${receipt.po} · ${supplierName(receipt.supplier)} · ETA ${receipt.eta}`,
    actions: `<a class="btn btn-ghost" href="#/receipts">${icon("arrow-left")} Quay lại</a>
      <button class="btn btn-secondary" data-action="print-receipt" data-code="${escapeHtml(receipt.code)}">${icon("printer")} In phiếu</button>
      ${editable ? `<button class="btn btn-secondary" data-action="save-receipt" data-code="${escapeHtml(receipt.code)}">${icon("check")} Lưu kiểm đếm</button>` : ""}
      ${editable ? `<button class="btn btn-danger ${over ? "" : "hidden"}" data-action="return-receipt" data-code="${escapeHtml(receipt.code)}">${icon("x")} Trả lô &amp; giao lại</button><button class="btn btn-primary ${over ? "hidden" : ""}" data-action="confirm-receipt" data-code="${escapeHtml(receipt.code)}" ${lock || !receiptCountsComplete(receipt) || (!receipt.source && receiptThreshold(receipt) === null) ? "disabled" : ""}>${icon("package")} Xác nhận nhập kho</button>` : ""}
      ${order && canStartPoReceipt(order, receipt) && ACTION_ROLES["redeliver-po"].includes(state.role) ? `<button class="btn btn-primary" data-action="redeliver-po" data-code="${escapeHtml(order.code)}" data-previous="${escapeHtml(receipt.code)}">Tiếp nhận lô giao lại</button>` : ""}`
  })}
  <div class="card mb-16"><div class="card-body">
    <div class="flex items-center justify-between gap-12 flex-wrap mb-16">
      <div class="flex items-center gap-8"><span class="phase-pill">Bước 4 / 4</span><strong style="font-size:12px">Xử lý sai lệch &amp; xác nhận nhập</strong></div>
        <span class="muted small">${receipt.source ? "Đối chiếu theo chứng từ nguồn" : `Ngưỡng sai lệch: ${receiptThreshold(receipt) === null ? "Chưa thiết lập" : `${receiptThreshold(receipt)}%`}`}</span>
    </div>
    <div class="trace">
       <div class="trace-step done"><span class="t-label">1. Tiếp nhận</span><span class="t-code">${escapeHtml(receipt.po || receipt.source)}</span><span class="t-status">Đã liên kết</span></div>
      <div class="trace-step done"><span class="t-label">2. Kiểm đếm</span><span class="t-code">${num(totalReceived)} đv</span><span class="t-status">${escapeHtml(receipt.owner)}</span></div>
       <div class="trace-step done"><span class="t-label">3. Đối chiếu</span><span class="t-code">${num(totalOrdered)} theo chứng từ</span><span class="t-status">${receipt.source ? "Đối chiếu chứng từ nguồn" : over ? "Có sai lệch vượt ngưỡng" : "Trong ngưỡng"}</span></div>
       <div class="trace-step current"><span class="t-label">4. Xử lý</span><span class="t-code">${receipt.status === "completed" ? "Đã nhập kho" : receipt.status === "returned" ? "Đã trả lô" : "Chờ xác nhận"}</span><span class="t-status">${receipt.status === "returned" ? "Không ghi nhập" : receipt.status === "completed" ? "Hoàn tất" : "Cần quyết định"}</span></div>
    </div>
    ${receipt.previousReceipt ? `<p class="small mt-12">Giao lại sau phiếu <a class="link-btn" href="${hrefFor("receipts", receipt.previousReceipt)}">${escapeHtml(receipt.previousReceipt)}</a></p>` : ""}
    ${nextAttempt ? `<p class="small mt-12">Phiếu tiếp nhận lô giao lại: <a class="link-btn" href="${hrefFor("receipts", nextAttempt.code)}">${escapeHtml(nextAttempt.code)}</a></p>` : ""}
    ${receipt.decidedAt ? `<p class="small muted mt-12">Xác nhận bởi ${escapeHtml(receipt.decidedBy)} · ${escapeHtml(purchaseVerifiedTime(receipt.decidedAt))}</p>` : ""}
  </div></div>
   ${lock ? `<div class="banner locked mb-16">${icon("lock")}<div><strong>Phiếu có SKU đang khóa theo kỳ ${escapeHtml(lock.code)}.</strong> Không thể xác nhận nhập các SKU đang kiểm kê.</div><a class="banner-link" href="${hrefFor("stocktakes", lock.code)}">Mở kỳ kiểm kê</a></div>` : ""}
  <div id="receipt-validation" class="mb-16">${receiptAssessment(receipt)}</div>
  <div class="grid grid-main">
    <div class="stack">
      ${card({
        title: "Đối chiếu hàng nhập",
        subtitle: "Nhân viên kho nhập số đếm · Thủ kho xác nhận kết quả",
        iconName: "clipboard",
        flush: true,
        body: `<div class="table-wrap"><table class="data" style="min-width:980px"><thead><tr><th>Sản phẩm</th><th class="num">SL đặt</th><th class="num">Thực nhận</th><th class="num">Hàng đạt</th><th class="num">Hư hỏng</th><th class="num">Lệch</th><th>Đánh giá</th></tr></thead><tbody>${rows.map((row) => `<tr>${row.cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
      })}
      ${card({
        title: "Chứng từ & hình ảnh",
        subtitle: "Ảnh phiếu giao, tem nhập khẩu, tình trạng thùng hàng",
        iconName: "upload",
         actions: editable || !receipt.po ? `<button class="btn btn-secondary btn-sm" data-action="upload-evidence" data-code="${escapeHtml(receipt.code)}">${icon("upload")} Tải lên</button>` : "",
        body: `<div class="flex flex-wrap gap-8">${receipt.evidence.map((file) => attachmentChip(file, receipt.code)).join("") || '<p class="hint">Chưa có chứng từ đính kèm.</p>'}</div><div class="hint mt-8">PDF/JPG/PNG tối đa 2 MB mỗi tệp. Tệp gốc được lưu trên trình duyệt hiện tại.</div>`
      })}
      ${!receipt.source ? card({ title: "Loại và nguyên nhân sai lệch", iconName: "clipboard", body: `<div class="field"><label for="receipt-variance-note">Loại và nguyên nhân sai lệch</label><textarea class="textarea" id="receipt-variance-note" maxlength="1000" data-rc-field="varianceNote" data-code="${escapeHtml(receipt.code)}" ${editable && ["warehouse_manager", "warehouse_staff"].includes(state.role) ? "" : "disabled"}>${escapeHtml(receipt.varianceNote || "")}</textarea><p class="hint">Bắt buộc khi có chênh lệch thực nhận so với đặt hàng hoặc có hàng hư hỏng, kể cả trong ngưỡng cho phép và khi trả lô.</p></div>` }) : ""}
    </div>
    <div class="stack">
      ${card({
        title: "Tổng hợp kiểm đếm",
        iconName: "chart",
        body: `<div class="summary-list">
          <div class="summary-row"><span>Đặt hàng</span><span class="value">${num(totalOrdered)} đv</span></div>
          <div class="summary-row"><span>Thực nhận</span><span class="value">${num(totalReceived)} đv</span></div>
          <div class="summary-row"><span>Hàng đạt</span><span class="value">${num(totalGood)} đv</span></div>
          <div class="summary-row"><span>Hư hỏng</span><span class="value" style="color:var(--danger)">${num(totalDamaged)} đv</span></div>
          <div class="summary-row total"><span>Chênh lệch tổng</span><span class="value">${totalReceived - totalOrdered > 0 ? "+" : ""}${num(totalReceived - totalOrdered)} đv</span></div>
        </div>
        <div class="hint mt-12">Hàng hư hỏng không được cộng vào tồn khả dụng; theo dõi riêng để xử lý với nhà cung cấp.</div>`
      })}
      ${costReceipt ? card({ title: "Đối chiếu chi phí mua hàng", iconName: "file", body: purchaseCostDetails(receipt) }) : ""}
       ${!receipt.source ? card({
         title: "Quy tắc xử lý",
        iconName: "shield",
        body: `<div class="rule-list">
           <div class="rule-item">${icon("check-circle")}<div class="rule-main"><div class="rule-title">Trong ngưỡng</div><div class="rule-sub">Ghi nhập theo thực nhận; sai lệch đã xác nhận hiển thị cho Kế toán đối chiếu chi phí.</div></div></div>
          <div class="rule-item">${icon("alert")}<div class="rule-main"><div class="rule-title">Vượt ngưỡng</div><div class="rule-sub">Trả lô, yêu cầu giao lại, không xác nhận hàng đạt.</div></div></div>
          <div class="rule-item">${icon("lock")}<div class="rule-main"><div class="rule-title">Khóa kiểm kê</div><div class="rule-sub">Không ghi nhận nhập khi kho đang trong kỳ kiểm kê.</div></div></div>
        </div>`
       }) : ""}
    </div>
  </div>`;
}

function stocktakeProgress(stocktake) {
  const counted = stocktake.lines.filter((line) => line.count !== null).length;
  return {
    counted,
    total: stocktake.lines.length,
    missing: stocktake.lines.filter((line) => line.count === null).length,
    percent: Math.round((counted / Math.max(stocktake.lines.length, 1)) * 100),
    variances: stocktake.lines.filter((line) => line.count !== null && line.count !== line.system)
  };
}

function stocktakeLockText(period) {
  return isGroupStocktake(period) ? `Khóa ${period.lines.length} SKU thuộc nhóm ${period.category}.` : "Khóa giao dịch trên toàn bộ kho.";
}

function viewStocktakes() {
  const locks = state.stocktakes.filter(isStocktakeLocked);
  const rows = state.stocktakes.map((stocktake) => {
    const progress = stocktakeProgress(stocktake);
    return {
      href: hrefFor("stocktakes", stocktake.code),
      cells: [
        `<span class="row-link">${escapeHtml(stocktake.code)}</span><div class="cell-sub">${escapeHtml(stocktake.scope)}</div>`,
        `<span>${escapeHtml(stocktake.started)}</span>`,
        statusChip(stocktake.status),
        `<span class="num">${progress.counted}/${progress.total}</span>`,
        `<span class="chip ${progress.variances.length ? "warning" : "success"}"><span class="dot"></span>${progress.variances.length} lệch</span>`,
        `<span>${escapeHtml(stocktake.owner)}</span>`,
        `<div class="row-actions"><a class="btn btn-ghost btn-sm" href="${hrefFor("stocktakes", stocktake.code)}">${icon("chevron-right")}</a></div>`
      ]
    };
  });
  return `${pageHead({
    title: "Kỳ kiểm kê",
    subtitle: "Tổ chức kiểm kê, tạm khóa giao dịch, đối chiếu và điều chỉnh tồn kho.",
    actions: `<button class="btn btn-secondary" data-action="export-stocktakes">${icon("download")} Xuất lịch sử</button>
      <button class="btn btn-primary" data-action="new-stocktake">${icon("plus")} Tạo kỳ kiểm kê</button>`
  })}
  ${locks.map((lock) => `<div class="banner locked mb-16">${icon("lock")}<div><strong>Đang kiểm kê ${escapeHtml(lock.code)}.</strong> ${escapeHtml(stocktakeLockText(lock))}</div><a class="banner-link" href="${hrefFor("stocktakes", lock.code)}">Mở kỳ kiểm kê</a></div>`).join("")}
  <div class="card">
    ${dataTable([
      { label: "Kỳ kiểm kê" },
      { label: "Bắt đầu" },
      { label: "Trạng thái" },
      { label: "Tiến độ", align: "num" },
      { label: "Chênh lệch" },
      { label: "Phụ trách" },
      { label: "", align: "num" }
    ], rows, { minWidth: 920 })}
    <div class="table-footer"><span>${state.stocktakes.length} kỳ kiểm kê</span><span>K04: mục tiêu ≥ 98% mã khớp sau đối chiếu</span></div>
  </div>`;
}

function viewStocktakeDetail(code) {
  const stocktake = stocktakeByCode(code);
  if (!stocktake) {
    return pageHead({ title: "Không tìm thấy kỳ kiểm kê" }) + card({ body: emptyState("clipboard", "Kỳ kiểm kê không tồn tại", "Liên kết có thể đã cũ.", `<a class="btn btn-secondary" href="#/stocktakes">Quay lại</a>`) });
  }
  const progress = stocktakeProgress(stocktake);
  const activeTab = state.ui.stocktakeTab;
  const locked = isStocktakeLocked(stocktake);
  const cancelled = stocktake.status === "cancelled";
  const counting = locked && stocktake.status === "counting";
  const reconciling = locked && ["reconciling", "reported"].includes(stocktake.status);
  const tabs = [
    { key: "count", label: "Đếm thực tế" },
    { key: "reconcile", label: "Đối chiếu", count: progress.variances.length },
    { key: "report", label: "Biên bản" },
    { key: "history", label: "Lịch sử" }
  ];
  const countRows = stocktake.lines.map((line) => {
    const variance = line.count === null ? null : line.count - line.system;
    return `<tr>
      <td>${productCell(line.sku)}</td>
      <td class="num">${num(line.system)}</td>
      <td><input class="input sm num-input" type="number" min="0" placeholder="Nhập SL" value="${line.count === null ? "" : line.count}" data-st-field="count" data-code="${escapeHtml(stocktake.code)}" data-sku="${escapeHtml(line.sku)}" ${counting ? "" : "disabled"}></td>
      <td class="num strong" data-st-var="${escapeHtml(line.sku)}" style="color:${variance === null ? "var(--ink-400)" : variance === 0 ? "var(--success)" : "var(--danger)"}">${variance === null ? "—" : (variance > 0 ? "+" : "") + variance}</td>
      <td><input class="input sm" type="text" placeholder="Ghi chú" value="${escapeHtml(line.note || "")}" data-st-field="note" data-code="${escapeHtml(stocktake.code)}" data-sku="${escapeHtml(line.sku)}" ${counting ? "" : "disabled"}></td>
    </tr>`;
  }).join("");
  const reconciliationLines = state.ui.stocktakeVarianceOnly ? progress.variances : stocktake.lines.filter((line) => line.count !== null);
  const varianceRows = reconciliationLines.map((line) => {
    const variance = line.count - line.system;
    return `<tr>
      <td>${productCell(line.sku)}</td>
      <td class="num">${num(line.system)}</td>
      <td class="num">${num(line.count)}</td>
      <td class="num strong" style="color:${variance ? "var(--danger)" : "var(--success)"}">${variance > 0 ? "+" : ""}${num(variance)}</td>
      <td><span class="muted">${escapeHtml(line.note || (variance ? "Chưa ghi nguyên nhân" : "Khớp số liệu"))}</span>${line.reviewed ? '<div class="chip success">Đã xác nhận</div>' : ""}</td>
      <td>${variance && reconciling ? `<div class="row-actions"><button class="btn btn-ghost btn-sm" data-action="request-recount" data-code="${escapeHtml(stocktake.code)}" data-sku="${escapeHtml(line.sku)}">${icon("refresh")} Đếm lại</button><button class="btn btn-secondary btn-sm" data-action="open-adjustment" data-code="${escapeHtml(stocktake.code)}" data-sku="${escapeHtml(line.sku)}">${icon("edit")} Điều chỉnh</button></div>` : "—"}</td>
    </tr>`;
  }).join("");
  const content = activeTab === "reconcile"
    ? `<div class="card-body">
        <div class="flex items-center justify-between gap-12 flex-wrap mb-16">
          <label class="checkline"><input type="checkbox" data-action="toggle-variance" ${state.ui.stocktakeVarianceOnly ? "checked" : ""}> Chỉ xem mã có chênh lệch</label>
          <span class="muted small">${progress.variances.length} mã chênh lệch</span>
        </div>
        ${progress.variances.length || !state.ui.stocktakeVarianceOnly ? `<div class="table-wrap"><table class="data" style="min-width:900px"><thead><tr><th>Sản phẩm</th><th class="num">Sổ sách</th><th class="num">Kiểm đếm</th><th class="num">Lệch</th><th>Nguyên nhân</th><th></th></tr></thead><tbody>${varianceRows || `<tr><td colspan="6">${emptyState("check-circle", "Không có chênh lệch", "Số đếm khớp với tồn sổ sách.")}</td></tr>`}</tbody></table></div>` : emptyState("check-circle", "Không có chênh lệch", "Số đếm khớp với tồn sổ sách.")}
        ${reconciling ? `<div class="flex justify-between gap-8 flex-wrap mt-16">
          <button class="btn btn-secondary" data-action="report-stocktake" data-code="${escapeHtml(stocktake.code)}">${icon("file-check")} Gửi báo cáo Giám đốc</button>
          <button class="btn btn-primary" data-action="complete-stocktake" data-code="${escapeHtml(stocktake.code)}">${icon("lock")} Hoàn tất &amp; mở khóa phạm vi</button>
        </div>` : ""}
      </div>`
    : activeTab === "report"
      ? `<div class="card-body">
          <div class="stat-grid mb-16">
            <div class="stat-card"><div class="stat-label">Mã đã đếm</div><div class="stat-value">${progress.counted}/${progress.total}</div><div class="stat-note">${progress.percent}% danh mục</div></div>
            <div class="stat-card"><div class="stat-label">Mã chênh lệch</div><div class="stat-value">${progress.variances.length}</div><div class="stat-note">cần giải trình</div></div>
            <div class="stat-card"><div class="stat-label">Báo cáo Giám đốc</div><div class="stat-value" style="font-size:13px">${stocktake.reportTo ? escapeHtml(stocktake.reportTo) : "Chưa gửi"}</div><div class="stat-note">Biên bản kiểm kê</div></div>
            <div class="stat-card"><div class="stat-label">Trạng thái</div><div class="stat-value" style="font-size:13px">${STATUS_META[stocktake.status].label}</div><div class="stat-note">${locked ? "Đang giữ khóa của kỳ này" : "Không giữ khóa"}</div></div>
          </div>
          <div class="banner info mb-16">${icon("file")}<div><strong>Biên bản kiểm kê ${escapeHtml(stocktake.code)}.</strong> ${cancelled ? "Số liệu được lưu để tra cứu, không dùng để điều chỉnh tồn." : "Nêu số lượng và nguyên nhân chênh lệch; gửi Giám đốc trước khi điều chỉnh tồn và mở lại giao dịch."}</div></div>
          ${progress.variances.length ? `<div class="table-wrap"><table class="data" style="min-width:760px"><thead><tr><th>Sản phẩm</th><th class="num">Sổ sách</th><th class="num">Kiểm đếm</th><th class="num">Lệch</th><th>Nguyên nhân</th></tr></thead><tbody>${progress.variances.map((line) => `<tr><td>${productCell(line.sku)}</td><td class="num">${num(line.system)}</td><td class="num">${num(line.count)}</td><td class="num strong">${line.count - line.system > 0 ? "+" : ""}${num(line.count - line.system)}</td><td>${escapeHtml(line.note || "Chưa giải trình")}</td></tr>`).join("")}</tbody></table></div>` : emptyState("check-circle", "Không có chênh lệch", "Không cần điều chỉnh tồn kho.")}
          <div class="flex justify-end gap-8 mt-16"><button class="btn btn-secondary" data-action="print-stocktake" data-code="${escapeHtml(stocktake.code)}">${icon("printer")} In biên bản</button></div>
        </div>`
      : activeTab === "history"
        ? `<div class="card-body"><div class="timeline">
            <div class="timeline-item warning"><div class="timeline-title">Tạo kỳ kiểm kê và tạm khóa giao dịch</div><div class="timeline-date">${escapeHtml(stocktake.started)} · ${escapeHtml(stocktake.owner)}</div></div>
            <div class="timeline-item info"><div class="timeline-title">Bắt đầu đếm thực tế</div><div class="timeline-date">${progress.counted}/${progress.total} mã đã nhập số liệu</div></div>
            ${stocktake.status === "completed" ? `<div class="timeline-item success"><div class="timeline-title">Hoàn tất kiểm kê và mở khóa kho</div><div class="timeline-date">${escapeHtml(stocktake.reportTo || "Đã hoàn tất")}</div></div>` : ""}
            ${state.audit.filter((entry) => entry.object === stocktake.code).map((entry) => `<div class="timeline-item ${entry.tone}"><div class="timeline-title">${escapeHtml(entry.action)}</div><div class="timeline-date">${escapeHtml(entry.time)} · ${escapeHtml(entry.actor)}</div><div class="muted small">${escapeHtml(entry.detail || "")}</div></div>`).join("")}
          </div></div>`
        : `<div class="card-body">
            ${counting ? (progress.missing ? `<div class="banner warning mb-16" id="st-missing">${icon("alert")}<div><strong>${progress.missing} mã chưa có số liệu kiểm đếm.</strong> Cần nhập đủ hoặc xác nhận số lượng bằng 0 trước khi hoàn tất đếm.</div></div>` : `<div class="banner success mb-16" id="st-missing">${icon("check-circle")}<div><strong>Đã nhập đủ số liệu cho ${progress.total} mã.</strong> Có thể chuyển sang đối chiếu.</div></div>`) : ""}
            <div class="flex items-center justify-between gap-12 flex-wrap mb-12">
              <div class="progress-row" style="flex:1;max-width:360px"><span class="progress-label">Tiến độ đếm</span><span class="progress-value" id="st-progress-label">${progress.percent}%</span><div class="progress"><span id="st-progress-bar" style="width:${progress.percent}%"></span></div></div>
              <span class="muted small" id="st-counted-label">${progress.counted}/${progress.total} mã đã nhập</span>
            </div>
            <div class="table-wrap"><table class="data" style="min-width:900px"><thead><tr><th>Sản phẩm</th><th class="num">SL hệ thống</th><th class="num">SL kiểm đếm</th><th class="num">Lệch</th><th>Ghi chú</th></tr></thead><tbody>${countRows}</tbody></table></div>
            ${counting ? `<div class="flex justify-end mt-16"><button class="btn btn-primary" id="st-finish" data-action="finish-count" data-code="${escapeHtml(stocktake.code)}" ${progress.missing ? "disabled" : ""}>${icon("check-circle")} Hoàn tất đếm thực tế</button></div>` : ""}
          </div>`;
  return `${pageHead({
    breadcrumb: `<a href="#/stocktakes">Kỳ kiểm kê</a> ${icon("chevron-right")} <span>${escapeHtml(stocktake.code)}</span>`,
    title: stocktake.code,
    status: statusChip(stocktake.status),
    subtitle: `${stocktake.scope} · bắt đầu ${stocktake.started} · ${stocktake.owner}`,
    actions: `<a class="btn btn-ghost" href="#/stocktakes">${icon("arrow-left")} Quay lại</a>
      <button class="btn btn-secondary" data-action="print-stocktake" data-code="${escapeHtml(stocktake.code)}">${icon("printer")} In biên bản</button>
      ${canCancelStocktake(stocktake) ? `<button class="btn btn-danger" data-action="cancel-stocktake" data-code="${escapeHtml(stocktake.code)}">Hủy kỳ</button>` : ""}`
  })}
  ${locked ? `<div class="banner locked mb-16">${icon("lock")}<div><strong>Khóa kiểm kê từ ${escapeHtml(stocktake.started)}.</strong> ${escapeHtml(stocktakeLockText(stocktake))}</div></div>` : cancelled ? `<div class="banner warning mb-16">${icon("alert")}<div><strong>Kỳ đã hủy, không điều chỉnh tồn.</strong> Đã giải phóng khóa của kỳ này. Lý do: ${escapeHtml(stocktake.cancellationReason || "Không có")}</div></div>` : stocktake.status === "completed" ? `<div class="banner success mb-16">${icon("check-circle")}<div><strong>Kỳ kiểm kê đã hoàn tất.</strong> Đã giải phóng khóa của kỳ này; số liệu điều chỉnh được lưu trong thẻ kho và nhật ký.</div></div>` : ""}
  <div class="card">
    ${tabsBar("stocktake", tabs, activeTab)}
    ${content}
  </div>`;
}

function customerDetailHtml(customer) {
  const { id } = customer;
  const addresses = customerShippingAddresses(customer);
  const ownsRecord = (code) => orderByCode(code)?.customerId === id || contractByCode(code)?.customerId === id;
  const row = (code, detail, amount, status, href) => {
    const content = `<span class="cell-main"><strong>${escapeHtml(code)}</strong><span class="cell-sub">${escapeHtml(detail)}</span></span>${status ? statusChip(status) : ""}<span class="num">${amount == null ? "—" : money(amount)}</span>`;
    return href ? `<a class="picker-row" href="${escapeHtml(href)}">${content}</a>` : `<div class="picker-row">${content}</div>`;
  };
  const section = (route, title, empty, getRows, linkLabel, summary = "") => {
    if (!routeAllowed(route)) return "";
    const rows = getRows();
    return `<div class="divider"></div><h3 class="section-title">${title}</h3>${summary}${rows.join("") || `<p class="muted small">${empty}</p>`}${linkLabel && rows.length ? `<p class="small mt-12"><a class="row-link" href="${hrefFor(route)}">${linkLabel}</a></p>` : ""}`;
  };
  return `<div class="kv-grid">${[["Liên hệ", customer.contact], ["Điện thoại", customer.phone], ["Email", customer.email], ["Mã số thuế", customer.tax]].map(([label, value]) => `<div><div class="kv-label">${label}</div><div class="kv-value">${escapeHtml(value || "—")}</div></div>`).join("")}
    <div class="full"><div class="kv-label">Địa chỉ giao hàng</div>${addresses.map((address, index) => `<div class="kv-value">${escapeHtml(address)}${index === 0 && addresses.length > 1 ? ' <span class="muted small">(Mặc định)</span>' : ""}</div>`).join("") || '<div class="kv-value">—</div>'}</div>
    <div class="full"><div class="kv-label">Địa chỉ xuất hóa đơn</div><div class="kv-value">${escapeHtml(customer.invoiceAddress || "—")}</div></div>
    </div>
    ${section("orders", "Lịch sử đơn hàng", "Chưa có đơn hàng.", () => state.orders.filter((order) => order.customerId === id).map((order) => row(order.code, order.created, order.total, order.status, hrefFor("orders", order.code))))}
    ${section("quotes", "Lịch sử báo giá", "Chưa có báo giá.", () => state.quotes.filter((quote) => quote.customerId === id).map((quote) => row(quote.code, quote.createdAt, quoteTotals(quote).total, quoteStatus(quote), hrefFor("quotes", quote.code))))}
    ${section("payments", "Lịch sử thanh toán", "Chưa có thanh toán.", () => state.payments.filter((payment) => payment.customerId === id || (!payment.customerId && ownsRecord(payment.record))).map((payment) => row(payment.id, [payment.record, payment.date, payment.method].filter(Boolean).join(" · "), payment.amount, payment.status)), "Mở Thanh toán & công nợ", `<p class="small">Còn phải thu: <strong>${money(customer.ar)}</strong></p>`)}
    ${section("documents", "Lịch sử hóa đơn", "Chưa có hóa đơn.", () => state.documents.filter((document) => document.type === "Hóa đơn" && ownsRecord(document.record)).map((document) => row(document.code, [document.record, document.date].filter(Boolean).join(" · "), document.amount)), "Mở danh sách chứng từ")}
    ${customer.note ? `<div class="divider"></div><p class="small muted">${escapeHtml(customer.note)}</p>` : ""}`;
}

function customersTableHtml(list) {
  const rows = list.map((customer) => ({
    cells: [
      `<div class="cell-main"><span class="row-link">${escapeHtml(customer.name)}</span><span class="cell-sub">${escapeHtml(customer.id)} · ${escapeHtml(customer.contact)}</span></div>`,
      `<span class="chip ${customer.type === "Bán sỉ" ? "accent" : "neutral"}">${escapeHtml(customer.type)}</span>`,
      `<span>${escapeHtml(customer.phone)}</span>`,
      `<span class="mono-code">${escapeHtml(customer.tax || "—")}</span>`,
      `<span class="num">${state.orders.filter((order) => order.customerId === customer.id).length}</span>`,
      `<span class="num">${money(customer.ar)}</span>`,
      `<div class="row-actions"><button class="btn btn-ghost btn-sm" data-action="open-customer" data-id="${escapeHtml(customer.id)}" aria-label="Xem hồ sơ ${escapeHtml(customer.name)}">${icon("eye")}</button></div>`
    ]
  }));
  return dataTable([
    { label: "Khách hàng" },
    { label: "Nhóm" },
    { label: "Điện thoại" },
    { label: "Mã số thuế" },
    { label: "Số đơn", align: "num" },
    { label: "Công nợ", align: "num" },
    { label: "", align: "num" }
  ], rows, { minWidth: 960 });
}

function filteredCustomers() {
  const filter = state.ui.customerFilter;
  const search = state.ui.customerSearch.trim().toLowerCase();
  return state.customers.filter((customer) => {
    const matchesFilter = filter === "all" || (filter === "wholesale" && customer.type === "Bán sỉ") || (filter === "retail" && customer.type === "Bán lẻ");
    const haystack = `${customer.name} ${customer.phone} ${customer.tax} ${customer.contact}`.toLowerCase();
    return matchesFilter && (!search || haystack.includes(search));
  });
}

function viewCustomers() {
  const list = filteredCustomers();
  const tabs = [
    { value: "all", label: "Tất cả", count: state.customers.length },
    { value: "wholesale", label: "Khách sỉ", count: state.customers.filter((customer) => customer.type === "Bán sỉ").length },
    { value: "retail", label: "Khách lẻ", count: state.customers.filter((customer) => customer.type === "Bán lẻ").length }
  ];
  return `${pageHead({
    title: "Khách hàng",
    subtitle: "Hồ sơ khách lẻ, khách sỉ, địa chỉ giao hàng và thông tin xuất hóa đơn.",
    actions: `<button class="btn btn-secondary" data-action="export-customers">${icon("download")} Xuất danh sách</button>
      <button class="btn btn-primary" data-action="new-customer">${icon("plus")} Thêm khách hàng</button>`
  })}
  <div class="card">
    <div class="table-toolbar">
      <div class="toolbar-left">
        <div class="search-box">${icon("search")}<input type="search" placeholder="Tìm tên, SĐT, mã số thuế…" value="${escapeHtml(state.ui.customerSearch)}" data-list-search="customers" data-list-target="customers-table"></div>
        ${filterTabs("customerFilter", tabs, state.ui.customerFilter)}
      </div>
      <div class="toolbar-right"><span class="muted small">${list.length} khách hàng</span></div>
    </div>
    <div id="customers-table">${customersTableHtml(list)}</div>
    <div class="table-footer"><span>Hiển thị <strong>${list.length}</strong> / ${state.customers.length} khách hàng</span><span>Tổng công nợ: <strong>${money(list.reduce((sum, customer) => sum + customer.ar, 0))}</strong></span></div>
  </div>`;
}

function productsTableHtml(list) {
  const rows = list.map((product) => ({
    cells: [
      productCell(product.sku),
      `<span>${escapeHtml(product.category)}</span>`,
      `<span class="muted">${escapeHtml(product.origin)}</span>`,
      `<span class="num">${money(product.retail)}</span>`,
      `<span class="num strong">${money(product.wholesale)}</span>`,
      `<span class="num">${num(product.physical)}</span>`,
      `<span class="num">${num(product.held)}</span>`,
      `<span class="num strong" style="color:${availableOf(product) < product.min ? "var(--danger)" : "var(--ink-900)"}">${num(availableOf(product))}</span>`,
      statusChip(product.status),
      `<div class="row-actions"><button class="btn btn-ghost btn-sm" data-action="open-product" data-sku="${escapeHtml(product.sku)}">${icon("eye")}</button></div>`
    ]
  }));
  return dataTable([
    { label: "Sản phẩm" },
    { label: "Nhóm" },
    { label: "Xuất xứ" },
    { label: "Giá lẻ", align: "num" },
    { label: "Giá sỉ", align: "num" },
    { label: "Tồn", align: "num" },
    { label: "Giữ", align: "num" },
    { label: "Khả dụng", align: "num" },
    { label: "Trạng thái" },
    { label: "", align: "num" }
  ], rows, { minWidth: 1160 });
}

function filteredProducts() {
  const filter = state.ui.productFilter;
  const search = state.ui.productSearch.trim().toLowerCase();
  return state.products.filter((product) => {
    const matchesFilter = filter === "all" || (filter === "active" && product.status === "product_active") || (filter === "inactive" && product.status === "product_inactive") || (filter === "low" && availableOf(product) < product.min);
    const haystack = `${product.sku} ${product.name} ${product.category} ${product.origin}`.toLowerCase();
    return matchesFilter && (!search || haystack.includes(search));
  });
}

function viewProducts() {
  const list = filteredProducts();
  const tabs = [
    { value: "all", label: "Tất cả", count: state.products.length },
    { value: "active", label: "Đang kinh doanh", count: state.products.filter((product) => product.status === "product_active").length },
    { value: "low", label: "Dưới định mức", count: state.products.filter((product) => availableOf(product) < product.min).length },
    { value: "inactive", label: "Ngừng kinh doanh", count: state.products.filter((product) => product.status === "product_inactive").length }
  ];
  return `${pageHead({
    title: "Sản phẩm & bảng giá",
    subtitle: "Danh mục rượu, quà tặng và giá niêm yết dùng thống nhất cho bán hàng và kho.",
    actions: `<button class="btn btn-secondary" data-action="export-products">${icon("download")} Xuất danh mục</button><button class="btn btn-primary" data-action="new-product">${icon("plus")} Thêm sản phẩm</button>`
  })}
  <div class="card">
    <div class="table-toolbar">
      <div class="toolbar-left">
        <div class="search-box">${icon("search")}<input type="search" placeholder="Tìm SKU, tên sản phẩm, xuất xứ…" value="${escapeHtml(state.ui.productSearch)}" data-list-search="products" data-list-target="products-table"></div>
        ${filterTabs("productFilter", tabs, state.ui.productFilter)}
      </div>
      <div class="toolbar-right"><span class="muted small">${list.length} SKU</span></div>
    </div>
    <div id="products-table">${productsTableHtml(list)}</div>
    <div class="table-footer"><span>Hiển thị <strong>${list.length}</strong> / ${state.products.length} sản phẩm</span><span>Giá hiển thị theo bảng giá hiện hành</span></div>
  </div>`;
}

function salesReportView(sales) {
  return `<div class="card-body"><div class="stat-grid mb-24">${[["Giá trị đơn hoàn tất", money(sales.total)], ["Đơn hoàn tất", sales.orders.length], ["Giá trị đơn trung bình", sales.orders.length ? money(Math.round(sales.total / sales.orders.length)) : "—"], ["Báo giá được xác nhận", sales.quotes.filter((quote) => quote.confirmed).length]].map(([label, value]) => `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`).join("")}</div>
    <p class="hint mb-24">Đơn hoàn tất và báo giá theo ngày lập, hợp đồng theo ngày ký, giờ Việt Nam. Hợp đồng được tính cho người lập báo giá nguồn; tỷ lệ chốt bằng hợp đồng ký trong kỳ từ báo giá của nhân viên / số báo giá nhân viên lập trong kỳ. Giá trị sản phẩm theo giá giao dịch, không thay thế báo cáo ghi nhận doanh thu kế toán.</p>
    <div class="grid grid-2"><div><h3 class="section-title">Xu hướng 6 tháng gần nhất · triệu đồng</h3>${sales.orders.length ? lineChart(sales.months.map((month) => month.value / 1000000), sales.months.map((month) => month.label), "reports") : emptyState("chart", "Chưa có đơn hoàn tất trong kỳ", "Chọn kỳ khác hoặc hoàn tất giao hàng để xem kết quả.")}</div><div><h3 class="section-title">Cơ cấu theo kênh</h3>${sales.channels.length ? `<div class="bar-list">${sales.channels.map(([label, value]) => `<div class="bar-row"><span class="bar-label">${escapeHtml(label)}</span><div class="bar-track"><div class="bar-fill" style="width:${sales.total ? value / sales.total * 100 : 0}%"></div></div><span class="bar-value">${money(value)}</span></div>`).join("")}</div>` : emptyState("chart", "Chưa có dữ liệu theo kênh", "Kết quả được tính từ kênh bán của đơn đã hoàn tất.")}</div></div>
    <div class="mt-24"><h3 class="section-title">Doanh số theo nhóm khách hàng</h3>${dataTable([{ label: "Nhóm khách hàng" }, { label: "Số đơn", align: "num" }, { label: "SL", align: "num" }, { label: "Giá trị", align: "num" }], sales.customerGroups.map((group) => ({ cells: [escapeHtml(group.label), num(group.orders), num(group.qty), money(group.value)] })), { minWidth: 600 })}</div>
    <div class="mt-24"><h3 class="section-title">Hiệu suất nhân viên kinh doanh</h3>${dataTable([{ label: "Nhân viên" }, { label: "Báo giá đã lập", align: "num" }, { label: "Hợp đồng ký", align: "num" }, { label: "Tỷ lệ chốt", align: "num" }, { label: "Đơn hoàn tất", align: "num" }, { label: "Doanh số", align: "num" }], sales.staff.map((employee) => ({ cells: [escapeHtml(employee.name), num(employee.quotes), num(employee.signedContracts), employee.closeRate === null ? "—" : pct(employee.closeRate), num(employee.completedOrders), money(employee.sales)] })), { minWidth: 820 })}</div>
    <div class="mt-24"><h3 class="section-title">Sản phẩm đóng góp</h3>${dataTable([{ label: "Sản phẩm" }, { label: "SL", align: "num" }, { label: "Giá trị phân bổ", align: "num" }], sales.products.map(([sku, item]) => ({ cells: [productCell(sku), num(item.qty), money(item.value)] })), { minWidth: 500 })}</div></div>`;
}

function warehouseQualityView() {
  const quality = warehouseQuality();
  return card({ title: "Chất lượng vận hành kho", iconName: "box", className: "mt-24", body: `<div class="stat-grid">${quality.measures.map((measure) => `<div class="stat-card"><div class="stat-label">${escapeHtml(measure.label)}</div><div class="stat-value">${measure.rate === null ? "—" : pct(measure.rate)}</div><div class="hint mt-8">${num(measure.numerator)} / ${num(measure.denominator)}</div><div class="hint">${escapeHtml(measure.basis)}</div></div>`).join("")}</div>
    <h3 class="section-title mt-24">Tỷ lệ sai lệch theo từng kỳ kiểm kê</h3>${quality.periods.length ? `<div class="bar-list">${quality.periods.map((period) => `<div class="bar-row"><span class="bar-label">${escapeHtml(period.code)}<small class="cell-sub">${escapeHtml(period.scope || "")}</small></span><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, period.rate)}%"></div></div><span class="bar-value">${pct(period.rate)} · ${num(period.different)} / ${num(period.counted)}</span></div>`).join("")}</div>` : emptyState("chart", "Chưa có số kiểm đếm", "Nhập số đếm để xem tỷ lệ sai lệch.")}` });
}

function viewReports() {
  const tabs = [
    { key: "sales", label: "Báo cáo bán hàng" },
    ...(canViewInventoryReport() ? [{ key: "inventory", label: "Nhập - xuất - tồn" }] : []),
    { key: "management", label: "Quản trị & KPI" }
  ];
  if (!tabs.some((tab) => tab.key === state.ui.reportTab)) state.ui.reportTab = "sales";
  const active = state.ui.reportTab;
  const sales = active === "sales" ? salesAnalytics() : null;
  const inventory = active === "inventory" ? inventoryReport() : null;
  const salesContent = sales ? salesReportView(sales) : "";
  const managementContent = active === "management" ? `<div class="card-body">
    ${metricCards()}
    ${warehouseQualityView()}
    <div class="grid grid-2 mt-16">
      ${card({ title: "Tiến độ hợp đồng", iconName: "file-check", body: `<div class="bar-list">${state.contracts.filter((contract) => contract.status === "active").map((contract) => { const total = contract.lines.reduce((sum, line) => sum + line.qty, 0); const delivered = contract.lines.reduce((sum, line) => sum + Math.min(line.qty, deliveredContractQty(contract, line.sku)), 0); const percent = total ? Math.round(delivered / total * 100) : 0; return `<div class="bar-row"><span class="bar-label">${escapeHtml(contract.code)}</span><div class="bar-track"><div class="bar-fill" style="width:${percent}%"></div></div><span class="bar-value">${percent}%</span></div>`; }).join("")}</div>` })}
      ${card({ title: "Công nợ phải thu", iconName: "card", body: `<div class="bar-list">${arRecords().map((record) => `<div class="bar-row"><span class="bar-label">${escapeHtml(record.id)} · ${escapeHtml(customerName(record.customerId))}</span><div class="bar-track"><div class="bar-fill ${arStatusKey(record) === "overdue" ? "" : "success"}" style="width:${Math.min(100, Math.round(record.remaining / Math.max(record.total, 1) * 100))}%;${arStatusKey(record) === "overdue" ? "background:var(--danger)" : ""}"></div></div><span class="bar-value">${money(record.remaining)}</span></div>`).join("")}</div>` })}
    </div>
  </div>` : "";
  const content = inventory ? inventoryReportView(inventory) : salesContent || managementContent;
  return `${pageHead({
    title: "Báo cáo & phân tích",
    subtitle: "Doanh thu, hiệu suất, nhập - xuất - tồn và các chỉ số vận hành K01–K06.",
    actions: inventory ? reportExportActions("export-inventory", inventory.rows.length > 0) : `${active === "sales" ? `<select class="select-sm" data-report-period aria-label="Kỳ báo cáo">${[["all", "Toàn bộ thời gian"], ["today", "Hôm nay"], ["week", "Tuần này"], ["month", "Tháng hiện tại"], ["quarter", "Quý hiện tại"]].map(([value, label]) => `<option value="${value}" ${(state.ui.reportPeriod || "all") === value ? "selected" : ""}>${label}</option>`).join("")}</select><select class="select-sm" data-report-channel aria-label="Kênh bán">${[["all", "Tất cả kênh"], ["retail", "Bán lẻ"], ["wholesale", "Bán sỉ"]].map(([value, label]) => `<option value="${value}" ${(state.ui.reportChannel || "all") === value ? "selected" : ""}>${label}</option>`).join("")}</select>` : ""}<button class="btn btn-secondary" data-action="export-report">${icon("download")} Xuất CSV</button>`
  })}
  <div class="card">
    ${tabsBar("report", tabs, active)}
    ${content}
  </div>`;
}

function auditType(entry) {
  const object = String(entry.object || "").normalize("NFC").toUpperCase();
  if (object.startsWith("BG-")) return "Chiết khấu bán sỉ";
  if (object.startsWith("PAY-")) return "Thanh toán";
  if (object.startsWith("YCM-") || object.startsWith("PO-")) return "Mua hàng";
  if (object.startsWith("HĐ-") || object.startsWith("HD-")) return "Hợp đồng";
  return "Khác";
}

function auditResult(entry) {
  const action = String(entry.action || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (action.includes("tu choi")) return "Từ chối";
  if (action.includes("phe duyet")) return "Đã duyệt";
  return "";
}

function auditFilterError() {
  const { from = "", to = "" } = state.ui.auditFilter || {};
  if (from && to && from > to) return "Từ ngày không được sau đến ngày.";
  if ((from && !validReportDay(from)) || (to && !validReportDay(to))) return "Ngày lọc không hợp lệ.";
  return "";
}

function auditFilterSummary() {
  const { from = "", to = "", actor = "", type = "", result = "" } = state.ui.auditFilter || {};
  const day = (value) => value ? value.split("-").reverse().join("/") : "Không giới hạn";
  return `Từ ngày: ${day(from)} · Đến ngày: ${day(to)} · Người duyệt: ${actor || "Tất cả"} · Loại hồ sơ: ${type || "Tất cả"} · Kết quả: ${result || "Tất cả"} · Từ khóa: ${state.ui.auditSearch.trim() || "Không giới hạn"}`;
}

function auditTableHtml(list) {
  return dataTable([
    { label: "Thời điểm" },
    { label: "Người thực hiện" },
    { label: "Hành động" },
    { label: "Đối tượng" },
    { label: "Chi tiết" }
  ], list.map((entry) => ({
    cells: [
      `<span class="nowrap">${escapeHtml(entry.time)}</span>`,
      `<div class="cell-main"><span class="strong">${escapeHtml(entry.actor)}</span><span class="cell-sub">${escapeHtml(entry.role)}</span></div>`,
      `<span>${escapeHtml(entry.action)}</span>`,
      `<span class="mono-code">${escapeHtml(entry.object)}</span>`,
      `<span class="audit-detail">${escapeHtml(entry.detail)}</span>`
    ]
  })), { minWidth: 900, empty: emptyState("clock", "Không có bản ghi phù hợp", "Điều chỉnh hoặc xóa bộ lọc để xem nhật ký.") });
}

function filteredAudit() {
  if (auditFilterError()) return [];
  const { from = "", to = "", actor = "", type = "", result = "" } = state.ui.auditFilter || {};
  const search = state.ui.auditSearch.trim().toLowerCase();
  return state.audit.filter((entry) => {
    const day = from || to ? inventoryMoveDay(entry) : "";
    return (!from || (day && day >= from)) && (!to || (day && day <= to))
      && (!actor || entry.actor === actor) && (!type || auditType(entry) === type)
      && (!result || auditResult(entry) === result)
      && (!search || `${entry.actor} ${entry.action} ${entry.object} ${entry.detail}`.toLowerCase().includes(search));
  });
}

function viewAudit() {
  const list = filteredAudit();
  const { from = "", to = "", actor = "", type = "", result = "" } = state.ui.auditFilter || {};
  const error = auditFilterError();
  const actors = [...new Set(state.audit.map((entry) => entry.actor).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi"));
  const options = (values, selected) => values.map((value) => `<option value="${escapeHtml(value)}" ${selected === value ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
  return `${pageHead({
    title: "Lịch sử xử lý & phê duyệt",
    subtitle: "Nhật ký kiểm toán của mọi thao tác gửi duyệt, xác nhận, từ chối, hủy chứng từ.",
    actions: canExportApprovalHistory() ? reportExportActions("export-audit", list.length > 0 && !error) : ""
  })}
  <div class="card">
    <div class="card-body">
      <div class="form-grid three">
        <div class="field"><label for="audit-from">Từ ngày</label><input class="input" id="audit-from" type="date" value="${escapeHtml(from)}" data-audit-filter="from" ${error ? 'aria-invalid="true" aria-describedby="audit-filter-error"' : ""}></div>
        <div class="field"><label for="audit-to">Đến ngày</label><input class="input" id="audit-to" type="date" value="${escapeHtml(to)}" data-audit-filter="to" ${error ? 'aria-invalid="true" aria-describedby="audit-filter-error"' : ""}></div>
        <div class="field"><label for="audit-actor">Người duyệt</label><select class="select" id="audit-actor" data-audit-filter="actor"><option value="">Tất cả</option>${options(actors, actor)}</select></div>
        <div class="field"><label for="audit-type">Loại hồ sơ</label><select class="select" id="audit-type" data-audit-filter="type"><option value="">Tất cả</option>${options(["Chiết khấu bán sỉ", "Thanh toán", "Mua hàng", "Hợp đồng", "Khác"], type)}</select></div>
        <div class="field"><label for="audit-result">Kết quả</label><select class="select" id="audit-result" data-audit-filter="result"><option value="">Tất cả</option>${options(["Đã duyệt", "Từ chối"], result)}</select></div>
        <div class="field"><label>&nbsp;</label><button type="button" class="btn btn-secondary" data-audit-reset>Xóa bộ lọc</button></div>
      </div>
      ${error ? `<p class="hint mt-16" id="audit-filter-error" role="alert">${escapeHtml(error)}</p>` : ""}
      <p class="hint mt-16" aria-live="polite">Bộ lọc đang áp dụng cho bảng và tệp xuất: ${escapeHtml(auditFilterSummary())}</p>
    </div>
    <div class="table-toolbar">
      <div class="toolbar-left">
        <div class="search-box">${icon("search")}<input type="search" aria-label="Tìm kiếm nhật ký" placeholder="Tìm người thực hiện, hành động, đối tượng…" value="${escapeHtml(state.ui.auditSearch)}" data-list-search="audit" data-list-target="audit-table"></div>
      </div>
      <div class="toolbar-right"><span class="muted small" aria-live="polite">${list.length} bản ghi</span></div>
    </div>
    <div id="audit-table">${auditTableHtml(list)}</div>
    <div class="table-footer"><span>Mọi thao tác phê duyệt đều lưu người thực hiện, thời điểm, đối tượng và trạng thái trước/sau.</span><span>Không thể sửa nhật ký</span></div>
  </div>`;
}

function viewSuppliers() {
  const rows = state.suppliers.map((supplier) => ({
    cells: [
      `<div class="cell-main"><span class="strong">${escapeHtml(supplier.name)}</span><span class="cell-sub">${escapeHtml(supplier.id)} · ${escapeHtml(supplier.tax)}</span></div>`,
      `<div class="cell-main"><span>${escapeHtml(supplier.contact)}</span><span class="cell-sub">${escapeHtml(supplier.phone)}</span></div>`,
      `<span>${escapeHtml(supplier.terms)}</span>`,
      `<span class="num">${supplierSupplyCatalog(supplier).length}</span>`,
      `<span>${escapeHtml(supplier.lastDelivery)}</span>`,
      `<div class="row-actions"><button class="btn btn-ghost btn-sm" data-action="open-supplier" data-id="${escapeHtml(supplier.id)}" aria-label="Xem hồ sơ nhà cung cấp">${icon("eye")}</button>${ACTION_ROLES["edit-supplier"].includes(state.role) ? `<button class="btn btn-secondary btn-sm" data-action="edit-supplier" data-id="${escapeHtml(supplier.id)}">Sửa</button>` : ""}</div>`
    ]
  }));
  return `${pageHead({
    title: "Nhà cung cấp",
    subtitle: "Hồ sơ, điều khoản và lịch sử cung ứng phục vụ mua hàng và đối chiếu.",
    actions: `<button class="btn btn-secondary" data-action="export-suppliers">${icon("download")} Xuất danh sách</button><button class="btn btn-primary" data-action="new-supplier">${icon("plus")} Thêm nhà cung cấp</button>`
  })}
  <div class="card">
    ${dataTable([
      { label: "Nhà cung cấp" },
      { label: "Liên hệ" },
      { label: "Điều khoản" },
      { label: "SKU cung ứng", align: "num" },
      { label: "Lần giao gần nhất" },
      { label: "", align: "num" }
    ], rows, { minWidth: 900 })}
    <div class="table-footer"><span>${state.suppliers.length} nhà cung cấp đang theo dõi</span><a class="link-btn" href="#/purchase-orders">Xem đơn đặt hàng</a></div>
  </div>`;
}

function purchaseRequestDecision(request, role) {
  const approval = state.approvals.find((item) => item.type === "purchase" && item.ref === request.code && item.assignee === role);
  const status = approval ? approval.status : request.approvals?.[role] ? "approved" : "pending";
  return { approval, status, label: status === "approved" ? role === "accountant" ? "Đã xác nhận" : "Đã phê duyệt" : status === "rejected" ? "Từ chối" : "Chờ xử lý" };
}

function purchaseRequestEligible(request) {
  return request.status !== "rejected" && ["accountant", "director"].every((role) => purchaseRequestDecision(request, role).status === "approved");
}

function purchaseRequestOrdering(request) {
  const order = state.purchaseOrders.find((item) => item.request === request.code);
  if (order) return order.code;
  if (request.status === "rejected" || ["accountant", "director"].some((role) => purchaseRequestDecision(request, role).status === "rejected")) return "Không đặt hàng";
  return purchaseRequestEligible(request) ? "Đủ điều kiện đặt hàng" : "Chờ đủ xác nhận";
}

function purchaseRequestProcessing(request) {
  const order = state.purchaseOrders.find((item) => item.request === request.code);
  return `<section class="mt-16"><h3 class="section-title">Kết quả xử lý từng bên</h3>${["accountant", "director"].map((role) => {
    const { approval, label } = purchaseRequestDecision(request, role);
    return `<div class="mt-12"><strong>${ROLES[role].label}: ${label}</strong><p class="small muted">Người xử lý: ${escapeHtml(approval?.decidedBy || "Chưa ghi nhận")} · Thời điểm: ${escapeHtml(approval?.decidedAt || "Chưa ghi nhận")}</p><p class="small">Ghi chú: ${escapeHtml(approval?.decisionNote || "Chưa có ghi chú")}</p></div>`;
  }).join("")}<div class="banner info mt-16"><div><strong>Điều kiện đặt hàng: ${escapeHtml(purchaseRequestOrdering(request))}</strong><p class="small">Cần Kế toán xác nhận và Giám đốc phê duyệt. Không đặt hàng nếu một bên từ chối.</p></div></div>${!order && purchaseRequestEligible(request) && actionRoles("create-po").includes(state.role) ? `<button class="btn btn-primary mt-12" data-action="create-po" data-code="${escapeHtml(request.code)}">Lập đơn đặt hàng</button>` : ""}</section>`;
}

function supplierDetails(supplier) {
  const catalog = supplierSupplyCatalog(supplier);
  const receipts = state.receipts.filter((receipt) => receipt.supplier === supplier.id).sort((a, b) => (Date.parse(isoDate(b.eta)) || 0) - (Date.parse(isoDate(a.eta)) || 0) || b.code.localeCompare(a.code, undefined, { numeric: true }));
  const refused = receipts.filter((receipt) => receipt.status === "returned" || receiptOverThreshold(receipt)).length;
  const waiting = state.purchaseOrders.filter((order) => order.supplier === supplier.id && order.status === "returned").length;
  const catalogTable = dataTable([
    { label: "Sản phẩm" }, { label: "Giá nhập tham chiếu", align: "num" }, { label: "Giao dự kiến" }, { label: "Nguồn" }
  ], catalog.map((row) => ({ cells: [productCell(row.sku), money(row.price), row.leadDays === null ? "Chưa ghi nhận" : `${row.leadDays} ngày`, escapeHtml(row.source)] })), { minWidth: 680 });
  const history = receipts.length ? dataTable([
    { label: "Phiếu nhận / Đơn đặt" }, { label: "Đặt", align: "num" }, { label: "Nhận", align: "num" }, { label: "Hỏng", align: "num" }, { label: "% lệch", align: "num" }, { label: "Trạng thái" }
  ], receipts.map((receipt) => {
    const threshold = receiptThreshold(receipt), complete = receiptCountsComplete(receipt);
    const ordered = receipt.lines.reduce((sum, line) => sum + line.ordered, 0);
    const received = receipt.lines.reduce((sum, line) => sum + (line.received || 0), 0);
    const damaged = receipt.lines.reduce((sum, line) => sum + (line.damaged || 0), 0);
    const difference = receipt.lines.reduce((sum, line) => sum + Math.abs((line.received || 0) - line.ordered), 0);
    const variance = complete && ordered ? difference / ordered * 100 : null;
    return { cells: [
      `<a class="link-btn strong" href="${hrefFor("receipts", receipt.code)}">${escapeHtml(receipt.code)}</a>${receipt.po ? `<div><button class="link-btn" data-action="open-po" data-code="${escapeHtml(receipt.po)}">${escapeHtml(receipt.po)}</button></div>` : ""}<div class="cell-sub">${escapeHtml(receipt.eta)} · Ngưỡng: ${threshold === null ? "Chưa thiết lập" : pct(threshold)}</div>${receipt.previousReceipt ? `<div class="cell-sub">Giao lại sau <a class="link-btn" href="${hrefFor("receipts", receipt.previousReceipt)}">${escapeHtml(receipt.previousReceipt)}</a></div>` : ""}`,
      num(ordered), complete ? num(received) : "Chưa đếm đủ", complete ? num(damaged) : "Chưa đếm đủ",
      `<span class="strong" ${receiptOverThreshold(receipt) ? 'style="color:var(--danger)"' : ""}>${variance === null ? "—" : pct(variance)}</span>`, statusChip(receipt.status)
    ] };
  }), { minWidth: 760 }) : "";
  return {
    drawer: true, wide: true, title: supplier.name, subtitle: supplier.id,
    body: `<div class="kv-grid">${[["Người liên hệ", supplier.contact], ["Điện thoại", supplier.phone], ["Email", supplier.email], ["Thanh toán", supplier.terms], ["Địa chỉ", supplier.address], ["MST", supplier.tax]].map(([label, value]) => `<div><div class="kv-label">${escapeHtml(label)}</div><div class="kv-value">${escapeHtml(value)}</div></div>`).join("")}</div><div class="divider"></div><div class="section-heading"><h3 class="section-title">Sản phẩm cung ứng &amp; giá tham chiếu</h3>${ACTION_ROLES["supplier-catalog"].includes(state.role) ? `<button class="btn btn-secondary btn-sm" data-action="supplier-catalog" data-id="${escapeHtml(supplier.id)}">Gắn sản phẩm</button>` : ""}</div>${catalogTable}<div class="divider"></div><h3 class="section-title">Lịch sử cung ứng</h3><p class="small muted mt-8">${receipts.length} lần giao · ${refused} lô vượt ngưỡng/trả lô · ${waiting} đơn chờ giao lại</p>${history || '<p class="hint mt-16">Chưa có phiếu tiếp nhận từ nhà cung cấp này.</p>'}`,
    footer: ACTION_ROLES["edit-supplier"].includes(state.role) ? `<button class="btn btn-primary" data-action="edit-supplier" data-id="${escapeHtml(supplier.id)}">Sửa thông tin</button>` : ""
  };
}

function viewPurchaseRequests() {
  const rows = state.purchaseRequests.map((request) => ({
    cells: [
      `<span class="strong">${escapeHtml(request.code)}</span><div class="cell-sub">${escapeHtml(request.createdAt)}</div>`,
      `<span>${escapeHtml(supplierName(request.supplier))}</span>`,
      `<span>${escapeHtml(request.requester)}</span>`,
      `<span>${escapeHtml(request.needed)}</span>`,
      `<span class="num strong">${money(request.amount)}</span>`,
      `<span>${purchaseRequestDecision(request, "accountant").label}</span>`,
      `<span>${purchaseRequestDecision(request, "director").label}</span>`,
      `<span>${escapeHtml(purchaseRequestOrdering(request))}</span>`,
      `<button class="btn btn-ghost btn-sm" data-action="open-request" data-code="${escapeHtml(request.code)}">${icon("eye")}</button>`
    ]
  }));
  return `${pageHead({
    title: "Yêu cầu mua hàng",
    subtitle: "Đề xuất bổ sung hàng, luân chuyển qua Kế toán và Giám đốc trước khi đặt hàng.",
    actions: `<button class="btn btn-secondary" data-action="export-requests">${icon("download")} Xuất danh sách</button>${state.role === "warehouse_manager" ? `<button class="btn btn-secondary" data-action="auto-purchase-request">${icon("clipboard")} Đề xuất nhập hàng tự động</button>` : ""}<button class="btn btn-primary" data-action="new-purchase-request">${icon("plus")} Lập yêu cầu mua</button>`
  })}
  <div class="banner info mb-16">${icon("clipboard")}<div>Yêu cầu mua chỉ đủ điều kiện đặt hàng khi có cả xác nhận của Kế toán và phê duyệt của Giám đốc. Hai bên có thể xem xét độc lập.</div></div>
  <div class="card">
    ${dataTable([
      { label: "Yêu cầu" },
      { label: "Nhà cung cấp" },
      { label: "Người đề xuất" },
      { label: "Ngày cần hàng" },
      { label: "Giá trị dự kiến", align: "num" },
      { label: "Kế toán" },
      { label: "Giám đốc" },
      { label: "Đặt hàng" },
      { label: "", align: "num" }
    ], rows, { minWidth: 1200 })}
    <div class="table-footer"><span>${state.purchaseRequests.length} yêu cầu · ${state.purchaseRequests.filter((request) => request.status === "pending").length} chờ phê duyệt</span><a class="link-btn" href="#/approvals">Mở phê duyệt</a></div>
  </div>`;
}

function purchaseAttachment(id, reference) {
  const file = id && state.attachments[id];
  return file && file.reference === reference ? `<button type="button" class="file-chip" data-action="view-attachment" data-id="${escapeHtml(id)}">${icon("file")}${escapeHtml(file.name)}</button>` : '<span class="hint">Không có tệp đính kèm.</span>';
}

function purchaseVerifiedTime(timestamp) {
  return new Date(timestamp).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

function purchaseCostDetails(receipt) {
  const entry = receipt.costAdjustment;
  if (!entry) return `<p class="small muted">Phiếu ${escapeHtml(receipt.code)} có sai lệch đã xác nhận. Chờ Kế toán đối chiếu, không tự tính số tiền.</p>${ACTION_ROLES["record-purchase-cost"].includes(state.role) ? `<button class="btn btn-secondary btn-sm mt-12" data-action="record-purchase-cost" data-code="${escapeHtml(receipt.code)}">Ghi nhận điều chỉnh chi phí</button>` : ""}`;
  return `<p class="strong">Điều chỉnh đã xác minh: ${entry.delta > 0 ? "+" : ""}${money(entry.delta)}</p><p class="small muted mt-8">${escapeHtml(entry.reference)} · ${escapeHtml(entry.verifiedBy)} · ${escapeHtml(purchaseVerifiedTime(entry.verifiedAt))}</p><p class="small mt-8 mb-8">${escapeHtml(entry.note)}</p>${purchaseAttachment(entry.evidenceId, receipt.code)}`;
}

function purchaseOrderDetails(order) {
  const request = state.purchaseRequests.find((item) => item.code === order.request);
  const receipts = state.receipts.filter((item) => item.po === order.code && !item.source);
  const payments = order.supplierPayments || [];
  const costReceipt = purchaseCostReceipt(order);
  return `${statusChip(order.status)}<div class="summary-list mt-16">
    <div class="summary-row"><span>Yêu cầu mua</span><span class="value">${escapeHtml(order.request)}</span></div>
    <div class="summary-row"><span>Giá trị đặt hàng</span><span class="value">${money(order.amount)}</span></div>
    <div class="summary-row"><span>Điều khoản thanh toán</span><span class="value">${escapeHtml(order.terms)}</span></div>
  </div><div class="mt-16"><div class="section-title">Báo giá nhà cung cấp</div>${purchaseAttachment(request?.quoteAttachmentId, order.request)}</div>
  <div class="mt-16"><div class="section-title">Lịch sử tiếp nhận</div>${receipts.map((receipt) => `<div class="picker-row"><a class="link-btn" href="${hrefFor("receipts", receipt.code)}">${escapeHtml(receipt.code)}</a><span>${escapeHtml(receipt.eta)}</span>${statusChip(receipt.status)}</div>`).join("") || '<p class="hint">Chưa có phiếu tiếp nhận.</p>'}</div>
  <div class="mt-16"><div class="section-title">Đối chiếu thanh toán nhà cung cấp</div><p class="small muted">Chỉ theo dõi khoản đã xác minh, không thực hiện giao dịch.</p>
    ${payments.length ? `<p class="strong mt-8">Tổng đã đối chiếu: ${money(payments.reduce((sum, entry) => sum + entry.amount, 0))}</p>` : '<p class="hint mt-8">Chưa ghi nhận khoản thanh toán đã xác minh.</p>'}
    ${payments.map((entry) => `<div class="mt-12"><p class="strong">${money(entry.amount)} · ${escapeHtml(entry.date)}</p><p class="small muted mb-8">${escapeHtml(entry.reference)} · ${escapeHtml(entry.verifiedBy)} · ${escapeHtml(purchaseVerifiedTime(entry.verifiedAt))}</p>${purchaseAttachment(entry.evidenceId, order.code)}</div>`).join("")}
    ${ACTION_ROLES["record-supplier-payment"].includes(state.role) ? `<button class="btn btn-secondary btn-sm mt-12" data-action="record-supplier-payment" data-code="${escapeHtml(order.code)}">Đối chiếu khoản đã trả</button>` : ""}
  </div>${costReceipt ? `<div class="mt-16"><div class="section-title">Đối chiếu chi phí mua hàng</div>${purchaseCostDetails(costReceipt)}</div>` : ""}`;
}

function viewPurchaseOrders() {
  const rows = state.purchaseOrders.map((order) => ({
    cells: [
      `<button class="link-btn strong" data-action="open-po" data-code="${escapeHtml(order.code)}">${escapeHtml(order.code)}</button><div class="cell-sub">${escapeHtml(order.createdAt)}</div>`,
      `<span>${escapeHtml(supplierName(order.supplier))}</span>`,
      `<span class="mono-code">${escapeHtml(order.request)}</span>`,
      `<span>${escapeHtml(order.receiveDate)}</span>`,
      `<span class="num strong">${money(order.amount)}</span>`,
      `<span>${escapeHtml(order.terms)}</span>`,
      statusChip(order.status),
      order.receipt ? `<a class="link-btn" href="${hrefFor("receipts", order.receipt)}">${escapeHtml(order.receipt)}</a>` : canStartPoReceipt(order) ? `<button class="btn btn-secondary btn-sm" data-action="create-receipt" data-code="${escapeHtml(order.code)}">Tiếp nhận</button>` : "—",
      `<span>${order.supplierPayments?.length ? `${order.supplierPayments.length} khoản đã đối chiếu` : "Chưa ghi nhận"}</span>${purchaseCostReceipt(order) ? `<div class="cell-sub">${purchaseCostReceipt(order).costAdjustment ? "Đã đối chiếu chi phí" : "Chờ đối chiếu chi phí"}</div>` : ""}`
    ]
  }));
  return `${pageHead({
    title: "Đơn đặt hàng nhà cung cấp",
    subtitle: "Cam kết mua hàng sau khi yêu cầu mua có đủ xác nhận.",
    actions: `<button class="btn btn-secondary" data-action="export-po">${icon("download")} Xuất danh sách</button><button class="btn btn-primary" data-action="create-po">${icon("plus")} Lập đơn đặt hàng</button>`
  })}
  <div class="card">
    ${dataTable([
      { label: "Đơn đặt hàng" },
      { label: "Nhà cung cấp" },
      { label: "Yêu cầu mua" },
      { label: "Ngày nhận" },
      { label: "Giá trị", align: "num" },
      { label: "Điều khoản" },
      { label: "Trạng thái" },
       { label: "Phiếu nhận" },
       { label: "Đối chiếu" }
    ], rows, { minWidth: 1080 })}
    <div class="table-footer"><span>${state.purchaseOrders.length} đơn đặt hàng</span><span>${state.purchaseOrders.filter((order) => order.status === "receiving").length} đang tiếp nhận</span></div>
  </div>`;
}

function returnDeliveryTime(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

function deliveryAttachment(id, label) {
  return id ? `<button class="file-chip" type="button" data-action="view-attachment" data-id="${escapeHtml(id)}">${icon("file")}${escapeHtml(label)}</button>` : "";
}

function deliveryDetails(delivery) {
  const code = escapeHtml(delivery.code);
  const blocked = delivery.status !== "delivered" && deliveryReturnBlock(delivery);
  const attempts = deliveryAttempts(delivery);
  const footer = delivery.status === "shipping" && ACTION_ROLES["delivery-result"].includes(state.role) && !deliveryReturnBlock(delivery, true)
    ? `<button class="btn btn-danger" data-action="delivery-result" data-code="${code}" data-result="failed">Giao thất bại</button>${blocked ? "" : `<button class="btn btn-secondary" data-action="delivery-result" data-code="${code}" data-result="delivery_partial">Giao một phần</button><button class="btn btn-primary" data-action="delivery-result" data-code="${code}" data-result="delivered">Giao đủ</button>`}`
    : !blocked && ["delivery_pending", "failed", "delivery_partial"].includes(delivery.status) && ACTION_ROLES["schedule-delivery"].includes(state.role)
      ? `<button class="btn btn-primary" data-action="schedule-delivery" data-code="${code}">${delivery.status === "delivery_pending" ? "Bàn giao vận chuyển" : "Giao lại phần còn thiếu"}</button>` : "";
  const summary = [["Phiếu xuất", delivery.issue], ["Đơn vị vận chuyển", delivery.carrier || "Chưa bàn giao"], ["Ngày dự kiến", delivery.planned], ["Mã vận đơn", delivery.tracking], ["Chi phí", money(delivery.fee)], ["Bên chịu phí", delivery.payer], ["Ghi chú", delivery.note]];
  const rows = (delivery.items || []).map(({ sku, qty }) => {
    const accepted = deliveryAcceptedQty(delivery, sku);
    return `<div class="picker-row">${productCell(sku)}<span>Xuất: ${num(qty)} · Khách đã nhận: ${num(accepted)} · Còn giao: ${num(qty - accepted)}</span></div>`;
  }).join("");
  const history = attempts.map((attempt, index) => `<div class="mt-12"><strong>Lần ${index + 1}</strong> ${statusChip(attempt.status)}<div class="small">Nhận xác nhận: ${escapeHtml(returnDeliveryTime(attempt.resultReceivedAt))} · Ghi kết quả: ${escapeHtml(returnDeliveryTime(attempt.resultRecordedAt))}</div><div class="small">Đã nhận lần này: ${escapeHtml((attempt.acceptedItems || []).map(({ sku, qty }) => `${sku}: ${num(qty)}`).join(" · "))}</div>${attempt.reason ? `<div class="small">${escapeHtml(attempt.reason)}</div>` : ""}${deliveryAttachment(attempt.evidenceId, "Biên bản giao nhận")}</div>`).join("");
  const body = `${statusChip(delivery.status)}<div class="summary-list mt-16">${summary.map(([label, value]) => `<div class="summary-row"><span>${escapeHtml(label)}</span><span class="value">${escapeHtml(value || "—")}</span></div>`).join("")}</div>${rows}${history ? `<h3 class="section-title mt-16">Lịch sử kết quả giao</h3>${history}` : deliveryAttachment(delivery.evidenceId, "Biên bản giao nhận")}${blocked ? `<div class="banner warning mt-16">${escapeHtml(blocked)}</div>` : `<div class="banner info mt-16">Ghi nhận số thực nhận theo từng SKU; mọi lần giao có khách nhận hàng cần biên bản có chữ ký.</div>`}`;
  return { drawer: true, title: delivery.code, subtitle: `${delivery.order} · ${customerName(delivery.customerId)}`, body, footer };
}

function returnDetails(item) {
  const code = escapeHtml(item.code), candidates = returnDeliveryCandidates(item);
  const deliveryLabel = item.delivery || (candidates.length === 1 ? `${candidates[0].code} (suy ra từ hồ sơ cũ)` : "Chưa xác định duy nhất");
  const condition = item.condition === "mixed" ? "Có hàng đạt và hàng hư hỏng" : item.condition === "good" ? "Đủ điều kiện bán lại" : item.condition === "damaged" ? "Hư hỏng / chờ xử lý" : "";
  const receipt = item.receivedAt ? `<div class="mt-12"><strong>Thực nhận: ${num(item.receivedQty ?? item.qty)}</strong><div class="small">Lúc ${escapeHtml(returnDeliveryTime(item.receivedAt))}${item.receiptRecordedAt ? ` · Ghi lúc ${escapeHtml(returnDeliveryTime(item.receiptRecordedAt))}` : ""}</div><div class="small">${escapeHtml(item.receiptNote)}</div>${deliveryAttachment(item.receiptEvidenceId, "Chứng từ nhận hàng hoàn")}</div>` : "";
  const resolution = (item.resolutionEvidence || []).map((entry) => `<div class="mt-12"><strong>${entry.track === "finance" ? "Tiền / công nợ" : "Đổi bù"} · ${escapeHtml(entry.reference)}</strong><div class="small">${escapeHtml(entry.note)} · ${escapeHtml(returnDeliveryTime(entry.recordedAt))}</div>${deliveryAttachment(entry.evidenceId, "Chứng từ đối chiếu")}</div>`).join("");
  const actionButton = (action, label, style = "primary") => ACTION_ROLES[action].includes(state.role) ? `<button class="btn btn-${style}" data-action="${action}" data-code="${code}">${label}</button>` : "";
  const posted = returnIsPosted(item), financiallyResolved = returnFinanciallyResolved(item);
  const finance = financiallyResolved ? `<div class="banner success mt-16"><strong>Tài chính đã được Kế toán xác minh</strong><div>${escapeHtml(item.financialResolution.reference)} · Căn cứ: ${escapeHtml(item.financialResolution.authorizationReference)}</div><div>${escapeHtml(item.financialResolution.note)} · ${escapeHtml(returnDeliveryTime(item.financialResolution.resolvedAt))}</div></div>` : posted ? '<div class="banner warning mt-16">Đã ghi nhập kho; tiền / công nợ hoặc đổi bù còn chờ xác nhận. Lưu chứng từ không tự đóng hồ sơ.</div>' : "";
  const footer = !posted && item.status === "inspecting" ? actionButton("return-receive", "Ghi nhận thực nhận") : !posted && item.status === "return_received" ? actionButton("return-inspection", "Kiểm tra và nhập kho") : posted ? actionButton("return-finance-evidence", "Lưu chứng từ tiền / công nợ", "secondary") + actionButton("return-replacement-evidence", "Lưu chứng từ đổi bù", "secondary") + (!financiallyResolved ? actionButton("return-finance-resolve", "Xác nhận kết quả tài chính") : "") : "";
  const body = `${statusChip(returnStatus(item))}<p class="small mt-12">Chuyến giao: ${escapeHtml(deliveryLabel)}${item.returnKind === "undelivered" ? " · Hàng chưa giao" : item.returnKind === "customer" ? " · Khách trả hàng" : ""}</p><div class="picker-row">${productCell(item.sku)}<strong>SL phiếu: ${num(item.qty)}</strong></div><p class="small mt-12">${escapeHtml(item.reason)} · ${escapeHtml(item.note)}</p>${item.remainderReturn ? `<p class="small">Yêu cầu gốc: ${num(item.originalRequestedQty)} · Phần chờ nhận: ${escapeHtml(item.remainderReturn)}</p>` : ""}${receipt}${posted ? `<p class="small mt-12">Đã ghi nhập kho: ${item.postedAt ? escapeHtml(returnDeliveryTime(item.postedAt)) : "Hồ sơ cũ, không ghi nhập lại"}</p>` : ""}${condition ? `<p class="small mt-12">Phân loại: ${escapeHtml(condition)}${item.goodQty === undefined ? "" : ` · Đạt: ${num(item.goodQty)} · Lỗi: ${num(item.damagedQty)}`}</p>` : ""}${resolution}${finance}<div class="banner warning mt-16">Thực nhận không cập nhật tồn. Kho chỉ cập nhật khi xác nhận phân loại. Chứng từ tiền / đổi bù không phê duyệt hoặc tạo giao dịch. Chỉ hoàn tất sau xác nhận riêng của Kế toán về kết quả đã xử lý theo thẩm quyền và đã đối chiếu.</div>`;
  return { drawer: true, title: item.code, subtitle: `${item.order} · ${customerName(item.customerId)}`, body, footer };
}

function viewDeliveries() {
  const rows = state.deliveries.map((delivery) => ({
    cells: [
      `<span class="strong">${escapeHtml(delivery.code)}</span><div class="cell-sub">${escapeHtml(delivery.order)}</div>`,
      `<span>${escapeHtml(customerName(delivery.customerId))}</span>`,
      `<span>${escapeHtml(delivery.carrier)}</span>`,
      `<span>${escapeHtml(delivery.planned)}</span>`,
      `<span class="num">${money(delivery.fee)}</span>`,
      `<span>${escapeHtml(delivery.payer)}</span>`,
      `${statusChip(delivery.status)}${delivery.retryClosedAt && delivery.status === "delivery_partial" ? '<div class="cell-sub">Phần còn lại đã nhập hoàn</div>' : ""}`,
      `<button class="btn btn-ghost btn-sm" data-action="open-delivery" data-code="${escapeHtml(delivery.code)}" aria-label="Xem chi tiết chuyến giao">${icon("eye")}</button>`
    ]
  }));
  return `${pageHead({
    title: "Theo dõi giao nhận",
    subtitle: "Ghi nhận thực giao và phần còn giao theo SKU, từ bàn giao đến giao lại hoặc nhập hoàn.",
    actions: `<button class="btn btn-secondary" data-action="export-deliveries">${icon("download")} Xuất danh sách</button>`
  })}
  <div class="card">
    ${dataTable([
      { label: "Mã giao nhận" },
      { label: "Khách hàng" },
      { label: "Đơn vị vận chuyển" },
      { label: "Kế hoạch" },
      { label: "Phí", align: "num" },
      { label: "Bên chịu phí" },
      { label: "Trạng thái" },
      { label: "", align: "num" }
    ], rows, { minWidth: 960 })}
    <div class="table-footer"><span>${state.deliveries.length} chuyến giao</span><span>Giao thất bại phải được ghi nhận trong ngày</span></div>
  </div>`;
}

function viewReturns() {
  const rows = state.returns.map((item) => ({
    cells: [
      `<span class="strong">${escapeHtml(item.code)}</span><div class="cell-sub">${escapeHtml(item.createdAt)}</div>`,
      `<span>${escapeHtml(item.order)}</span><div class="cell-sub">${escapeHtml(item.delivery)}</div>`,
      `<span>${escapeHtml(customerName(item.customerId))}</span>`,
      productCell(item.sku),
      `<span class="num">${num(item.qty)}</span><div class="cell-sub">${item.receivedAt ? `Đã nhận: ${num(item.receivedQty ?? item.qty)}` : "Chưa nhận"}</div>`,
      `<span>${escapeHtml(item.reason)}</span>`,
      `${statusChip(returnStatus(item))}${returnIsPosted(item) ? '<div class="cell-sub">Đã ghi nhập kho</div>' : item.status === "return_received" ? `<div class="cell-sub">${escapeHtml(returnDeliveryTime(item.receivedAt))}</div>` : ""}`,
      `<button class="btn btn-ghost btn-sm" data-action="open-return" data-code="${escapeHtml(item.code)}" aria-label="Xem chi tiết hàng hoàn">${icon("eye")}</button>`
    ]
  }));
  return `${pageHead({
    title: "Đổi trả hàng hóa",
    subtitle: "Theo dõi riêng thực nhận, nhập kho và xác nhận kết quả xử lý tài chính.",
    actions: `<button class="btn btn-secondary" data-action="export-returns">${icon("download")} Xuất danh sách</button>${ACTION_ROLES["new-return"].includes(state.role) ? `<button class="btn btn-primary" data-action="new-return">${icon("plus")} Tiếp nhận đổi trả</button>` : ""}${ACTION_ROLES["new-undelivered-return"].includes(state.role) ? `<button class="btn btn-primary" data-action="new-undelivered-return">${icon("plus")} Nhận hàng giao không thành công</button>` : ""}`
  })}
  <div class="banner warning mb-16">${icon("alert")}<div><strong>Chỉ tiếp nhận lỗi từ SoulWine hoặc đơn vị vận chuyển.</strong> Hàng không lỗi do khách đổi ý bị từ chối theo chính sách đã xác nhận.</div></div>
  <div class="card">
    ${dataTable([
      { label: "Yêu cầu" },
      { label: "Đơn hàng / chuyến giao" },
      { label: "Khách hàng" },
      { label: "Sản phẩm" },
      { label: "SL", align: "num" },
      { label: "Nguyên nhân" },
      { label: "Trạng thái" },
      { label: "", align: "num" }
    ], rows, { minWidth: 1020 })}
    <div class="table-footer"><span>${state.returns.length} yêu cầu đổi trả</span><span>Hàng hư hỏng không cộng vào tồn khả dụng</span></div>
  </div>`;
}

function filteredDocuments() {
  const filter = state.ui.docFilter;
  const search = (state.ui.docSearch || "").trim().toLowerCase();
  return state.documents.filter((document) => (filter === "all" || document.type === filter) && (!search || `${document.code} ${document.type} ${document.record} ${document.owner} ${document.date}`.toLowerCase().includes(search)));
}

function documentsTableHtml(list) {
  return dataTable([
    { label: "Mã chứng từ" },
    { label: "Loại" },
    { label: "Liên kết" },
    { label: "Ngày lập" },
    { label: "Tệp" },
    { label: "Người tạo" },
    { label: "", align: "num" }
  ], list.map((document) => ({
    cells: [
      `<span class="strong">${escapeHtml(document.code)}</span>`,
      `<span>${escapeHtml(document.type)}</span>`,
      `<span class="mono-code">${escapeHtml(document.record)}</span>`,
      `<span>${escapeHtml(document.date)}</span>`,
      document.fileId ? `<button class="file-chip" data-action="view-attachment" data-id="${document.fileId}">${icon("file")}${escapeHtml(document.file)} ${icon("eye")}</button>` : attachmentChip(document.file, document.record),
      `<span>${escapeHtml(document.owner)}</span>`,
      `<button class="btn btn-ghost btn-sm" data-action="print-document" data-code="${escapeHtml(document.code)}">${icon("printer")} In thông tin</button>`
    ]
  })), { minWidth: 900, empty: emptyState("search", "Không có chứng từ phù hợp", "Đổi tab loại chứng từ hoặc xóa từ khóa để xem lại.") });
}

function viewDocuments() {
  const filter = state.ui.docFilter;
  const types = ["all", "Hợp đồng", "Báo giá", "Phiếu thu", "Phiếu xuất kho", "Hóa đơn", "Phiếu nhập kho"];
  const list = filteredDocuments();
  return `${pageHead({
    title: "Chứng từ",
    subtitle: "Bộ chứng từ liên kết đơn hàng, hợp đồng và thanh toán.",
    actions: `<button class="btn btn-secondary" data-action="export-documents">${icon("download")} Xuất danh sách</button>`
  })}
  <div class="card">
    <div class="table-toolbar">
      <div class="toolbar-left">${filterTabs("docFilter", types.map((type) => ({ value: type, label: type === "all" ? "Tất cả" : type, count: type === "all" ? state.documents.length : state.documents.filter((document) => document.type === type).length })), filter)}</div>
      <div class="toolbar-right"><div class="search-box">${icon("search")}<input type="search" placeholder="Tìm mã, liên kết, người tạo, ngày lập…" value="${escapeHtml(state.ui.docSearch || "")}" data-list-search="documents" data-list-target="documents-table"></div><span class="muted small">${list.length} chứng từ</span></div>
    </div>
    <div id="documents-table">${documentsTableHtml(list)}</div>
    <div class="table-footer"><span>Hóa đơn chỉ lưu thông tin và tệp đã phát hành.</span><span>Không tích hợp phát hành trực tiếp</span></div>
  </div>`;
}

function viewIssues() {
  const pending = state.orders.filter((order) => order.issueRequest?.status === "pending");
  const rows = state.issues.map((issue) => ({
    cells: [
      `<span class="strong">${escapeHtml(issue.code)}</span><div class="cell-sub">${escapeHtml(issue.date)}</div>`,
      `<span>${escapeHtml(issue.order)}</span>`,
      `<span>${escapeHtml(customerName(issue.customerId))}</span>`,
      `<div class="cell-main">${issue.lines.map((line) => `<span>${num(line.qty)} × ${escapeHtml(productName(line.sku))}</span>`).join("")}</div>`,
      statusChip(issue.status),
      `<span>${escapeHtml(issue.owner)}</span>`,
      `<button class="btn btn-ghost btn-sm" data-action="print-issue" data-code="${escapeHtml(issue.code)}">${icon("printer")} In</button>`
    ]
  }));
  return `${pageHead({
    title: "Phiếu xuất kho",
    subtitle: "Xác nhận số thực xuất theo đơn hoặc đợt giao đủ điều kiện.",
    actions: `<button class="btn btn-secondary" data-action="export-issues">${icon("download")} Xuất danh sách</button>`
  })}
  <div class="banner info mb-16">${icon("package")}<div><strong>Không xuất vượt lượng còn phải giao hoặc tồn vật lý.</strong> Hàng đang giữ cho đơn khác không được dùng để xuất cho đơn này.</div></div>
  ${pending.length ? card({ title: "Yêu cầu xuất chờ xác nhận", body: `<div class="summary-list">${pending.map((order) => `<div class="summary-row"><div><strong>${escapeHtml(order.code)}</strong><div class="cell-sub">${escapeHtml(order.issueRequest.requestedBy)} · ${num(order.issueRequest.lines.reduce((sum, line) => sum + line.qty, 0))} đơn vị</div></div>${routeAllowed("orders") ? `<a href="${hrefFor("orders", order.code)}" class="btn btn-secondary btn-sm">Mở đơn</a>` : ""}</div>`).join("")}</div>` }) : ""}
  <div class="card">
    ${dataTable([
      { label: "Phiếu xuất" },
      { label: "Đơn hàng" },
      { label: "Khách hàng" },
      { label: "Hàng hóa" },
      { label: "Trạng thái" },
      { label: "Người xác nhận" },
      { label: "", align: "num" }
    ], rows, { minWidth: 900 })}
    <div class="table-footer"><span>${state.issues.length} phiếu xuất kho</span><span>Ghi giảm tồn theo số thực xuất</span></div>
  </div>`;
}

function movementsTableHtml(list) {
  return dataTable([
    { label: "Thời điểm" },
    { label: "Sản phẩm" },
    { label: "Loại biến động" },
    { label: "SL", align: "num" },
    { label: "Tồn vật lý", align: "num" },
    { label: "Đang giữ", align: "num" },
    { label: "Chứng từ" },
    { label: "Người thao tác" }
  ], list.map((movement) => ({
    cells: [
      `<span class="nowrap">${escapeHtml(movement.time)}</span>`,
      productCell(movement.sku),
      `<span class="chip ${movement.type === "Nhập kho" ? "success" : movement.type === "Xuất kho" ? "info" : movement.type === "Giữ hàng" ? "brass" : "warning"}">${escapeHtml(movement.type)}</span>`,
      `<span class="num strong" style="color:${movement.qty < 0 ? "var(--danger)" : "var(--success)"}">${movement.qty > 0 ? "+" : ""}${num(movement.qty)}</span>`,
      `<span class="num">${num(movement.physical)}</span>`,
      `<span class="num">${num(movement.held)}</span>`,
      `<span class="mono-code">${escapeHtml(movement.ref)}</span>`,
      `<div class="cell-main"><span>${escapeHtml(movement.user)}</span><span class="cell-sub">${escapeHtml(movement.note || "")}</span></div>`
    ]
  })), { minWidth: 1060 });
}

function filteredMovements() {
  const search = state.ui.movementSearch.trim().toLowerCase();
  const type = state.ui.movementType;
  return state.movements.filter((movement) => {
    const typeMatch = type === "all"
      || (type === "in" && movement.type === "Nhập kho")
      || (type === "out" && movement.type === "Xuất kho")
      || (type === "hold" && movement.type === "Giữ hàng")
      || (type === "adjust" && movement.type === "Điều chỉnh tồn");
    const haystack = `${movement.sku} ${productName(movement.sku)} ${movement.ref} ${movement.user}`.toLowerCase();
    return typeMatch && (!search || haystack.includes(search));
  });
}

function viewMovements() {
  const list = filteredMovements();
  const tabs = [
    { value: "all", label: "Tất cả", count: state.movements.length },
    { value: "in", label: "Nhập kho", count: state.movements.filter((movement) => movement.type === "Nhập kho").length },
    { value: "out", label: "Xuất kho", count: state.movements.filter((movement) => movement.type === "Xuất kho").length },
    { value: "hold", label: "Giữ hàng", count: state.movements.filter((movement) => movement.type === "Giữ hàng").length },
    { value: "adjust", label: "Điều chỉnh", count: state.movements.filter((movement) => movement.type === "Điều chỉnh tồn").length }
  ];
  return `${pageHead({
    title: "Thẻ kho",
    subtitle: "Lịch sử biến động tồn kho theo sản phẩm và chứng từ liên quan.",
    actions: `<button class="btn btn-secondary" data-action="export-movements">${icon("download")} Xuất thẻ kho</button>`
  })}
  <div class="banner info mb-16">${icon("history")}<div><strong>Giữ hàng chỉ làm thay đổi lượng giữ và tồn khả dụng, không làm thay đổi tồn vật lý.</strong> Mọi giao dịch đều lưu người thao tác, thời điểm và trạng thái trước/sau.</div></div>
  <div class="card">
    <div class="table-toolbar">
      <div class="toolbar-left">
        <div class="search-box">${icon("search")}<input type="search" placeholder="Tìm SKU, sản phẩm, chứng từ…" value="${escapeHtml(state.ui.movementSearch)}" data-list-search="movements" data-list-target="movements-table"></div>
        ${filterTabs("movementType", tabs, state.ui.movementType)}
      </div>
      <div class="toolbar-right"><span class="muted small">${list.length} bản ghi</span></div>
    </div>
    <div id="movements-table">${movementsTableHtml(list)}</div>
    <div class="table-footer"><span>Hiển thị <strong>${list.length}</strong> / ${state.movements.length} giao dịch</span><span>Không sửa/xóa nhật ký biến động</span></div>
  </div>`;
}

function viewAccounts() {
  const director = state.role === "director";
  const rows = state.users.map((user) => {
    const credential = credentialByUserId(user.id);
    return {
      cells: [
        `<div class="cell-main"><span class="strong">${escapeHtml(user.name)}</span><span class="cell-sub">${escapeHtml(user.email || "Chưa có email")}</span></div>`,
        `<span>${escapeHtml(user.dept)}</span>`,
        `<span class="chip accent">${escapeHtml(user.role)}</span>`,
        statusChip(user.status),
        loginStatusChip(user),
        `<div class="row-actions">${director ? `<button class="btn btn-secondary btn-sm" data-action="reset-user-password" data-id="${escapeHtml(user.id)}">${icon("shield")} Cấp lại mật khẩu</button>${credential?.locked ? `<button class="btn btn-secondary btn-sm" data-action="unlock-account" data-id="${escapeHtml(user.id)}">${icon("check")} Mở khóa</button>` : ""}` : ""}<button class="btn btn-secondary btn-sm" data-action="toggle-user" data-id="${escapeHtml(user.id)}">${icon(user.status === "user_active" ? "lock" : "check")} ${user.status === "user_active" ? "Ngừng" : "Kích hoạt"}</button></div>`
      ]
    };
  });
  return `${pageHead({
    title: "Hồ sơ nhân sự",
    subtitle: "Thông tin liên hệ, vai trò, tài khoản đăng nhập và tình trạng truy cập.",
    actions: `<button class="btn btn-primary" data-action="new-user">${icon("plus")} Thêm nhân sự</button>`
  })}
  <div class="banner info mb-16">${icon("shield")}<div><strong>Giám đốc cấp mật khẩu ban đầu và cấp lại khi cần.</strong> Nhân sự đổi mật khẩu ở lần đăng nhập đầu. Khôi phục mật khẩu trên thiết bị này không gửi thư điện tử. Tài khoản tạm khóa sau ${MAX_FAILED_LOGINS} lần nhập sai.</div></div>
  <div class="card">
    ${dataTable([
      { label: "Nhân sự" },
      { label: "Bộ phận" },
      { label: "Vai trò" },
      { label: "Hồ sơ" },
      { label: "Đăng nhập" },
      { label: "", align: "num" }
    ], rows, { minWidth: 980 })}
    <div class="table-footer"><span>${state.users.length} hồ sơ nhân sự</span><span>Mật khẩu lưu dưới dạng đã băm trên thiết bị</span></div>
  </div>`;
}

function matrixCell(value) {
  if (value === "yes") return `<span class="yes">✓</span>`;
  if (value === "pending") return `<span class="pending">?</span>`;
  return `<span class="no">—</span>`;
}

function viewRoles() {
  const columns = ["director", "accountant", "sales_manager", "sales_staff", "warehouse_manager", "warehouse_staff"];
  const permissions = [...CONFIGURABLE_ACTIONS, ["Quản lý nhân sự", "new-user"]].map(([label, action]) => ({ label, values: columns.map((role) => actionRoles(action).includes(role) ? "yes" : "no") }));
  return `${pageHead({
    title: "Phân quyền theo vai trò",
    subtitle: "Phạm vi chức năng theo vai trò đang được áp dụng trong không gian làm việc.",
    actions: `<button class="btn btn-secondary" data-action="export-roles">${icon("download")} Xuất ma trận</button><button class="btn btn-primary" data-action="configure-permissions">${icon("edit")} Điều chỉnh quyền</button>`
  })}
  <div class="banner info mb-16">${icon("shield")}<div>Vai trò hiển thị chức năng phù hợp trên thiết bị. Phân quyền và bảo vệ dữ liệu khi triển khai nhiều người dùng cần được thực thi bởi dịch vụ xác thực và máy chủ.</div></div>
  <div class="card">
    <div class="matrix-wrap"><table class="matrix">
      <thead><tr><th>Quyền chức năng</th><th>Giám đốc</th><th>Kế toán</th><th>Quản lý bán hàng</th><th>Nhân viên bán hàng</th><th>Quản lý kho</th><th>Nhân viên kho</th></tr></thead>
      <tbody>${permissions.map((permission) => `<tr><td>${escapeHtml(permission.label)}</td>${permission.values.map((value) => `<td>${matrixCell(value)}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></div>
    <div class="table-footer"><span>Kiểm soát tách biệt người kiểm đếm và người xác nhận kho.</span><span>6 vai trò nghiệp vụ</span></div>
  </div>`;
}

function viewSettings() {
  return settingsPage();
}

function viewNotFound() {
  return `${pageHead({ title: "Không tìm thấy trang" })}
  <div class="card">${emptyState("search", "Trang không tồn tại", "Đường dẫn có thể đã thay đổi hoặc bạn không có quyền truy cập.", `<a class="btn btn-primary" href="#/dashboard">Về tổng quan</a>`)}</div>`;
}
