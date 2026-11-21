const ACTION_ROLES = {
  "new-quote": ["director", "sales_manager", "sales_staff"],
  "save-quote": ["director", "sales_manager", "sales_staff"],
  "submit-quote": ["director", "sales_manager", "sales_staff"],
  "duplicate-quote": ["director", "sales_manager", "sales_staff"],
  "confirm-quote": ["sales_manager", "sales_staff"],
  "add-line": ["director", "sales_manager", "sales_staff"],
  "remove-line": ["director", "sales_manager", "sales_staff"],
  "new-order": ["sales_manager", "sales_staff"],
  "new-customer": ["director", "sales_manager", "sales_staff"],
  "open-payment": ["accountant", "sales_staff"],
  "open-invoice": ["accountant"],
  "open-reserve": ["warehouse_manager"],
  "release-reservation": ["warehouse_manager"],
  "issue-order": ["warehouse_manager"],
  "confirm-receipt": ["warehouse_manager"],
  "return-receipt": ["warehouse_manager"],
  "save-receipt": ["warehouse_manager", "warehouse_staff"],
  "upload-evidence": ["warehouse_manager", "warehouse_staff"],
  "new-stocktake": ["warehouse_manager"],
  "finish-count": ["warehouse_manager"],
  "request-recount": ["warehouse_manager"],
  "open-adjustment": ["warehouse_manager"],
  "complete-stocktake": ["warehouse_manager"],
  "report-stocktake": ["warehouse_manager"],
  "new-user": ["director"],
  "toggle-user": ["director"],
  "toggle-product": ["director", "sales_manager"],
  "new-contract": ["sales_manager", "sales_staff"],
  "add-shipment": ["sales_manager", "sales_staff"],
  "upload-scan": ["accountant", "sales_manager"],
  "liquidate-contract": ["director", "sales_manager"]
};

function guardAction(action) {
  const roles = ACTION_ROLES[action];
  if (roles && workspaceStatus.conflict && !["restore-backup", "clear-workspace"].includes(action)) { toast("Có dữ liệu mới ở cửa sổ khác. Tải dữ liệu mới trước khi tiếp tục thay đổi.", "warning"); return false; }
  if (roles && !roles.includes(state.role)) {
    toast(`Thao tác thuộc quyền ${roles.map((role) => ROLES[role].label).join(" / ")}. Kiểm tra vai trò đang sử dụng.`, "warning");
    return false;
  }
  return true;
}

function nextCode(collection, key, prefix, width = 4) {
  const max = Math.max(0, ...collection.map((item) => Number(String(item[key]).split("-").pop()) || 0));
  return `${prefix}${String(max + 1).padStart(width, "0")}`;
}

function todayText() {
  return new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Ho_Chi_Minh" });
}

function displayDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
}

function isoDate(text) {
  return (text || todayText()).split("/").reverse().join("-");
}

function field(name, label, control, hint = "") {
  return `<div class="field"><label for="form-${name}">${escapeHtml(label)}</label>${control}${hint ? `<div class="hint">${escapeHtml(hint)}</div>` : ""}</div>`;
}

function inputField(name, label, type = "text", value = "", attributes = "") {
  return field(name, label, `<input class="input" id="form-${name}" name="${name}" type="${type}" value="${escapeHtml(value)}" ${attributes}>`);
}

function selectField(name, label, options, selected = "") {
  return field(name, label, `<select class="select" id="form-${name}" name="${name}">${options.map(([value, text]) => `<option value="${escapeHtml(value)}" ${String(value) === String(selected) ? "selected" : ""}>${escapeHtml(text)}</option>`).join("")}</select>`);
}

function currentQuote() {
  return quoteForEditing(state.routeParam);
}

function quoteForEditing(code) {
  if (code === "new") return state.ui.draftQuote;
  const quote = quoteByCode(code);
  if (!quote || !quoteEditable(quote)) return quote;
  state.ui.quoteWorkingCopies ||= {};
  return state.ui.quoteWorkingCopies[code] ||= structuredClone(quote);
}

function quoteEditable(quote) {
  return !!quote && ["draft", "rejected"].includes(quote.status) && ACTION_ROLES["save-quote"].includes(state.role);
}

function lockQuoteEditor() {
  const quote = currentQuote();
  if (!quote || quoteEditable(quote)) return;
  viewElement.querySelectorAll("[data-qfield],[data-qmeta],[data-qcheck],[data-action=save-quote],[data-action=add-line],[data-action=remove-line]").forEach((element) => {
    element.disabled = true;
    element.title = "Báo giá đã gửi duyệt / đã duyệt được giữ nguyên. Nhân bản để tạo phiên bản mới.";
  });
}

function createQuote(source, replace = false) {
  if (!guardAction("new-quote")) return;
  if (!state.customers.length || !state.products.some((product) => product.status === "product_active")) return toast("Thêm khách hàng và sản phẩm trước khi lập báo giá.", "info");
  if (!replace && state.ui.draftQuote?.lines.length) return confirmAction("Thay thế báo giá đang soạn?", "Bạn còn một báo giá chưa đưa vào danh sách. Chọn Hủy để tiếp tục nội dung đó, hoặc xác nhận để bắt đầu báo giá khác.", () => createQuote(source, true), true);
  const validUntil = new Date(); validUntil.setDate(validUntil.getDate() + state.settings.rules.quoteValidityDays);
  const quote = source ? JSON.parse(JSON.stringify(source)) : {
    customerId: state.customers.find((customer) => customer.type === "Bán sỉ")?.id || state.customers[0].id,
    channel: "Bán sỉ", owner: currentUser().name, validUntil: validUntil.toLocaleDateString("en-GB"), version: 1,
    lines: [], note: "", confirmed: false
  };
  quote.code = nextCode(state.quotes, "code", `BG-${new Date().getFullYear()}-`);
  quote.lines = quote.lines.map((line) => ({ ...line, price: productBySku(line.sku).wholesale }));
  quote.status = "draft";
  quote.createdAt = todayText();
  quote.approvalId = null;
  quote.isNew = true;
  quote.createdBy = state.activeUserId;
  if (source) { quote.version += 1; quote.sourceQuote = source.code; quote.confirmed = false; }
  state.ui.draftQuote = quote;
  navigate("quotes/new");
}

function refreshQuoteTotals() {
  const quote = currentQuote();
  if (!quote) return;
  const totals = quoteTotals(quote);
  const values = { "q-subtotal": money(totals.subtotal), "q-discount": `-${money(totals.discount)}`, "q-total": money(totals.total) };
  Object.entries(values).forEach(([id, value]) => { const element = document.getElementById(id); if (element) element.textContent = value; });
  quote.lines.forEach((line) => {
    const element = document.querySelector(`[data-line-total="${line.sku}"]`);
    if (element) element.textContent = money(quoteLineTotal(line));
    const stock = document.querySelector(`[data-stock-badge="${line.sku}"]`);
    if (stock) stock.innerHTML = quoteStockBadge(line);
  });
}

function updateQuoteLine(input) {
  const quote = currentQuote();
  if (!quoteEditable(quote)) return;
  const line = quote.lines.find((item) => item.sku === input.dataset.sku);
  const value = Number(input.value);
  const valid = input.value !== "" && Number.isFinite(value) && (input.dataset.qfield === "qty" ? Number.isSafeInteger(value) && value > 0 && value <= 1000000000 : value >= 0 && value <= 100);
  input.setCustomValidity(valid ? "" : "Nhập số hợp lệ; số lượng nguyên dương, chiết khấu từ 0 đến 100%.");
  input.classList.toggle("field-error", !valid);
  numericFieldFeedback(input, valid, input.dataset.qfield === "qty" ? "Nhập số lượng nguyên dương." : "Chiết khấu cần từ 0 đến 100%.");
  if (!valid) return;
  line[input.dataset.qfield] = value;
  refreshQuoteTotals();
  scheduleWorkspaceSave();
}

function saveQuote(submit = false) {
  const quote = currentQuote();
  if (!quoteEditable(quote)) return toast("Báo giá hiện chỉ được xem. Nhân bản để chỉnh sửa.", "warning");
  const invalid = viewElement.querySelector("input:invalid");
  if (invalid) { invalid.reportValidity(); return; }
  if (!quote.lines.length) return toast("Thêm ít nhất một sản phẩm trước khi lưu báo giá.", "warning");
  if (!/^(0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/.test(quote.validUntil)) return toast("Ngày hiệu lực cần có định dạng dd/MM/yyyy.", "warning");
  const parsedDate = new Date(`${isoDate(quote.validUntil)}T12:00:00Z`);
  if (!Number.isFinite(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== isoDate(quote.validUntil)) return toast("Ngày hiệu lực không tồn tại trong lịch.", "warning");
  if (submit && isoDate(quote.validUntil) < isoDate(todayText())) return toast("Không gửi duyệt báo giá đã hết hiệu lực.", "warning");
  if (quote.isNew) {
    quote.isNew = false;
    state.quotes.unshift(quote);
  } else state.quotes[state.quotes.findIndex((item) => item.code === quote.code)] = quote;
  if (state.ui.quoteWorkingCopies) delete state.ui.quoteWorkingCopies[quote.code];
  if (state.ui.draftQuote?.code === quote.code) state.ui.draftQuote = null;
  if (submit) {
    quote.status = "pending";
    const approval = {
      id: nextCode(state.approvals, "id", "AP-", 3), type: "discount", ref: quote.code,
      title: "Chiết khấu bán sỉ", assignee: "director", status: "pending", createdAt: nowStamp(), age: "Vừa gửi",
      requester: currentUser().name, amount: quoteTotals(quote).total,
      summary: quote.note || "Đề nghị xem xét giá và chiết khấu cho báo giá.",
      lines: JSON.parse(JSON.stringify(quote.lines)), evidence: [`${quote.code} v${quote.version}`]
    };
    quote.approvalId = approval.id;
    state.approvals.unshift(approval);
    state.notifications.unshift({ id: `N${Date.now()}`, title: `${quote.code} chờ duyệt chiết khấu`, text: customerName(quote.customerId), time: "Vừa xong", route: "approvals", unread: true });
  }
  addAudit(submit ? "Gửi duyệt báo giá" : "Lưu báo giá", quote.code, money(quoteTotals(quote).total), submit ? "warning" : "info");
  navigate(`quotes/${encodeURIComponent(quote.code)}`);
  toast(submit ? "Đã gửi báo giá đến Giám đốc phê duyệt." : "Đã lưu báo giá.");
}

function showProductPicker() {
  if (!quoteEditable(currentQuote())) return;
  showDialog({ title: "Thêm sản phẩm vào báo giá", body: `<div class="product-picker">${state.products.filter((product) => product.status === "product_active").map((product) => `<button class="picker-row" data-action="pick-product" data-sku="${product.sku}">${productCell(product.sku)}<span class="num">${money(product.wholesale)}</span>${icon("plus")}</button>`).join("")}</div>` });
}

function showCustomerForm(id) {
  const existing = id ? customerById(id) : null;
  const value = (name) => existing?.[name] || "";
  showForm(existing ? "Chỉnh sửa khách hàng" : "Thêm khách hàng", `<div class="form-grid">${inputField("name", "Tên cá nhân / doanh nghiệp", "text", value("name"), "required maxlength=120")}${selectField("type", "Nhóm khách hàng", [["Bán sỉ", "Khách sỉ / doanh nghiệp"], ["Bán lẻ", "Khách lẻ / cá nhân"]], value("type"))}${inputField("phone", "Số điện thoại", "tel", value("phone"), "required minlength=8 maxlength=20")}${inputField("email", "Email", "email", value("email"))}${inputField("tax", "Mã số thuế (nếu có)", "text", value("tax"))}${inputField("address", "Địa chỉ giao hàng", "text", value("address"), "required")}</div>`, (data) => {
    const phone = String(data.get("phone")).replace(/\D/g, "");
    if (phone.length < 8 || phone.length > 15) return formError("Số điện thoại cần từ 8 đến 15 chữ số.");
    if (state.customers.some((customer) => customer.id !== id && customer.phone.replace(/\D/g, "") === phone)) return formError("Số điện thoại đã thuộc hồ sơ khác. Kiểm tra để tránh tạo trùng.");
    const name = data.get("name").trim();
    if (!name) return formError("Nhập tên khách hàng.");
    const fields = { name, contact: name, type: data.get("type"), kind: data.get("type") === "Bán sỉ" ? "business" : "individual", phone: data.get("phone"), email: data.get("email"), tax: data.get("tax"), address: data.get("address"), invoiceAddress: data.get("address") };
    if (existing) Object.assign(existing, fields);
    else state.customers.unshift({ id: nextCode(state.customers, "id", "KH-", 3), ...fields, ar: 0, orders: 0, note: "" });
    addAudit(existing ? "Cập nhật khách hàng" : "Tạo khách hàng", name, data.get("phone"));
    closeDialog(); render(true); toast("Đã lưu hồ sơ khách hàng.");
  });
}

function canonicalPaymentRecord(code) {
  const order = orderByCode(code);
  return contractByCode(code) || (order?.contract ? contractByCode(order.contract) : order);
}

function remainingOf(record) {
  return Math.max(0, (record.value ?? record.total) - record.paid);
}

function applyPayment(payment) {
  if (payment.status === "confirmed") return;
  const record = canonicalPaymentRecord(payment.record);
  if (!record || payment.amount > remainingOf(record)) throw new Error("Số tiền vượt phần còn phải thu hoặc hồ sơ không tồn tại.");
  record.paid += payment.amount;
  payment.status = "confirmed";
  payment.confirmedBy = currentUser().name;
  payment.confirmedById = state.activeUserId;
  payment.confirmedAt = new Date().toISOString();
  state.orders.forEach((order) => {
    if (order.code === record.code || order.contract === record.code) {
      order.paid = record.paid;
      if (order.status === "pending_payment" && orderEligible(order)) order.status = "eligible";
      if (orderEligible(order)) order.eligibleAt ||= new Date().toISOString();
      if (order.status === "overdue" && order.paid >= order.total) order.status = order.lines.every((line) => line.shipped >= line.qty) ? "completed" : "holding";
    }
  });
  syncCustomerBalances();
  addAudit("Xác nhận thanh toán", payment.id, `${payment.record} · ${money(payment.amount)}`, "success");
}

function syncCustomerBalances() {
  const records = arRecords();
  state.customers.forEach((customer) => customer.ar = records.filter((record) => record.customerId === customer.id).reduce((sum, record) => sum + record.remaining, 0));
}

function showPaymentForm(code) {
  const preferred = code ? canonicalPaymentRecord(code)?.code : "";
  const options = arRecords().filter((record) => record.remaining > 0 && canonicalPaymentRecord(record.id)?.status !== "pending_sign");
  if (!options.length) return toast("Không có khoản phải thu đủ điều kiện để ghi nhận.", "info");
  if (preferred && !options.some((record) => record.id === preferred)) return toast("Hồ sơ này chưa đủ điều kiện thu tiền hoặc đã thu đủ.", "warning");
  const selected = options.find((record) => record.id === preferred) || options[0];
  showForm("Ghi nhận thanh toán", `<div class="banner info mb-16">${icon("card")}<div>Chuyển khoản cần có chứng từ và được Kế toán xác nhận. Với vai trò bán hàng, giao dịch được đưa vào hàng chờ phê duyệt.</div></div><div class="form-grid">${selectField("record", "Đơn hàng / hợp đồng", options.map((record) => [record.id, `${record.id} · ${customerName(record.customerId)}`]), selected.id)}${inputField("amount", "Số tiền (VND)", "number", selected.remaining, "required min=1 step=1")}${inputField("date", "Ngày nhận", "date", isoDate(todayText()), "required")}${selectField("method", "Phương thức", [["Chuyển khoản", "Chuyển khoản"], ["Tiền mặt", "Tiền mặt"]])}${inputField("reference", "Mã tham chiếu / chứng từ", "text", "", "required maxlength=100")}${inputField("proof", "Tệp chứng từ", "file", "", "accept='.pdf,.jpg,.jpeg,.png'")}${inputField("note", "Ghi chú")}</div><div id="payment-preview" class="hint mt-12"></div>`, async (data) => {
    const record = canonicalPaymentRecord(data.get("record"));
    const amount = Number(data.get("amount"));
    if (!record || !Number.isSafeInteger(amount) || amount <= 0 || amount > remainingOf(record)) return formError("Số tiền phải là số nguyên dương và không vượt phần còn phải thu.");
    if (!data.get("reference").trim() || data.get("date") > isoDate(todayText())) return formError("Cần mã tham chiếu và ngày nhận không ở tương lai.");
    const pending = state.payments.filter((payment) => payment.record === record.code && payment.status === "pending_confirm").reduce((sum, payment) => sum + payment.amount, 0);
    if (pending + amount > remainingOf(record)) return formError("Đã có giao dịch chờ xác nhận cho khoản này. Mở Trung tâm phê duyệt để xử lý, không ghi nhận trùng.");
    const immediate = state.role === "accountant" || (data.get("method") === "Tiền mặt" && orderByCode(record.code)?.channel === "Tại quầy");
    const payment = { id: nextCode(state.payments, "id", `PAY-${new Date().getFullYear()}-`, 3), record: record.code, customerId: record.customerId, amount, date: displayDate(data.get("date")), method: data.get("method"), reference: data.get("reference").trim(), status: "pending_confirm", confirmedBy: "", note: data.get("note"), evidenceReadyAt: new Date().toISOString() };
    const proof = data.get("proof");
    if (data.get("method") === "Chuyển khoản" && !proof?.name) return formError("Đính kèm chứng từ chuyển khoản để đối chiếu.");
    if (proof?.name) { const [attachment] = await storeAttachments([proof], payment.id); payment.fileId = attachment.id; payment.proofName = attachment.name; }
    if (immediate) applyPayment(payment);
    else state.approvals.unshift({ id: nextCode(state.approvals, "id", "AP-", 3), type: "payment", ref: payment.id, title: "Xác nhận thanh toán", assignee: "accountant", status: "pending", createdAt: nowStamp(), age: "Vừa gửi", requester: currentUser().name, amount, summary: `${payment.record} · ${money(amount)}`, lines: [], evidence: [payment.reference, ...(payment.proofName ? [payment.proofName] : [])] });
    state.payments.unshift(payment);
    addAudit("Ghi nhận thanh toán", payment.id, `${payment.record} · ${money(amount)}`);
    closeDialog(); render(true); toast(immediate ? "Đã xác nhận thu tiền và cập nhật công nợ." : "Đã ghi nhận; chờ Kế toán xác nhận.");
  }, { submitLabel: state.role === "accountant" ? "Ghi nhận & xác nhận" : "Ghi nhận giao dịch", input: () => {
    const form = document.getElementById("action-form");
    if (!form) return;
    const record = canonicalPaymentRecord(form.elements.record.value);
    document.getElementById("payment-preview").textContent = `Còn phải thu: ${money(remainingOf(record))}`;
    form.elements.proof.required = form.elements.method.value === "Chuyển khoản";
  } });
}

function decideApproval(id, approve, confirmed = false, savedReason = "") {
  if (workspaceStatus.conflict) return toast("Tải dữ liệu mới trước khi quyết định hồ sơ.", "warning");
  const approval = state.approvals.find((item) => item.id === id);
  if (!approval || approval.status !== "pending") return toast("Hồ sơ đã được xử lý.", "info");
  if (approval.assignee !== state.role) return toast(`Hồ sơ thuộc vai trò ${ROLES[approval.assignee].label}.`, "warning");
  const reason = confirmed ? savedReason : document.getElementById("decision-reason")?.value.trim() || "";
  if (!approve && !reason) {
    document.getElementById("decision-error")?.classList.remove("hidden");
    document.getElementById("decision-reason")?.focus();
    return;
  }
  if (!confirmed) return confirmAction(approve ? "Phê duyệt hồ sơ" : "Từ chối hồ sơ", `${approval.ref} · ${money(approval.amount)}. ${approve ? "Quyết định sẽ cập nhật điều kiện của hồ sơ liên quan." : `Lý do: ${reason}`}`, () => decideApproval(id, approve, true, reason), !approve, approve ? "Phê duyệt" : "Từ chối");
  if (approve && approval.type === "payment") {
    const payment = state.payments.find((item) => item.id === approval.ref);
    if (!payment || payment.status !== "pending_confirm") return toast("Giao dịch không còn chờ xác nhận.", "warning");
    try { applyPayment(payment); } catch (error) { return toast(error.message, "error"); }
  }
  if (approval.type === "discount") {
    const quote = quoteByCode(approval.ref);
    if (quote) quote.status = approve ? "approved" : "rejected";
  }
  if (approval.type === "purchase") {
    const request = state.purchaseRequests.find((item) => item.code === approval.ref);
    if (request) { request.approvals ||= { accountant: false, director: false }; request.approvals[state.role] = approve; request.status = !approve ? "rejected" : Object.values(request.approvals).every(Boolean) ? "approved" : "pending"; }
  }
  if (!approve && approval.type === "payment") {
    const payment = state.payments.find((item) => item.id === approval.ref);
    if (payment) payment.status = "rejected";
  }
  approval.status = approve ? "approved" : "rejected";
  approval.decidedAt = nowStamp(); approval.decidedBy = currentUser().name; approval.decisionNote = reason || "Đồng ý theo hồ sơ đã xem xét.";
  approval.decidedById = state.activeUserId; approval.decidedRole = state.role;
  addAudit(approve ? "Phê duyệt hồ sơ" : "Từ chối hồ sơ", approval.ref, approval.decisionNote, approve ? "success" : "danger");
  render(true); toast(approve ? "Đã phê duyệt và cập nhật hồ sơ liên quan." : "Đã từ chối kèm lý do.");
}

function showReservationForm(sku) {
  const orders = state.orders.filter((order) => !["completed", "cancelled", "failed", "overdue"].includes(order.status));
  const products = state.products.filter((product) => product.status === "product_active");
  if (!orders.length) return toast("Không có đơn còn được phân bổ hàng.", "info");
  if (!products.length) return toast("Chưa có sản phẩm đang kinh doanh để giữ hàng.", "info");
  showForm("Xác nhận giữ hàng", `<div class="form-grid">${selectField("order", "Đơn hàng", orders.map((order) => [order.code, `${order.code} · ${customerName(order.customerId)}`]))}${selectField("sku", "Sản phẩm", products.map((product) => [product.sku, `${product.sku} · ${product.name}`]), sku || products[0].sku)}${inputField("qty", "Số lượng giữ", "number", 1, "required min=1 step=1")}${inputField("note", "Ghi chú phân bổ")}</div><div class="banner info mt-16" id="reserve-preview"></div>`, (data) => {
    const order = orderByCode(data.get("order"));
    const product = productBySku(data.get("sku"));
    const line = order?.lines.find((item) => item.sku === product?.sku);
    const qty = Number(data.get("qty"));
    if (!order || !product || !line) return formError("Sản phẩm không thuộc đơn này. Chọn đúng SKU đã đặt.");
    if (!orderEligible(order)) return formError(orderEligibilityReason(order));
    const contract = order.contract && contractByCode(order.contract);
    if (contract && !["active", "signed"].includes(contract.status)) return formError("Hợp đồng chưa hoàn tất ký kết.");
    if (!Number.isInteger(qty) || qty <= 0) return formError("Nhập số lượng nguyên dương.");
    if (qty > availableOf(product)) return formError(`Không thể giữ ${qty}: tồn khả dụng chỉ còn ${availableOf(product)} ${product.unit.toLowerCase()}.`);
    if (qty > line.qty - line.shipped - line.held) return formError("Số lượng giữ vượt phần chưa giao, chưa giữ của đơn.");
    product.held += qty; line.held += qty; order.status = "holding";
    order.readyForIssueAt ||= new Date().toISOString();
    const expiryDate = new Date(); expiryDate.setDate(expiryDate.getDate() + (state.settings.rules.holdDays || 0));
    state.reservations.unshift({ id: nextCode(state.reservations, "id", `GR-${new Date().getFullYear()}-`), order: order.code, customerId: order.customerId, sku: product.sku, qty, since: todayText(), expiry: state.settings.rules.holdDays ? expiryDate.toLocaleDateString("en-GB") : "", status: "holding", note: data.get("note") });
    addMovement("Giữ hàng", product.sku, qty, product.physical, product.held, order.code, data.get("note"));
    addAudit("Xác nhận giữ hàng", order.code, `${product.sku} · ${qty} ${product.unit}`, "success");
    closeDialog(); render(true); toast("Đã giữ hàng. Tồn vật lý không thay đổi.");
  }, { submitLabel: "Xác nhận giữ hàng", input: () => {
    const form = document.getElementById("action-form");
    if (!form) return;
    const product = productBySku(form.elements.sku.value);
    const order = orderByCode(form.elements.order.value);
    const preview = document.getElementById("reserve-preview");
    preview.textContent = `${orderEligibilityReason(order)}. Tồn khả dụng: ${availableOf(product)} ${product.unit.toLowerCase()} · Sau giữ: ${availableOf(product) - Number(form.elements.qty.value || 0)}.`;
    preview.className = `banner ${orderEligible(order) && Number(form.elements.qty.value) <= availableOf(product) ? "info" : "warning"} mt-16`;
  } });
}

function releaseReservation(id) {
  const reservation = state.reservations.find((item) => item.id === id);
  if (!reservation || reservation.status !== "holding") return toast("Bản ghi không còn giữ hàng.", "info");
  showForm("Nhả giữ hàng", `${inputField("reason", "Lý do nhả giữ", "text", "", "required maxlength=200")}<div class="banner warning mt-16">Giải phóng ${reservation.qty} đơn vị cho ${escapeHtml(reservation.order)}; không thay đổi tồn vật lý.</div>`, (data) => {
    if (!data.get("reason").trim()) return formError("Cần nêu lý do nhả giữ.");
    const product = productBySku(reservation.sku);
    const line = orderByCode(reservation.order)?.lines.find((item) => item.sku === reservation.sku);
    product.held -= reservation.qty;
    if (line) line.held -= reservation.qty;
    reservation.status = "released";
    addMovement("Nhả giữ", reservation.sku, -reservation.qty, product.physical, product.held, reservation.order, data.get("reason"));
    addAudit("Nhả giữ hàng", reservation.id, data.get("reason"));
    closeDialog(); render(true); toast("Đã giải phóng lượng giữ.");
  }, { submitLabel: "Nhả giữ" });
}

function showRetailOrderForm() {
  return showRetailCart();
}

function issueOrder(code) {
  const order = orderByCode(code);
  const validate = () => {
    if (stockLock()) return `Kho đang khóa kiểm kê ${stockLock().code}. Hoàn tất kỳ trước khi xuất.`;
    if (!orderEligible(order)) return orderEligibilityReason(order);
    if (order.contract && contractByCode(order.contract)?.status !== "active") return "Hợp đồng chưa đủ điều kiện thực hiện.";
    if (!order.lines.some((line) => line.held > 0)) return "Đơn chưa có lượng hàng đang giữ.";
    if (order.contract) {
      const contract = contractByCode(order.contract);
      const planned = contract.shipments.find((shipment) => shipment.status !== "delivered" && !shipment.delivery && shipment.items.every((item) => order.lines.find((line) => line.sku === item.sku)?.held === item.qty) && order.lines.filter((line) => line.held > 0).length === shipment.items.length);
      if (!planned) return "Lượng đang giữ cần khớp một đợt giao chưa xuất trong hợp đồng. Điều chỉnh giữ hàng hoặc lập đợt giao trước.";
    }
    for (const line of order.lines) {
      const product = productBySku(line.sku);
      if (line.held > line.qty - line.shipped || line.held > product.physical - product.damaged || line.held > product.held) return "Số lượng xuất không hợp lệ so với đơn và tồn thực tế.";
    }
    return "";
  };
  if (!order) return;
  const error = validate();
  if (error) return toast(error, "warning");
  confirmAction("Xác nhận xuất kho", `Xuất lượng đang giữ của ${code}. Giao dịch sẽ giảm tồn vật lý và giải phóng lượng giữ tương ứng.`, () => {
    const conflict = validate();
    if (conflict) return toast(conflict, "error");
    const issue = { code: nextCode(state.issues, "code", `PX-${new Date().getFullYear()}-`), order: code, customerId: order.customerId, date: todayText(), status: "issued", owner: currentUser().name, lines: [] };
    order.lines.forEach((line) => {
      if (!line.held) return;
      const qty = line.held;
      const product = productBySku(line.sku);
      product.physical -= qty; product.held -= qty; line.shipped += qty; line.held = 0;
      issue.lines.push({ sku: product.sku, qty });
      state.reservations.filter((reservation) => reservation.order === code && reservation.sku === product.sku && reservation.status === "holding").forEach((reservation) => reservation.status = "issued");
      addMovement("Xuất kho", product.sku, -qty, product.physical, product.held, issue.code, code);
    });
    state.issues.unshift(issue); order.status = "issued";
    order.issueRequestedAt = new Date().toISOString();
    const contract = order.contract ? contractByCode(order.contract) : null;
    const shipment = contract?.shipments.find((item) => item.status !== "delivered" && !item.delivery && item.items.every((line) => issue.lines.find((issued) => issued.sku === line.sku)?.qty === line.qty));
    const delivery = { code: nextCode(state.deliveries, "code", `GH-${new Date().getFullYear()}-`), order: code, customerId: order.customerId, issue: issue.code, contract: contract?.code || "", shipmentId: shipment?.id || "", items: structuredClone(issue.lines), carrier: "", planned: shipment?.date || todayText(), status: "delivery_pending", fee: 0, payer: "SoulWine", note: "Chờ bàn giao vận chuyển" };
    state.deliveries.unshift(delivery);
    if (shipment) { shipment.delivery = delivery.code; shipment.status = "issued"; }
    addAudit("Xác nhận xuất kho", issue.code, code, "success");
    render(true); toast(`Đã lập ${issue.code} và ghi giảm tồn.`);
  });
}

function showContractForm() {
  const quotes = state.quotes.filter((quote) => quote.status === "approved" && quote.confirmed && !state.contracts.some((contract) => contract.quote === quote.code));
  if (!quotes.length) return toast("Chưa có báo giá đã duyệt, được khách xác nhận và chưa có hợp đồng. Duyệt một báo giá mới trước.", "info");
  showForm("Tạo hợp đồng từ báo giá", `<div class="form-grid">${selectField("quote", "Báo giá nguồn", quotes.map((quote) => [quote.code, `${quote.code} · ${customerName(quote.customerId)}`]))}${selectField("scheme", "Thanh toán", [["50/50", "50/50 theo thỏa thuận"], ["100%", "100% trước giao hàng"]])}${inputField("due", "Hạn thanh toán", "date", isoDate(todayText()), "required")}</div>`, (data) => {
    const quote = quoteByCode(data.get("quote"));
    const contract = { code: nextCode(state.contracts, "code", `HĐ-${new Date().getFullYear()}-`), customerId: quote.customerId, quote: quote.code, owner: currentUser().name, value: quoteTotals(quote).total, paid: 0, status: "checking", scheme: data.get("scheme"), due: displayDate(data.get("due")), signedAt: "", lines: quote.lines.map((line) => ({ sku: line.sku, qty: line.qty, price: line.price, discount: line.discount })), checklist: { customerConfirm: false, accountantCheck: false, directorSign: false, customerSign: false, scan: false }, shipments: [] };
    state.contracts.unshift(contract);
    addAudit("Tạo hợp đồng", contract.code, quote.code);
    closeDialog(); navigate(`contracts/${encodeURIComponent(contract.code)}`); toast("Đã tạo hợp đồng, chuyển Kế toán kiểm tra.");
  }, { submitLabel: "Tạo hợp đồng" });
}

function updateContractCheck(code, name) {
  const contract = contractByCode(code);
  const roles = { customerConfirm: ["sales_manager", "sales_staff"], accountantCheck: ["accountant"], directorSign: ["director"], customerSign: ["sales_manager", "accountant"], scan: ["sales_manager", "accountant"] };
  if (!contract || !roles[name]?.includes(state.role)) return toast("Bước này cần người đúng thẩm quyền xác nhận. Kiểm tra vai trò đang sử dụng.", "warning");
  if (["active", "liquidated", "cancelled"].includes(contract.status)) return;
  if (name === "scan") return chooseFile((files) => {
    contract.checklist.scan = true;
    contract.scanName = files[0].name; contract.scanId = files[0].id;
    const existing = state.documents.find((item) => item.type === "Hợp đồng" && item.record === code);
    if (existing) { existing.file = files[0].name; existing.fileId = files[0].id; }
    else state.documents.unshift({ code, type: "Hợp đồng", record: code, date: todayText(), file: files[0].name, fileId: files[0].id, owner: currentUser().name });
    addAudit("Lưu hợp đồng đã ký", code, files[0].name);
    finishContractSignature(contract);
  }, false, code);
  if (name === "directorSign" && !contract.checklist.accountantCheck) return toast("Kế toán cần kiểm tra trước khi Giám đốc ký.", "warning");
  if (name === "customerSign" && !contract.checklist.directorSign) return toast("Cần Giám đốc ký trước khi ghi nhận khách hoàn tất ký.", "warning");
  contract.checklist[name] = true;
  if (name === "accountantCheck") contract.status = "pending_sign";
  addAudit("Cập nhật ký kết", code, CONTRACT_CHECKS.find(([key]) => key === name)[1]);
  finishContractSignature(contract);
}

function finishContractSignature(contract) {
  if (Object.values(contract.checklist).every(Boolean)) { contract.status = "active"; contract.signedAt = todayText(); }
  render(true); toast(contract.status === "active" ? "Hợp đồng đủ chữ ký và scan, sẵn sàng thực hiện." : "Đã cập nhật checklist ký kết.");
}

function chooseFile(callback, multiple = false, reference = "") {
  const input = document.createElement("input");
  input.type = "file"; input.accept = ".pdf,.png,.jpg,.jpeg"; input.multiple = multiple;
  input.addEventListener("change", async () => {
    const files = [...input.files];
    if (!files.length) return;
    try { callback(await storeAttachments(files, reference)); } catch (error) { toast(error.message, "error"); }
  }, { once: true });
  input.click();
}

function showShipmentForm(code) {
  const contract = contractByCode(code);
  if (!contract || contract.status !== "active") return toast("Chỉ lập đợt giao cho hợp đồng đang thực hiện.", "warning");
  showForm("Lập đợt giao", `${inputField("date", "Ngày giao", "date", isoDate(todayText()), "required")}<div class="form-grid mt-16">${contract.lines.map((line) => inputField(line.sku, `${productName(line.sku)} (tổng ${line.qty})`, "number", 0, "min=0 step=1 required")).join("")}</div>${inputField("note", "Địa điểm / ghi chú")}`, (data) => {
    const items = contract.lines.map((line) => ({ sku: line.sku, qty: Number(data.get(line.sku)) }));
    if (!items.some((item) => item.qty > 0)) return formError("Cần ít nhất một mặt hàng có số lượng dương.");
    for (const item of items) {
      const planned = contract.shipments.reduce((sum, shipment) => sum + (shipment.items.find((line) => line.sku === item.sku)?.qty || 0), 0);
      const limit = contract.lines.find((line) => line.sku === item.sku).qty;
      if (!Number.isInteger(item.qty) || item.qty < 0 || planned + item.qty > limit) return formError(`${item.sku}: tổng các đợt giao vượt lượng hợp đồng (${limit}).`);
    }
    contract.shipments.push({ id: `Đợt ${contract.shipments.length + 1}`, date: displayDate(data.get("date")), items: items.filter((item) => item.qty > 0), status: "planned", note: data.get("note") });
    addAudit("Lập đợt giao", code, displayDate(data.get("date")));
    closeDialog(); render(true); toast("Đã thêm đợt giao, không thay đổi lịch thanh toán.");
  });
}

function updateReceiptInput(input) {
  if (!["warehouse_manager", "warehouse_staff"].includes(state.role)) return;
  const receipt = receiptByCode(input.dataset.code);
  const line = receipt?.lines.find((item) => item.sku === input.dataset.sku);
  const value = Number(input.value);
  if (!line || receipt.status !== "receiving") return;
  const valid = input.value !== "" && Number.isSafeInteger(value) && value >= 0;
  line[input.dataset.rcField] = valid ? value : null;
  line.counted = true;
  input.setAttribute("aria-invalid", String(!valid));
  input.setCustomValidity(valid ? "" : "Nhập số lượng nguyên không âm.");
  numericFieldFeedback(input, valid, "Nhập số lượng nguyên không âm, kể cả số 0.");
  refreshReceiptEditor(receipt);
  scheduleWorkspaceSave();
}

function refreshReceiptEditor(receipt) {
  const template = document.createElement("template");
  template.innerHTML = viewReceiptDetail(receipt.code);
  for (const selector of [".page-actions", "#receipt-validation", ".summary-list"]) {
    const previous = viewElement.querySelector(selector), next = template.content.querySelector(selector);
    if (previous && next) previous.innerHTML = next.innerHTML;
  }
  for (const attribute of ["data-rc-variance", "data-rc-assessment"]) {
    viewElement.querySelectorAll(`[${attribute}]`).forEach((element) => {
      const next = template.content.querySelector(`[${attribute}="${element.getAttribute(attribute)}"]`);
      if (next) { element.innerHTML = next.innerHTML; element.className = next.className; element.style.cssText = next.style.cssText; }
    });
  }
  viewElement.querySelectorAll("[data-action]").forEach((element) => { const roles = ACTION_ROLES[element.dataset.action]; if (roles && !roles.includes(state.role)) element.disabled = true; });
}

function confirmReceipt(code, returnLot = false) {
  const receipt = receiptByCode(code);
  if (!receipt || receipt.status !== "receiving") return;
  const threshold = receiptThreshold(receipt);
  if (!returnLot && threshold === null) return toast("Thiết lập ngưỡng sai lệch trong Cài đặt trước khi xác nhận nhập.", "warning");
  if (!receiptCountsComplete(receipt)) return toast("Nhập đủ số thực nhận, đạt và lỗi cho mọi dòng trước khi quyết định.", "warning");
  if (!receipt.evidence.length) return toast("Đính kèm phiếu giao / biên bản kiểm đếm trước khi xác nhận kết quả.", "warning");
  if (!returnLot && stockLock()) return toast("Không thể nhập kho trong kỳ đang khóa kiểm kê.", "warning");
  if (!returnLot && receiptOverThreshold(receipt)) return toast("Sai lệch vượt ngưỡng: phải trả lô và yêu cầu giao lại.", "warning");
  if (!returnLot && receipt.lines.some((line) => line.good + line.damaged !== line.received)) return toast("Hàng đạt + hư hỏng phải bằng thực nhận ở từng dòng.", "warning");
  confirmAction(returnLot ? "Trả lô hàng" : "Xác nhận nhập kho", returnLot ? "Không ghi tăng tồn. Lưu yêu cầu nhà cung cấp giao lại." : "Ghi tăng tồn vật lý theo thực nhận; hàng lỗi được tách khỏi tồn khả dụng.", () => {
    if (receipt.status !== "receiving") return;
    if (!returnLot && stockLock()) return toast("Kho đã bị khóa kiểm kê, không thể ghi nhập.", "error");
    if (!returnLot) receipt.lines.forEach((line) => {
      const product = productBySku(line.sku);
      product.physical += line.received; product.damaged += line.damaged;
      addMovement("Nhập kho", product.sku, line.received, product.physical, product.held, receipt.code, `${line.good} đạt; ${line.damaged} lỗi`);
    });
    receipt.status = returnLot ? "returned" : "completed";
    const supplier = state.suppliers.find((item) => item.id === receipt.supplier);
    if (supplier && !returnLot) supplier.lastDelivery = todayText();
    receipt.threshold = threshold;
    const order = state.purchaseOrders.find((item) => item.code === receipt.po);
    if (order) order.status = returnLot ? "returned" : "completed";
    addAudit(returnLot ? "Trả lô hàng" : "Xác nhận nhập kho", code, receipt.po, returnLot ? "danger" : "success");
    render(true); toast(returnLot ? "Đã ghi trả lô, yêu cầu giao lại." : "Đã nhập kho và ghi thẻ kho.");
  }, returnLot);
}

function updateStocktakeInput(input) {
  if (!["warehouse_manager", "warehouse_staff"].includes(state.role)) return;
  const stocktake = stocktakeByCode(input.dataset.code);
  const line = stocktake?.lines.find((item) => item.sku === input.dataset.sku);
  if (!line || stocktake.status !== "counting") return;
  if (input.dataset.stField === "note") line.note = input.value;
  else {
    const value = input.value === "" ? null : Number(input.value);
    const valid = value !== null && Number.isSafeInteger(value) && value >= 0;
    line.count = valid ? value : null;
    input.setAttribute("aria-invalid", String(!valid));
    input.setCustomValidity(valid ? "" : "Nhập số lượng nguyên không âm, kể cả số 0.");
    numericFieldFeedback(input, valid, "Nhập số lượng nguyên không âm, kể cả số 0.");
  }
  const progress = stocktakeProgress(stocktake);
  const variance = line.count === null ? null : line.count - line.system;
  const cell = document.querySelector(`[data-st-var="${line.sku}"]`);
  if (cell) { cell.textContent = variance === null ? "—" : `${variance > 0 ? "+" : ""}${variance}`; cell.style.color = variance ? "var(--danger)" : "var(--success)"; }
  const label = document.getElementById("st-progress-label");
  if (label) label.textContent = `${progress.percent}%`;
  const bar = document.getElementById("st-progress-bar");
  if (bar) bar.style.width = `${progress.percent}%`;
  const counted = document.getElementById("st-counted-label");
  if (counted) counted.textContent = `${progress.counted}/${progress.total} mã đã nhập`;
  const missing = document.getElementById("st-missing");
  if (missing) { missing.className = `banner ${progress.missing ? "warning" : "success"} mb-16`; missing.textContent = progress.missing ? `${progress.missing} mã chưa nhập. Nhập đủ, kể cả số 0, để hoàn tất đếm.` : "Đã nhập đủ số liệu. Có thể hoàn tất đếm để đối chiếu."; }
  const button = document.getElementById("st-finish");
  if (button) button.disabled = progress.missing > 0 || state.role !== "warehouse_manager";
  scheduleWorkspaceSave();
}

function showAdjustmentForm(code, sku) {
  const stocktake = stocktakeByCode(code);
  const line = stocktake?.lines.find((item) => item.sku === sku);
  if (!line || line.count === null || !["reconciling", "reported"].includes(stocktake.status)) return toast("Hoàn tất đếm trước khi giải trình điều chỉnh.", "warning");
  showForm("Giải trình chênh lệch", `<div class="banner warning mb-16">${escapeHtml(productName(sku))} · Sổ sách ${line.system} · Đếm ${line.count} · Lệch ${line.count - line.system}</div>${inputField("reason", "Nguyên nhân đã kiểm tra / đếm lại", "text", line.note, "required maxlength=240")}<p class="hint mt-12">Chỉ ghi nhận căn cứ. Tồn được điều chỉnh một lần khi hoàn tất kỳ kiểm kê.</p>`, (data) => {
    if (!data.get("reason").trim()) return formError("Cần ghi nguyên nhân chênh lệch.");
    line.note = data.get("reason").trim(); line.reviewed = true;
    addAudit("Xác nhận chênh lệch kiểm kê", code, `${sku}: ${line.note}`);
    closeDialog(); render(true); toast("Đã xác nhận căn cứ; chưa thay đổi tồn.");
  }, { submitLabel: "Xác nhận nguyên nhân" });
}

function completeStocktake(code) {
  const stocktake = stocktakeByCode(code);
  if (!stocktake || !["reconciling", "reported"].includes(stocktake.status)) return toast("Cần hoàn tất đếm, đối chiếu trước khi đóng kỳ.", "warning");
  if (stocktakeProgress(stocktake).missing) return toast("Còn mã chưa kiểm đếm.", "warning");
  if (stocktake.lines.some((line) => line.count !== line.system && !line.reviewed)) return toast("Mỗi mã chênh lệch phải được kiểm tra và xác nhận nguyên nhân qua nút Điều chỉnh.", "warning");
  if (stocktake.lines.some((line) => line.count < productBySku(line.sku).held + productBySku(line.sku).damaged)) return toast("Số đếm thấp hơn lượng giữ + hàng lỗi. Kiểm tra lại trước khi đóng kỳ.", "warning");
  confirmAction("Hoàn tất kiểm kê & mở khóa", "Áp dụng kết quả đã kiểm tra, lưu biên bản và mở lại nhập/xuất. Không thể sửa kỳ đã hoàn tất.", () => {
    if (stocktake.status === "completed") return;
    stocktake.lines.forEach((line) => {
      const product = productBySku(line.sku);
      const variance = line.count - product.physical;
      if (variance) { product.physical = line.count; addMovement("Điều chỉnh tồn", line.sku, variance, product.physical, product.held, code, line.note); }
    });
    stocktake.status = "completed"; stocktake.locked = false; stocktake.reportTo = nowStamp();
    stocktake.closedAt = new Date().toISOString();
    stocktake.closedLines = stocktake.lines.map((line) => ({ sku: line.sku, count: line.count, final: productBySku(line.sku).physical }));
    addAudit("Hoàn tất kiểm kê & mở khóa", code, "Đã lưu biên bản và báo cáo Giám đốc", "success");
    state.ui.stocktakeTab = "report"; render(true); toast("Kỳ kiểm kê hoàn tất. Nhập/xuất đã mở lại.");
  });
}

function showNewStocktakeForm() {
  if (stockLock()) return toast(`Đang có kỳ ${stockLock().code} khóa kho. Hoàn tất kỳ đó trước.`, "warning");
  if (!state.products.length) return toast("Thêm sản phẩm trước khi tạo kỳ kiểm kê.", "info");
  showForm("Tạo kỳ kiểm kê", `${inputField("scope", "Phạm vi kiểm kê", "text", "Toàn kho", "required")}<div class="banner locked mt-16">Bắt đầu kỳ sẽ khóa toàn bộ nhập/xuất đến khi đối chiếu và hoàn tất.</div>`, (data) => {
    const code = nextCode(state.stocktakes, "code", `KK-${new Date().getFullYear()}-`, 2);
    state.stocktakes.unshift({ code, scope: data.get("scope"), started: nowStamp(), status: "counting", locked: true, owner: currentUser().name, reportTo: "", lines: state.products.filter((product) => product.status === "product_active").map((product) => ({ sku: product.sku, system: product.physical, count: null, note: "" })) });
    addAudit("Tạo kỳ kiểm kê", code, "Khóa nhập/xuất");
    closeDialog(); navigate(`stocktakes/${code}`);
  }, { submitLabel: "Bắt đầu & khóa kho" });
}

function showCustomer(id) {
  const customer = customerById(id);
  if (!customer) return;
  showDialog({ drawer: true, title: customer.name, subtitle: `${customer.id} · ${customer.type}`, body: `<div class="kv-grid"><div><div class="kv-label">Liên hệ</div><div class="kv-value">${escapeHtml(customer.contact)}</div></div><div><div class="kv-label">Điện thoại</div><div class="kv-value">${escapeHtml(customer.phone)}</div></div><div><div class="kv-label">Email</div><div class="kv-value">${escapeHtml(customer.email || "—")}</div></div><div><div class="kv-label">Mã số thuế</div><div class="kv-value">${escapeHtml(customer.tax || "—")}</div></div><div class="full"><div class="kv-label">Địa chỉ giao hàng</div><div class="kv-value">${escapeHtml(customer.address)}</div></div></div><div class="divider"></div><h3 class="section-title">Đơn hàng liên quan</h3>${state.orders.filter((order) => order.customerId === id).map((order) => `<a class="picker-row" href="${hrefFor("orders", order.code)}"><span>${order.code}</span>${statusChip(order.status)}<span>${money(order.total)}</span></a>`).join("") || '<p class="muted small">Chưa có đơn hàng.</p>'}<div class="divider"></div><p class="small muted">${escapeHtml(customer.note)}</p>` });
  if (ACTION_ROLES["edit-customer"].includes(state.role)) document.querySelector(".drawer")?.insertAdjacentHTML("beforeend", `<div class="drawer-foot"><button class="btn btn-primary" data-action="edit-customer" data-id="${customer.id}">${icon("edit")}Chỉnh sửa hồ sơ</button></div>`);
}

function showProduct(sku) {
  const product = productBySku(sku);
  if (!product) return;
  showDialog({ drawer: true, title: product.name, subtitle: `${product.sku} · ${product.origin}`, body: `${productCell(sku)}<div class="divider"></div><div class="kv-grid">${[["Nhóm", product.category], ["Nồng độ", product.abv], ["Dung tích", product.volume], ["Đơn vị", product.unit], ["Giá lẻ", money(product.retail)], ["Giá sỉ", money(product.wholesale)], ["Tồn vật lý", product.physical], ["Đang giữ", product.held], ["Hàng lỗi", product.damaged], ["Khả dụng", availableOf(product)]].map(([label, value]) => `<div><div class="kv-label">${escapeHtml(label)}</div><div class="kv-value">${escapeHtml(value)}</div></div>`).join("")}</div><div class="divider"></div>${statusChip(product.status)}<p class="hint mt-12">Nhà cung cấp: ${escapeHtml(supplierName(product.supplier))}</p>`, footer: ACTION_ROLES["toggle-product"].includes(state.role) ? `<button class="btn btn-secondary" data-action="toggle-product" data-sku="${sku}">${product.status === "product_active" ? "Ngừng kinh doanh" : "Mở lại kinh doanh"}</button>` : "" });
  if (ACTION_ROLES["edit-product"].includes(state.role)) document.querySelector(".drawer-foot")?.insertAdjacentHTML("beforeend", `<button class="btn btn-primary" data-action="edit-product" data-sku="${sku}">${icon("edit")}Chỉnh sửa</button>`);
}

function showUserForm() {
  showForm("Thêm nhân sự", `<div class="form-grid">${inputField("name", "Họ tên", "text", "", "required")}${inputField("email", "Email đăng nhập", "email", "", "required")}${inputField("phone", "Điện thoại", "tel", "", "required")}${selectField("role", "Vai trò được phân công", Object.entries(ROLES).map(([key, role]) => [key, role.label]))}${inputField("password", "Mật khẩu ban đầu", "password", "", "required minlength=8 maxlength=64 autocomplete=new-password")}${inputField("confirm", "Nhập lại mật khẩu ban đầu", "password", "", "required autocomplete=new-password")}</div><label class="checkline mt-12"><input type="checkbox" name="mustChange" checked> Yêu cầu nhân sự đổi mật khẩu ở lần đăng nhập đầu tiên</label><p class="hint mt-12">Mật khẩu được băm trước khi lưu trên thiết bị. Nhân sự dùng email và mật khẩu này để đăng nhập; hãy chuyển trực tiếp, không gửi qua kênh không bảo mật.</p>`, async (data) => {
    const email = data.get("email").trim().toLowerCase();
    if (state.users.some((user) => user.email.toLowerCase() === email) || credentialByEmail(email)) return formError("Email đã thuộc hồ sơ khác.");
    const role = ROLES[data.get("role")];
    if (!data.get("name").trim()) return formError("Nhập họ tên hợp lệ.");
    const policy = passwordPolicyError(data.get("password"));
    if (policy) return formError(policy);
    if (data.get("password") !== data.get("confirm")) return formError("Mật khẩu nhập lại chưa khớp.");
    const user = { id: nextCode(state.users, "id", "U-", 3), name: data.get("name").trim(), email, phone: data.get("phone"), dept: role.dept, role: role.label, roleIds: [data.get("role")], status: "user_active" };
    state.users.push(user);
    await createUserCredential(user.id, email, data.get("password"), data.has("mustChange"));
    addAudit("Thêm nhân sự", email, role.label);
    closeDialog(); render(true); toast("Đã thêm hồ sơ và cấp tài khoản đăng nhập.");
  });
}

function showInvoiceForm(record) {
  showForm("Thông tin hóa đơn đã phát hành", `<div class="form-grid">${inputField("record", "Đơn / hợp đồng", "text", record || "", "required")}${inputField("number", "Số hóa đơn", "text", "", "required")}${inputField("date", "Ngày lập", "date", isoDate(todayText()), "required")}${inputField("amount", "Giá trị (VND)", "number", "", "required min=1 step=1")}${inputField("file", "Tệp hóa đơn", "file", "", "accept='.pdf,.png,.jpg,.jpeg' required")}</div><p class="hint mt-12">Lưu hồ sơ và tệp hóa đơn đã được phát hành bên ngoài. Không ký số hoặc phát hành hóa đơn điện tử.</p>`, async (data) => {
    if (!orderByCode(data.get("record")) && !contractByCode(data.get("record"))) return formError("Không tìm thấy đơn hàng / hợp đồng.");
    const file = data.get("file");
    if (!file?.name) return formError("Chọn tệp hóa đơn đã phát hành.");
    const code = data.get("number").trim();
    if (state.documents.some((document) => document.code === code)) return formError("Số chứng từ đã tồn tại.");
    const [attachment] = await storeAttachments([file], code);
    state.documents.unshift({ code, type: "Hóa đơn", record: data.get("record"), date: displayDate(data.get("date")), amount: Number(data.get("amount")), file: file.name, fileId: attachment.id, owner: currentUser().name });
    addAudit("Lưu thông tin hóa đơn", code, data.get("record"));
    closeDialog(); render(true); toast("Đã lưu hóa đơn và tệp đính kèm trên thiết bị.");
  });
}

function showBulkCheck() {
  showForm("Kiểm tra tồn hàng loạt", `<div class="field"><label for="bulk-lines">Danh sách SKU, số lượng (mỗi dòng một mặt hàng)</label><textarea class="textarea" style="min-height:120px" id="bulk-lines" name="lines" placeholder="Nhập mã SKU và số lượng, phân tách bằng dấu phẩy" required></textarea></div><div id="bulk-results" class="mt-16" aria-live="polite"></div>`, (data) => {
    const totals = new Map();
    const parsed = data.get("lines").split(/\r?\n/).filter((line) => line.trim());
    if (!parsed.length) return formError("Nhập ít nhất một dòng SKU, số lượng.");
    for (const row of parsed) {
      const match = /^\s*([\w-]+)\s*[,;]\s*(\d+)\s*$/.exec(row);
      if (!match || Number(match[2]) <= 0) return formError(`Dòng không hợp lệ: ${row}`);
      const sku = match[1].toUpperCase();
      totals.set(sku, (totals.get(sku) || 0) + Number(match[2]));
    }
    document.getElementById("bulk-results").innerHTML = dataTable([{ label: "SKU" }, { label: "Cần", align: "num" }, { label: "Khả dụng", align: "num" }, { label: "Kết quả" }], [...totals].map(([sku, qty]) => {
      const product = productBySku(sku);
      const available = product?.status === "product_active" ? availableOf(product) : 0;
      return { cells: [escapeHtml(sku), num(qty), product ? num(available) : "—", `<span class="chip ${product && qty <= available ? "success" : "danger"}">${!product ? "Không tìm thấy" : qty <= available ? "Đủ" : `Thiếu ${qty - available}`}</span>`] };
    }), { minWidth: 360 });
  }, { drawer: false, submitLabel: "Kiểm tra" });
}

function showSecondaryDetails(kind, code) {
  if (kind === "supplier") {
    const supplier = state.suppliers.find((item) => item.id === code);
    if (!supplier) return;
    showDialog({ drawer: true, title: supplier.name, subtitle: supplier.id, body: `<div class="kv-grid">${[["Người liên hệ", supplier.contact], ["Điện thoại", supplier.phone], ["Email", supplier.email], ["Thanh toán", supplier.terms], ["Địa chỉ", supplier.address], ["MST", supplier.tax]].map(([label, value]) => `<div><div class="kv-label">${escapeHtml(label)}</div><div class="kv-value">${escapeHtml(value)}</div></div>`).join("")}</div><div class="divider"></div><h3 class="section-title">Sản phẩm cung ứng</h3>${state.products.filter((product) => product.supplier === code).map((product) => `<div class="picker-row">${productCell(product.sku)}</div>`).join("")}` });
  } else if (kind === "request") {
    const request = state.purchaseRequests.find((item) => item.code === code);
    if (!request) return;
    showDialog({ drawer: true, title: code, subtitle: supplierName(request.supplier), body: `${statusChip(request.status)}<p class="small muted mt-16">${escapeHtml(request.note)}</p><p class="strong mt-12">${money(request.amount)}</p>${request.lines.map((line) => `<div class="picker-row">${productCell(line.sku)}<strong>${line.qty}</strong></div>`).join("")}<a class="btn btn-secondary mt-16" href="#/approvals">Mở phê duyệt</a>` });
  } else if (kind === "delivery") {
    const delivery = state.deliveries.find((item) => item.code === code);
    if (!delivery) return;
    showDialog({ drawer: true, title: code, subtitle: `${delivery.order} · ${customerName(delivery.customerId)}`, body: `${statusChip(delivery.status)}<div class="summary-list mt-16">${[["Đơn vị vận chuyển", delivery.carrier || "Chưa bàn giao"], ["Ngày dự kiến", delivery.planned], ["Chi phí", money(delivery.fee)], ["Bên chịu phí", delivery.payer], ["Ghi chú", delivery.note]].map(([label, value]) => `<div class="summary-row"><span>${escapeHtml(label)}</span><span class="value">${escapeHtml(value)}</span></div>`).join("")}</div>${delivery.evidenceId ? `<div class="mt-16"><button class="file-chip" data-action="view-attachment" data-id="${delivery.evidenceId}">${icon("file")}Biên bản giao nhận</button></div>` : ""}<div class="banner info mt-16">Ghi nhận theo xác nhận của đơn vị vận chuyển và biên bản có chữ ký khách hàng.</div>`, footer: ["sales_staff", "sales_manager", "warehouse_manager"].includes(state.role) ? delivery.status === "shipping" ? `<button class="btn btn-danger" data-action="delivery-result" data-code="${code}" data-result="failed">Giao thất bại</button><button class="btn btn-primary" data-action="delivery-result" data-code="${code}" data-result="delivered">Xác nhận đã giao</button>` : ["delivery_pending", "failed"].includes(delivery.status) ? `<button class="btn btn-primary" data-action="schedule-delivery" data-code="${code}">${delivery.status === "failed" ? "Lên lịch giao lại" : "Bàn giao vận chuyển"}</button>` : "" : "" });
  } else if (kind === "return") {
    const item = state.returns.find((entry) => entry.code === code);
    if (!item) return;
    showDialog({ drawer: true, title: code, subtitle: `${item.order} · ${customerName(item.customerId)}`, body: `${statusChip(item.status)}<div class="picker-row">${productCell(item.sku)}<strong>${item.qty}</strong></div><p class="small mt-12">${escapeHtml(item.reason)} · ${escapeHtml(item.note)}</p><div class="banner warning mt-16">Phân loại hàng đạt / hư hỏng và xác nhận số thực nhận trước khi cập nhật tồn. Hoàn tiền / đổi bù cần chính sách được chốt.</div>`, footer: state.role === "warehouse_manager" && item.status === "inspecting" ? `<button class="btn btn-primary" data-action="return-inspection" data-code="${code}">Kiểm tra hàng hoàn</button>` : "" });
  }
}

function dispatchAction(action, data = {}) {
  if (!guardAction(action)) return;
  const managementActions = ["new-product", "edit-product", "new-supplier", "opening-stock", "new-purchase-request", "create-po", "create-receipt", "create-wholesale-order", "schedule-delivery", "new-return", "add-cart-row", "remove-cart-row", "backup-workspace", "retry-save", "reload-workspace", "download-recovery", "restore-backup", "clear-workspace", "discard-settings", "metric-help", "clear-filters", "sort-table", "page-table", "open-help", "view-attachment", "reset-user-password", "unlock-account", "change-password"];
  if (managementActions.includes(action)) return handleManagementAction(action, data);
  if (action.startsWith("export-")) { closePopover(); return exportData(action); }
  if (action.startsWith("refresh-")) { state.lastRefresh = nowTime(); render(true); return toast("Đã đối chiếu dữ liệu trên thiết bị.", "info"); }
  if (action.startsWith("print-")) {
    const kind = action.replace("print-", "");
    return printRecord(kind, data.code || state.routeParam);
  }
  switch (action) {
    case "edit-customer": return showCustomerForm(data.id);
    case "close-dialog": return closeDialog();
    case "confirm-dialog": { const callback = activeDialog?.confirm; closeDialog(true); try { if (callback) callback(); } catch (error) { toast(error.message, "error"); } return; }
    case "keep-editing": return keepDialogEditing();
    case "discard-dialog": { const callback = activeDialog?.discardCallback; closeDialog(true); if (callback) callback(); return; }
    case "retry-view": return render(true);
    case "storage-details": state.ui.settingsTab = "data"; return navigate("settings");
    case "new-quote": return createQuote();
    case "duplicate-quote": return createQuote(currentQuote());
    case "confirm-quote": {
      const quote = currentQuote();
      if (!quote || quote.status !== "approved") return;
      return showForm("Ghi nhận khách xác nhận báo giá", inputField("reference", "Căn cứ xác nhận (email / cuộc gọi / trao đổi)", "text", "", "required maxlength=200"), (form) => {
        if (!form.get("reference").trim()) return formError("Cần căn cứ xác nhận từ khách.");
        quote.confirmed = true; addAudit("Khách xác nhận báo giá", quote.code, form.get("reference"));
        closeDialog(); render(true); toast("Đã ghi nhận khách xác nhận, có thể tạo hợp đồng.");
      });
    }
    case "save-quote": return saveQuote();
    case "submit-quote": return saveQuote(true);
    case "add-line": return showProductPicker();
    case "pick-product": {
      const quote = currentQuote();
      if (!quoteEditable(quote)) return;
      const line = quote.lines.find((item) => item.sku === data.sku);
      if (line) line.qty += 1;
      else quote.lines.push({ sku: data.sku, qty: 1, discount: 0, price: productBySku(data.sku).wholesale });
      closeDialog(); render(true); return;
    }
    case "remove-line": if (quoteEditable(currentQuote())) { currentQuote().lines = currentQuote().lines.filter((line) => line.sku !== data.sku); render(true); } return;
    case "new-customer": return showCustomerForm();
    case "new-order": return showRetailOrderForm();
    case "open-payment": return showPaymentForm(data.record);
    case "open-invoice": return showInvoiceForm(data.record);
    case "open-reserve": return showReservationForm(data.sku);
    case "release-reservation": return releaseReservation(data.id);
    case "issue-order": return issueOrder(data.code);
    case "bulk-check": return showBulkCheck();
    case "select-approval": state.ui.selectedApproval = data.id; return render(true);
    case "approve-approval": return decideApproval(data.id, true);
    case "reject-approval": return decideApproval(data.id, false);
    case "new-contract": return showContractForm();
    case "contract-check": return updateContractCheck(data.code, data.field);
    case "upload-scan": return updateContractCheck(data.code, "scan");
    case "add-shipment": return showShipmentForm(data.code);
    case "liquidate-contract": {
      const contract = contractByCode(data.code);
      if (!contract || contract.paid < contract.value || !contract.shipments.length || contract.shipments.some((shipment) => shipment.status !== "delivered")) return toast("Chỉ thanh lý khi đã giao đủ và thu đủ theo hợp đồng.", "warning");
      return confirmAction("Thanh lý hợp đồng", `Kết thúc ${data.code} sau khi giao đủ, thu đủ.`, () => { contract.status = "liquidated"; addAudit("Thanh lý hợp đồng", data.code, "Đã giao đủ và thu đủ", "success"); render(true); toast("Đã thanh lý hợp đồng."); });
    }
    case "save-receipt": persistWorkspace(); renderStorageStatus(); return toast("Đã lưu số liệu kiểm đếm, chưa ghi tăng tồn.", "info");
    case "confirm-receipt": return confirmReceipt(data.code);
    case "return-receipt": return confirmReceipt(data.code, true);
    case "upload-evidence": return chooseFile((files) => { receiptByCode(data.code).evidence.push(...files.map((file) => file.name)); render(true); toast("Đã lưu tệp trên thiết bị."); }, true, data.code);
    case "new-stocktake": return showNewStocktakeForm();
    case "finish-count": {
      const stocktake = stocktakeByCode(data.code);
      if (!stocktake || stocktake.status !== "counting" || stocktakeProgress(stocktake).missing) return toast("Chưa nhập đủ số kiểm đếm.", "warning");
      stocktake.status = "reconciling"; state.ui.stocktakeTab = "reconcile";
      addAudit("Chốt số đếm", data.code, "Chuyển đối chiếu"); return render(true);
    }
    case "request-recount": {
      const stocktake = stocktakeByCode(data.code);
      const line = stocktake?.lines.find((item) => item.sku === data.sku);
      if (!line || stocktake.status === "completed") return;
      line.count = null; line.reviewed = false; stocktake.status = "counting"; state.ui.stocktakeTab = "count";
      addAudit("Yêu cầu đếm lại", data.code, data.sku); render(true); return toast("Đã mở lại dòng cần đếm; ghi số thực tế mới.", "info");
    }
    case "open-adjustment": return showAdjustmentForm(data.code, data.sku);
    case "report-stocktake": {
      const stocktake = stocktakeByCode(data.code);
      if (!stocktake || !["reconciling", "reported"].includes(stocktake.status)) return toast("Cần chốt số đếm trước khi báo cáo.", "warning");
      stocktake.reportTo = nowStamp(); stocktake.status = "reported";
      addAudit("Ghi nhận báo cáo kiểm kê", data.code, "Đã ghi nhận báo cáo trong nhật ký"); render(true); return toast("Đã lưu báo cáo kiểm kê.");
    }
    case "complete-stocktake": return completeStocktake(data.code);
    case "open-customer": return showCustomer(data.id);
    case "open-product": return showProduct(data.sku);
    case "new-user": return showUserForm();
    case "toggle-user": {
      const user = state.users.find((item) => item.id === data.id);
      if (user.id === state.activeUserId) return toast("Không thể vô hiệu hóa hồ sơ đang sử dụng.", "warning");
      if (user.status === "user_active" && user.roleIds.includes("director") && state.users.filter((item) => item.status === "user_active" && item.roleIds.includes("director")).length <= 1) return toast("Cần duy trì ít nhất một hồ sơ Giám đốc hoạt động.", "warning");
      return confirmAction("Đổi trạng thái hồ sơ", `Cập nhật ${user.name}. Hồ sơ ngừng hoạt động không xuất hiện trong danh sách chọn không gian làm việc.`, () => { user.status = user.status === "user_active" ? "user_locked" : "user_active"; addAudit("Đổi trạng thái nhân sự", user.id, user.status); render(true); toast("Đã cập nhật hồ sơ nhân sự."); }, true);
    }
    case "toggle-product": {
      const product = productBySku(data.sku);
      closeDialog();
      return confirmAction("Đổi trạng thái kinh doanh", `Cập nhật ${product.name}; không thay đổi tồn kho hay giao dịch cũ.`, () => { product.status = product.status === "product_active" ? "product_inactive" : "product_active"; addAudit("Đổi trạng thái sản phẩm", product.sku, product.status); render(true); toast("Đã cập nhật sản phẩm."); });
    }
    case "open-supplier": return showSecondaryDetails("supplier", data.id);
    case "open-request": return showSecondaryDetails("request", data.code);
    case "open-delivery": return showSecondaryDetails("delivery", data.code);
    case "open-return": return showSecondaryDetails("return", data.code);
    case "delivery-result": return showDeliveryResultForm(data.code, data.result);
    case "return-inspection": return showReturnInspection(data.code);
    case "mark-all-read": allowedNotifications().forEach((item) => item.unread = false); persistWorkspace(); closePopover(); renderShell(); return toast("Đã đánh dấu thông báo là đã đọc.");
    case "logout": {
      if (activeDialog?.dirty) return requestDiscard(() => { closeDialog(true); dispatchAction("logout"); });
      if (state.ui.settingsDirty) return requestSettingsDiscard(() => dispatchAction("logout"));
      closePopover(); state.loggedIn = false; try { sessionStorage.removeItem(PROFILE_KEY); } catch {} persistWorkspace(); resetLoginFlow(); renderShell(); syncOverlayState(); document.getElementById("login-email")?.focus(); return;
    }
  }
}

function showDeliveryResultForm(code, result) {
  if (!["sales_staff", "sales_manager", "warehouse_manager"].includes(state.role)) return;
  const delivery = state.deliveries.find((item) => item.code === code);
  if (!delivery || delivery.status !== "shipping") return;
  showForm(result === "delivered" ? "Xác nhận giao thành công" : "Ghi nhận giao thất bại", `${inputField("receivedAt", "Nhận xác nhận giao hàng lúc", "datetime-local", new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 16), "required")}${result === "delivered" ? inputField("evidence", "Biên bản giao nhận có chữ ký", "file", "", "required accept='.pdf,.jpg,.jpeg,.png'") : inputField("reason", "Lý do giao thất bại", "text", "", "required maxlength=240")}`, async (data) => {
    const receivedAt = new Date(`${data.get("receivedAt")}:00+07:00`);
    if (!Number.isFinite(receivedAt.valueOf()) || receivedAt > new Date()) return formError("Thời điểm nhận xác nhận không được ở tương lai.");
    if (result === "delivered") {
      const file = data.get("evidence");
      if (!file?.name) return formError("Chọn biên bản giao nhận có chữ ký.");
      const [attachment] = await storeAttachments([file], code);
      delivery.evidence = file.name;
      delivery.evidenceId = attachment.id;
    } else if (!data.get("reason").trim()) return formError("Cần nêu lý do thất bại.");
    delivery.status = result; delivery.note = result === "failed" ? data.get("reason") : "Khách đã ký nhận đủ hàng";
    delivery.resultReceivedAt = receivedAt.toISOString(); delivery.resultRecordedAt = new Date().toISOString();
    const contract = delivery.contract ? contractByCode(delivery.contract) : null;
    const shipment = contract?.shipments?.find((item) => item.id === delivery.shipmentId);
    if (shipment) { shipment.status = result === "delivered" ? "delivered" : "failed"; shipment.confirmedAt = receivedAt.toISOString(); shipment.updatedAt = delivery.resultRecordedAt; }
    const order = orderByCode(delivery.order);
    if (order) order.status = result === "failed" ? "failed" : order.lines.every((line) => line.shipped >= line.qty) && state.deliveries.filter((item) => item.order === order.code).every((item) => item.status === "delivered") ? "completed" : "shipping";
    addAudit("Cập nhật kết quả giao", code, delivery.note, result === "failed" ? "danger" : "success");
    closeDialog(); render(true); toast("Đã lưu kết quả giao nhận.");
  });
}

function showReturnInspection(code) {
  if (state.role !== "warehouse_manager") return;
  const item = state.returns.find((entry) => entry.code === code);
  if (!item || item.status !== "inspecting") return;
  showForm("Kiểm tra hàng hoàn", `${inputField("receivedAt", "Hàng trả về thực tế lúc", "datetime-local", new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 16), "required")}${selectField("condition", "Phân loại thực nhận", [["damaged", "Hư hỏng / chờ xử lý"], ["good", "Đủ điều kiện bán lại"]])}${inputField("reason", "Kết quả kiểm tra", "text", "", "required")}<div class="banner warning mt-16">Chỉ cập nhật tồn khi hàng đã trả về thực tế. Hàng hỏng không tăng tồn khả dụng.</div>`, (data) => {
    if (stockLock()) return formError("Kho đang khóa kiểm kê. Hoàn tất kỳ trước khi xác nhận nhập hoàn.");
    const product = productBySku(item.sku);
    const receivedAt = new Date(`${data.get("receivedAt")}:00+07:00`);
    if (!Number.isFinite(receivedAt.valueOf()) || receivedAt > new Date()) return formError("Thời điểm nhận hàng không được ở tương lai.");
    product.physical += item.qty;
    if (data.get("condition") === "damaged") product.damaged += item.qty;
    item.status = "completed"; item.note = data.get("reason");
    item.receivedAt = receivedAt.toISOString(); item.postedAt = new Date().toISOString();
    addMovement("Hàng hoàn", item.sku, item.qty, product.physical, product.held, code, item.note);
    addAudit("Xác nhận hàng hoàn", code, item.note, "success");
    closeDialog(); render(true); toast("Đã ghi nhận hàng hoàn. Xử lý tiền cần Kế toán theo chính sách.");
  });
}
