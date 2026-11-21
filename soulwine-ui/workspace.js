const WORKSPACE_KEY = "soulwine.workspace.v1";
const PROFILE_KEY = "soulwine.profile";
const DEFAULT_SETTINGS = {
  organization: { name: "SoulWine", taxId: "", address: "", representative: "", phone: "", email: "" },
  rules: { receiptTolerance: null, quoteValidityDays: 30, holdDays: null, approvalHours: null, quoteReminderDays: 3, shipmentReminderDays: 5, workStart: "08:00", workEnd: "17:00" },
  notifications: { shipment: true, quote: true, approval: true, stock: true, payment: true },
  display: { density: "comfortable", pageSize: 10 }
};
const workspaceStatus = { revision: 0, savedAt: "", error: "", conflict: false, raw: "", serialized: "" };
let workspaceSaveTimer;
state.settings = structuredClone(DEFAULT_SETTINGS);
state.notifications = [];

function validateWorkspace(payload) {
  if (!payload || payload.version !== 1 || !payload.data || typeof payload.data !== "object") throw new Error("Định dạng dữ liệu không hợp lệ.");
  if (!Number.isSafeInteger(payload.revision) || payload.revision < 0) throw new Error("Phiên bản dữ liệu không hợp lệ.");
  for (const key of ENTITY_KEYS) {
    if (!Array.isArray(payload.data[key]) || payload.data[key].length > 25000) throw new Error(`Danh mục ${key} không hợp lệ.`);
    if (payload.data[key].some((record) => !record || typeof record !== "object" || Array.isArray(record))) throw new Error("Bản ghi không hợp lệ.");
  }
  if (!payload.data.users.some((user) => user.status === "user_active" && user.roleIds?.includes("director"))) throw new Error("Không tìm thấy hồ sơ quản trị đang hoạt động.");
  if (!payload.data.settings?.organization || !payload.data.settings?.rules || !payload.data.settings?.display) throw new Error("Thiếu cấu hình không gian làm việc.");
  if (payload.data.credentials !== undefined && (!Array.isArray(payload.data.credentials) || payload.data.credentials.some((item) => !item || typeof item !== "object" || Array.isArray(item)))) throw new Error("Danh sách thông tin đăng nhập không hợp lệ.");
  return payload;
}

function workspaceData() {
  return {
    ...Object.fromEntries(ENTITY_KEYS.map((key) => [key, state[key]])),
    settings: state.settings, notifications: state.notifications, attachments: state.attachments, credentials: state.credentials, sampleData: state.sampleData || {},
    editor: state.ui.draftQuote || null, workingQuotes: state.ui.quoteWorkingCopies || {}, tableViews: state.ui.tableViews || {}, collapsed: state.collapsed
  };
}

function hydrateWorkspace(payload) {
  validateWorkspace(payload);
  ENTITY_KEYS.forEach((key) => state[key] = payload.data[key]);
  state.credentials = payload.data.credentials || [];
  state.users.forEach((user) => { if (!user.email) user.email = credentialByUserId(user.id)?.email || user.email; });
  state.settings = payload.data.settings;
  state.notifications = payload.data.notifications || [];
  state.attachments = payload.data.attachments || {};
  state.sampleData = payload.data.sampleData || {};
  state.ui.draftQuote = payload.data.editor || null;
  state.ui.quoteWorkingCopies = payload.data.workingQuotes || {};
  state.ui.tableViews = payload.data.tableViews || {};
  state.collapsed = !!payload.data.collapsed;
  workspaceStatus.revision = payload.revision;
  workspaceStatus.savedAt = payload.savedAt;
  workspaceStatus.serialized = JSON.stringify(workspaceData());
  workspaceStatus.error = "";
  workspaceStatus.conflict = false;
  const user = state.users.find((item) => item.id === state.activeUserId && item.status === "user_active");
  if (state.loggedIn && !user?.roleIds.includes(state.role)) state.loggedIn = false;
}

function loadWorkspace() {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (raw) {
      workspaceStatus.raw = raw;
      const payload = JSON.parse(raw);
      validateRestoredData(payload.data);
      const cleaned = typeof sanitizeDataTypeNotes === "function" ? sanitizeDataTypeNotes(payload.data) : payload.data;
      const changed = JSON.stringify(cleaned) !== JSON.stringify(payload.data);
      payload.data = cleaned;
      hydrateWorkspace(payload);
      if (changed) persistWorkspace();
    }
    const profile = JSON.parse(sessionStorage.getItem(PROFILE_KEY) || "null");
    const user = profile && state.users.find((item) => item.id === profile.user && item.status === "user_active" && item.roleIds?.includes(profile.role));
    state.loggedIn = !!user;
    if (user) { state.activeUserId = user.id; state.role = profile.role; }
  } catch (error) {
    workspaceStatus.error = workspaceStatus.raw ? "corrupt" : "unavailable";
  }
}

function persistWorkspace() {
  clearTimeout(workspaceSaveTimer);
  if (workspaceStatus.error === "corrupt" || workspaceStatus.conflict) return false;
  try {
    const serialized = JSON.stringify(workspaceData());
    if (serialized === workspaceStatus.serialized && !workspaceStatus.error) return true;
    const current = localStorage.getItem(WORKSPACE_KEY);
    if (current && JSON.parse(current).revision > workspaceStatus.revision) { workspaceStatus.conflict = true; return false; }
    const savedAt = new Date().toISOString();
    const revision = workspaceStatus.revision + 1;
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ version: 1, revision, savedAt, data: JSON.parse(serialized) }));
    Object.assign(workspaceStatus, { revision, savedAt, serialized, error: "" });
    return true;
  } catch (error) { workspaceStatus.error = error.name === "QuotaExceededError" ? "quota" : "unavailable"; return false; }
}

function scheduleWorkspaceSave() {
  clearTimeout(workspaceSaveTimer);
  const status = document.getElementById("save-status");
  if (status) { status.textContent = "Đang lưu…"; status.dataset.state = "saving"; }
  workspaceSaveTimer = setTimeout(() => { persistWorkspace(); renderStorageStatus(); }, 350);
}

function renderStorageStatus() {
  const element = document.getElementById("save-status");
  if (element) {
    element.textContent = workspaceStatus.conflict ? "Có cập nhật mới" : workspaceStatus.error ? "Chưa lưu được" : "Đã lưu trên thiết bị";
    element.dataset.state = workspaceStatus.error || workspaceStatus.conflict ? "error" : "saved";
    element.title = workspaceStatus.savedAt ? `Lưu gần nhất ${new Date(workspaceStatus.savedAt).toLocaleString("vi-VN")}. Dữ liệu không đồng bộ sang thiết bị khác.` : "Dữ liệu được lưu trong trình duyệt hiện tại.";
  }
  const root = document.getElementById("workspace-notices");
  if (!root) return;
  root.innerHTML = workspaceStatus.conflict ? `<div class="banner warning">${icon("alert")}<div><strong>Dữ liệu đã thay đổi ở cửa sổ khác.</strong> Các thay đổi hiện tại chưa được ghi đè. Tải phiên bản mới trước khi tiếp tục.</div><button class="btn btn-secondary btn-sm" data-action="reload-workspace">Tải dữ liệu mới</button></div>`
    : workspaceStatus.error && workspaceStatus.error !== "corrupt" ? `<div class="banner danger">${icon("alert")}<div><strong>Chưa thể lưu trên thiết bị.</strong> ${workspaceStatus.error === "quota" ? "Dung lượng trình duyệt không đủ. Tải bản sao lưu và giải phóng dung lượng." : "Kiểm tra quyền lưu dữ liệu của trình duyệt. Thay đổi hiện vẫn ở bộ nhớ của trang."}</div><button class="btn btn-secondary btn-sm" data-action="retry-save">Thử lưu lại</button><button class="btn btn-secondary btn-sm" data-action="backup-workspace">Sao lưu</button></div>` : "";
}

function enterWorkspace(userId, role) {
  const user = state.users.find((item) => item.id === userId && item.status === "user_active" && item.roleIds?.includes(role));
  if (!user) return formError("Hồ sơ không khả dụng. Chọn nhân sự đang hoạt động.");
  state.activeUserId = user.id; state.role = role; state.loggedIn = true;
  try { sessionStorage.setItem(PROFILE_KEY, JSON.stringify({ user: user.id, role })); } catch { /* Session remains usable without session storage. */ }
  navigate("dashboard"); render(); syncOverlayState();
}

function workspaceBackup() {
  const payload = JSON.stringify({ version: 1, revision: workspaceStatus.revision, savedAt: new Date().toISOString(), data: workspaceData() }, null, 2);
  downloadBlob(new Blob([payload], { type: "application/json" }), `SoulWine-${new Date().toISOString().slice(0, 10)}.json`);
  toast("Đã tải bản sao lưu dữ liệu trên thiết bị.");
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function storageRecoveryView() {
  return `${pageHead({ title: "Cần khôi phục không gian làm việc", subtitle: "Dữ liệu đã lưu chưa thể đọc. Chưa có dữ liệu nào bị ghi đè." })}<section class="card recovery-card">${icon("shield")}<h2>Bảo toàn dữ liệu trước khi tiếp tục</h2><p>Tải bản dữ liệu hiện tại để kiểm tra hoặc khôi phục từ một bản sao lưu hợp lệ.</p><div class="flex gap-8 flex-wrap"><button class="btn btn-primary" data-action="download-recovery">Tải dữ liệu cần khôi phục</button><button class="btn btn-secondary" data-action="restore-backup">Chọn bản sao lưu</button></div></section>`;
}

function salesAnalytics() {
  const completed = state.orders.filter((order) => order.status === "completed");
  const now = new Date();
  const period = state.ui.reportPeriod || "all";
  const orders = completed.filter((order) => {
    const [day, month, year] = order.created.split("/").map(Number);
    if (period === "month") return month === now.getMonth() + 1 && year === now.getFullYear();
    if (period === "quarter") return Math.floor((month - 1) / 3) === Math.floor(now.getMonth() / 3) && year === now.getFullYear();
    return Number.isFinite(day + month + year);
  });
  const months = Array.from({ length: 6 }, (_, index) => { const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1); return { month: date.getMonth() + 1, year: date.getFullYear(), label: `T${date.getMonth() + 1}`, value: 0 }; });
  const channels = new Map(), products = new Map(), people = new Map();
  orders.forEach((order) => {
    const [day, month, year] = order.created.split("/").map(Number);
    const bucket = months.find((item) => item.month === month && item.year === year);
    if (bucket) bucket.value += order.total;
    const channel = order.type === "Bán sỉ" ? "Bán sỉ" : `Bán lẻ · ${order.channel}`;
    channels.set(channel, (channels.get(channel) || 0) + order.total);
    people.set(order.owner, (people.get(order.owner) || 0) + order.total);
    const totalWeight = order.lines.reduce((sum, line) => sum + productBySku(line.sku).retail * line.qty, 0);
    let allocated = 0;
    order.lines.forEach((line, index) => {
      const value = index === order.lines.length - 1 ? order.total - allocated : Math.round(order.total * productBySku(line.sku).retail * line.qty / Math.max(totalWeight, 1));
      allocated += value;
      const previous = products.get(line.sku) || { qty: 0, value: 0 };
      products.set(line.sku, { qty: previous.qty + line.qty, value: previous.value + value });
    });
  });
  return { orders, total: orders.reduce((sum, order) => sum + order.total, 0), months, channels: [...channels], products: [...products].sort((a, b) => b[1].value - a[1].value), people: [...people] };
}

function businessMinutesBetween(start, end) {
  let cursor = new Date(start), finish = new Date(end);
  if (!Number.isFinite(cursor.valueOf()) || !Number.isFinite(finish.valueOf()) || finish < cursor) return null;
  const [startH, startM] = state.settings.rules.workStart.split(":").map(Number);
  const [endH, endM] = state.settings.rules.workEnd.split(":").map(Number);
  const dateParts = (date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  let minutes = 0, days = 0;
  while (cursor < finish && days++ < 3660) {
    const parts = dateParts(cursor);
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    const open = new Date(`${date}T${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}:00+07:00`);
    const close = new Date(`${date}T${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}:00+07:00`);
    const weekDay = new Date(`${date}T12:00:00+07:00`).getUTCDay();
    if (weekDay !== 0 && weekDay !== 6) minutes += Math.max(0, (Math.min(finish, close) - Math.max(cursor, open)) / 60000);
    cursor = new Date(`${date}T00:00:00+07:00`); cursor = new Date(cursor.valueOf() + 86400000);
  }
  return minutes;
}

function operationalMetrics() {
  const reservations = state.reservations.filter((item) => item.status === "holding");
  const violations = new Set(reservations.filter((item) => !orderByCode(item.order) || !orderEligible(orderByCode(item.order)) || productBySku(item.sku).held > productBySku(item.sku).physical - productBySku(item.sku).damaged).map((item) => item.order)).size;
  const ratio = (records, test) => records.length ? Math.round(records.filter(test).length / records.length * 100) : null;
  const issueOrders = state.orders.filter((order) => order.readyForIssueAt && order.issueRequestedAt);
  const deliveries = state.deliveries.filter((delivery) => delivery.resultReceivedAt && delivery.resultRecordedAt);
  const counts = state.stocktakes.filter((period) => period.status === "completed" && period.closedLines).flatMap((period) => period.closedLines);
  const payments = state.payments.filter((payment) => payment.status === "confirmed" && payment.evidenceReadyAt && payment.confirmedAt);
  const returns = state.returns.filter((item) => item.receivedAt && item.postedAt);
  return [
    { code: "K01", label: "Giữ vượt tồn", value: violations, count: reservations.length, target: "0 đơn vượt tồn · 100% có cọc/đủ tiền", route: "reservations", good: violations === 0, help: "Đối chiếu lượng giữ đang hiệu lực với tồn vật lý, hàng lỗi và điều kiện thanh toán." },
    { code: "K02", label: "Yêu cầu xuất đúng hạn", value: ratio(issueOrders, (item) => (new Date(item.issueRequestedAt) - new Date(item.readyForIssueAt)) / 60000 <= 15), count: issueOrders.length, target: "≥ 90% trong 15 phút", route: "orders", help: "Đo từ lúc đã đủ tiền, kiểm tra tồn và giữ hàng đến lúc yêu cầu xuất." },
    { code: "K03", label: "Cập nhật giao đúng hạn", value: ratio(deliveries, (item) => (new Date(item.resultRecordedAt) - new Date(item.resultReceivedAt)) / 60000 <= 30), count: deliveries.length, target: "≥ 95% trong 30 phút", route: "deliveries", help: "Cần thời điểm nhận xác nhận giao hàng và thời điểm ghi kết quả." },
    { code: "K04", label: "Khớp sau đối chiếu", value: ratio(counts, (item) => item.final === item.count), count: counts.length, target: "≥ 98% mã khớp sau đối chiếu", route: "stocktakes", help: "Đối chiếu số thực tế và tồn chốt của các kỳ đã hoàn tất." },
    { code: "K05", label: "Xác nhận tiền đúng hạn", value: ratio(payments, (item) => businessMinutesBetween(item.evidenceReadyAt, item.confirmedAt) <= 15), count: payments.length, target: "≥ 90% trong 15 phút làm việc", route: "payments", help: `Giờ làm việc ${state.settings.rules.workStart}–${state.settings.rules.workEnd}, thứ Hai–thứ Sáu.` },
    { code: "K06", label: "Hàng hoàn trong ngày", value: ratio(returns, (item) => new Date(item.receivedAt).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) === new Date(item.postedAt).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })), count: returns.length, target: "100% hàng đã trả về", route: "returns", help: "Tính từ ngày nhận lại hàng thực tế đến ngày ghi nhập hàng hoàn." }
  ];
}

function approvalCreatedAt(approval) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/.exec(approval.createdAt || "");
  return match ? `${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}:00+07:00` : null;
}

function approvalAge(approval) {
  const created = approvalCreatedAt(approval);
  if (!created) return "Chưa ghi nhận thời điểm";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(created)) / 60000));
  if (minutes < 1) return "Vừa gửi";
  if (minutes < 60) return `${minutes} phút trước`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} giờ trước`;
  return `${Math.floor(minutes / 1440)} ngày trước`;
}

function metricCards() {
  return `<div class="kpi-grid">${operationalMetrics().map((metric) => `<article class="card kpi"><div class="kpi-label"><span>${metric.code} · ${metric.label}</span><button class="metric-help" type="button" data-action="metric-help" data-code="${metric.code}" aria-label="Cách tính ${metric.code}">${icon("info")}</button></div><div class="kpi-value">${metric.value === null ? "—" : metric.code === "K01" ? metric.value : `${metric.value}%`}</div><div class="kpi-target">${metric.target}</div><p class="metric-source">${metric.count ? `${metric.count} ${metric.code === "K04" ? "mã kiểm kê" : "bản ghi"} được đo lường` : "Chưa phát sinh dữ liệu đo lường"}</p><a class="kpi-link" href="#/${metric.route}">Xem dữ liệu ${icon("arrow-right")}</a></article>`).join("")}</div>`;
}

function setupChecklist() {
  const steps = [
    { done: !!state.settings.organization.address, label: "Thông tin doanh nghiệp", text: "Tên, địa chỉ và thông tin trên chứng từ", route: "settings" },
    { done: state.products.length > 0, label: "Danh mục sản phẩm", text: "SKU, đơn vị tính và giá bán", route: "products" },
    { done: state.customers.length > 0, label: "Hồ sơ khách hàng", text: "Thông tin giao hàng và xuất hóa đơn", route: "customers" },
    { done: state.settings.rules.receiptTolerance !== null, label: "Quy tắc tiếp nhận", text: "Thiết lập ngưỡng sai lệch được phép", route: "settings" }
  ];
  if (steps.every((step) => step.done) || state.ui.hideSetup) return "";
  return `<section class="setup-panel mb-24"><div class="setup-intro"><span class="eyebrow">THIẾT LẬP KHÔNG GIAN LÀM VIỆC</span><h2>Sẵn sàng cho giao dịch đầu tiên</h2><p>Hoàn thiện dữ liệu nền tảng để bán hàng, xuất chứng từ và quản lý kho thống nhất.</p><span class="setup-progress">${steps.filter((step) => step.done).length} / ${steps.length} bước hoàn tất</span></div><div class="setup-steps">${steps.map((step) => `<a class="setup-step ${step.done ? "is-done" : ""}" href="#/${step.route}"><span class="setup-step-icon">${icon(step.done ? "check" : "chevron-right")}</span><span><strong>${step.label}</strong><small>${step.text}</small></span>${step.done ? '<span class="chip success">Hoàn tất</span>' : ""}</a>`).join("")}</div></section>`;
}

function recalculateNotifications() {
  const old = new Map(state.notifications.map((item) => [item.id, item]));
  const records = [];
  const add = (id, title, text, route, permission = null) => records.push({ id, title, text, route, unread: old.has(id) ? old.get(id).unread : true, time: old.get(id)?.time || nowStamp(), roles: permission });
  const preferences = state.settings.notifications;
  if (preferences.approval) state.approvals.filter((item) => item.status === "pending").forEach((item) => {
    const created = approvalCreatedAt(item);
    const overdue = created && state.settings.rules.approvalHours !== null && businessMinutesBetween(created, new Date().toISOString()) > state.settings.rules.approvalHours * 60;
    add(`approval:${item.id}`, `${item.ref} ${overdue ? "quá hạn phản hồi" : "chờ xử lý"}`, item.title, "approvals", [item.assignee]);
  });
  if (preferences.payment) state.payments.filter((item) => item.status === "pending_confirm").forEach((item) => add(`payment:${item.id}`, `${item.id} cần xác nhận thanh toán`, `${item.record} · ${money(item.amount)}`, "payments", ["accountant"]));
  if (preferences.stock) state.products.filter((product) => product.status === "product_active" && availableOf(product) < product.min).forEach((product) => add(`stock:${product.sku}`, `${product.sku} dưới định mức tồn`, `Khả dụng ${availableOf(product)} / định mức ${product.min}`, "availability"));
  if (preferences.shipment) state.contracts.forEach((contract) => contract.shipments.filter((shipment) => shipment.status !== "delivered").forEach((shipment, index) => {
    const days = Math.ceil((new Date(`${isoDate(shipment.date)}T00:00:00+07:00`) - new Date()) / 86400000);
    if (days <= state.settings.rules.shipmentReminderDays) add(`shipment:${contract.code}:${index}`, `${shipment.id} · ${contract.code} ${days < 0 ? "trễ hạn" : "sắp đến hạn"}`, shipment.date, `contracts/${encodeURIComponent(contract.code)}`);
  }));
  if (preferences.quote) state.quotes.filter((quote) => !["converted", "rejected"].includes(quote.status)).forEach((quote) => {
    const days = Math.ceil((new Date(`${isoDate(quote.validUntil)}T23:59:59+07:00`) - new Date()) / 86400000);
    if (days <= state.settings.rules.quoteReminderDays) add(`quote:${quote.code}`, `${quote.code} ${days < 0 ? "đã hết hiệu lực" : "sắp hết hiệu lực"}`, quote.validUntil, `quotes/${quote.code}`);
  });
  state.notifications = records;
}

function allowedNotifications() { return state.notifications.filter((item) => (!item.roles || item.roles.includes(state.role)) && routeAllowed(item.route.split("/")[0])); }

function clearActiveFilters() {
  ["orderFilter", "quoteFilter", "contractFilter", "paymentFilter", "customerFilter", "productFilter", "docFilter", "movementType"].forEach((key) => state.ui[key] = "all");
  ["orderSearch", "quoteSearch", "contractSearch", "customerSearch", "productSearch", "availabilitySearch", "auditSearch", "movementSearch"].forEach((key) => state.ui[key] = "");
  state.ui.tableViews = {}; render(true);
}

function decorateTables(root) {
  state.ui.tableViews ||= {};
  root.querySelectorAll("table.data").forEach((table, index) => {
    if (table.querySelector(".empty-state")) return;
    const key = `${state.route}:${state.routeParam}:${index}`;
    const rows = [...table.tBodies[0].rows];
    const settings = state.ui.tableViews[key] ||= { page: 1, sort: -1, direction: 1 };
    if (settings.sort >= 0) {
      const value = (row) => row.cells[settings.sort]?.textContent.trim() || "";
      const comparable = (text) => { if (/^[-+\d.,\s]+(?:₫|%)?$/.test(text)) return Number(text.replace(/[^\d-]/g, "")); if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return isoDate(text); return text; };
      rows.sort((a, b) => { const x = comparable(value(a)), y = comparable(value(b)); return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "vi", { numeric: true })) * settings.direction; });
      rows.forEach((row) => table.tBodies[0].append(row));
    }
    [...table.tHead.rows[0].cells].forEach((header, column) => {
      if (!header.textContent.trim() || column >= rows[0].cells.length) return;
      const text = header.textContent;
      header.innerHTML = `<button class="sort-button" data-action="sort-table" data-table="${escapeHtml(key)}" data-column="${column}">${escapeHtml(text)}${settings.sort === column ? icon(settings.direction === 1 ? "chevron-down" : "chevron-right") : '<span class="sort-indicator" aria-hidden="true">↕</span>'}</button>`;
      header.setAttribute("aria-sort", settings.sort === column ? settings.direction === 1 ? "ascending" : "descending" : "none");
    });
    const size = Number(state.settings.display.pageSize);
    const pages = Math.max(1, Math.ceil(rows.length / size));
    settings.page = Math.max(1, Math.min(settings.page, pages));
    rows.forEach((row, position) => row.hidden = position < (settings.page - 1) * size || position >= settings.page * size);
    if (pages > 1) table.parentElement.insertAdjacentHTML("afterend", `<div class="pagination"><span>${(settings.page - 1) * size + 1}–${Math.min(settings.page * size, rows.length)} / ${rows.length} bản ghi</span><div><button class="btn btn-secondary btn-sm" data-action="page-table" data-table="${escapeHtml(key)}" data-page="${settings.page - 1}" ${settings.page === 1 ? "disabled" : ""} aria-label="Trang trước">${icon("chevron-left")}</button><span>Trang ${settings.page} / ${pages}</span><button class="btn btn-secondary btn-sm" data-action="page-table" data-table="${escapeHtml(key)}" data-page="${settings.page + 1}" ${settings.page === pages ? "disabled" : ""} aria-label="Trang sau">${icon("chevron-right")}</button></div></div>`);
  });
}

function tableEmptyState() {
  const map = {
    orders: ["Đơn hàng", "new-order", "Tạo đơn hàng", "order"], quotes: ["Báo giá", "new-quote", "Tạo báo giá", "quote"],
    contracts: ["Hợp đồng", "new-contract", "Tạo hợp đồng", "contract"], customers: ["Khách hàng", "new-customer", "Thêm khách hàng", "customer"],
    products: ["Sản phẩm", "new-product", "Thêm sản phẩm", "product"], suppliers: ["Nhà cung cấp", "new-supplier", "Thêm nhà cung cấp"],
    "purchase-requests": ["Yêu cầu mua hàng", "new-purchase-request", "Lập yêu cầu mua"], "purchase-orders": ["Đơn đặt hàng", "create-po", "Lập đơn đặt hàng"],
    receipts: ["Phiếu tiếp nhận", "create-receipt", "Tạo phiếu tiếp nhận"], stocktakes: ["Kỳ kiểm kê", "new-stocktake", "Tạo kỳ kiểm kê"],
    returns: ["Yêu cầu đổi trả", "new-return", "Tiếp nhận đổi trả"]
  };
  const config = map[state.route];
  const prefix = config?.[3];
  const filtered = prefix && ((state.ui[`${prefix}Search`] || "").trim() || (state.ui[`${prefix}Filter`] && state.ui[`${prefix}Filter`] !== "all"));
  if (filtered) return emptyState("search", "Không tìm thấy kết quả phù hợp", "Thử từ khóa khác hoặc xóa bộ lọc để xem toàn bộ danh sách.", '<button class="btn btn-secondary btn-sm" data-action="clear-filters">Xóa bộ lọc</button>');
  const canCreate = config && (!ACTION_ROLES[config[1]] || ACTION_ROLES[config[1]].includes(state.role));
  return emptyState(config ? "file" : "chart", config ? `Chưa có ${config[0].toLowerCase()}` : "Chưa có dữ liệu để tổng hợp", config ? "Tạo bản ghi đầu tiên để bắt đầu quản lý và theo dõi tại đây." : "Kết quả sẽ xuất hiện khi có giao dịch đáp ứng điều kiện báo cáo.", canCreate ? `<button class="btn btn-primary btn-sm" data-action="${config[1]}">${icon("plus")}${config[2]}</button>` : "");
}

function permissionView() {
  return `${pageHead({ title: "Bạn chưa có quyền mở nội dung này", subtitle: `Vai trò đang sử dụng: ${currentUser().label}` })}<section class="card">${emptyState("shield", "Nội dung thuộc phạm vi vai trò khác", "Chọn vai trò được phân công trong hồ sơ của bạn hoặc trao đổi với người phụ trách quản trị.", '<a class="btn btn-primary" href="#/dashboard">Về tổng quan</a>')}</section>`;
}

function requestDiscard(callback) {
  if (!activeDialog || document.getElementById("discard-guard")) return;
  activeDialog.discardCallback = callback;
  const dialog = document.querySelector('[aria-labelledby="dialog-title"]');
  [...dialog.children].forEach((child) => child.inert = true);
  dialog.insertAdjacentHTML("beforeend", `<section class="discard-guard" id="discard-guard" role="alertdialog" aria-modal="true" aria-label="Thay đổi chưa lưu"><div><span class="alert-icon warning">${icon("alert")}</span><h3>Thay đổi chưa được lưu</h3><p>Bạn có muốn bỏ nội dung đang nhập? Dữ liệu đã lưu trước đó không thay đổi.</p><div class="flex gap-8"><button class="btn btn-secondary" data-action="keep-editing">Tiếp tục chỉnh sửa</button><button class="btn btn-danger" data-action="discard-dialog">Bỏ thay đổi</button></div></div></section>`);
  dialog.querySelector('[data-action="keep-editing"]').focus();
}

function keepDialogEditing() {
  const dialog = document.querySelector('[aria-labelledby="dialog-title"]');
  document.getElementById("discard-guard")?.remove();
  if (!dialog) return;
  [...dialog.children].forEach((child) => child.inert = false);
  if (activeDialog) activeDialog.discardCallback = null;
  dialog.querySelector("input,select,textarea,button")?.focus();
}

function requestSettingsDiscard(callback) {
  confirmAction("Cấu hình chưa được lưu", "Bỏ các thay đổi trên biểu mẫu và tiếp tục? Cấu hình đã lưu vẫn được giữ nguyên.", () => { state.ui.settingsDirty = false; callback(); }, true, "Bỏ thay đổi");
}

function validateForm(form) {
  let first = null;
  form.querySelectorAll(".field-validation").forEach((element) => element.remove());
  form.querySelectorAll("input,select,textarea").forEach((element, index) => {
    if (element.disabled || element.type === "hidden") return;
    element.removeAttribute("aria-invalid");
    if (!element.checkValidity()) {
      first ||= element;
      element.setAttribute("aria-invalid", "true");
      const message = document.createElement("span"); message.className = "field-validation"; message.id = `validation-${index}`;
      message.textContent = element.validity.valueMissing ? "Vui lòng hoàn thiện trường này." : element.validity.typeMismatch ? "Định dạng chưa đúng. Kiểm tra lại giá trị đã nhập." : element.validity.rangeOverflow || element.validity.rangeUnderflow ? `Giá trị cần từ ${element.min || "0"} đến ${element.max || "giới hạn cho phép"}.` : "Giá trị chưa hợp lệ. Kiểm tra định dạng và giới hạn.";
      element.setAttribute("aria-describedby", message.id);
      (element.closest(".field") || element.parentElement).append(message);
    }
  });
  if (first) { first.focus(); return false; }
  return true;
}

function numericFieldFeedback(input, valid, message) {
  const previous = input.parentElement.querySelector(".numeric-validation");
  previous?.remove();
  input.setAttribute("aria-invalid", String(!valid));
  if (valid) { input.removeAttribute("aria-describedby"); return; }
  const error = document.createElement("span");
  error.className = "numeric-validation"; error.id = `numeric-${input.dataset.sku}-${input.dataset.qfield || input.dataset.stField || input.dataset.rcField}`;
  error.textContent = message;
  input.parentElement.append(error); input.setAttribute("aria-describedby", error.id);
}

async function storeAttachments(files, reference) {
  const previous = { ...state.attachments };
  const saved = [];
  if (files.some((file) => file.size > 2 * 1024 * 1024 || !/\.(pdf|png|jpe?g)$/i.test(file.name) || !["application/pdf", "image/png", "image/jpeg"].includes(file.type))) throw new Error("Chọn PDF/JPG/PNG tối đa 2 MB mỗi tệp.");
  try { for (const file of files) {
    const content = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = () => reject(new Error("Không thể đọc tệp. Chọn lại tệp trên thiết bị.")); reader.readAsDataURL(file); });
    const entry = { id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size, content, reference, savedAt: new Date().toISOString() };
    saved.push(entry); state.attachments[entry.id] = entry;
  } } catch (error) { state.attachments = previous; throw error; }
  if (!persistWorkspace()) { state.attachments = previous; throw new Error("Chưa đủ dung lượng để lưu tệp trên thiết bị. Tải bản sao lưu và giải phóng dung lượng."); }
  return saved;
}

function attachmentChip(name, reference) {
  const attachment = Object.values(state.attachments).find((item) => item.reference === reference && item.name === name);
  return attachment ? `<button class="file-chip" type="button" data-action="view-attachment" data-id="${attachment.id}">${icon("file")}${escapeHtml(name)} ${icon("eye")}</button>` : `<span class="file-chip">${icon("file")}${escapeHtml(name)}</span>`;
}
