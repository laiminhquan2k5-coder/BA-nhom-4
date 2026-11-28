const ACTION_ROLES = {
  "new-quote": ["director", "sales_manager", "sales_staff"],
  "save-quote": ["director", "sales_manager", "sales_staff"],
  "submit-quote": ["director", "sales_manager", "sales_staff"],
  "duplicate-quote": ["director", "sales_manager", "sales_staff"],
  "confirm-quote": ["sales_manager", "sales_staff"],
  "add-line": ["director", "sales_manager", "sales_staff"],
  "remove-line": ["director", "sales_manager", "sales_staff"],
  "new-order": ["sales_manager", "sales_staff"],
  "edit-order": ["sales_manager", "sales_staff"],
  "cancel-order": ["sales_manager", "sales_staff"],
  "new-customer": ["director", "sales_manager", "sales_staff"],
  "edit-supplier": ["director", "warehouse_manager"],
  "supplier-catalog": ["director", "warehouse_manager", "accountant"],
  "open-payment": ["accountant", "sales_staff"],
  "open-invoice": ["accountant"],
  "open-reserve": ["warehouse_manager"],
  "release-reservation": ["warehouse_manager"],
  "request-issue": ["sales_manager", "sales_staff"],
  "cancel-issue-request": ["sales_manager", "sales_staff", "warehouse_manager"],
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
  "cancel-stocktake": ["warehouse_manager"],
  "report-stocktake": ["warehouse_manager"],
  "new-user": ["director"],
  "configure-permissions": ["director"],
  "toggle-user": ["director"],
  "toggle-product": ["director", "sales_manager"],
  "new-contract": ["sales_manager", "sales_staff"],
  "add-shipment": ["sales_manager", "sales_staff"],
  "upload-scan": ["accountant", "sales_manager"],
  "liquidate-contract": ["director", "sales_manager"]
};
Object.assign(ACTION_ROLES, {
  "delivery-result": ["sales_staff", "sales_manager", "warehouse_manager"],
  "new-undelivered-return": ["warehouse_staff", "warehouse_manager"],
  "return-receive": ["warehouse_staff", "warehouse_manager"],
  "return-inspection": ["warehouse_manager"],
  "return-finance-evidence": ["accountant"],
  "return-finance-resolve": ["accountant"],
  "return-replacement-evidence": ["warehouse_manager"]
});

const CONFIGURABLE_ACTIONS = [
  ["Lập và sửa báo giá", "new-quote", ["new-quote", "save-quote", "submit-quote", "duplicate-quote", "add-line", "remove-line"]],
  ["Tạo / sửa / hủy đơn hàng", "new-order", ["new-order", "edit-order", "cancel-order", "create-wholesale-order"]],
  ["Ghi nhận thanh toán", "open-payment", ["open-payment"]],
  ["Xác nhận giữ hàng", "open-reserve", ["open-reserve", "release-reservation"]],
  ["Yêu cầu xuất kho", "request-issue", ["request-issue"]],
  ["Xác nhận xuất kho", "issue-order", ["issue-order"]],
  ["Xác nhận nhập kho", "confirm-receipt", ["confirm-receipt", "return-receipt"]],
  ["Lập yêu cầu mua", "new-purchase-request", ["new-purchase-request"]],
  ["Hoàn tất kiểm kê", "complete-stocktake", ["complete-stocktake"]]
];

function actionRoles(action) {
  const base = ACTION_ROLES[action];
  const group = CONFIGURABLE_ACTIONS.find((entry) => entry[2].includes(action));
  const restriction = group && state.settings.actionRoles?.[group[1]];
  return base && Array.isArray(restriction) ? base.filter((role) => restriction.includes(role)) : base;
}

function showPermissionSettings() {
  const controls = CONFIGURABLE_ACTIONS.map(([label, key]) => `<fieldset class="field mb-16"><legend>${escapeHtml(label)}</legend>${ACTION_ROLES[key].map((role) => `<label class="checkline"><input type="checkbox" name="${key}" value="${role}" ${actionRoles(key).includes(role) ? "checked" : ""}> ${escapeHtml(ROLES[role].label)}</label>`).join("")}</fieldset>`).join("");
  showForm("Điều chỉnh quyền thao tác", `<p class="hint mb-16">Chỉ bật lại hoặc giới hạn các quyền trong phạm vi vai trò chuẩn. Không cấp quyền cho vai trò ngoài ma trận mặc định.</p>${controls}${inputField("reason", "Lý do thay đổi", "text", "", "required maxlength=240")}`, (data) => {
    if (!guardAction("configure-permissions")) return;
    const reason = data.get("reason").trim();
    if (!reason) return formError("Cần nhập lý do thay đổi quyền.");
    const next = {}, changes = [];
    for (const [label, key] of CONFIGURABLE_ACTIONS) {
      const previous = actionRoles(key);
      const requested = data.getAll(key);
      const allowed = ACTION_ROLES[key].filter((role) => requested.includes(role));
      if (allowed.length !== ACTION_ROLES[key].length) next[key] = allowed;
      if (previous.join() !== allowed.join()) changes.push(`${label}: ${previous.map((role) => ROLES[role].label).join(", ") || "Không cấp"} → ${allowed.map((role) => ROLES[role].label).join(", ") || "Không cấp"}`);
    }
    if (changes.length) {
      state.settings.actionRoles = next;
      addAudit("Cập nhật quyền vai trò", "Ma trận quyền", `${reason} · ${changes.join("; ")}`);
    }
    closeDialog(); render(true); toast(changes.length ? "Đã lưu ma trận quyền trên thiết bị." : "Không có quyền nào thay đổi.");
  });
}

function guardAction(action) {
  const roles = actionRoles(action);
  if (roles && workspaceStatus.conflict && !["restore-backup", "clear-workspace"].includes(action)) { toast("Có dữ liệu mới ở cửa sổ khác. Tải dữ liệu mới trước khi tiếp tục thay đổi.", "warning"); return false; }
  if (roles && !roles.includes(state.role)) {
    toast(roles.length ? `Thao tác thuộc quyền ${roles.map((role) => ROLES[role].label).join(" / ")}. Kiểm tra vai trò đang sử dụng.` : "Thao tác đã bị tắt trong ma trận quyền.", "warning");
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
  if (!quote) return;
  if (quoteEditable(quote)) return refreshQuoteTotals();
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
  if (source) { quote.version += 1; quote.sourceQuote = source.code; quote.confirmed = false; quote.validUntil = validUntil.toLocaleDateString("en-GB", { timeZone: "Asia/Ho_Chi_Minh" }); }
  state.ui.draftQuote = quote;
  navigate("quotes/new");
}

function quoteQtyValid(value) { return Number.isSafeInteger(value) && value > 0 && value <= 1000000000; }

function validateQuoteInput(input, valid, message) {
  if (input) {
    input.setCustomValidity(valid ? "" : message);
    input.classList.toggle("field-error", !valid);
    numericFieldFeedback(input, valid, message);
  }
  return valid;
}

function validateQuoteDiscount(input, discount, basis) {
  const fixed = discount.mode === "fixed";
  if (input) {
    input.max = fixed ? basis : 100;
    input.step = fixed ? "1" : "any";
  }
  const value = input ? input.valueAsNumber : discount.value;
  const valid = quoteDiscountValid({ ...discount, value }, basis);
  return validateQuoteInput(input, valid, fixed ? `Nhập số VND nguyên từ 0 đến ${money(basis)}.` : "Nhập tỷ lệ từ 0 đến 100%.");
}

function refreshQuoteTotals(quote = currentQuote()) {
  const totals = quoteTotals(quote);
  let validLines = true;
  for (const line of quote.lines) {
    const sku = CSS.escape(line.sku);
    const qty = viewElement.querySelector(`[data-qfield="qty"][data-sku="${sku}"]`);
    const discount = viewElement.querySelector(`[data-qfield="discount"][data-sku="${sku}"]`);
    const amounts = quoteLineTotals(line);
    const validQty = validateQuoteInput(qty, quoteQtyValid(qty ? qty.valueAsNumber : line.qty) && Number.isSafeInteger(amounts.subtotal), "Nhập số lượng nguyên dương sao cho giá trị dòng hợp lệ.");
    const validDiscount = validateQuoteDiscount(discount, quoteLineDiscount(line), amounts.subtotal);
    const validLine = validQty && validDiscount && Number.isSafeInteger(amounts.price) && amounts.price >= 0;
    validLines = validLines && validLine;
    const element = viewElement.querySelector(`[data-line-total="${sku}"]`);
    if (element) element.textContent = validLine ? money(amounts.total) : "—";
    const stock = viewElement.querySelector(`[data-stock-badge="${sku}"]`);
    if (stock) stock.innerHTML = quoteStockBadge(line);
  }
  validLines = validLines && Number.isSafeInteger(totals.subtotal);
  const wholeInput = viewElement.querySelector('[data-qfield="discount"]:not([data-sku])');
  const validWhole = validateQuoteDiscount(wholeInput, quoteWholeDiscount(quote), totals.afterLines);
  const valid = validLines && validWhole;
  const values = {
    "q-subtotal": validLines ? money(totals.subtotal) : "—",
    "q-line-discount": validLines ? discountMoney(totals.lineDiscount) : "—",
    "q-after-lines": validLines ? money(totals.afterLines) : "—",
    "q-whole-discount": valid ? discountMoney(totals.wholeDiscount) : "—",
    "q-discount": valid ? discountMoney(totals.discount) : "—",
    "q-total": valid ? money(totals.total) : "—"
  };
  Object.entries(values).forEach(([id, value]) => { const element = document.getElementById(id); if (element) element.textContent = value; });
  return valid;
}

function updateQuoteLine(input) {
  const quote = currentQuote();
  if (!quoteEditable(quote)) return;
  const { qfield, sku } = input.dataset;
  const line = sku && quote.lines.find((item) => item.sku === sku);
  if (sku && !line) return;
  if (qfield === "qty") {
    if (line && quoteQtyValid(input.valueAsNumber)) line.qty = input.valueAsNumber;
  } else {
    const switching = qfield === "discountMode";
    const mode = switching ? input.value : (line ? quoteLineDiscount(line) : quoteWholeDiscount(quote)).mode;
    const value = switching ? 0 : input.valueAsNumber;
    if (Number.isFinite(value) && value >= 0 && (mode !== "fixed" || Number.isSafeInteger(value))) {
      if (!line) quote.quoteDiscount = { mode, value };
      else if (mode === "fixed") { line.discountAmount = value; delete line.discount; }
      else { line.discount = value; delete line.discountAmount; }
    }
    // Changing the unit starts a new amount instead of treating VND as a percentage or vice versa.
    if (switching) input.parentElement.querySelector('[data-qfield="discount"]').value = "0";
  }
  refreshQuoteTotals(quote);
  scheduleWorkspaceSave();
}

function snapshotQuoteLine(line) {
  const { price, subtotal, discount } = quoteLineTotals(line);
  // Existing approval and sales views read a percentage; also retain the exact fixed amount.
  return { ...line, price, discount: line.discountAmount === undefined ? line.discount ?? 0 : subtotal ? (discount / subtotal) * 100 : 0 };
}

function saveQuote(submit = false) {
  const quote = currentQuote();
  if (!quoteEditable(quote)) return toast("Báo giá hiện chỉ được xem. Nhân bản để chỉnh sửa.", "warning");
  const valid = refreshQuoteTotals(quote);
  const invalid = viewElement.querySelector("[data-qfield]:invalid");
  if (invalid) { invalid.reportValidity(); return; }
  if (!quote.lines.length) return toast("Thêm ít nhất một sản phẩm trước khi lưu báo giá.", "warning");
  if (!valid) return toast("Kiểm tra số lượng, đơn giá và chiết khấu trước khi lưu báo giá.", "warning");
  if (submit && quote.lines.some((line) => productBySku(line.sku)?.status !== "product_active")) return toast("Loại bỏ sản phẩm đã ngừng kinh doanh trước khi gửi duyệt.", "warning");
  if (!/^(0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/.test(quote.validUntil)) return toast("Ngày hiệu lực cần có định dạng dd/MM/yyyy.", "warning");
  const parsedDate = new Date(`${isoDate(quote.validUntil)}T12:00:00Z`);
  if (!Number.isFinite(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== isoDate(quote.validUntil)) return toast("Ngày hiệu lực không tồn tại trong lịch.", "warning");
  if (submit && isoDate(quote.validUntil) < isoDate(todayText())) return toast("Không gửi duyệt báo giá đã hết hiệu lực.", "warning");
  for (const line of quote.lines) line.price ??= quoteLineTotals(line).price;
  if (quote.isNew) {
    quote.isNew = false;
    state.quotes.unshift(quote);
  } else state.quotes[state.quotes.findIndex((item) => item.code === quote.code)] = quote;
  if (state.ui.quoteWorkingCopies) delete state.ui.quoteWorkingCopies[quote.code];
  if (state.ui.draftQuote?.code === quote.code) state.ui.draftQuote = null;
  if (submit) {
    quote.status = "pending";
    const totals = quoteTotals(quote);
    const whole = quoteWholeDiscount(quote);
    const lineProposals = quote.lines.filter((line) => quoteLineDiscount(line).value).map((line) => `${line.sku}: ${quoteDiscountLabel(quoteLineDiscount(line))}`);
    const summary = [quote.note || "Đề nghị xem xét giá và chiết khấu cho báo giá."];
    if (lineProposals.length) summary.push(`Chiết khấu đề xuất theo dòng: ${lineProposals.join("; ")}.`);
    if (quote.lines.some((line) => line.discountAmount > 0)) summary.push("Tỷ lệ trong bảng là tỷ lệ quy đổi đối với dòng chiết khấu bằng VND.");
    if (whole.value) summary.push(`Chiết khấu toàn báo giá: ${quoteDiscountLabel(whole)} trên ${money(totals.afterLines)} sau chiết khấu dòng (giảm ${money(totals.wholeDiscount)}).`);
    const approval = {
      id: nextCode(state.approvals, "id", "AP-", 3), type: "discount", ref: quote.code,
      title: "Chiết khấu bán sỉ", assignee: "director", status: "pending", createdAt: nowStamp(), age: "Vừa gửi",
      requester: currentUser().name, amount: totals.total,
      summary: summary.join(" "), quoteDiscount: { ...whole },
      lines: quote.lines.map(snapshotQuoteLine), evidence: [`${quote.code} v${quote.version}`]
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

function customerShippingAddresses(customer) {
  const saved = customer?.type === "Bán sỉ" && Array.isArray(customer.shippingAddresses) ? customer.shippingAddresses : [];
  const addresses = [...new Set(saved.filter((address) => typeof address === "string").map((address) => address.trim()).filter(Boolean))];
  const legacy = typeof customer?.address === "string" ? customer.address.trim() : "";
  return addresses.length ? addresses : legacy ? [legacy] : [];
}

function shippingAddressFields(customer, current, label = "Địa chỉ nhận hàng") {
  const addresses = customerShippingAddresses(customer);
  const address = current?.trim() || addresses[0] || "";
  const manual = inputField("address", customer?.type === "Bán sỉ" && addresses.length ? "Địa chỉ khác" : label, "text", address, "required maxlength=240");
  if (customer?.type !== "Bán sỉ" || !addresses.length) return manual;
  return `${selectField("savedAddress", label, [...addresses.map((item, index) => [item, index === 0 ? `${item} (mặc định)` : item]), ["", "Nhập địa chỉ khác"]], addresses.includes(address) ? address : "")}<div id="manual-shipping-address">${manual}</div>`;
}

function updateShippingAddressField() {
  const form = document.getElementById("action-form");
  if (!form?.elements.savedAddress) return;
  const useSaved = !!form.elements.savedAddress.value;
  form.elements.address.disabled = useSaved;
  form.querySelector("#manual-shipping-address").classList.toggle("hidden", useSaved);
}

function selectedShippingAddress(data, customer) {
  const saved = data.get("savedAddress");
  if (saved) return customerShippingAddresses(customer).includes(saved) ? saved : "";
  const manual = (data.get("address") || "").trim();
  return manual.length <= 240 ? manual : "";
}

function showCustomerForm(id) {
  const existing = id ? customerById(id) : null;
  const value = (name) => existing?.[name] || "";
  const [primary = "", ...additional] = customerShippingAddresses(existing);
  showForm(existing ? "Chỉnh sửa khách hàng" : "Thêm khách hàng", `<div class="form-grid">${inputField("name", "Tên cá nhân / doanh nghiệp", "text", value("name"), "required maxlength=120")}${selectField("type", "Nhóm khách hàng", [["Bán sỉ", "Khách sỉ / doanh nghiệp"], ["Bán lẻ", "Khách lẻ / cá nhân"]], value("type"))}${inputField("phone", "Số điện thoại", "tel", value("phone"), "required minlength=8 maxlength=20")}${inputField("email", "Email", "email", value("email"))}${inputField("tax", "Mã số thuế (nếu có)", "text", value("tax"))}${inputField("invoiceAddress", "Địa chỉ xuất hóa đơn (nếu có)", "text", value("invoiceAddress"))}</div>
    ${inputField("address", "Địa chỉ giao hàng mặc định", "text", primary, "required maxlength=240")}
    <div id="additional-shipping-addresses">${field("additionalAddresses", "Địa chỉ giao hàng bổ sung", `<textarea class="textarea" id="form-additionalAddresses" name="additionalAddresses" rows="3">${escapeHtml(additional.join("\n"))}</textarea>`, "Mỗi địa chỉ một dòng. Có thể chọn lại khi tạo đơn hoặc bàn giao vận chuyển.")}</div>
    ${additional.length ? '<p id="retail-shipping-note" class="hint hidden">Khách lẻ chỉ giữ địa chỉ giao hàng mặc định khi lưu.</p>' : ""}`, (data) => {
    const phone = String(data.get("phone")).replace(/\D/g, "");
    if (phone.length < 8 || phone.length > 15) return formError("Số điện thoại cần từ 8 đến 15 chữ số.");
    if (state.customers.some((customer) => customer.id !== id && customer.phone.replace(/\D/g, "") === phone)) return formError("Số điện thoại đã thuộc hồ sơ khác. Kiểm tra để tránh tạo trùng.");
    const name = data.get("name").trim();
    if (!name) return formError("Nhập tên khách hàng.");
    const type = data.get("type");
    const address = data.get("address").trim();
    const extras = type === "Bán sỉ" ? (data.get("additionalAddresses") || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean) : [];
    const shippingAddresses = [address, ...extras];
    if (!address || shippingAddresses.some((item) => item.length > 240)) return formError("Nhập địa chỉ giao hàng mặc định; mỗi địa chỉ tối đa 240 ký tự.");
    if (new Set(shippingAddresses.map((item) => item.toLocaleLowerCase("vi"))).size !== shippingAddresses.length) return formError("Danh sách địa chỉ giao hàng không được trùng.");
    const fields = { name, contact: name, type, kind: type === "Bán sỉ" ? "business" : "individual", phone: data.get("phone"), email: data.get("email"), tax: data.get("tax"), address, shippingAddresses, invoiceAddress: data.get("invoiceAddress").trim() };
    if (existing) Object.assign(existing, fields);
    else state.customers.unshift({ id: nextCode(state.customers, "id", "KH-", 3), ...fields, ar: 0, orders: 0, note: "" });
    addAudit(existing ? "Cập nhật khách hàng" : "Tạo khách hàng", name, data.get("phone"));
    closeDialog(); render(true); toast("Đã lưu hồ sơ khách hàng.");
  }, { input: () => {
    const form = document.getElementById("action-form");
    if (!form?.elements.additionalAddresses) return;
    const wholesale = form.elements.type.value === "Bán sỉ";
    form.elements.additionalAddresses.disabled = !wholesale;
    form.querySelector("#additional-shipping-addresses").classList.toggle("hidden", !wholesale);
    form.querySelector("#retail-shipping-note")?.classList.toggle("hidden", wholesale);
  } });
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
  if (!record || record.status === "cancelled" || payment.amount > remainingOf(record)) throw new Error("Hồ sơ đã hủy, không tồn tại hoặc số tiền vượt phần còn phải thu.");
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
      syncIssueReadiness(order);
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
  const reason = String(confirmed ? savedReason : document.getElementById("decision-reason")?.value || "").trim();
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
    if (approve && quote && quoteIsExpired(quote)) return toast("Báo giá đã hết hiệu lực. Tạo phiên bản mới trước khi phê duyệt.", "warning");
    if (quote) quote.status = approve ? "approved" : "rejected";
  }
  if (approval.type === "purchase") {
    const request = state.purchaseRequests.find((item) => item.code === approval.ref);
    if (!request || request.status !== "pending") return toast("Yêu cầu mua không còn chờ xử lý.", "warning");
    request.approvals ||= { accountant: false, director: false };
    request.approvals[state.role] = approve;
    request.status = !approve ? "rejected" : request.approvals.accountant && request.approvals.director ? "approved" : "pending";
    if (!approve) {
      state.approvals.filter((item) => item !== approval && item.type === "purchase" && item.ref === request.code && item.status === "pending").forEach((item) => {
        item.status = "cancelled";
        item.decidedAt = nowStamp();
        item.decisionNote = "Đóng bước chờ vì yêu cầu mua đã bị từ chối.";
      });
    }
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
    const lock = stockLock(product.sku);
    if (lock) return formError(`SKU ${product.sku} đang khóa theo kỳ ${lock.code}.`);
    if (["completed", "cancelled", "failed", "overdue"].includes(order.status) || product.status !== "product_active") return formError("Đơn hoặc sản phẩm không còn được phân bổ hàng.");
    if (!orderEligible(order)) return formError(orderEligibilityReason(order));
    const contract = order.contract && contractByCode(order.contract);
    if (contract && !["active", "signed"].includes(contract.status)) return formError("Hợp đồng chưa hoàn tất ký kết.");
    if (!Number.isInteger(qty) || qty <= 0) return formError("Nhập số lượng nguyên dương.");
    if (qty > availableOf(product)) return formError(`Không thể giữ ${qty}: tồn khả dụng chỉ còn ${availableOf(product)} ${product.unit.toLowerCase()}.`);
    if (qty > line.qty - line.shipped - line.held) return formError("Số lượng giữ vượt phần chưa giao, chưa giữ của đơn.");
    product.held += qty; line.held += qty; order.status = "holding";
    const expiryDate = new Date(); expiryDate.setDate(expiryDate.getDate() + (state.settings.rules.holdDays || 0));
    state.reservations.unshift({ id: nextCode(state.reservations, "id", `GR-${new Date().getFullYear()}-`), order: order.code, customerId: order.customerId, sku: product.sku, qty, since: todayText(), expiry: state.settings.rules.holdDays ? expiryDate.toLocaleDateString("en-GB") : "", status: "holding", note: data.get("note") });
    syncIssueReadiness(order);
    addMovement("Giữ hàng", product.sku, qty, product.physical, product.held, order.code, data.get("note"));
    addAudit("Xác nhận giữ hàng", order.code, `${product.sku} · ${qty} ${product.unit}`, "success");
    closeDialog(); render(true); toast("Đã giữ hàng. Tồn vật lý không thay đổi.");
  }, { submitLabel: "Xác nhận giữ hàng", input: () => {
    const form = document.getElementById("action-form");
    if (!form) return;
    const product = productBySku(form.elements.sku.value);
    const order = orderByCode(form.elements.order.value);
    const preview = document.getElementById("reserve-preview");
    const lock = stockLock(product.sku);
    preview.textContent = lock ? `SKU ${product.sku} đang khóa theo kỳ ${lock.code}.` : `${orderEligibilityReason(order)}. Tồn khả dụng: ${availableOf(product)} ${product.unit.toLowerCase()} · Sau giữ: ${availableOf(product) - Number(form.elements.qty.value || 0)}.`;
    preview.className = `banner ${!lock && orderEligible(order) && Number(form.elements.qty.value) <= availableOf(product) ? "info" : "warning"} mt-16`;
  } });
}

function releaseReservation(id) {
  const reservation = state.reservations.find((item) => item.id === id);
  if (!reservation || reservation.status !== "holding") return toast("Bản ghi không còn giữ hàng.", "info");
  const lock = stockLock(reservation.sku);
  if (lock) return toast(`SKU ${reservation.sku} đang khóa theo kỳ ${lock.code}.`, "warning");
  showForm("Nhả giữ hàng", `${inputField("reason", "Lý do nhả giữ", "text", "", "required maxlength=200")}<div class="banner warning mt-16">Giải phóng ${reservation.qty} đơn vị cho ${escapeHtml(reservation.order)}; không thay đổi tồn vật lý.</div>`, (data) => {
    if (!data.get("reason").trim()) return formError("Cần nêu lý do nhả giữ.");
    if (!guardAction("release-reservation") || reservation.status !== "holding") return formError("Bản ghi không còn giữ hàng.");
    const currentLock = stockLock(reservation.sku);
    if (currentLock) return formError(`SKU ${reservation.sku} đang khóa theo kỳ ${currentLock.code}.`);
    const product = productBySku(reservation.sku);
    const order = orderByCode(reservation.order);
    const line = order?.lines.find((item) => item.sku === reservation.sku);
    product.held -= reservation.qty;
    if (line) line.held -= reservation.qty;
    reservation.status = "released";
    if (order) syncIssueReadiness(order);
    addMovement("Nhả giữ", reservation.sku, -reservation.qty, product.physical, product.held, reservation.order, data.get("reason"));
    addAudit("Nhả giữ hàng", reservation.id, data.get("reason"));
    closeDialog(); render(true); toast("Đã giải phóng lượng giữ.");
  }, { submitLabel: "Nhả giữ" });
}

function showRetailOrderForm() {
  return showRetailCart();
}

function canChangeOrder(order) {
  return order && ["draft", "pending_confirm", "pending_payment", "eligible", "holding"].includes(order.status) &&
    order.lines.every((line) => !line.shipped) && !state.issues.some((issue) => issue.order === order.code);
}

function orderReleasePlan(order, quantities) {
  const plan = [];
  for (const [index, line] of order.lines.entries()) {
    let left = line.held - quantities[index];
    if (left <= 0) continue;
    const product = productBySku(line.sku);
    const active = state.reservations.filter((item) => item.order === order.code && item.sku === line.sku && item.status === "holding");
    if (!product || product.held < line.held || active.reduce((sum, item) => sum + item.qty, 0) !== line.held) throw new Error(`Lượng giữ của ${line.sku} chưa khớp. Thủ kho cần đối chiếu trước khi đổi đơn.`);
    for (const reservation of active) {
      const qty = Math.min(left, reservation.qty);
      plan.push({ reservation, product, line, qty });
      left -= qty;
      if (!left) break;
    }
  }
  return plan;
}

function applyOrderRelease(plan, reason) {
  for (const { reservation, product, line, qty } of plan) {
    product.held -= qty;
    line.held -= qty;
    if (reservation.qty === qty) reservation.status = "released";
    else {
      reservation.qty -= qty;
      state.reservations.unshift({ ...reservation, id: nextCode(state.reservations, "id", `GR-${new Date().getFullYear()}-`), qty, status: "released", note: reason });
    }
    addMovement("Nhả giữ", product.sku, -qty, product.physical, product.held, reservation.order, reason);
  }
}

function showOrderChange(code, cancel = false) {
  const action = cancel ? "cancel-order" : "edit-order";
  const order = orderByCode(code);
  if (!guardAction(action) || !canChangeOrder(order)) return;
  const customer = customerById(order.customerId);
  const addressFields = cancel ? "" : shippingAddressFields(customer, order.address);
  const editableQty = !cancel && !order.contract;
  const quantities = editableQty ? order.lines.map((line, index) => inputField(`qty-${index}`, productName(line.sku), "number", line.qty, "required min=1 step=1")).join("") : "";
  const explanation = cancel ? "Hủy đơn sẽ nhả toàn bộ lượng giữ. Không tự hoàn tiền hoặc hủy hợp đồng liên quan." : order.contract ? "Số lượng đơn sỉ theo hợp đồng. Chỉ được đổi địa chỉ tại đây." : "Giảm lượng đặt sẽ nhả phần giữ thừa. Nếu đã thu vượt giá trị mới, phần chênh lệch được ghi nhận để Kế toán đối chiếu, không tự hoàn tiền.";
  showForm(cancel ? "Hủy đơn hàng" : "Cập nhật đơn hàng", `${cancel ? "" : `<div class="form-grid">${addressFields}${quantities}</div>`}${inputField("reason", "Lý do", "text", "", "required maxlength=240")}<div class="banner warning mt-16">${explanation}</div>`, (data) => {
    if (!guardAction(action) || !canChangeOrder(order)) return formError("Đơn không còn ở trạng thái được sửa hoặc hủy.");
    const reason = data.get("reason").trim();
    if (!reason) return formError("Cần nhập lý do.");
    const next = order.lines.map((line, index) => cancel ? 0 : editableQty ? Number(data.get(`qty-${index}`)) : line.qty);
    if (!cancel && next.some((qty, index) => !Number.isSafeInteger(qty) || qty < 1 || (qty > order.lines[index].qty && qty > (order.lines[index].held + availableOf(productBySku(order.lines[index].sku)))))) return formError("Số lượng không hợp lệ hoặc vượt tồn khả dụng.");
    const address = cancel ? "" : selectedShippingAddress(data, customer);
    if (!cancel && !address) return formError("Chọn hoặc nhập địa chỉ nhận hàng hợp lệ.");
    const changedQty = editableQty && next.some((qty, index) => qty !== order.lines[index].qty);
    const total = changedQty ? order.lines.reduce((sum, line, index) => sum + line.price * next[index], 0) : order.total;
    const pending = state.payments.filter((item) => item.record === order.code && item.status === "pending_confirm").reduce((sum, item) => sum + item.amount, 0);
    if (!order.contract && pending && (cancel || (changedQty && total < order.paid + pending))) return formError("Kế toán cần xử lý giao dịch đang chờ đối chiếu trước.");
    if (changedQty && (!Number.isSafeInteger(total) || total <= 0)) return formError("Giá trị đơn mới không hợp lệ.");
    if (changedQty && total > order.paid && order.lines.some((line) => line.held > 0)) return formError("Đơn đang giữ hàng. Không tăng giá trị đơn vượt số tiền đã xác nhận.");
    const plan = orderReleasePlan(order, next);
    const lock = stockLock(plan.map(({ product }) => product.sku));
    if (lock) return formError(`Có SKU cần nhả giữ đang khóa theo kỳ ${lock.code}.`);
    const previous = order.status;
    applyOrderRelease(plan, reason);
    if (cancel) {
      order.status = "cancelled";
      order.cancelReason = reason;
    } else {
      order.address = address;
      if (changedQty) {
        order.lines.forEach((line, index) => { line.qty = next[index]; });
        order.total = total;
      }
      order.status = order.lines.some((line) => line.held > 0) ? "holding" : orderEligible(order) ? "eligible" : "pending_payment";
    }
    if (!order.contract) order.paymentAdjustment = Math.max(0, order.paid - (cancel ? 0 : order.total));
    syncIssueReadiness(order);
    syncCustomerBalances();
    addAudit(cancel ? "Hủy đơn hàng" : "Cập nhật đơn hàng", code, `${previous} → ${order.status} · ${reason}${order.paymentAdjustment ? ` · Tiền chờ Kế toán xử lý: ${money(order.paymentAdjustment)}` : ""}`);
    closeDialog(); render(true); toast(cancel ? "Đã hủy đơn và nhả hàng giữ." : "Đã cập nhật đơn hàng.");
  }, { submitLabel: cancel ? "Xác nhận hủy" : "Lưu thay đổi", input: cancel ? undefined : updateShippingAddressField });
}

function issuePlan(order) {
  const fail = (error) => ({ error });
  if (!orderEligible(order)) return fail(orderEligibilityReason(order));
  const lines = order.lines.filter((line) => line.held > 0).map((line) => ({ sku: line.sku, qty: line.held }));
  if (!lines.length) return fail("Đơn chưa có lượng hàng đang giữ.");
  const contract = order.contract ? contractByCode(order.contract) : null;
  let shipment;
  if (contract) {
    if (contract.status !== "active") return fail("Hợp đồng chưa đủ điều kiện thực hiện.");
    shipment = contract.shipments.find((entry) => {
      const required = entry.remainingItems ?? entry.items;
      return entry.status !== "delivered" && !entry.delivery && required.length === lines.length && required.every((item) => lines.some((line) => line.sku === item.sku && line.qty === item.qty));
    });
    if (!shipment) return fail("Lượng đang giữ cần khớp một đợt giao chưa xuất trong hợp đồng.");
  } else if (!order.lines.every((line) => line.held === line.qty - line.shipped)) return fail("Đơn lẻ cần giữ đủ lượng hàng còn phải giao trước khi yêu cầu xuất.");
  for (const line of order.lines.filter((entry) => entry.held > 0)) {
    const product = productBySku(line.sku);
    const reserved = state.reservations.filter((item) => item.order === order.code && item.sku === line.sku && item.status === "holding").reduce((sum, item) => sum + item.qty, 0);
    if (!product || !Number.isSafeInteger(line.held) || line.held !== reserved || line.held > line.qty - line.shipped || line.held > product.physical - product.damaged || line.held > product.held) return fail("Số lượng xuất không khớp đơn, phiếu giữ hoặc tồn thực tế.");
  }
  return { lines, shipment, contract };
}

function issuePlanKey(plan) {
  return plan.error ? "" : JSON.stringify([plan.shipment?.id || "", [...plan.lines].sort((a, b) => a.sku.localeCompare(b.sku))]);
}

function syncIssueReadiness(order) {
  const key = issuePlanKey(issuePlan(order));
  if (key && order.issueReadiness?.key === key) return;
  if (order.issueRequest?.status === "pending") {
    closeIssueRequest(order);
    addAudit("Đóng yêu cầu xuất kho", order.code, "Lượng giữ hoặc điều kiện xuất đã thay đổi.");
  }
  order.issueReadiness = key ? { key, readyAt: new Date().toISOString() } : null;
}

function closeIssueRequest(order) {
  const request = order.issueRequest;
  request.status = "cancelled";
  const recorded = order.issueRequests?.find((entry) => entry.requestedAt === request.requestedAt);
  if (recorded) recorded.status = "cancelled";
}

function requestIssue(code) {
  const order = orderByCode(code);
  if (!order || !guardAction("request-issue")) return;
  const plan = issuePlan(order);
  if (plan.error) return toast(plan.error, "warning");
  syncIssueReadiness(order);
  if (order.issueRequest?.status === "pending") return toast("Đơn đã có yêu cầu xuất đang chờ Thủ kho.", "warning");
  const requestedAt = new Date().toISOString();
  const request = { status: "pending", key: issuePlanKey(plan), lines: plan.lines, shipmentId: plan.shipment?.id || "", readyAt: order.issueReadiness.readyAt, requestedAt, requestedBy: currentUser().name, actorId: state.activeUserId };
  order.issueReadiness.requestedAt ||= requestedAt;
  order.issueRequests ||= [];
  order.issueRequests.push(request);
  order.issueRequest = request;
  addAudit("Yêu cầu xuất kho", code, plan.lines.map((line) => `${line.sku}: ${line.qty}`).join(" · "), "info");
  render(true); toast("Đã gửi yêu cầu xuất cho Thủ kho. Chưa trừ tồn.");
}

function issueOrder(code) {
  const order = orderByCode(code);
  const validate = () => {
    const plan = issuePlan(order);
    if (plan.error) return plan;
    const lock = stockLock(plan.lines.map((line) => line.sku));
    if (lock) return { error: `Hàng đang khóa kiểm kê ${lock.code}. Hoàn tất kỳ trước khi xuất.` };
    const request = order.issueRequest;
    if (request?.status !== "pending" || request.key !== issuePlanKey(plan)) return { error: "Cần yêu cầu xuất hợp lệ từ Bán hàng, khớp lượng đang giữ." };
    return plan;
  };
  if (!order || !guardAction("issue-order")) return;
  const { error } = validate();
  if (error) return toast(error, "warning");
  confirmAction("Xác nhận xuất kho", `Xuất lượng đang giữ của ${code}. Giao dịch sẽ giảm tồn vật lý và giải phóng lượng giữ tương ứng.`, () => {
    if (!guardAction("issue-order")) return;
    const { error: conflict, contract, shipment } = validate();
    if (conflict) return toast(conflict, "error");
    const request = order.issueRequest;
    const issue = { code: nextCode(state.issues, "code", `PX-${new Date().getFullYear()}-`), order: code, customerId: order.customerId, date: todayText(), status: "issued", owner: currentUser().name, lines: [], requestedAt: request.requestedAt, requestedBy: request.requestedBy };
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
    request.status = "issued";
    const recorded = order.issueRequests?.find((entry) => entry.requestedAt === request.requestedAt);
    if (recorded) Object.assign(recorded, { status: "issued", issue: issue.code });
    order.issueReadiness = null;
    const delivery = { code: nextCode(state.deliveries, "code", `GH-${new Date().getFullYear()}-`), order: code, customerId: order.customerId, issue: issue.code, contract: contract?.code || "", shipmentId: shipment?.id || "", items: structuredClone(issue.lines), carrier: "", address: order.address || "", planned: shipment?.date || todayText(), status: "delivery_pending", fee: 0, payer: "SoulWine", note: "Chờ bàn giao vận chuyển" };
    state.deliveries.unshift(delivery);
    if (shipment) { shipment.delivery = delivery.code; shipment.status = "issued"; }
    addAudit("Xác nhận xuất kho", issue.code, code, "success");
    render(true); toast(`Đã lập ${issue.code} và ghi giảm tồn.`);
  });
}

function showContractForm() {
  const canUseQuote = (quote) => quote?.status === "approved" && quote.confirmed && !quoteIsExpired(quote) && !state.contracts.some((contract) => contract.quote === quote.code);
  const quotes = state.quotes.filter(canUseQuote);
  if (!quotes.length) return toast("Cần báo giá còn hiệu lực, đã duyệt, đã được khách xác nhận và chưa có hợp đồng.", "info");
  showForm("Tạo hợp đồng từ báo giá", `<div class="form-grid">${selectField("quote", "Báo giá nguồn", quotes.map((quote) => [quote.code, `${quote.code} · ${customerName(quote.customerId)}`]))}${selectField("scheme", "Thanh toán", [["50/50", "50/50 theo thỏa thuận"], ["100%", "100% trước giao hàng"]])}${inputField("due", "Hạn thanh toán", "date", isoDate(todayText()), "required")}</div>`, (data) => {
    const quote = quoteByCode(data.get("quote"));
    if (!canUseQuote(quote)) return formError("Báo giá không còn đủ điều kiện để lập hợp đồng.");
    const contract = { code: nextCode(state.contracts, "code", `HĐ-${new Date().getFullYear()}-`), customerId: quote.customerId, quote: quote.code, owner: currentUser().name, value: quoteTotals(quote).total, paid: 0, status: "checking", scheme: data.get("scheme"), due: displayDate(data.get("due")), signedAt: "", lines: quote.lines.map(snapshotQuoteLine), quoteDiscount: { ...quoteWholeDiscount(quote) }, checklist: { customerConfirm: false, accountantCheck: false, directorSign: false, customerSign: false, scan: false }, shipments: [] };
    state.contracts.unshift(contract);
    addAudit("Tạo hợp đồng", contract.code, quote.code);
    closeDialog(); navigate(`contracts/${encodeURIComponent(contract.code)}`); toast("Đã tạo hợp đồng, chuyển Kế toán kiểm tra.");
  }, { submitLabel: "Tạo hợp đồng" });
}

const CONTRACT_CHECK_ROLES = { customerConfirm: ["sales_manager", "sales_staff"], accountantCheck: ["accountant"], directorSign: ["director"], customerSign: ["sales_manager", "accountant"], scan: ["sales_manager", "accountant"] };

function contractCheckError(contract, name) {
  if (!contract || !CONTRACT_CHECK_ROLES[name]?.includes(state.role)) return "Bước này cần người đúng thẩm quyền xác nhận.";
  if (!["checking", "pending_sign"].includes(contract.status) || contract.checklist[name]) return "Bước ký kết không còn chờ xử lý.";
  if (name === "customerConfirm" && !contract.checklist.accountantCheck) return "Kế toán cần kiểm tra điều khoản trước khi khách xác nhận nội dung.";
  if (name === "directorSign" && (!contract.checklist.accountantCheck || !contract.checklist.customerConfirm)) return "Cần Kế toán kiểm tra và khách xác nhận nội dung trước khi Giám đốc ký.";
  if (name === "customerSign" && !contract.checklist.directorSign) return "Cần Giám đốc ký trước khi ghi nhận khách hoàn tất ký.";
  if (name === "scan" && (!contract.checklist.directorSign || !contract.checklist.customerSign)) return "Chỉ tải bản scan sau khi cả hai bên đã ký.";
  return "";
}

function updateContractCheck(code, name) {
  const contract = contractByCode(code);
  const error = contractCheckError(contract, name);
  if (error) return toast(error, "warning");
  if (name === "scan") return chooseFile((files) => {
    contract.checklist.scan = true;
    contract.scanName = files[0].name; contract.scanId = files[0].id;
    const existing = state.documents.find((item) => item.type === "Hợp đồng" && item.record === code);
    if (existing) { existing.file = files[0].name; existing.fileId = files[0].id; }
    else state.documents.unshift({ code, type: "Hợp đồng", record: code, date: todayText(), file: files[0].name, fileId: files[0].id, owner: currentUser().name });
    addAudit("Lưu hợp đồng đã ký", code, files[0].name);
    finishContractSignature(contract);
  }, false, code);
  contract.checklist[name] = true;
  if (name === "accountantCheck") { contract.status = "pending_sign"; if (contract.changeRequest) contract.changeRequestResolved = true; }
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
    state.orders.filter((order) => order.contract === code).forEach(syncIssueReadiness);
    addAudit("Lập đợt giao", code, displayDate(data.get("date")));
    closeDialog(); render(true); toast("Đã thêm đợt giao, không thay đổi lịch thanh toán.");
  });
}

function updateReceiptInput(input) {
  if (!state.loggedIn || workspaceStatus.conflict || !["warehouse_manager", "warehouse_staff"].includes(state.role)) return;
  const receipt = receiptByCode(input.dataset.code);
  if (!receipt || receipt.status !== "receiving") return;
  if (input.dataset.rcField === "varianceNote") {
    if (receipt.source) return;
    receipt.varianceNote = input.value.slice(0, 1000);
    refreshReceiptEditor(receipt);
    scheduleWorkspaceSave();
    return;
  }
  if (!["received", "good", "damaged"].includes(input.dataset.rcField)) return;
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
  if (!guardAction(returnLot ? "return-receipt" : "confirm-receipt") || !receipt || receipt.status !== "receiving") return;
  if (receipt.source && returnLot) return;
  const order = receipt.po && !receipt.source ? state.purchaseOrders.find((item) => item.code === receipt.po) : null;
  const activePoAttempt = () => !receipt.po || receipt.source || (order && state.purchaseOrders.includes(order) && order.receipt === code && order.status === "receiving");
  if (!activePoAttempt()) return toast("Phiếu không còn là lần tiếp nhận hiện tại của đơn đặt hàng.", "warning");
  const canRefuse = () => order && receiptOverThreshold(receipt) && receipt.lines.every((line) => line.good + line.damaged === line.received);
  if (returnLot && !canRefuse()) return toast("Chỉ trả lô đã đối chiếu đầy đủ và vượt ngưỡng sai lệch đã cấu hình.", "warning");
  if (!returnLot && !receipt.source && receiptThreshold(receipt) === null) return toast("Thiết lập ngưỡng sai lệch trong Cài đặt trước khi xác nhận nhập.", "warning");
  if (!receiptCountsComplete(receipt)) return toast("Nhập đủ số thực nhận, đạt và lỗi cho mọi dòng trước khi quyết định.", "warning");
  const validVarianceNote = () => !receiptHasVariance(receipt) || !!String(receipt.varianceNote || "").trim();
  const missingVarianceNote = () => { refreshReceiptEditor(receipt); toast("Ghi loại và nguyên nhân sai lệch trước khi xác nhận kết quả.", "warning"); };
  if (!validVarianceNote()) return missingVarianceNote();
  if (!receipt.source && String(receipt.varianceNote || "").length > 1000) return toast("Loại và nguyên nhân sai lệch không được vượt 1000 ký tự.", "warning");
  if (!receipt.evidence.length) return toast("Đính kèm phiếu giao / biên bản kiểm đếm trước khi xác nhận kết quả.", "warning");
  const receiptLock = () => stockLock(receipt.lines.map((line) => line.sku));
  const lock = !returnLot && receiptLock();
  if (lock) return toast(`Có SKU nhập đang khóa theo kỳ ${lock.code}.`, "warning");
  if (!returnLot && receiptOverThreshold(receipt)) return toast("Sai lệch vượt ngưỡng: phải trả lô và yêu cầu giao lại.", "warning");
  if (!returnLot && receipt.lines.some((line) => line.good + line.damaged !== line.received)) return toast("Hàng đạt + hư hỏng phải bằng thực nhận ở từng dòng.", "warning");
  const actor = state.activeUserId;
  const snapshot = () => JSON.stringify([receipt.lines, receipt.evidence, receipt.varianceNote, receiptThreshold(receipt)]);
  const reviewed = snapshot();
  confirmAction(returnLot ? "Trả lô hàng" : "Xác nhận nhập kho", returnLot ? "Không ghi tăng tồn. Lưu yêu cầu nhà cung cấp giao lại." : "Ghi tăng tồn vật lý theo thực nhận; hàng lỗi được tách khỏi tồn khả dụng.", () => {
    if (receiptByCode(code) !== receipt || receipt.status !== "receiving" || !guardAction(returnLot ? "return-receipt" : "confirm-receipt")) return;
    if (!validVarianceNote()) return missingVarianceNote();
    if (!state.loggedIn || state.activeUserId !== actor || snapshot() !== reviewed) return toast("Dữ liệu tiếp nhận đã thay đổi. Kiểm tra lại trước khi xác nhận.", "warning");
    if (!activePoAttempt() || (returnLot && !canRefuse())) return toast("Dữ liệu tiếp nhận không còn đủ điều kiện xác nhận.", "warning");
    const currentLock = !returnLot && receiptLock();
    if (currentLock) return toast(`Có SKU nhập đang khóa theo kỳ ${currentLock.code}.`, "error");
    if (!receiptCountsComplete(receipt) || !receipt.evidence.length || (!returnLot && ((!receipt.source && receiptThreshold(receipt) === null) || receiptOverThreshold(receipt) || receipt.lines.some((line) => line.good + line.damaged !== line.received)))) return toast("Dữ liệu tiếp nhận không còn đủ điều kiện xác nhận.", "warning");
    const threshold = receiptThreshold(receipt);
    if (!returnLot) receipt.lines.forEach((line) => {
      const product = productBySku(line.sku);
      product.physical += line.received; product.damaged += line.damaged;
      addMovement("Nhập kho", product.sku, line.received, product.physical, product.held, receipt.code, `${line.good} đạt; ${line.damaged} lỗi`);
    });
    receipt.status = returnLot ? "returned" : "completed";
    const supplier = state.suppliers.find((item) => item.id === receipt.supplier);
    if (supplier && !returnLot) supplier.lastDelivery = todayText();
    if (order) {
      receipt.decidedAt = new Date().toISOString();
      receipt.decidedBy = currentUser().name;
      order.status = returnLot ? "returned" : "completed";
    }
    receipt.threshold = threshold;
    if (!receipt.source) receipt.varianceNote = String(receipt.varianceNote || "").trim();
    addAudit(returnLot ? "Trả lô hàng" : "Xác nhận nhập kho", code, receipt.source ? `${receipt.source} · ${receipt.note}` : `${receipt.po}${receipt.varianceNote ? ` · ${receipt.varianceNote}` : ""}`, returnLot ? "danger" : "success");
    render(true); toast(returnLot ? "Đã ghi trả lô, yêu cầu giao lại." : "Đã nhập kho và ghi thẻ kho.");
  }, returnLot);
}

function updateStocktakeInput(input) {
  if (workspaceStatus.conflict || !["warehouse_manager", "warehouse_staff"].includes(state.role)) return;
  const stocktake = stocktakeByCode(input.dataset.code);
  const line = stocktake?.lines.find((item) => item.sku === input.dataset.sku);
  if (!line || stocktake.status !== "counting" || !isStocktakeLocked(stocktake)) return;
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
  const canAdjust = () => line && line.count !== null && isStocktakeLocked(stocktake) && ["reconciling", "reported"].includes(stocktake.status);
  if (!guardAction("open-adjustment")) return;
  if (!canAdjust()) return toast("Hoàn tất đếm trước khi giải trình điều chỉnh.", "warning");
  showForm("Giải trình chênh lệch", `<div class="banner warning mb-16">${escapeHtml(productName(sku))} · Sổ sách ${line.system} · Đếm ${line.count} · Lệch ${line.count - line.system}</div>${inputField("reason", "Nguyên nhân đã kiểm tra / đếm lại", "text", line.note, "required maxlength=240")}<p class="hint mt-12">Chỉ ghi nhận căn cứ. Tồn được điều chỉnh một lần khi hoàn tất kỳ kiểm kê.</p>`, (data) => {
    if (!guardAction("open-adjustment") || stocktakeByCode(code) !== stocktake || !canAdjust()) return formError("Kỳ không còn ở trạng thái đối chiếu.");
    if (!data.get("reason").trim()) return formError("Cần ghi nguyên nhân chênh lệch.");
    line.note = data.get("reason").trim(); line.reviewed = true;
    addAudit("Xác nhận chênh lệch kiểm kê", code, `${sku}: ${line.note}`);
    closeDialog(); render(true); toast("Đã xác nhận căn cứ; chưa thay đổi tồn.");
  }, { submitLabel: "Xác nhận nguyên nhân" });
}

function completeStocktake(code) {
  const stocktake = stocktakeByCode(code);
  const validate = () => {
    if (!stocktake || stocktakeByCode(code) !== stocktake || !isStocktakeLocked(stocktake) || !["reconciling", "reported"].includes(stocktake.status)) return "Cần hoàn tất đếm, đối chiếu trước khi đóng kỳ.";
    if (!stocktake.lines.length || stocktake.lines.some((line) => !Number.isSafeInteger(line.count) || line.count < 0)) return "Còn mã chưa có số kiểm đếm hợp lệ.";
    if (stocktake.lines.some((line) => line.count !== line.system && !line.reviewed)) return "Mỗi mã chênh lệch phải được kiểm tra và xác nhận nguyên nhân qua nút Điều chỉnh.";
    if (stocktake.lines.some((line) => {
      const product = productBySku(line.sku);
      return !product || line.count < product.held + product.damaged;
    })) return "SKU không còn tồn tại hoặc số đếm thấp hơn lượng giữ + hàng lỗi.";
  };
  if (!guardAction("complete-stocktake")) return;
  const error = validate();
  if (error) return toast(error, "warning");
  confirmAction("Hoàn tất kiểm kê & mở khóa", "Áp dụng kết quả đã kiểm tra, lưu biên bản và giải phóng khóa của kỳ này. Không thể sửa kỳ đã hoàn tất.", () => {
    if (!guardAction("complete-stocktake")) return;
    const currentError = validate();
    if (currentError) return toast(currentError, "warning");
    stocktake.lines.forEach((line) => {
      const product = productBySku(line.sku);
      const variance = line.count - product.physical;
      if (variance) { product.physical = line.count; addMovement("Điều chỉnh tồn", line.sku, variance, product.physical, product.held, code, line.note); }
    });
    stocktake.status = "completed"; stocktake.locked = false; stocktake.reportTo = nowStamp();
    stocktake.closedAt = new Date().toISOString();
    stocktake.closedLines = stocktake.lines.map((line) => ({ sku: line.sku, count: line.count, final: productBySku(line.sku).physical }));
    addAudit("Hoàn tất kiểm kê & mở khóa", code, "Đã lưu biên bản và báo cáo Giám đốc", "success");
    state.ui.stocktakeTab = "report"; render(true); toast("Kỳ kiểm kê hoàn tất. Đã giải phóng khóa của kỳ này.");
  });
}

function showNewStocktakeForm() {
  if (!guardAction("new-stocktake")) return;
  const warehouseLock = state.stocktakes.find((period) => isStocktakeLocked(period) && !isGroupStocktake(period));
  if (warehouseLock) return toast(`Đang có kỳ ${warehouseLock.code} khóa toàn kho.`, "warning");
  if (!state.products.length) return toast("Thêm sản phẩm trước khi tạo kỳ kiểm kê.", "info");
  const categories = [...new Set(state.products.map((product) => product.category).filter((category) => typeof category === "string" && category.trim()))].sort((a, b) => a.localeCompare(b, "vi"));
  showForm("Tạo kỳ kiểm kê", `<div class="form-grid">${selectField("scopeType", "Phạm vi kiểm kê", [["whole", "Toàn bộ kho"], ["group", "Theo nhóm hàng"]], "whole")}${selectField("category", "Nhóm hàng", [["", "Chọn nhóm hàng"], ...categories.map((category) => [category, category])])}</div><div class="banner locked mt-16">Khi bắt đầu, hệ thống ghi thời điểm hiện tại và chụp số tồn của các SKU trong phạm vi chọn. Chỉ các SKU thuộc phạm vi đó bị khóa.</div>`, (data) => {
    if (!guardAction("new-stocktake")) return;
    const scopeType = data.get("scopeType");
    const category = scopeType === "group" ? data.get("category") : "";
    if (!["whole", "group"].includes(scopeType) || (scopeType === "group" && !categories.includes(category))) return formError("Chọn phạm vi và nhóm hàng hợp lệ.");
    const products = state.products.filter((product) => scopeType === "whole" || product.category === category);
    if (!products.length) return formError("Không có SKU trong phạm vi kiểm kê đã chọn.");
    const lock = scopeType === "whole" ? stockLock() : stockLock(products.map((product) => product.sku)) || state.stocktakes.find((period) => isStocktakeLocked(period) && period.category === category);
    if (lock) return formError(`Phạm vi đã bị khóa bởi kỳ ${lock.code}.`);
    const code = nextCode(state.stocktakes, "code", `KK-${new Date().getFullYear()}-`, 2);
    const scope = scopeType === "whole" ? "Toàn bộ kho" : `Nhóm: ${category}`;
    state.stocktakes.unshift({ code, scope, scopeType, ...(category ? { category } : {}), started: nowStamp(), startedAt: new Date().toISOString(), status: "counting", locked: true, owner: currentUser().name, reportTo: "", lines: products.map((product) => ({ sku: product.sku, system: product.physical, count: null, note: "" })) });
    addAudit("Tạo kỳ kiểm kê", code, `${scope} · ${products.length} SKU · Khóa giao dịch kho`);
    closeDialog(); navigate(`stocktakes/${code}`);
  }, { submitLabel: "Bắt đầu kiểm kê", input: () => {
    const fields = document.getElementById("action-form")?.elements;
    if (fields) { fields.category.disabled = fields.scopeType.value !== "group"; fields.category.required = !fields.category.disabled; }
  } });
}

function canCancelStocktake(period) {
  return state.loggedIn && state.role === "warehouse_manager" && state.settings.rules.allowStocktakeCancellation === true &&
    period && isStocktakeLocked(period) && ["counting", "reconciling", "reported"].includes(period.status);
}

function showCancelStocktakeForm(code) {
  const period = stocktakeByCode(code);
  if (!guardAction("cancel-stocktake")) return;
  if (!canCancelStocktake(period)) return toast("Kỳ không thể hủy hoặc quy tắc hủy chưa được Giám đốc bật.", "warning");
  showForm("Hủy kỳ kiểm kê", `${inputField("reason", "Lý do hủy", "text", "", "required maxlength=240")}<div class="banner warning mt-16">Xác nhận hủy sẽ kết thúc kỳ, giữ nguyên số đã đếm và mở khóa phạm vi của kỳ này. Không ghi điều chỉnh tồn.</div>`, (data) => {
    if (!guardAction("cancel-stocktake") || stocktakeByCode(code) !== period || !canCancelStocktake(period)) return formError("Kỳ không còn được phép hủy.");
    const reason = String(data.get("reason") ?? "").trim();
    if (!reason || reason.length > 240) return formError("Nhập lý do hủy, tối đa 240 ký tự.");
    Object.assign(period, { status: "cancelled", locked: false, cancellationReason: reason, cancelledAt: new Date().toISOString(), cancelledBy: state.activeUserId });
    addAudit("Hủy kỳ kiểm kê", code, `${reason} · Không điều chỉnh tồn`, "warning");
    state.ui.stocktakeTab = "history";
    closeDialog(); render(true); toast("Đã hủy kỳ và giải phóng khóa; tồn kho không thay đổi.");
  }, { submitLabel: "Xác nhận hủy kỳ" });
}

function showCustomer(id) {
  const customer = customerById(id);
  if (!customer) return;
  showDialog({ drawer: true, title: customer.name, subtitle: `${customer.id} · ${customer.type}`, body: customerDetailHtml(customer),
    footer: ACTION_ROLES["edit-customer"].includes(state.role) ? `<button class="btn btn-primary" data-action="edit-customer" data-id="${escapeHtml(customer.id)}">${icon("edit")}Chỉnh sửa hồ sơ</button>` : "" });
}

function showProduct(sku) {
  const product = productBySku(sku);
  if (!product) return;
    showDialog({ drawer: true, title: product.name, subtitle: `${product.sku} · ${product.origin}`, body: `${productCell(sku)}<div class="divider"></div><div class="kv-grid">${[["Nhóm", product.category], ["Nồng độ", product.abv], ["Dung tích", product.volume], ["Đơn vị", product.unit], ["Giá lẻ", money(product.retail)], ["Giá sỉ", money(product.wholesale)], ["Tồn vật lý", product.physical], ["Đang giữ", product.held], ["Hàng lỗi", product.damaged], ["Khả dụng", availableOf(product)]].map(([label, value]) => `<div><div class="kv-label">${escapeHtml(label)}</div><div class="kv-value">${escapeHtml(value)}</div></div>`).join("")}</div><div class="divider"></div>${statusChip(product.status)}<p class="hint mt-12">Nhà cung cấp: ${escapeHtml(supplierName(product.supplier))}</p><button class="btn btn-secondary btn-block" type="button" data-action="product-history" data-sku="${escapeHtml(product.sku)}">${icon("history")} Xem lịch sử giao dịch (thẻ kho)</button>`, footer: ACTION_ROLES["toggle-product"].includes(state.role) ? `<button class="btn btn-secondary" data-action="toggle-product" data-sku="${sku}">${product.status === "product_active" ? "Ngừng kinh doanh" : "Mở lại kinh doanh"}</button>` : "" });
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
    showDialog(supplierDetails(supplier));
  } else if (kind === "request") {
    const request = state.purchaseRequests.find((item) => item.code === code);
    if (!request) return;
    showDialog({ drawer: true, title: code, subtitle: supplierName(request.supplier), body: `${statusChip(request.status)}<p class="small muted mt-16">${escapeHtml(request.note)}</p><p class="strong mt-12">${money(request.amount)}</p>${request.lines.map((line) => `<div class="picker-row">${productCell(line.sku)}<strong>${line.qty}</strong></div>`).join("")}<div class="mt-16"><div class="section-title">Báo giá nhà cung cấp</div>${purchaseAttachment(request.quoteAttachmentId, request.code)}</div>${purchaseRequestProcessing(request)}${routeAllowed("approvals") ? '<a class="btn btn-secondary mt-16" href="#/approvals">Mở phê duyệt</a>' : ""}` });
  } else if (kind === "purchase-order") {
    const order = state.purchaseOrders.find((item) => item.code === code);
    if (order) showDialog({ drawer: true, wide: true, title: code, subtitle: supplierName(order.supplier), body: purchaseOrderDetails(order) });
  } else if (kind === "delivery") {
    const delivery = state.deliveries.find((item) => item.code === code);
    if (delivery) showDialog(deliveryDetails(delivery));
  } else if (kind === "return") {
    const item = state.returns.find((entry) => entry.code === code);
    if (item) showDialog(returnDetails(item));
  }
}

function dispatchAction(action, data = {}) {
  if (!guardAction(action)) return;
  if (action === "auto-purchase-request") return showPurchaseRequestForm(true);
  if (action === "create-basic-receipt") return handleManagementAction(action, data);
  if (action === "redeliver-po" && data.previous) return showReceiptForm(data.code, data.previous);
  if (action === "record-supplier-payment" || action === "record-purchase-cost") return showPurchaseFinanceForm(data.code, action === "record-purchase-cost");
  if (action === "open-po") return showSecondaryDetails("purchase-order", data.code);
  const managementActions = ["new-product", "edit-product", "new-supplier", "opening-stock", "new-purchase-request", "create-po", "create-receipt", "create-wholesale-order", "schedule-delivery", "new-return", "add-cart-row", "remove-cart-row", "backup-workspace", "retry-save", "reload-workspace", "download-recovery", "restore-backup", "clear-workspace", "discard-settings", "metric-help", "clear-filters", "sort-table", "page-table", "open-help", "view-attachment", "reset-user-password", "unlock-account", "change-password", "connect-sync", "disconnect-sync"];
  if (managementActions.includes(action)) return handleManagementAction(action, data);
  if (action.startsWith("export-")) { closePopover(); return exportData(action); }
  if (action.startsWith("refresh-")) { state.lastRefresh = nowTime(); render(true); return toast("Đã đối chiếu dữ liệu trên thiết bị.", "info"); }
  if (action.startsWith("print-")) {
    const kind = action.replace("print-", "");
    return printRecord(kind, data.code || state.routeParam);
  }
  switch (action) {
    case "edit-supplier": return showSupplierForm(data.id);
    case "supplier-catalog": return showSupplierCatalogForm(data.id);
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
      if (quoteIsExpired(quote)) return toast("Báo giá đã hết hiệu lực. Tạo phiên bản mới trước khi xác nhận.", "warning");
      return showForm("Ghi nhận khách xác nhận báo giá", inputField("reference", "Căn cứ xác nhận (email / cuộc gọi / trao đổi)", "text", "", "required maxlength=200"), (form) => {
        if (quoteIsExpired(quote)) return formError("Báo giá đã hết hiệu lực.");
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
    case "configure-permissions": return showPermissionSettings();
    case "edit-order": return showOrderChange(data.code);
    case "cancel-order": return showOrderChange(data.code, true);
    case "open-payment": return showPaymentForm(data.record);
    case "open-invoice": return showInvoiceForm(data.record);
    case "open-reserve": return showReservationForm(data.sku);
    case "release-reservation": return releaseReservation(data.id);
    case "request-issue": return requestIssue(data.code);
    case "cancel-issue-request": {
      const order = orderByCode(data.code);
      if (order?.issueRequest?.status !== "pending") return;
      return showForm("Hủy yêu cầu xuất kho", inputField("reason", "Lý do", "text", "", "required maxlength=200"), (form) => {
        if (!guardAction(action) || order.issueRequest?.status !== "pending" || !form.get("reason").trim()) return formError("Yêu cầu không còn chờ hoặc chưa có lý do.");
        closeIssueRequest(order);
        addAudit("Hủy yêu cầu xuất kho", order.code, form.get("reason").trim());
        closeDialog(); render(true); toast("Đã hủy yêu cầu xuất. Lượng giữ không thay đổi.");
      });
    }
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
      if (!canLiquidateContract(contract)) return toast("Chỉ thanh lý khi đã giao đủ từng SKU và thu đủ theo hợp đồng.", "warning");
      return confirmAction("Thanh lý hợp đồng", `Kết thúc ${data.code} sau khi giao đủ, thu đủ.`, () => {
        if (!canLiquidateContract(contract)) return toast("Hợp đồng không còn đủ điều kiện thanh lý.", "warning");
        contract.status = "liquidated"; addAudit("Thanh lý hợp đồng", data.code, "Đã giao đủ và thu đủ", "success"); render(true); toast("Đã thanh lý hợp đồng.");
      });
    }
    case "save-receipt": persistWorkspace(); renderStorageStatus(); return toast("Đã lưu số liệu kiểm đếm, chưa ghi tăng tồn.", "info");
    case "confirm-receipt": return confirmReceipt(data.code);
    case "return-receipt": return confirmReceipt(data.code, true);
    case "upload-evidence": {
      const receipt = receiptByCode(data.code);
      if (!receipt || (receipt.po && receipt.status !== "receiving")) return;
      return chooseFile((files) => {
        if (receiptByCode(data.code) !== receipt || !guardAction("upload-evidence") || (receipt.po && receipt.status !== "receiving")) {
          files.forEach((file) => delete state.attachments[file.id]);
          persistWorkspace();
          return;
        }
        receipt.evidence.push(...files.map((file) => file.name)); render(true); toast("Đã lưu tệp trên thiết bị.");
      }, true, data.code);
    }
    case "new-stocktake": return showNewStocktakeForm();
    case "cancel-stocktake": return showCancelStocktakeForm(data.code);
    case "finish-count": {
      const stocktake = stocktakeByCode(data.code);
      if (!stocktake || stocktake.status !== "counting" || !isStocktakeLocked(stocktake) || stocktakeProgress(stocktake).missing) return toast("Chưa nhập đủ số kiểm đếm hoặc kỳ đã kết thúc.", "warning");
      stocktake.status = "reconciling"; state.ui.stocktakeTab = "reconcile";
      addAudit("Chốt số đếm", data.code, "Chuyển đối chiếu"); return render(true);
    }
    case "request-recount": {
      const stocktake = stocktakeByCode(data.code);
      const line = stocktake?.lines.find((item) => item.sku === data.sku);
      if (!line || !isStocktakeLocked(stocktake) || !["reconciling", "reported"].includes(stocktake.status)) return;
      line.count = null; line.reviewed = false; stocktake.status = "counting"; state.ui.stocktakeTab = "count";
      addAudit("Yêu cầu đếm lại", data.code, data.sku); render(true); return toast("Đã mở lại dòng cần đếm; ghi số thực tế mới.", "info");
    }
    case "open-adjustment": return showAdjustmentForm(data.code, data.sku);
    case "report-stocktake": {
      const stocktake = stocktakeByCode(data.code);
      if (!stocktake || !isStocktakeLocked(stocktake) || !["reconciling", "reported"].includes(stocktake.status)) return toast("Cần chốt số đếm trước khi báo cáo.", "warning");
      stocktake.reportTo = nowStamp(); stocktake.status = "reported";
      addAudit("Ghi nhận báo cáo kiểm kê", data.code, "Đã ghi nhận báo cáo trong nhật ký"); render(true); return toast("Đã lưu báo cáo kiểm kê.");
    }
    case "complete-stocktake": return completeStocktake(data.code);
    case "open-customer": return showCustomer(data.id);
    case "open-product": return showProduct(data.sku);
    case "product-history": {
      if (!routeAllowed("movements")) return toast("Tra cứu lịch sử giao dịch thuộc quyền xem thẻ kho.", "warning");
      state.ui.movementSearch = data.sku;
      state.ui.movementType = "all";
      navigate("movements");
      return;
    }
    case "request-contract-changes": {
      const contract = contractByCode(data.code);
      if (!contract || state.role !== "accountant") return toast("Chỉ Kế toán được yêu cầu chỉnh sửa hợp đồng.", "warning");
      if (contract.status !== "checking" || contract.checklist.accountantCheck) return toast("Hợp đồng không còn chờ kiểm tra điều khoản.", "warning");
      return showForm("Yêu cầu chỉnh sửa hợp đồng", `<p class="hint mb-16">Nhân viên bán hàng sẽ cập nhật hồ sơ và trình lại; Kế toán kiểm tra trước khi chuyển ký.</p>${inputField("note", "Nội dung cần chỉnh sửa", "text", "", "required maxlength=240")}`, (form) => {
        if (state.role !== "accountant" || contract.status !== "checking") return formError("Hợp đồng không còn chờ kiểm tra điều khoản.");
        const note = form.get("note").trim();
        if (!note) return formError("Nhập nội dung cần chỉnh sửa.");
        Object.assign(contract, { changeRequest: { note, by: currentUser().name, at: nowStamp() }, changeRequestResolved: false });
        addAudit("Yêu cầu chỉnh sửa hợp đồng", contract.code, note);
        closeDialog(); render(true); toast("Đã gửi yêu cầu chỉnh sửa cho bộ phận bán hàng.");
      });
    }
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
    case "new-undelivered-return": return showReturnForm(true);
    case "return-receive": return showReturnReceipt(data.code);
    case "return-inspection": return showReturnInspection(data.code);
    case "return-finance-evidence": return showReturnResolutionEvidence(data.code, "finance");
    case "return-finance-resolve": return showReturnFinanceResolution(data.code);
    case "return-replacement-evidence": return showReturnResolutionEvidence(data.code, "replacement");
    case "mark-all-read": allowedNotifications().forEach((item) => item.unread = false); persistWorkspace(); closePopover(); renderShell(); return toast("Đã đánh dấu thông báo là đã đọc.");
    case "logout": {
      if (activeDialog?.dirty) return requestDiscard(() => { closeDialog(true); dispatchAction("logout"); });
      if (state.ui.settingsDirty) return requestSettingsDiscard(() => dispatchAction("logout"));
      closePopover(); state.loggedIn = false; try { sessionStorage.removeItem(PROFILE_KEY); } catch {} serverSyncLogout(); persistWorkspace(); resetLoginFlow(); renderShell(); syncOverlayState(); document.getElementById("login-email")?.focus(); return;
    }
  }
}

function deliveryItemQty(items, sku) {
  if (!Array.isArray(items)) return 0;
  const lines = items.filter((line) => line.sku === sku);
  return lines.length === 1 && Number.isSafeInteger(lines[0].qty) && lines[0].qty >= 0 ? lines[0].qty : 0;
}

function deliveryAcceptedQty(delivery, sku) {
  const issued = deliveryItemQty(delivery.items, sku);
  return delivery.acceptedItems === undefined ? delivery.status === "delivered" ? issued : 0 : Math.min(issued, deliveryItemQty(delivery.acceptedItems, sku));
}

function deliveryOutstandingItems(delivery) {
  return (delivery.items || []).map(({ sku }) => ({ sku, qty: deliveryItemQty(delivery.items, sku) - deliveryAcceptedQty(delivery, sku) })).filter(({ qty }) => qty > 0);
}

function deliveryAttempts(delivery) {
  if (Array.isArray(delivery.attempts)) return delivery.attempts;
  if (!delivery.resultRecordedAt) return [];
  return [{ status: delivery.status === "delivered" ? "delivered" : "failed", scheduledAt: delivery.scheduledAt, resultReceivedAt: delivery.resultReceivedAt, resultRecordedAt: delivery.resultRecordedAt, acceptedItems: (delivery.items || []).map(({ sku }) => ({ sku, qty: deliveryAcceptedQty(delivery, sku) })), remainingItems: deliveryOutstandingItems(delivery), evidenceId: delivery.evidenceId, reason: delivery.note }];
}

function deliveryActionActor(action) {
  const user = state.users.find((entry) => entry.id === state.activeUserId);
  return state.loggedIn && user?.status === "user_active" && user.roleIds.includes(state.role) && guardAction(action) ? `${user.id}:${state.role}` : "";
}

function deliveryReturnKind(delivery) {
  if (!delivery) return "";
  if (["failed", "returned"].includes(delivery.status) || (delivery.status === "delivery_partial" && !delivery.retryClosedAt)) return "undelivered";
  if (delivery.status === "delivered" || (delivery.status === "delivery_partial" && delivery.retryClosedAt)) return "customer";
  return "";
}

function returnDeliveryCandidates(entry) {
  if (!Number.isSafeInteger(entry.qty) || entry.qty <= 0) return [];
  // Old returns could be opened after issue, even on a trip since retried or retired.
  return state.deliveries.filter((delivery) => delivery.order === entry.order && (!entry.delivery || entry.delivery === delivery.code) && deliveryItemQty(delivery.items, entry.sku) >= entry.qty);
}

function deliveryReturns(delivery) {
  return state.returns.filter((entry) => entry.order === delivery.order && entry.status !== "rejected" && (entry.delivery ? entry.delivery === delivery.code : returnDeliveryCandidates(entry).includes(delivery)));
}

function deliveryReturnRemaining(delivery, sku, exclude, kind = deliveryReturnKind(delivery)) {
  // Reserve against each possible source when a legacy return cannot be attributed safely.
  const used = deliveryReturns(delivery).filter((entry) => entry !== exclude && entry.sku === sku && (!entry.returnKind || entry.returnKind === kind)).reduce((sum, entry) => Number.isSafeInteger(entry.qty) && entry.qty > 0 ? sum + entry.qty : Infinity, 0);
  const accepted = deliveryAcceptedQty(delivery, sku);
  const limit = kind === "customer" ? accepted : kind === "undelivered" ? deliveryItemQty(delivery.items, sku) - accepted : 0;
  return Math.max(0, limit - used);
}

function deliveryReturnBlock(delivery, allowPending = false) {
  const returns = deliveryReturns(delivery);
  if (delivery.retryClosedAt || delivery.status === "returned") return "Chuyến đã đóng sau khi nhập hoàn. Phần chưa giao cần giữ và xuất kho mới.";
  if (delivery.returned || returns.some(returnIsPosted)) return "Không thể dùng lại chuyến đã nhập hoàn. Đối chiếu và nhập hoàn hết phần chưa giao trước khi xuất kho mới cho đợt này.";
  if (returns.some((entry) => entry.status === "return_received" || (!allowPending && entry.status === "inspecting"))) return "Chuyến đang có yêu cầu hoàn hàng. Không thể bàn giao lại hoặc ghi nhận khách đã nhận hàng.";
  return "";
}

function deliveryShipment(delivery) {
  return delivery.contract && delivery.shipmentId ? contractByCode(delivery.contract)?.shipments?.find((item) => item.id === delivery.shipmentId) : undefined;
}

function deliveryTimestampField(label) {
  return inputField("receivedAt", label, "datetime-local", new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 16), "required");
}

function deliveryTimestamp(data) {
  const value = String(data.get("receivedAt") || "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return "";
  const date = new Date(`${value}:00+07:00`);
  if (!Number.isFinite(date.valueOf()) || date > new Date()) return "";
  return new Date(date.valueOf() + 7 * 3600000).toISOString().slice(0, 16) === value ? date.toISOString() : "";
}

function deliveryEvidenceField(label, required = true) {
  return inputField("evidence", label, "file", "", `${required ? "required " : ""}accept='.pdf,.jpg,.jpeg,.png'`);
}

async function storeDeliveryEvidence(file, code, current) {
  const [attachment] = await storeAttachments([file], code);
  if (current()) return attachment;
  delete state.attachments[attachment.id];
  if (!workspaceStatus.conflict) persistWorkspace();
  formError("Hồ sơ, vai trò hoặc dữ liệu đã thay đổi trong lúc lưu chứng từ. Tải lại hồ sơ và thử lại.");
  return null;
}

function showDeliveryResultForm(code, result) {
  const actor = deliveryActionActor("delivery-result");
  if (!actor || !["delivered", "delivery_partial", "failed"].includes(result)) return;
  const delivery = state.deliveries.find((item) => item.code === code);
  if (!delivery || delivery.status !== "shipping") return;
  const blocked = deliveryReturnBlock(delivery, result === "failed");
  if (blocked) return toast(blocked, "warning");
  const issued = delivery.items || [];
  const items = deliveryOutstandingItems(delivery);
  if (!items.length || issued.some(({ sku }) => !sku || deliveryItemQty(issued, sku) <= 0)) return toast("Phiếu xuất của chuyến giao thiếu số lượng SKU hợp lệ.", "warning");
  const { scheduledAt, resultRecordedAt } = delivery;
  const current = () => deliveryActionActor("delivery-result") === actor && state.deliveries.includes(delivery) && delivery.status === "shipping" && delivery.scheduledAt === scheduledAt && delivery.resultRecordedAt === resultRecordedAt && (!delivery.shipmentId || deliveryShipment(delivery)?.delivery === code) && !deliveryReturnBlock(delivery, result === "failed");
  const quantities = items.map(({ sku, qty }, index) => inputField(`accepted-${index}`, `${sku} · xuất ${num(qty)} · khách thực nhận`, "number", "", `required min=0 max=${qty} step=1`)).join("");
  const needsReason = result !== "delivered";
  const needsProof = result !== "failed";
  showForm(result === "delivered" ? "Xác nhận giao đủ phần còn lại" : result === "failed" ? "Ghi nhận giao thất bại" : "Ghi nhận giao một phần", `${deliveryTimestampField("Nhận xác nhận giao hàng lúc")}${needsProof ? deliveryEvidenceField("Biên bản giao nhận có chữ ký") : ""}${needsReason ? inputField("reason", "Lý do chưa nhận đủ", "text", "", "required maxlength=240") : ""}${quantities}<p class="small muted">Nhập số khách nhận trong lần giao này. Chuyến giao lại chỉ gồm phần chưa được nhận và chưa nhập hoàn.</p>`, async (data) => {
    if (!current()) return formError("Chuyến giao đã thay đổi hoặc đang xử lý hoàn; không thể ghi kết quả.");
    const receivedAt = deliveryTimestamp(data);
    if (!receivedAt || (scheduledAt && Date.parse(receivedAt) + 60000 <= Date.parse(scheduledAt))) return formError("Thời điểm nhận xác nhận phải từ lúc bàn giao đến hiện tại.");
    const acceptedNow = items.map(({ sku }, index) => {
      const value = String(data.get(`accepted-${index}`) ?? "").trim();
      return { sku, qty: value ? Number(value) : NaN };
    });
    if (acceptedNow.some(({ qty }, index) => !Number.isSafeInteger(qty) || qty < 0 || qty > items[index].qty)) return formError("Nhập số nguyên không âm và không vượt phần chưa giao ở từng SKU.");
    const all = acceptedNow.every(({ qty }, index) => qty === items[index].qty), none = acceptedNow.every(({ qty }) => qty === 0);
    if (result !== (all ? "delivered" : none ? "failed" : "delivery_partial")) return formError("Số lượng không khớp kết quả. Chọn giao đủ, giao một phần hoặc thất bại theo số thực nhận.");
    const reason = String(data.get("reason") || "").trim();
    if (needsReason && (!reason || reason.length > 240)) return formError("Cần nêu lý do chưa giao đủ.");
    const file = data.get("evidence");
    if (needsProof && !file?.name) return formError("Chọn biên bản giao nhận có chữ ký.");
    const attachment = needsProof ? await storeDeliveryEvidence(file, code, current) : null;
    if (needsProof && !attachment) return;

    const attempts = deliveryAttempts(delivery);
    const acceptedItems = issued.map(({ sku }) => ({ sku, qty: deliveryAcceptedQty(delivery, sku) + deliveryItemQty(acceptedNow, sku) }));
    const status = all ? "delivered" : acceptedItems.some(({ qty }) => qty > 0) ? "delivery_partial" : "failed";
    const recordedAt = new Date().toISOString();
    Object.assign(delivery, { status, acceptedItems, note: all ? "Khách đã ký nhận đủ hàng" : reason, resultReceivedAt: receivedAt, resultRecordedAt: recordedAt });
    if (attachment) Object.assign(delivery, { evidence: file.name, evidenceId: attachment.id });
    const remainingItems = deliveryOutstandingItems(delivery);
    delivery.attempts = [...attempts, { status: result, scheduledAt, resultReceivedAt: receivedAt, resultRecordedAt: recordedAt, acceptedItems: acceptedNow, remainingItems, evidenceId: attachment?.id, reason, actorId: state.activeUserId }];
    const shipment = deliveryShipment(delivery);
    if (shipment) Object.assign(shipment, { status, remainingItems, confirmedAt: receivedAt, updatedAt: recordedAt });
    const order = orderByCode(delivery.order);
    if (order && order.status !== "cancelled") {
      const trips = state.deliveries.filter((item) => item.order === order.code);
      const fulfilled = trips.every((item) => item.status === "delivered" || item.status === "returned" || item.retryClosedAt) && order.lines.every((line) => line.shipped === line.qty && trips.reduce((sum, item) => sum + deliveryAcceptedQty(item, line.sku), 0) === line.qty);
      order.status = fulfilled ? "completed" : status === "failed" ? "failed" : "shipping";
    }
    addAudit("Cập nhật kết quả giao", code, `${delivery.note} · ${acceptedNow.map(({ sku, qty }) => `${sku}: ${qty}`).join(", ")}`, result === "failed" ? "danger" : result === "delivery_partial" ? "warning" : "success");
    closeDialog(); render(true); toast("Đã lưu kết quả giao nhận.");
  });
}

function recordReturnReceipt(item, receivedAt, receiptNote, evidenceId) {
  Object.assign(item, { status: "return_received", receivedAt, receivedQty: item.qty, receiptRecordedAt: new Date().toISOString(), receiptActorId: state.activeUserId, receiptEvidenceId: evidenceId, receiptNote });
  addAudit("Ghi nhận thực nhận hàng hoàn", item.code, `${item.delivery} · ${item.sku} · ${item.qty} · ${receiptNote}`);
}

function resolveReturnDelivery(item) {
  const candidates = returnDeliveryCandidates(item);
  return candidates.length === 1 && deliveryReturnKind(candidates[0]) && (!item.returnKind || item.returnKind === deliveryReturnKind(candidates[0])) ? candidates[0] : null;
}

function showReturnReceipt(code) {
  const actor = deliveryActionActor("return-receive");
  const item = state.returns.find((entry) => entry.code === code);
  if (!actor || !item || item.status !== "inspecting" || returnIsPosted(item)) return;
  const delivery = resolveReturnDelivery(item);
  if (!delivery) return toast("Không xác định được duy nhất chuyến hàng cần nhận hoàn. Đối chiếu hồ sơ trước khi tiếp tục.", "warning");
  const current = () => deliveryActionActor("return-receive") === actor && state.returns.includes(item) && item.status === "inspecting" && !returnIsPosted(item) && resolveReturnDelivery(item) === delivery && item.qty <= deliveryReturnRemaining(delivery, item.sku, item);
  showForm("Ghi nhận thực nhận hàng hoàn", `<p class="small muted">${escapeHtml(delivery.code)} · ${escapeHtml(item.sku)} · Yêu cầu: ${num(item.qty)}</p>${deliveryTimestampField("Hàng trả về thực tế lúc")}${inputField("qty", "Số thực nhận", "number", "", `required min=1 max=${item.qty} step=1`)}${inputField("note", "Căn cứ bàn giao / ghi chú kiểm đếm", "text", "", "required maxlength=240")}${deliveryEvidenceField("Phiếu bàn giao hoặc ảnh hàng thực nhận (nếu có)", false)}<p class="small muted">Không cập nhật tồn tại bước này. Nếu nhận thiếu, phần còn lại tiếp tục chờ nhận trên phiếu liên kết.</p>`, async (data) => {
    if (!current()) return formError("Yêu cầu hoàn không còn đủ điều kiện nhận hàng hoặc đã thay đổi.");
    const receivedAt = deliveryTimestamp(data), receivedQty = Number(data.get("qty")), receiptNote = String(data.get("note") || "").trim(), file = data.get("evidence");
    if (!receivedAt || !Number.isSafeInteger(receivedQty) || receivedQty < 1 || receivedQty > item.qty || !receiptNote || receiptNote.length > 240) return formError("Nhập thời điểm thực nhận, số lượng hợp lệ và căn cứ bàn giao.");
    const attachment = file?.name ? await storeDeliveryEvidence(file, code, current) : null;
    if (file?.name && !attachment) return;
    const returnKind = deliveryReturnKind(delivery), originalRequestedQty = item.qty;
    if (receivedQty < originalRequestedQty) {
      const remainder = { code: nextCode(state.returns, "code", `DT-${new Date().getFullYear()}-`, 4), order: item.order, customerId: item.customerId, delivery: delivery.code, returnKind, sku: item.sku, qty: originalRequestedQty - receivedQty, reason: item.reason, source: item.source, status: "inspecting", createdAt: todayText(), splitFrom: code, evidence: item.evidence || [], note: "Phần còn chờ nhận từ phiếu " + code };
      state.returns.unshift(remainder);
      Object.assign(item, { originalRequestedQty, remainderReturn: remainder.code, qty: receivedQty });
    }
    Object.assign(item, { delivery: delivery.code, returnKind });
    recordReturnReceipt(item, receivedAt, receiptNote, attachment?.id);
    closeDialog(); render(true); toast("Đã ghi nhận thực nhận; chưa thay đổi tồn kho.");
  });
}

function showReturnInspection(code) {
  const actor = deliveryActionActor("return-inspection");
  const item = state.returns.find((entry) => entry.code === code);
  if (!actor || !item || item.status !== "return_received" || returnIsPosted(item)) return;
  const delivery = resolveReturnDelivery(item);
  if (!delivery) return toast("Không xác định được duy nhất chuyến hàng đã nhận hoàn.", "warning");
  showForm("Kiểm tra và nhập kho hàng hoàn", `<p class="small muted">${escapeHtml(delivery.code)} · ${escapeHtml(item.sku)} · Đã nhận ${num(item.receivedQty)} đơn vị</p>${inputField("good", "Số đủ điều kiện bán lại", "number", "", `required min=0 max=${item.qty} step=1`)}${inputField("damaged", "Số hư hỏng / chờ xử lý", "number", "", `required min=0 max=${item.qty} step=1`)}${inputField("reason", "Kết quả kiểm tra", "text", "", "required maxlength=240")}<div class="banner warning mt-16">Tổng số đã phân loại phải bằng thực nhận. Hàng hỏng không tăng tồn khả dụng.</div>`, (data) => {
    if (deliveryActionActor("return-inspection") !== actor || !state.returns.includes(item) || item.status !== "return_received" || returnIsPosted(item)) return formError("Yêu cầu hoàn này đã xử lý hoặc đã thay đổi.");
    if (stockLock(item.sku)) return formError("SKU đang khóa kiểm kê. Hoàn tất kỳ trước khi xác nhận nhập hoàn.");
    if (resolveReturnDelivery(item) !== delivery || item.receivedQty !== item.qty || item.qty > deliveryReturnRemaining(delivery, item.sku, item)) return formError("Số lượng nhập hoàn không khớp với thực nhận và phần còn được hoàn trên chuyến này.");
    const order = orderByCode(item.order), product = productBySku(item.sku);
    const line = order?.lines.find((entry) => entry.sku === item.sku);
    if (!line || !product) return formError("Hồ sơ hoàn không khớp sản phẩm của đơn hàng.");
    const goodText = String(data.get("good") ?? "").trim(), damagedText = String(data.get("damaged") ?? "").trim();
    const goodQty = Number(goodText), damagedQty = Number(damagedText), note = String(data.get("reason") || "").trim();
    if (!goodText || !damagedText || ![goodQty, damagedQty].every((qty) => Number.isSafeInteger(qty) && qty >= 0) || goodQty + damagedQty !== item.qty || !note || note.length > 240) return formError("Nhập kết quả kiểm tra và phân loại đúng tổng số thực nhận.");
    const undelivered = item.returnKind === "undelivered";
    const previous = deliveryReturns(delivery).filter((entry) => entry !== item && (!entry.returnKind || entry.returnKind === "undelivered") && returnIsPosted(entry));
    const remainingItems = deliveryOutstandingItems(delivery);
    const shipment = deliveryShipment(delivery);
    if (undelivered && (!Number.isSafeInteger(line.shipped) || line.shipped - item.qty < state.deliveries.filter((entry) => entry.order === order.code).reduce((sum, entry) => sum + deliveryAcceptedQty(entry, item.sku), 0))) return formError("Lượng đã xuất của đơn không khớp hàng chưa giao được trả về.");
    if (undelivered && previous.some((entry) => !delivery.returned || entry.delivery !== delivery.code || (!entry.postedAt && entry.status !== "completed"))) return formError("Có hàng hoàn cũ chưa đối chiếu lượng đã xuất. Không thể tự động nhập tiếp cho chuyến này.");
    if (undelivered && delivery.shipmentId && shipment?.delivery !== delivery.code) return formError("Đợt giao hợp đồng không còn khớp chuyến trả về. Cần đối chiếu trước khi nhập.");
    const fullyReturned = undelivered && remainingItems.every(({ sku, qty }) => qty === (sku === item.sku ? item.qty : 0) + previous.filter((entry) => entry.sku === sku).reduce((sum, entry) => sum + entry.qty, 0));
    const physical = product.physical + item.qty, damaged = product.damaged + damagedQty;
    if (![physical, damaged, product.held].every((qty) => Number.isSafeInteger(qty) && qty >= 0) || product.held + damaged > physical) return formError("Số dư tồn kho không hợp lệ; cần đối chiếu trước khi nhập hoàn.");

    const postedAt = new Date().toISOString();
    Object.assign(product, { physical, damaged });
    Object.assign(item, { status: "return_finance_pending", condition: goodQty && damagedQty ? "mixed" : goodQty ? "good" : "damaged", goodQty, damagedQty, note, postedAt, postedBy: state.activeUserId });
    Object.assign(delivery, { returned: true, returnedAt: postedAt });
    if (undelivered) {
      line.shipped -= item.qty;
      if (order.status !== "cancelled") order.status = order.lines.some((entry) => entry.held > 0) ? "holding" : orderEligible(order) ? "eligible" : "pending_payment";
      if (fullyReturned) {
        if (delivery.status === "failed") delivery.status = "returned";
        delivery.retryClosedAt = postedAt;
        if (shipment) Object.assign(shipment, { status: "planned", remainingItems, delivery: "", confirmedAt: "", updatedAt: postedAt });
      }
      syncIssueReadiness(order);
    }
    addMovement("Hàng hoàn", item.sku, item.qty, physical, product.held, code, `${note} · Đạt ${goodQty}, lỗi ${damagedQty}`);
    addAudit("Xác nhận hàng hoàn", code, `${delivery.code} · ${note}`, "success");
    closeDialog(); render(true); toast(undelivered ? "Đã nhập hoàn phần chưa giao. Không dùng lại chuyến cũ; hàng giao tiếp cần giữ và xuất mới." : "Đã ghi nhận hàng hoàn; không thay đổi số lượng đã giao của đơn.");
  });
}

function showReturnResolutionEvidence(code, track) {
  if (!["finance", "replacement"].includes(track)) return;
  const action = `return-${track}-evidence`;
  const actor = deliveryActionActor(action);
  const item = state.returns.find((entry) => entry.code === code);
  if (!actor || !item || !returnIsPosted(item)) return;
  const title = track === "finance" ? "hồ sơ tiền / công nợ" : "hồ sơ đổi bù";
  showForm(`Lưu chứng từ ${title}`, `<p class="small muted">Chỉ lưu căn cứ của phương án đã được người có thẩm quyền quyết định bên ngoài bước này. Không phê duyệt, ghi tiền, tạo đơn đổi bù hoặc xuất kho.</p>${inputField("reference", "Số quyết định / chứng từ đã kiểm tra", "text", "", "required maxlength=120")}${inputField("note", "Kết quả đối chiếu", "text", "", "required maxlength=240")}${deliveryEvidenceField("Tệp chứng từ đã kiểm tra")}`, async (data) => {
    const reference = String(data.get("reference") || "").trim(), note = String(data.get("note") || "").trim(), file = data.get("evidence");
    const current = () => deliveryActionActor(action) === actor && state.returns.includes(item) && returnIsPosted(item) && !(item.resolutionEvidence || []).some((entry) => entry.track === track && String(entry.reference).toLowerCase() === reference.toLowerCase());
    if (!current() || !reference || reference.length > 120 || !note || note.length > 240 || !file?.name || !file.size) return formError("Cần vai trò đúng, tệp chứng từ không trống chưa lưu, mã tham chiếu và kết quả đối chiếu.");
    const attachment = await storeDeliveryEvidence(file, code, current);
    if (!attachment) return;
    (item.resolutionEvidence ||= []).push({ track, reference, note, evidenceId: attachment.id, actorId: state.activeUserId, actorRole: state.role, recordedAt: new Date().toISOString() });
    addAudit(`Lưu chứng từ ${title}`, code, `${reference} · ${note}`);
    closeDialog(); render(true); toast("Đã lưu chứng từ; không tạo giao dịch tiền hoặc tồn kho.");
  });
}

function showReturnFinanceResolution(code) {
  const action = "return-finance-resolve", actor = deliveryActionActor(action);
  const item = state.returns.find((entry) => entry.code === code);
  if (!actor || !item || !returnIsPosted(item) || returnFinanciallyResolved(item)) return;
  const evidence = returnFinanceEvidence(item), originalResolution = item.financialResolution;
  if (!evidence.length) return toast("Lưu chứng từ tiền / công nợ đã kiểm tra trước khi xác nhận kết quả tài chính.", "warning");
  showForm("Xác nhận kết quả xử lý tài chính", `<div class="banner warning mb-16">Chỉ ghi nhận kết quả đã được xử lý theo quyết định có thẩm quyền và đã đối chiếu. Không dùng bước này để duyệt phương án, hoàn tiền, cấn trừ hoặc tạo đổi bù.</div>${selectField("evidenceId", "Chứng từ tài chính đã lưu", [["", "Chọn chứng từ đã đối chiếu"], ...evidence.map((entry) => [entry.evidenceId, entry.reference])])}${inputField("authorizationReference", "Căn cứ thẩm quyền / quyết định đã được duyệt", "text", "", "required maxlength=120")}${inputField("note", "Kết quả xử lý đã xác minh", "text", "", "required maxlength=240")}<label class="checkline"><input type="checkbox" name="authorized" required> Phương án đã được người có thẩm quyền quyết định; không còn chờ duyệt tiền hoặc đổi bù.</label><label class="checkline mt-12"><input type="checkbox" name="verified" required> Tôi đã đối chiếu chứng từ và xác minh việc xử lý tài chính đã hoàn thành, không chỉ mới có đề nghị.</label>`, (data) => {
    const entry = evidence.find((record) => record.evidenceId === data.get("evidenceId"));
    if (deliveryActionActor(action) !== actor || !state.returns.includes(item) || !returnIsPosted(item) || returnFinanciallyResolved(item) || item.financialResolution !== originalResolution || !entry || !returnFinanceEvidence(item).includes(entry)) return formError("Hồ sơ, chứng từ hoặc quyền đã thay đổi; tải lại hồ sơ để xác nhận.");
    const authorizationReference = String(data.get("authorizationReference") || "").trim(), note = String(data.get("note") || "").trim();
    if (!authorizationReference || authorizationReference.length > 120 || !note || note.length > 240 || data.get("authorized") !== "on" || data.get("verified") !== "on") return formError("Cần căn cứ thẩm quyền, kết quả đã xác minh và cả hai xác nhận rõ ràng của Kế toán.");
    const resolution = { status: "resolved", evidenceId: entry.evidenceId, reference: entry.reference, authorizationReference, note, actorId: state.activeUserId, actorRole: state.role, resolvedAt: new Date().toISOString(), authorized: true, verified: true };
    if (!returnFinanciallyResolved({ ...item, financialResolution: resolution })) return formError("Chứng từ hoặc thời điểm xử lý chưa đủ căn cứ hoàn tất tài chính.");
    Object.assign(item, { status: "completed", financialResolution: resolution });
    addAudit("Xác nhận kết quả tài chính hàng hoàn", code, `${entry.reference} · ${authorizationReference} · ${note}`, "success");
    closeDialog(); render(true); toast("Đã xác nhận tài chính đã xử lý; không tạo giao dịch tiền hoặc tồn kho.");
  }, { submitLabel: "Xác nhận tài chính đã xử lý" });
}
