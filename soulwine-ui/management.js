Object.assign(ACTION_ROLES, {
  "new-product": ["director", "sales_manager"], "edit-product": ["director", "sales_manager"],
  "new-supplier": ["director", "warehouse_manager"], "edit-customer": ["director", "sales_manager", "sales_staff"],
  "opening-stock": ["warehouse_manager"], "new-purchase-request": ["warehouse_manager"],
  "create-po": ["warehouse_manager"], "create-receipt": ["warehouse_manager"],
  "create-wholesale-order": ["sales_manager", "sales_staff"], "schedule-delivery": ["sales_manager", "sales_staff", "warehouse_manager"],
  "new-return": ["sales_manager", "sales_staff"], "restore-backup": ["director"], "clear-workspace": ["director"],
  "reset-user-password": ["director"], "unlock-account": ["director"], "change-password": ALL_ROLES
});

function settingsPage() {
  const tab = state.ui.settingsTab || "organization";
  const settings = state.settings;
  const admin = state.role === "director";
  const tabs = [
    { key: "organization", label: "Doanh nghiệp" }, { key: "rules", label: "Quy tắc vận hành" },
    { key: "notifications", label: "Thông báo" }, { key: "display", label: "Giao diện" }, { key: "data", label: "Dữ liệu & lưu trữ" }
  ];
  const organization = `<div class="settings-section"><div class="settings-description"><h2>Thông tin doanh nghiệp</h2><p>Hiển thị trên báo giá, hợp đồng và chứng từ in. Để trống thông tin chưa có; hệ thống không tự bổ sung nội dung pháp lý.</p></div><div class="form-grid">${inputField("name", "Tên doanh nghiệp", "text", settings.organization.name, "required maxlength=120")}${inputField("taxId", "Mã số thuế", "text", settings.organization.taxId, "maxlength=20")}${inputField("address", "Địa chỉ", "text", settings.organization.address, "maxlength=240")}${inputField("representative", "Người đại diện", "text", settings.organization.representative, "maxlength=100")}${inputField("phone", "Điện thoại", "tel", settings.organization.phone)}${inputField("email", "Email liên hệ", "email", settings.organization.email)}</div></div>`;
  const rules = `<div class="settings-section"><div class="settings-description"><h2>Điều kiện & thời hạn</h2><p>Cấu hình theo chính sách đã được doanh nghiệp phê chuẩn. Để trống thời hạn để tắt cảnh báo tương ứng; không tự động nhả giữ hoặc phê duyệt hồ sơ.</p></div><div class="form-grid">${inputField("receiptTolerance", "Ngưỡng sai lệch nhập hàng (%)", "number", settings.rules.receiptTolerance ?? "", "min=0 max=100 step=0.1")}${inputField("quoteValidityDays", "Hiệu lực báo giá mặc định (ngày)", "number", settings.rules.quoteValidityDays, "required min=1 max=365 step=1")}${inputField("holdDays", "Nhắc thời hạn giữ hàng (ngày)", "number", settings.rules.holdDays ?? "", "min=1 max=365 step=1")}${inputField("approvalHours", "Nhắc hồ sơ chờ xử lý (giờ làm việc)", "number", settings.rules.approvalHours ?? "", "min=1 max=720 step=1")}${inputField("quoteReminderDays", "Nhắc trước khi báo giá hết hạn (ngày)", "number", settings.rules.quoteReminderDays, "required min=0 max=30 step=1")}${inputField("shipmentReminderDays", "Nhắc trước ngày giao (ngày)", "number", settings.rules.shipmentReminderDays, "required min=0 max=30 step=1")}${inputField("workStart", "Giờ bắt đầu làm việc", "time", settings.rules.workStart, "required")}${inputField("workEnd", "Giờ kết thúc làm việc", "time", settings.rules.workEnd, "required")}</div></div><div class="banner info mt-24">${icon("shield")}<div>Chiết khấu bán sỉ luôn cần Giám đốc duyệt. Yêu cầu mua cần kết quả của cả Kế toán và Giám đốc; không tự giả định thứ tự phê duyệt.</div></div>`;
  const notifications = `<div class="settings-section"><div class="settings-description"><h2>Trung tâm thông báo</h2><p>Điều khiển các thông báo trong ứng dụng. Những mục đã tắt sẽ được loại khỏi danh sách thông báo; không gửi email hoặc tin nhắn.</p></div><div class="settings-options">${[["shipment", "Đợt giao sắp đến hạn", "Cảnh báo ngày giao đã đến và quá hạn."], ["quote", "Hiệu lực báo giá", "Nhắc trước hạn theo số ngày đã cấu hình."], ["approval", "Hồ sơ chờ xác nhận", "Chỉ hiển thị hồ sơ thuộc vai trò đang sử dụng."], ["stock", "Tồn kho dưới định mức", "Theo dõi tồn khả dụng của sản phẩm đang kinh doanh."], ["payment", "Đối chiếu thanh toán", "Theo dõi các giao dịch chưa được xác nhận."]].map(([name, label, text]) => `<label class="setting-switch"><span><strong>${label}</strong><small>${text}</small></span><input type="checkbox" name="${name}" ${settings.notifications[name] ? "checked" : ""}><span class="switch-track" aria-hidden="true"></span></label>`).join("")}</div></div>`;
  const display = `<div class="settings-section"><div class="settings-description"><h2>Trải nghiệm làm việc</h2><p>Tối ưu mật độ hiển thị và số dòng cho bảng dữ liệu trên thiết bị hiện tại.</p></div><div class="form-grid">${selectField("density", "Mật độ hiển thị", [["comfortable", "Thoáng · phù hợp thao tác cảm ứng"], ["compact", "Gọn · ưu tiên bảng dữ liệu"]], settings.display.density)}${selectField("pageSize", "Số bản ghi mỗi trang", [[10, "10 bản ghi"], [25, "25 bản ghi"], [50, "50 bản ghi"]], settings.display.pageSize)}</div><div class="settings-preview mt-24"><span class="chip accent">SoulWine</span><strong>Rõ ràng trong từng chi tiết</strong><p>Ngôn ngữ: Tiếng Việt · Tiền tệ: VND · Múi giờ: Asia/Ho_Chi_Minh</p></div></div>`;
  const bytes = new Blob([JSON.stringify(workspaceData())]).size;
  const data = `<div class="settings-section"><div class="settings-description"><h2>Lưu trữ trên thiết bị</h2><p>Dữ liệu và tệp đính kèm được lưu trong trình duyệt hiện tại. Không có đồng bộ nhiều thiết bị. Xóa dữ liệu trình duyệt có thể làm mất dữ liệu; nên tải bản sao lưu định kỳ.</p></div><div class="storage-summary"><span>${icon("shield")}</span><div><strong>${(bytes / 1024).toFixed(1)} KB đang sử dụng</strong><small>${workspaceStatus.savedAt ? `Lưu gần nhất ${new Date(workspaceStatus.savedAt).toLocaleString("vi-VN")}` : "Chưa lưu trên thiết bị"}</small></div><span class="chip ${workspaceStatus.error ? "danger" : "success"}">${workspaceStatus.error ? "Cần kiểm tra" : "Đang hoạt động"}</span></div><div class="settings-actions"><div><h3>Sao lưu dữ liệu</h3><p>Tải tệp JSON gồm danh mục, giao dịch, cấu hình và tệp đính kèm trên thiết bị.</p></div><button class="btn btn-secondary" type="button" data-action="backup-workspace">${icon("download")} Tải bản sao lưu</button></div><div class="settings-actions"><div><h3>Khôi phục từ bản sao lưu</h3><p>Kiểm tra dữ liệu và xác nhận trước khi thay thế không gian làm việc hiện tại.</p></div><button class="btn btn-secondary" type="button" data-action="restore-backup" ${admin ? "" : "disabled"}>${icon("upload")} Chọn tệp JSON</button></div><div class="settings-actions danger-zone"><div><h3>Xóa dữ liệu nghiệp vụ</h3><p>Giữ lại nhân sự và cấu hình; xóa danh mục, giao dịch và tệp đính kèm. Cần nhập nội dung xác nhận.</p></div><button class="btn btn-danger" type="button" data-action="clear-workspace" ${admin ? "" : "disabled"}>Xóa dữ liệu</button></div></div>`;
  const hasSample = state.products.some((product) => product.sampleSet === globalThis.SoulWineSampleData?.SAMPLE_SET_ID);
  const sampleControls = `<div class="settings-section"><div class="settings-description"><h2>Dữ liệu nghiệp vụ mẫu liên kết</h2><p>Bộ hồ sơ giả lập xuyên suốt giữa Kinh doanh, Giám đốc, Kế toán và Kho. Nạp bổ sung một lần, không đổi tài khoản hay mật khẩu; không ghi đè bản ghi đang có. Đây không phải giao dịch hoặc chứng từ thật.</p></div><div class="settings-actions"><div><h3>${hasSample ? "Đã có bộ hồ sơ liên kết" : "Bắt đầu các tình huống mẫu"}</h3><p>Cùng một báo giá, hợp đồng, thanh toán và giao dịch kho được các tài khoản xử lý nối tiếp.</p></div>${hasSample ? '<button class="btn btn-secondary" type="button" data-action="sample-guide">Xem kịch bản liên quan</button>' : `<button class="btn btn-primary" type="button" data-action="load-linked-sample" ${admin ? "" : "disabled"}>${icon("plus")} Nạp dữ liệu mẫu</button>`}</div><div class="settings-actions"><div><h3>Bản lưu trước khi nạp mẫu</h3><p>Tải bản sao lưu dữ liệu đã lưu trên trình duyệt trước lần nạp đầu tiên để khôi phục khi cần.</p></div><button class="btn btn-secondary" type="button" data-action="download-before-sample">${icon("download")} Tải bản trước đó</button></div></div>`;
  const content = { organization, rules, notifications, display, data: data + sampleControls }[tab];
  const editable = !["organization", "rules"].includes(tab) || admin;
  return `${pageHead({ title: "Cài đặt không gian làm việc", subtitle: "Cấu hình thống nhất cho doanh nghiệp và trải nghiệm trên thiết bị." })}<div class="card settings-card">${tabsBar("settings", tabs, tab)}<form id="settings-form" class="card-body" novalidate>${!editable ? '<div class="banner info mb-24">Bạn có thể xem cấu hình. Chỉ Giám đốc được thay đổi thông tin doanh nghiệp và quy tắc vận hành.</div>' : ""}<fieldset ${editable ? "" : "disabled"}>${content}</fieldset><div class="banner danger hidden mt-16" id="settings-error" role="alert"></div>${tab !== "data" ? `<div class="settings-footer"><span id="settings-save-note">Thay đổi được lưu trên trình duyệt hiện tại.</span><div class="flex gap-8"><button class="btn btn-secondary" type="button" data-action="discard-settings">Hủy thay đổi</button><button class="btn btn-primary" type="submit" ${editable ? "" : "disabled"}>${icon("check")} Lưu cấu hình</button></div></div>` : ""}</form></div>`;
}

function saveSettings(form) {
  const tab = state.ui.settingsTab || "organization";
  if (["organization", "rules"].includes(tab) && state.role !== "director") return;
  const data = new FormData(form);
  if (!form.reportValidity()) return;
  const settings = structuredClone(state.settings);
  const error = (text) => { const element = document.getElementById("settings-error"); element.textContent = text; element.classList.remove("hidden"); };
  if (tab === "organization") {
    ["name", "taxId", "address", "representative", "phone", "email"].forEach((key) => settings.organization[key] = String(data.get(key)).trim());
    if (!settings.organization.name) return error("Tên doanh nghiệp không được để trống.");
    if (settings.organization.taxId && !/^\d{10}(?:-?\d{3})?$/.test(settings.organization.taxId)) return error("Mã số thuế gồm 10 hoặc 13 chữ số.");
  }
  if (tab === "rules") {
    for (const [key, min, max, optional] of [["receiptTolerance", 0, 100, true], ["quoteValidityDays", 1, 365, false], ["holdDays", 1, 365, true], ["approvalHours", 1, 720, true], ["quoteReminderDays", 0, 30, false], ["shipmentReminderDays", 0, 30, false]]) {
      const value = data.get(key);
      if (value === "" && optional) settings.rules[key] = null;
      else if (!Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max || (key !== "receiptTolerance" && !Number.isInteger(Number(value)))) return error("Kiểm tra các giới hạn thời gian và ngưỡng đã nhập.");
      else settings.rules[key] = Number(value);
    }
    if (data.get("workStart") >= data.get("workEnd")) return error("Giờ kết thúc phải sau giờ bắt đầu làm việc.");
    settings.rules.workStart = data.get("workStart"); settings.rules.workEnd = data.get("workEnd");
  }
  if (tab === "notifications") Object.keys(settings.notifications).forEach((key) => settings.notifications[key] = data.has(key));
  if (tab === "display") { settings.display.density = data.get("density"); settings.display.pageSize = Number(data.get("pageSize")); }
  state.settings = settings;
  state.ui.settingsDirty = false;
  addAudit("Cập nhật cấu hình", tab, "Đã lưu thay đổi cấu hình");
  render(true); toast("Đã lưu cấu hình.");
}

function showProductForm(sku) {
  const product = sku ? productBySku(sku) : null;
  const values = product || { sku: nextCode(state.products, "sku", "SW-"), name: "", category: "Vang đỏ", unit: "Chai", retail: 0, wholesale: 0, min: 0, origin: "", volume: "", abv: "", supplier: "" };
  showForm(product ? "Chỉnh sửa sản phẩm" : "Thêm sản phẩm", `<div class="form-grid">${inputField("sku", "Mã SKU", "text", values.sku, `required pattern='[A-Za-z0-9_-]{1,40}' ${product ? "readonly" : ""}`)}${inputField("name", "Tên sản phẩm", "text", values.name, "required maxlength=160")}${selectField("category", "Nhóm sản phẩm", ["Vang đỏ", "Vang trắng", "Vang sủi", "Whisky", "Quà tặng", "Khác"].map((name) => [name, name]), values.category)}${selectField("unit", "Đơn vị tính", ["Chai", "Hộp", "Thùng"].map((name) => [name, name]), values.unit)}${inputField("retail", "Giá bán lẻ (VND)", "number", values.retail, "required min=0 step=1")}${inputField("wholesale", "Giá bán sỉ (VND)", "number", values.wholesale, "required min=0 step=1")}${inputField("min", "Định mức tồn tối thiểu", "number", values.min, "required min=0 step=1")}${selectField("supplier", "Nhà cung cấp", [["", "Chưa chỉ định"], ...state.suppliers.map((supplier) => [supplier.id, supplier.name])], values.supplier)}${inputField("origin", "Xuất xứ", "text", values.origin)}${inputField("volume", "Dung tích / quy cách", "text", values.volume)}${inputField("abv", "Nồng độ", "text", values.abv)}</div>`, (data) => {
    const code = data.get("sku").trim().toUpperCase();
    if (!product && state.products.some((item) => item.sku === code)) return formError("SKU đã tồn tại.");
    if (!data.get("name").trim()) return formError("Nhập tên sản phẩm.");
    for (const key of ["retail", "wholesale", "min"]) if (!Number.isSafeInteger(Number(data.get(key))) || Number(data.get(key)) < 0) return formError("Giá bán và định mức phải là số nguyên không âm.");
    const fields = Object.fromEntries(["name", "category", "unit", "origin", "volume", "abv", "supplier"].map((key) => [key, data.get(key).trim()]));
    const prices = { retail: Number(data.get("retail")), wholesale: Number(data.get("wholesale")), min: Number(data.get("min")) };
    if (product) Object.assign(product, fields, prices);
    else state.products.push({ sku: code, ...fields, ...prices, physical: 0, held: 0, damaged: 0, status: "product_active" });
    addAudit(product ? "Cập nhật sản phẩm" : "Thêm sản phẩm", code, fields.name);
    closeDialog(); render(true); toast("Đã lưu sản phẩm. Tồn kho được ghi nhận qua nhập kho / số dư đầu kỳ.");
  });
}

function showOpeningStock() {
  if (stockLock()) return toast("Kho đang khóa kiểm kê.", "warning");
  const products = state.products.filter((product) => !state.movements.some((move) => move.sku === product.sku) && product.physical === 0);
  if (!products.length) return toast("Không có sản phẩm chưa phát sinh biến động. Dùng phiếu tiếp nhận để nhập thêm.", "info");
  showForm("Ghi nhận tồn đầu kỳ", `<div class="banner warning mb-16">Chỉ áp dụng một lần cho SKU chưa có biến động kho. Không thay thế quy trình nhập hàng từ nhà cung cấp.</div>${selectField("sku", "Sản phẩm", products.map((product) => [product.sku, product.name]))}${inputField("qty", "Số lượng thực tế", "number", "", "required min=1 step=1")}${inputField("reference", "Biên bản / chứng từ nguồn", "text", "", "required maxlength=120")}`, (data) => {
    const product = productBySku(data.get("sku"));
    const qty = Number(data.get("qty"));
    if (stockLock() || product.physical || state.movements.some((move) => move.sku === product.sku)) return formError("Sản phẩm đã có biến động hoặc kho đang bị khóa. Kiểm tra lại dữ liệu.");
    if (!Number.isSafeInteger(qty) || qty <= 0) return formError("Nhập số lượng nguyên dương.");
    product.physical = qty;
    addMovement("Nhập kho", product.sku, qty, qty, 0, data.get("reference"), "Số dư đầu kỳ");
    addAudit("Ghi nhận tồn đầu kỳ", product.sku, `${qty} · ${data.get("reference")}`);
    closeDialog(); render(true); toast("Đã ghi nhận tồn đầu kỳ.");
  });
}

function showSupplierForm() {
  showForm("Thêm nhà cung cấp", `<div class="form-grid">${inputField("name", "Tên nhà cung cấp", "text", "", "required maxlength=160")}${inputField("contact", "Người liên hệ", "text", "", "required")}${inputField("phone", "Điện thoại", "tel", "", "required")}${inputField("email", "Email", "email")}${inputField("tax", "Mã số thuế")}${inputField("address", "Địa chỉ")}${inputField("terms", "Điều khoản thanh toán")}</div>`, (data) => {
    const name = data.get("name").trim();
    if (!name || state.suppliers.some((supplier) => supplier.name.toLowerCase() === name.toLowerCase())) return formError("Tên nhà cung cấp trống hoặc đã tồn tại.");
    const supplier = { id: nextCode(state.suppliers, "id", "NCC-", 3), ...Object.fromEntries(["contact", "phone", "email", "tax", "address", "terms"].map((key) => [key, data.get(key).trim()])), name, skus: 0, lastDelivery: "—", note: "" };
    state.suppliers.push(supplier); addAudit("Thêm nhà cung cấp", supplier.id, name);
    closeDialog(); render(true); toast("Đã thêm nhà cung cấp.");
  });
}

function lineEditorRow(index, purchase = false) {
  const products = state.products.filter((product) => product.status === "product_active");
  return `<div class="cart-row" data-cart-row><div class="field"><label for="cart-sku-${index}">Sản phẩm</label><select class="select" name="cartSku" id="cart-sku-${index}">${products.map((product) => `<option value="${product.sku}">${escapeHtml(product.name)} · ${product.unit}</option>`).join("")}</select></div><div class="field"><label for="cart-qty-${index}">Số lượng</label><input class="input" id="cart-qty-${index}" name="cartQty" type="number" min="1" step="1" value="1" required></div>${purchase ? `<div class="field"><label for="cart-price-${index}">Giá mua (VND)</label><input class="input" id="cart-price-${index}" name="cartPrice" type="number" min="1" step="1" required></div>` : ""}<button type="button" class="icon-btn" data-action="remove-cart-row" aria-label="Xóa dòng">${icon("trash")}</button></div>`;
}

function readCart(data, purchase = false) {
  const products = data.getAll("cartSku"), quantities = data.getAll("cartQty"), prices = data.getAll("cartPrice");
  const unique = new Set();
  if (!products.length) throw new Error("Thêm ít nhất một dòng hàng.");
  return products.map((sku, index) => {
    const product = productBySku(sku), qty = Number(quantities[index]), price = purchase ? Number(prices[index]) : product?.retail;
    if (!product || product.status !== "product_active" || !Number.isSafeInteger(qty) || qty <= 0 || !Number.isSafeInteger(price) || price <= 0) throw new Error("Kiểm tra sản phẩm, số lượng và đơn giá nguyên dương.");
    if (unique.has(sku)) throw new Error("SKU xuất hiện nhiều lần. Gộp số lượng vào cùng một dòng.");
    if (!Number.isSafeInteger(qty * price)) throw new Error("Giá trị dòng vượt giới hạn xử lý.");
    unique.add(sku);
    return { sku, qty, price };
  });
}

function showRetailCart() {
  if (!state.customers.length || !state.products.some((product) => product.status === "product_active")) return toast("Thêm khách hàng và sản phẩm đang kinh doanh trước khi tạo đơn.", "info");
  showForm("Tạo đơn bán lẻ", `<div class="form-grid">${selectField("customer", "Khách hàng", state.customers.map((customer) => [customer.id, customer.name]))}${selectField("channel", "Kênh bán", [["Tại quầy", "Tại quầy"], ["Facebook", "Facebook"]])}${selectField("paid", "Thu tiền", [["no", "Chưa thu / chờ xác nhận"], ["cash", "Đã thu tiền mặt tại quầy"]])}${inputField("reference", "Số phiếu thu")}</div><div class="section-heading mt-24"><h3>Hàng hóa</h3><button class="btn btn-secondary btn-sm" type="button" data-action="add-cart-row">${icon("plus")} Thêm dòng</button></div><div id="cart-lines">${lineEditorRow(0)}</div><div class="banner info mt-16" id="cart-summary">Đơn bán lẻ cần thu đủ 100% trước khi giữ và xuất hàng.</div>`, (data) => {
    let cart;
    try { cart = readCart(data); } catch (error) { return formError(error.message); }
    if (cart.some((line) => line.qty > availableOf(productBySku(line.sku)))) return formError("Có dòng vượt tồn khả dụng. Giảm số lượng hoặc kiểm tra lại kho.");
    const collected = data.get("paid") === "cash";
    if (collected && (data.get("channel") !== "Tại quầy" || !data.get("reference").trim())) return formError("Thu tiền mặt chỉ dùng tại quầy và cần số phiếu thu.");
    const order = { code: nextCode(state.orders, "code", `SO-${new Date().getFullYear()}-`), customerId: data.get("customer"), type: "Bán lẻ", channel: data.get("channel"), quote: "", contract: "", owner: currentUser().name, created: todayText(), createdAt: new Date().toISOString(), status: collected ? "eligible" : "pending_payment", total: cart.reduce((sum, line) => sum + line.qty * line.price, 0), paid: 0, lines: cart.map((line) => ({ ...line, held: 0, shipped: 0 })), note: "" };
    state.orders.unshift(order);
    if (collected) {
      const payment = { id: nextCode(state.payments, "id", `PAY-${new Date().getFullYear()}-`, 3), record: order.code, customerId: order.customerId, amount: order.total, date: todayText(), method: "Tiền mặt", reference: data.get("reference"), status: "pending_confirm", evidenceReadyAt: new Date().toISOString(), note: "Thu đủ tại quầy" };
      applyPayment(payment); state.payments.unshift(payment);
    }
    addAudit("Tạo đơn bán lẻ", order.code, money(order.total));
    closeDialog(); navigate(`orders/${order.code}`); toast("Đã tạo đơn hàng.");
  }, { drawer: false, submitLabel: "Tạo đơn hàng", input: () => updateCartSummary() });
}

function updateCartSummary() {
  const form = document.getElementById("action-form"), element = document.getElementById("cart-summary");
  if (!form || !element) return;
  try { const cart = readCart(new FormData(form), !!form.dataset.purchase); element.textContent = `${cart.length} dòng hàng · Tổng ${money(cart.reduce((sum, line) => sum + line.qty * line.price, 0))}. ${form.dataset.purchase ? "Cần Kế toán và Giám đốc phê duyệt." : "Thu đủ 100% trước khi giữ/xuất."}`; } catch { element.textContent = "Hoàn thiện sản phẩm, số lượng và đơn giá của từng dòng."; }
}

function showPurchaseRequestForm() {
  if (!state.products.length || !state.suppliers.length) return toast("Thêm sản phẩm và nhà cung cấp trước khi lập yêu cầu mua.", "info");
  showForm("Lập yêu cầu mua hàng", `<div class="form-grid">${selectField("supplier", "Nhà cung cấp", state.suppliers.map((supplier) => [supplier.id, supplier.name]))}${inputField("needed", "Ngày cần hàng", "date", isoDate(todayText()), "required")}${inputField("note", "Lý do mua hàng", "text", "", "required")}</div><div class="section-heading mt-24"><h3>Chi tiết đề xuất</h3><button type="button" class="btn btn-secondary btn-sm" data-action="add-cart-row" data-purchase="true">Thêm dòng</button></div><div id="cart-lines">${lineEditorRow(0, true)}</div><div class="banner info mt-16" id="cart-summary"></div>`, (data) => {
    let cart;
    try { cart = readCart(data, true); } catch (error) { return formError(error.message); }
    const request = { code: nextCode(state.purchaseRequests, "code", `YCM-${new Date().getFullYear()}-`), supplier: data.get("supplier"), requester: currentUser().name, createdAt: todayText(), needed: displayDate(data.get("needed")), status: "pending", amount: cart.reduce((sum, line) => sum + line.qty * line.price, 0), lines: cart, note: data.get("note"), approvals: { accountant: false, director: false } };
    state.purchaseRequests.unshift(request);
    ["accountant", "director"].forEach((role) => state.approvals.unshift({ id: nextCode(state.approvals, "id", "AP-", 4), type: "purchase", ref: request.code, title: role === "accountant" ? "Kiểm tra tài chính mua hàng" : "Phê duyệt yêu cầu mua", assignee: role, status: "pending", createdAt: nowStamp(), age: "Vừa gửi", requester: currentUser().name, amount: request.amount, summary: request.note, lines: structuredClone(cart), evidence: [] }));
    addAudit("Gửi duyệt yêu cầu mua", request.code, money(request.amount));
    closeDialog(); render(true); toast("Đã gửi yêu cầu đến Kế toán và Giám đốc.");
  }, { drawer: false, submitLabel: "Gửi phê duyệt", input: () => updateCartSummary() });
  document.getElementById("action-form").dataset.purchase = "true";
}

function showPurchaseOrderForm(code) {
  const requests = state.purchaseRequests.filter((request) => request.status === "approved" && !state.purchaseOrders.some((order) => order.request === request.code));
  if (!requests.length) return toast("Chưa có yêu cầu đủ hai phê duyệt và chưa lập đơn đặt hàng.", "info");
  showForm("Lập đơn đặt hàng", `${selectField("request", "Yêu cầu mua đã duyệt", requests.map((request) => [request.code, `${request.code} · ${supplierName(request.supplier)}`]), code)}${inputField("receiveDate", "Ngày nhận dự kiến", "date", isoDate(todayText()), "required")}${inputField("terms", "Điều khoản thanh toán", "text", "", "required")}`, (data) => {
    const request = state.purchaseRequests.find((item) => item.code === data.get("request"));
    const order = { code: nextCode(state.purchaseOrders, "code", `PO-${new Date().getFullYear()}-`), supplier: request.supplier, request: request.code, createdAt: todayText(), receiveDate: displayDate(data.get("receiveDate")), amount: request.amount, status: "receiving", receipt: "", terms: data.get("terms"), lines: structuredClone(request.lines) };
    state.purchaseOrders.unshift(order); addAudit("Lập đơn đặt hàng", order.code, request.code);
    closeDialog(); navigate("purchase-orders"); toast("Đã lập đơn đặt hàng.");
  });
}

function showReceiptForm(code) {
  const orders = state.purchaseOrders.filter((order) => !order.receipt && order.status !== "cancelled");
  if (!orders.length) return toast("Chưa có đơn đặt hàng cần tiếp nhận.", "info");
  showForm("Tạo phiếu tiếp nhận", selectField("order", "Đơn đặt hàng", orders.map((order) => [order.code, `${order.code} · ${supplierName(order.supplier)}`]), code), (data) => {
    const order = state.purchaseOrders.find((item) => item.code === data.get("order"));
    const receipt = { code: nextCode(state.receipts, "code", `PN-${new Date().getFullYear()}-`), po: order.code, supplier: order.supplier, eta: order.receiveDate, status: "receiving", owner: currentUser().name, lines: order.lines.map((line) => ({ sku: line.sku, ordered: line.qty, received: 0, good: 0, damaged: 0, counted: false })), evidence: [], note: "" };
    state.receipts.unshift(receipt); order.receipt = receipt.code;
    addAudit("Tạo phiếu tiếp nhận", receipt.code, order.code);
    closeDialog(); navigate(`receipts/${receipt.code}`);
  }, { submitLabel: "Tạo phiếu" });
}

function createWholesaleOrder(code) {
  const contract = contractByCode(code);
  if (!contract || contract.status !== "active") return toast("Hoàn tất kiểm tra, ký và lưu hợp đồng trước khi tạo đơn thực hiện.", "warning");
  const existing = state.orders.find((order) => order.contract === code && order.status !== "cancelled");
  if (existing) return navigate(`orders/${existing.code}`);
  confirmAction("Tạo đơn thực hiện hợp đồng", `${code} · ${customerName(contract.customerId)} · ${money(contract.value)}. Đơn sử dụng lịch thanh toán và giao hàng của hợp đồng.`, () => {
    const order = { code: nextCode(state.orders, "code", `SO-${new Date().getFullYear()}-`), customerId: contract.customerId, type: "Bán sỉ", channel: "Hợp đồng", quote: contract.quote, contract: code, owner: currentUser().name, created: todayText(), createdAt: new Date().toISOString(), status: contract.paid ? "eligible" : "pending_payment", total: contract.value, paid: contract.paid, lines: contract.lines.map((line) => ({ ...line, held: 0, shipped: 0 })), note: "" };
    state.orders.unshift(order); addAudit("Tạo đơn từ hợp đồng", order.code, code);
    navigate(`orders/${order.code}`); toast("Đã tạo đơn thực hiện hợp đồng.");
  });
}

function showDeliverySchedule(code) {
  const delivery = state.deliveries.find((item) => item.code === code);
  if (!delivery || !["delivery_pending", "failed"].includes(delivery.status)) return;
  showForm(delivery.status === "failed" ? "Lên lịch giao lại" : "Bàn giao vận chuyển", `<div class="form-grid">${inputField("carrier", "Đơn vị vận chuyển", "text", delivery.carrier || "", "required")}${inputField("planned", "Ngày giao dự kiến", "date", isoDate(todayText()), "required")}${inputField("fee", "Phí vận chuyển (VND)", "number", delivery.fee || 0, "required min=0 step=1")}${selectField("payer", "Bên chịu phí", [["SoulWine", "SoulWine"], ["Khách hàng", "Khách hàng"]], delivery.payer)}${inputField("address", "Địa chỉ giao", "text", delivery.address || customerById(delivery.customerId)?.address || "", "required")}${inputField("tracking", "Mã vận đơn", "text", delivery.tracking || "")}</div>`, (data) => {
    if (state.returns.some((item) => item.delivery === code && item.status === "completed")) return formError("Hàng đã được nhập hoàn. Cần lập phiếu xuất mới trước khi giao lại.");
    Object.assign(delivery, { carrier: data.get("carrier"), planned: displayDate(data.get("planned")), fee: Number(data.get("fee")), payer: data.get("payer"), address: data.get("address"), tracking: data.get("tracking"), status: "shipping" });
    const order = orderByCode(delivery.order); if (order) order.status = "shipping";
    addAudit("Bàn giao vận chuyển", code, delivery.carrier); closeDialog(); render(true); toast("Đã lưu lịch và thông tin vận chuyển.");
  });
}

function showReturnForm() {
  const orders = state.orders.filter((order) => order.lines.some((line) => line.shipped > 0));
  if (!orders.length) return toast("Chưa có đơn đã xuất để lập yêu cầu đổi trả.", "info");
  showForm("Tiếp nhận yêu cầu đổi trả", `${selectField("order", "Đơn hàng", orders.map((order) => [order.code, `${order.code} · ${customerName(order.customerId)}`]))}${selectField("sku", "Sản phẩm", state.products.map((product) => [product.sku, product.name]))}${inputField("qty", "Số lượng hoàn", "number", 1, "required min=1 step=1")}${selectField("source", "Nguyên nhân thuộc trách nhiệm", [["SoulWine", "SoulWine"], ["Vận chuyển", "Đơn vị vận chuyển"]])}${inputField("reason", "Mô tả lỗi và căn cứ", "text", "", "required maxlength=240")}`, (data) => {
    const order = orderByCode(data.get("order")), sku = data.get("sku"), qty = Number(data.get("qty"));
    const line = order.lines.find((item) => item.sku === sku);
    const returned = state.returns.filter((item) => item.order === order.code && item.sku === sku && item.status !== "rejected").reduce((sum, item) => sum + item.qty, 0);
    if (!line || !Number.isSafeInteger(qty) || qty <= 0 || qty + returned > line.shipped) return formError("Số lượng hoàn phải thuộc lượng đã xuất và chưa có yêu cầu hoàn khác.");
    const record = { code: nextCode(state.returns, "code", `DT-${new Date().getFullYear()}-`, 4), order: order.code, customerId: order.customerId, sku, qty, reason: data.get("reason"), source: data.get("source"), status: "inspecting", createdAt: todayText(), evidence: [], note: "Chờ nhận hàng thực tế và kiểm tra" };
    state.returns.unshift(record); addAudit("Tiếp nhận yêu cầu đổi trả", record.code, `${record.source}: ${record.reason}`);
    closeDialog(); render(true); toast("Đã tạo yêu cầu; tồn chỉ cập nhật sau khi nhận hàng thực tế.");
  });
}

function handleManagementAction(action, data) {
  switch (action) {
    case "new-product": return showProductForm();
    case "edit-product": return showProductForm(data.sku);
    case "new-supplier": return showSupplierForm();
    case "opening-stock": return showOpeningStock();
    case "new-purchase-request": return showPurchaseRequestForm();
    case "create-po": return showPurchaseOrderForm(data.code);
    case "create-receipt": return showReceiptForm(data.code);
    case "create-wholesale-order": return createWholesaleOrder(data.code);
    case "schedule-delivery": return showDeliverySchedule(data.code);
    case "new-return": return showReturnForm();
    case "add-cart-row": {
      const container = document.getElementById("cart-lines");
      if (!container) return;
      container.insertAdjacentHTML("beforeend", lineEditorRow(Date.now(), !!data.purchase));
      activeDialog.dirty = true; updateCartSummary(); return;
    }
    case "remove-cart-row": {
      if (document.querySelectorAll("[data-cart-row]").length <= 1) return toast("Giữ ít nhất một dòng hàng.", "info");
      document.activeElement.closest("[data-cart-row]")?.remove(); activeDialog.dirty = true; updateCartSummary(); return;
    }
    case "backup-workspace": return workspaceBackup();
    case "retry-save": persistWorkspace(); renderStorageStatus(); return;
    case "reload-workspace": return confirmAction("Tải dữ liệu mới", "Thay thế nội dung đang mở bằng dữ liệu đã lưu từ cửa sổ khác.", () => { const payload = JSON.parse(localStorage.getItem(WORKSPACE_KEY)); hydrateWorkspace(payload); render(true); });
    case "download-recovery": return downloadBlob(new Blob([workspaceStatus.raw], { type: "application/json" }), "SoulWine-can-khoi-phuc.json");
    case "restore-backup": return restoreWorkspaceFile();
    case "clear-workspace": return showForm("Xóa dữ liệu nghiệp vụ trên thiết bị", `<div class="banner danger mb-16">Tất cả danh mục, giao dịch và tệp đính kèm sẽ bị xóa. Nhân sự và cấu hình được giữ lại. Tải bản sao lưu trước khi tiếp tục.</div>${inputField("confirmation", "Nhập XÓA DỮ LIỆU để xác nhận", "text", "", "required")}`, (form) => {
      if (form.get("confirmation") !== "XÓA DỮ LIỆU") return formError("Nội dung xác nhận chưa đúng.");
      ENTITY_KEYS.filter((key) => key !== "users").forEach((key) => state[key] = []);
      state.notifications = []; state.attachments = {}; state.ui.draftQuote = null; state.ui.quoteWorkingCopies = {};
      state.sampleData = { ...(state.sampleData || {}), suppressAutoLoad: true };
      addAudit("Xóa dữ liệu nghiệp vụ", "Thiết bị hiện tại", "Đã xác nhận bằng nội dung bắt buộc", "warning");
      closeDialog(); navigate("dashboard"); toast("Đã xóa dữ liệu nghiệp vụ trên thiết bị.");
    }, { submitLabel: "Xóa dữ liệu" });
    case "discard-settings": state.ui.settingsDirty = false; render(true); return;
    case "metric-help": {
      const metric = operationalMetrics().find((item) => item.code === data.code);
      return showDialog({ title: `${metric.code} · ${metric.label}`, body: `<p>${escapeHtml(metric.help)}</p><p class="hint mt-16">Mục tiêu: ${metric.target}. Chỉ tính các bản ghi có đủ thời điểm và chứng từ; không suy đoán dữ liệu thiếu.</p>`, footer: `<a class="btn btn-primary" href="#/${metric.route}">Xem dữ liệu gốc</a>` });
    }
    case "clear-filters": return clearActiveFilters();
    case "sort-table": {
      const view = state.ui.tableViews[data.table];
      const column = Number(data.column); view.direction = view.sort === column ? -view.direction : 1; view.sort = column; view.page = 1;
      return render(true);
    }
    case "page-table": state.ui.tableViews[data.table].page = Number(data.page); return render(true);
    case "open-help": return showDialog({ drawer: true, title: "Trợ giúp & dữ liệu", subtitle: "SoulWine Operations", body: `<div class="help-section"><h3>Bắt đầu từ danh mục</h3><p>Thêm sản phẩm và khách hàng; cấu hình ngưỡng tiếp nhận và thông tin doanh nghiệp trong Cài đặt.</p><h3>Điều kiện xử lý</h3><p>Giữ hàng cần có cọc hoặc đủ tiền. Nhập/xuất bị khóa khi đang kiểm kê. Các quyết định phê duyệt thuộc đúng vai trò được phân công.</p><h3>Phím tắt</h3><p><kbd>/</kbd> hoặc <kbd>Ctrl K</kbd> tìm kiếm · <kbd>Esc</kbd> đóng lớp thông tin · <kbd>Tab</kbd> chuyển điều khiển.</p><h3>Lưu trữ trên thiết bị</h3><p>Thay đổi được lưu vào trình duyệt. Tải bản sao lưu trong Cài đặt để tránh mất dữ liệu khi xóa bộ nhớ trình duyệt. Không có đồng bộ máy chủ hoặc xác thực danh tính trong không gian này.</p></div>` });
    case "view-attachment": return openAttachment(data.id);
    case "reset-user-password": return showResetPasswordForm(data.id);
    case "unlock-account": return unlockLoginAccount(data.id);
    case "change-password": return showChangePasswordForm();
  }
}

async function restoreWorkspaceFile() {
  const input = document.createElement("input"); input.type = "file"; input.accept = ".json";
  input.addEventListener("change", async () => {
    const file = input.files[0]; if (!file) return;
    if (file.size > 8 * 1024 * 1024) return toast("Bản sao lưu vượt 8 MB. Kiểm tra lại tệp.", "warning");
    let payload;
    try { payload = validateWorkspace(JSON.parse(await file.text())); validateRestoredData(payload.data); } catch (error) { return toast(`Không thể khôi phục: ${error.message}`, "error"); }
    showForm("Khôi phục không gian làm việc", `<div class="banner warning mb-16">Bản sao lưu gồm ${payload.data.orders.length} đơn hàng, ${payload.data.products.length} sản phẩm${payload.data.credentials ? ` và ${payload.data.credentials.length} tài khoản đăng nhập` : ""}. Nội dung hiện tại sẽ được thay thế.</div>${inputField("confirmation", "Nhập KHÔI PHỤC để tiếp tục", "text", "", "required")}`, async (data) => {
      if (data.get("confirmation") !== "KHÔI PHỤC") return formError("Nội dung xác nhận chưa đúng.");
      try {
        const revision = Math.max(workspaceStatus.revision, Number(payload.revision) || 0) + 1;
        payload = { ...payload, revision, savedAt: new Date().toISOString() };
        localStorage.setItem(WORKSPACE_KEY, JSON.stringify(payload));
        hydrateWorkspace(payload);
        state.sampleData = { ...(state.sampleData || {}), suppressAutoLoad: true };
        await ensureSeedCredentials();
        closeDialog(); render(true); toast("Đã khôi phục dữ liệu trên thiết bị.");
      } catch { return formError("Không đủ dung lượng hoặc trình duyệt không cho phép ghi. Dữ liệu hiện tại chưa bị thay thế."); }
    }, { submitLabel: "Khôi phục dữ liệu" });
  }, { once: true });
  input.click();
}

function validateRestoredData(data) {
  if (!data || typeof data !== "object") throw new Error("Thiếu dữ liệu không gian làm việc.");
  const numbers = new Set(["qty", "price", "retail", "wholesale", "min", "physical", "held", "damaged", "paid", "total", "value", "amount", "shipped", "system", "count", "received", "good", "ordered", "discount", "fee"]);
  const walk = (object, depth = 0, path = "") => {
    if (depth > 15) throw new Error("Cấu trúc dữ liệu quá sâu.");
    if (!object || typeof object !== "object") return;
    for (const [key, value] of Object.entries(object)) {
      if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("Tệp có trường không được phép.");
      if (numbers.has(key) && value !== null && (typeof value !== "number" || !Number.isFinite(value) || (value < 0 && !(path.startsWith("movements.") && key === "qty")))) throw new Error(`Giá trị ${key} không hợp lệ.`);
      if (typeof value === "object") walk(value, depth + 1, path ? `${path}.${key}` : key);
    }
  };
  walk(data);
  const skus = new Set(data.products.map((product) => product.sku));
  if (skus.size !== data.products.length || data.products.some((product) => !/^[A-Za-z0-9_-]{1,40}$/.test(product.sku) || typeof product.name !== "string")) throw new Error("Danh mục SKU không hợp lệ hoặc trùng lặp.");
  for (const key of ["orders", "quotes", "contracts"]) {
    if (data[key].some((item) => !Array.isArray(item.lines) || item.lines.some((line) => !skus.has(line.sku)) || !data.customers.some((customer) => customer.id === item.customerId))) throw new Error("Liên kết sản phẩm / khách hàng không hợp lệ.");
  }
  if (data.users.some((user) => !Array.isArray(user.roleIds) || user.roleIds.some((role) => !ROLES[role]))) throw new Error("Vai trò nhân sự không hợp lệ.");
  if (data.users.some((user) => typeof user.name !== "string" || typeof user.email !== "string" || typeof user.id !== "string")) throw new Error("Thông tin nhân sự không hợp lệ.");
  ENTITY_KEYS.forEach((key) => {
    if (!Array.isArray(data[key])) throw new Error(`Thiếu danh mục ${key}.`);
    if (data[key].some((record) => record.status && !STATUS_META[record.status])) throw new Error("Trạng thái bản ghi không được hỗ trợ.");
    if (data[key].some((record) => [record.id, record.code].filter((value) => value !== undefined).some((value) => typeof value !== "string" || !/^[\p{L}\p{N}_./ :\-]{1,100}$/u.test(value)))) throw new Error("Mã định danh không hợp lệ.");
  });
  const editors = [data.editor, ...Object.values(data.workingQuotes || {})].filter(Boolean);
  if (editors.some((item) => !Array.isArray(item.lines) || item.lines.some((line) => !skus.has(line.sku)) || !data.customers.some((customer) => customer.id === item.customerId))) throw new Error("Nội dung đang soạn có liên kết không hợp lệ.");
  if (data.contracts.some((item) => !Array.isArray(item.shipments) || !item.checklist || typeof item.checklist !== "object")) throw new Error("Hồ sơ hợp đồng thiếu lịch giao / checklist.");
  if (data.credentials !== undefined) {
    if (!Array.isArray(data.credentials)) throw new Error("Danh sách đăng nhập không hợp lệ.");
    const userIds = new Set(data.users.map((user) => user.id));
    const emails = new Set();
    for (const credential of data.credentials) {
      if (!userIds.has(credential.userId) || typeof credential.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(credential.email)) throw new Error("Thông tin đăng nhập không khớp hồ sơ nhân sự.");
      if (emails.has(credential.email)) throw new Error("Email đăng nhập bị trùng lặp.");
      emails.add(credential.email);
      if (credential.pending) { if (credential.hash !== "" || credential.salt !== "") throw new Error("Trạng thái mật khẩu chưa cấp không hợp lệ."); }
      else if (!/^[a-f0-9]{64}$/.test(credential.hash || "") || !/^[a-f0-9]{32}$/.test(credential.salt || "")) throw new Error("Dữ liệu mật khẩu không đúng định dạng đã băm.");
      if (typeof credential.mustChange !== "boolean" || typeof credential.locked !== "boolean" || !Number.isSafeInteger(credential.failedAttempts) || credential.failedAttempts < 0) throw new Error("Trạng thái đăng nhập không hợp lệ.");
      if (credential.lockUntil !== null && !/^\d{4}-\d{2}-\d{2}T/.test(String(credential.lockUntil))) throw new Error("Thời điểm khóa đăng nhập không hợp lệ.");
    }
  }
  if (data.receipts.some((item) => !Array.isArray(item.lines) || !Array.isArray(item.evidence))) throw new Error("Hồ sơ tiếp nhận không hợp lệ.");
  if (data.stocktakes.some((item) => !Array.isArray(item.lines))) throw new Error("Hồ sơ kiểm kê không hợp lệ.");
  const rules = data.settings.rules;
  for (const [key, minimum, maximum, optional] of [["receiptTolerance", 0, 100, true], ["quoteValidityDays", 1, 365, false], ["holdDays", 1, 365, true], ["approvalHours", 1, 720, true], ["quoteReminderDays", 0, 30, false], ["shipmentReminderDays", 0, 30, false]]) {
    if (optional && rules[key] === null) continue;
    if (typeof rules[key] !== "number" || !Number.isFinite(rules[key]) || rules[key] < minimum || rules[key] > maximum) throw new Error("Quy tắc vận hành không hợp lệ.");
  }
  if (![rules.workStart, rules.workEnd].every((value) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) || rules.workStart >= rules.workEnd) throw new Error("Giờ làm việc không hợp lệ.");
  if (!data.settings.organization || Object.values(data.settings.organization).some((value) => typeof value !== "string")) throw new Error("Thông tin doanh nghiệp không hợp lệ.");
  if (!data.settings.notifications || Object.values(data.settings.notifications).some((value) => typeof value !== "boolean")) throw new Error("Cấu hình thông báo không hợp lệ.");
  if (Object.values(data.attachments || {}).some((file) => !["application/pdf", "image/jpeg", "image/png"].includes(file.type) || typeof file.content !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.content))) throw new Error("Tệp đính kèm không hợp lệ.");
  if (![10, 25, 50].includes(data.settings.display.pageSize) || !["comfortable", "compact"].includes(data.settings.display.density)) throw new Error("Cấu hình giao diện không hợp lệ.");
}

function openAttachment(id) {
  const attachment = state.attachments[id];
  if (!attachment) return toast("Tệp gốc không có trên thiết bị này. Chọn lại tệp từ hồ sơ liên quan.", "warning");
  let bytes;
  try { bytes = Uint8Array.from(atob(attachment.content), (letter) => letter.charCodeAt(0)); } catch { return toast("Tệp chưa thể đọc. Chọn lại bản gốc trong hồ sơ liên quan.", "error"); }
  const blob = new Blob([bytes], { type: attachment.type });
  const url = URL.createObjectURL(blob);
  const popup = window.open("", "_blank");
  if (!popup) downloadBlob(blob, attachment.name);
  else { popup.opener = null; popup.location.href = url; }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
