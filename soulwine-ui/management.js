Object.assign(ACTION_ROLES, {
  "new-product": ["director", "sales_manager"], "edit-product": ["director", "sales_manager"],
  "new-supplier": ["director", "warehouse_manager"], "edit-customer": ["director", "sales_manager", "sales_staff"],
  "opening-stock": ["warehouse_manager"], "new-purchase-request": ["warehouse_manager"], "auto-purchase-request": ["warehouse_manager"],
  "create-po": ["warehouse_manager"], "create-receipt": ["warehouse_manager", "warehouse_staff"], "create-basic-receipt": ["warehouse_manager"],
  "redeliver-po": ["warehouse_manager", "warehouse_staff"], "record-supplier-payment": ["accountant"], "record-purchase-cost": ["accountant"],
  "create-wholesale-order": ["sales_manager", "sales_staff"], "schedule-delivery": ["sales_manager", "sales_staff", "warehouse_manager"],
  "new-return": ["sales_manager", "sales_staff"], "restore-backup": ["director"], "clear-workspace": ["director"],
  "reset-user-password": ["director"], "unlock-account": ["director"], "change-password": ALL_ROLES,
  "connect-sync": ALL_ROLES, "disconnect-sync": ALL_ROLES
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
  const data = `<div class="settings-section"><div class="settings-description"><h2>Lưu trữ trên thiết bị</h2><p>Dữ liệu và tệp đính kèm được lưu trong trình duyệt hiện tại. Không có đồng bộ nhiều thiết bị. Xóa dữ liệu trình duyệt có thể làm mất dữ liệu; nên tải bản sao lưu định kỳ.</p></div><div class="storage-summary"><span>${icon("shield")}</span><div><strong>${(bytes / 1024).toFixed(1)} KB đang sử dụng</strong><small>${workspaceStatus.savedAt ? `Lưu gần nhất ${new Date(workspaceStatus.savedAt).toLocaleString("vi-VN")}` : "Chưa lưu trên thiết bị"}</small></div><span class="chip ${workspaceStatus.error ? "danger" : "success"}">${workspaceStatus.error ? "Cần kiểm tra" : "Đang hoạt động"}</span></div><div class="settings-actions"><div><h3>Sao lưu dữ liệu</h3><p>Tải tệp JSON gồm danh mục, giao dịch, cấu hình và tệp đính kèm trên thiết bị.</p></div><button class="btn btn-secondary" type="button" data-action="backup-workspace">${icon("download")} Tải bản sao lưu</button></div><div class="settings-actions"><div><h3>Khôi phục từ bản sao lưu</h3><p>Kiểm tra dữ liệu và xác nhận trước khi thay thế không gian làm việc hiện tại.</p></div><button class="btn btn-secondary" type="button" data-action="restore-backup" ${admin ? "" : "disabled"}>${icon("upload")} Chọn tệp JSON</button></div><div class="settings-actions"><div><h3>Dữ liệu dùng chung qua máy chủ</h3><p>Kết nối SoulWine API để các bộ phận dùng chung một nguồn dữ liệu. Kết nối dùng email và mật khẩu đã đăng nhập trên thiết bị này để xác thực với máy chủ một lần; mật khẩu không lưu thêm vào đâu. Khi kết nối, bản dữ liệu máy chủ thay thế dữ liệu cục bộ; nếu máy chủ còn trống, dữ liệu cục bộ được tải lên. Phân quyền nghiệp vụ vẫn theo vai trò đang dùng.</p><div class="form-grid mt-12">${inputField("syncUrl", "Địa chỉ máy chủ API", "text", serverSync.baseUrl || "http://127.0.0.1:8787", "maxlength=200 data-sync-field=1")}</div><div class="mt-12"><small class="muted">${escapeHtml(serverSyncStatusLine().text)}</small></div></div><div class="flex gap-8 flex-wrap"><button class="btn btn-secondary" type="button" data-action="disconnect-sync" ${serverSync.enabled ? "" : "disabled"}>Ngắt kết nối</button><button class="btn btn-primary" type="button" data-action="connect-sync">${icon("upload")} Kết nối máy chủ</button></div></div><div class="settings-actions danger-zone"><div><h3>Xóa dữ liệu nghiệp vụ</h3><p>Giữ lại nhân sự và cấu hình; xóa danh mục, giao dịch và tệp đính kèm. Cần nhập nội dung xác nhận.</p></div><button class="btn btn-danger" type="button" data-action="clear-workspace" ${admin ? "" : "disabled"}>Xóa dữ liệu</button></div></div>`;
  const stocktakeRules = `<div class="settings-options mt-24"><label class="setting-switch"><span><strong>Cho phép Thủ kho hủy kỳ kiểm kê</strong><small>Mặc định tắt. Chỉ bật khi SoulWine đã phê chuẩn thủ tục và quyền hủy. Hủy yêu cầu lý do, lưu số đã đếm và không điều chỉnh tồn.</small></span><input type="checkbox" name="allowStocktakeCancellation" ${settings.rules.allowStocktakeCancellation === true ? "checked" : ""}><span class="switch-track" aria-hidden="true"></span></label></div>`;
  const content = { organization, rules: rules + stocktakeRules, notifications, display, data }[tab];
  const editable = !["organization", "rules"].includes(tab) || admin;
  return `${pageHead({ title: "Cài đặt không gian làm việc", subtitle: "Cấu hình thống nhất cho doanh nghiệp và trải nghiệm trên thiết bị." })}<div class="card settings-card">${tabsBar("settings", tabs, tab)}<form id="settings-form" class="card-body" novalidate>${!editable ? '<div class="banner info mb-24">Bạn có thể xem cấu hình. Chỉ Giám đốc được thay đổi thông tin doanh nghiệp và quy tắc vận hành.</div>' : ""}<fieldset ${editable ? "" : "disabled"}>${content}</fieldset><div class="banner danger hidden mt-16" id="settings-error" role="alert"></div>${tab !== "data" ? `<div class="settings-footer"><span id="settings-save-note">Thay đổi được lưu trên trình duyệt hiện tại.</span><div class="flex gap-8"><button class="btn btn-secondary" type="button" data-action="discard-settings">Hủy thay đổi</button><button class="btn btn-primary" type="submit" ${editable ? "" : "disabled"}>${icon("check")} Lưu cấu hình</button></div></div>` : ""}</form></div>`;
}

function saveSettings(form) {
  const tab = state.ui.settingsTab || "organization";
  if (["organization", "rules"].includes(tab) && state.role !== "director") return;
  const data = new FormData(form);
  if (!form.reportValidity()) return;
  const settings = structuredClone(state.settings);
  let auditDetail = "Đã lưu thay đổi cấu hình";
  const error = (text) => { const element = document.getElementById("settings-error"); element.textContent = text; element.classList.remove("hidden"); };
  if (tab === "organization") {
    ["name", "taxId", "address", "representative", "phone", "email"].forEach((key) => settings.organization[key] = String(data.get(key)).trim());
    if (!settings.organization.name) return error("Tên doanh nghiệp không được để trống.");
    if (settings.organization.taxId && !/^\d{10}(?:-?\d{3})?$/.test(settings.organization.taxId)) return error("Mã số thuế gồm 10 hoặc 13 chữ số.");
  }
  if (tab === "rules") {
    if (!state.loggedIn || workspaceStatus.conflict) return;
    for (const [key, min, max, optional] of [["receiptTolerance", 0, 100, true], ["quoteValidityDays", 1, 365, false], ["holdDays", 1, 365, true], ["approvalHours", 1, 720, true], ["quoteReminderDays", 0, 30, false], ["shipmentReminderDays", 0, 30, false]]) {
      const value = data.get(key);
      if (value === "" && optional) settings.rules[key] = null;
      else if (!Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max || (key !== "receiptTolerance" && !Number.isInteger(Number(value)))) return error("Kiểm tra các giới hạn thời gian và ngưỡng đã nhập.");
      else settings.rules[key] = Number(value);
    }
    if (data.get("workStart") >= data.get("workEnd")) return error("Giờ kết thúc phải sau giờ bắt đầu làm việc.");
    settings.rules.workStart = data.get("workStart"); settings.rules.workEnd = data.get("workEnd");
    settings.rules.allowStocktakeCancellation = data.has("allowStocktakeCancellation");
    if (settings.rules.allowStocktakeCancellation !== (state.settings.rules.allowStocktakeCancellation === true)) auditDetail += settings.rules.allowStocktakeCancellation ? " · Bật quyền hủy kỳ kiểm kê cho Thủ kho" : " · Tắt quyền hủy kỳ kiểm kê cho Thủ kho";
  }
  if (tab === "notifications") Object.keys(settings.notifications).forEach((key) => settings.notifications[key] = data.has(key));
  if (tab === "display") { settings.display.density = data.get("density"); settings.display.pageSize = Number(data.get("pageSize")); }
  state.settings = settings;
  state.ui.settingsDirty = false;
  addAudit("Cập nhật cấu hình", tab, auditDetail);
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
  const products = state.products.filter((product) => !state.movements.some((move) => move.sku === product.sku) && product.physical === 0);
  if (!products.length) return toast("Không có sản phẩm chưa phát sinh biến động. Dùng phiếu tiếp nhận để nhập thêm.", "info");
  const unlocked = products.filter((product) => !stockLock(product.sku));
  if (!unlocked.length) return toast("Tất cả SKU đủ điều kiện đang bị khóa kiểm kê.", "warning");
  showForm("Ghi nhận tồn đầu kỳ", `<div class="banner warning mb-16">Chỉ áp dụng một lần cho SKU chưa có biến động kho. Không thay thế quy trình nhập hàng từ nhà cung cấp.</div>${selectField("sku", "Sản phẩm", unlocked.map((product) => [product.sku, product.name]))}${inputField("qty", "Số lượng thực tế", "number", "", "required min=1 step=1")}${inputField("reference", "Biên bản / chứng từ nguồn", "text", "", "required maxlength=120")}`, (data) => {
    const product = productBySku(data.get("sku"));
    const qty = Number(data.get("qty"));
    if (!guardAction("opening-stock") || !product || stockLock(product.sku) || product.physical || state.movements.some((move) => move.sku === product.sku)) return formError("Sản phẩm đã có biến động hoặc SKU đang bị khóa. Kiểm tra lại dữ liệu.");
    if (!Number.isSafeInteger(qty) || qty <= 0) return formError("Nhập số lượng nguyên dương.");
    product.physical = qty;
    addMovement("Nhập kho", product.sku, qty, qty, 0, data.get("reference"), "Số dư đầu kỳ");
    addAudit("Ghi nhận tồn đầu kỳ", product.sku, `${qty} · ${data.get("reference")}`);
    closeDialog(); render(true); toast("Đã ghi nhận tồn đầu kỳ.");
  });
}

function showSupplierForm(id) {
  const supplier = id ? state.suppliers.find((item) => item.id === id) : null;
  const action = id ? "edit-supplier" : "new-supplier";
  if (!guardAction(action) || (id && !supplier)) return;
  const values = supplier || {};
  showForm(supplier ? "Sửa thông tin nhà cung cấp" : "Thêm nhà cung cấp", `<div class="form-grid">${inputField("name", "Tên nhà cung cấp", "text", values.name || "", "required maxlength=160")}${inputField("contact", "Người liên hệ", "text", values.contact || "", "required")}${inputField("phone", "Điện thoại", "tel", values.phone || "", "required")}${inputField("email", "Email", "email", values.email || "", "required")}${inputField("tax", "Mã số thuế", "text", values.tax || "", "required")}${inputField("address", "Địa chỉ", "text", values.address || "", "required")}${inputField("terms", "Điều khoản thanh toán", "text", values.terms || "", "required")}</div>`, (data) => {
    if (!guardAction(action) || (supplier && !state.suppliers.includes(supplier))) return formError("Hồ sơ nhà cung cấp đã thay đổi. Mở lại trước khi lưu.");
    const fields = Object.fromEntries(["name", "contact", "phone", "email", "tax", "address", "terms"].map((key) => [key, String(data.get(key) ?? "").trim()]));
    if (!fields.name) return formError("Nhập tên nhà cung cấp.");
    if (state.suppliers.some((item) => item !== supplier && item.name.trim().toLowerCase() === fields.name.toLowerCase())) return formError("Tên nhà cung cấp đã tồn tại.");
    if (!/^\d{10}(?:\d{3})?$/.test(fields.tax)) return formError("Mã số thuế gồm 10 hoặc 13 chữ số.");
    if (state.suppliers.some((item) => item !== supplier && item.tax === fields.tax)) return formError("Mã số thuế đã thuộc nhà cung cấp khác.");
    if (!/^0\d{9,10}$/.test(fields.phone)) return formError("Số điện thoại gồm 10–11 chữ số, bắt đầu bằng 0.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) return formError("Email không hợp lệ.");
    if (!fields.contact || !fields.address || !fields.terms) return formError("Nhập người liên hệ, địa chỉ và điều khoản thanh toán.");
    const record = supplier || { id: nextCode(state.suppliers, "id", "NCC-", 3), catalog: [], skus: 0, lastDelivery: "—", note: "" };
    Object.assign(record, fields);
    if (!supplier) state.suppliers.push(record);
    addAudit(supplier ? "Cập nhật nhà cung cấp" : "Thêm nhà cung cấp", record.id, fields.name);
    closeDialog(); render(true); toast(supplier ? "Đã cập nhật nhà cung cấp." : "Đã thêm nhà cung cấp.");
  });
}

function supplierSupplyCatalog(supplier) {
  if (!supplier) return [];
  const rows = new Map((supplier.catalog || []).map((entry) => [entry.sku, { ...entry, source: "Danh mục nhà cung cấp" }]));
  const orders = state.purchaseOrders.filter((order) => order.supplier === supplier.id).sort((a, b) => {
    const date = (order) => order.createdAt ? Date.parse(isoDate(order.createdAt)) || 0 : 0;
    return date(b) - date(a) || b.code.localeCompare(a.code, undefined, { numeric: true });
  });
  for (const order of orders) {
    for (const line of order.lines) {
      if (!rows.has(line.sku) && Number.isSafeInteger(line.price) && line.price > 0) rows.set(line.sku, { sku: line.sku, price: line.price, leadDays: null, updatedAt: order.createdAt, source: "Theo lần mua gần nhất" });
    }
  }
  return [...rows.values()];
}

function showSupplierCatalogForm(id) {
  const supplier = state.suppliers.find((item) => item.id === id);
  if (!guardAction("supplier-catalog") || !supplier) return;
  if (!state.products.length) return toast("Thêm sản phẩm trước khi gắn vào danh mục cung ứng.", "info");
  let selectedSku;
  showForm("Gắn sản phẩm", `${selectField("sku", "Sản phẩm", state.products.map((product) => [product.sku, `${product.sku} · ${product.name}`]))}<div class="form-grid">${inputField("price", "Giá nhập tham chiếu (VND)", "number", "", "required min=1 step=1")}${inputField("leadDays", "Giao dự kiến (ngày)", "number", "", "required min=0 max=365 step=1")}</div>`, (data) => {
    if (!guardAction("supplier-catalog") || !state.suppliers.includes(supplier)) return formError("Hồ sơ nhà cung cấp đã thay đổi. Mở lại trước khi lưu.");
    const sku = data.get("sku"), price = Number(data.get("price")), leadDays = Number(data.get("leadDays"));
    if (!productBySku(sku)) return formError("Chọn sản phẩm đang có trong danh mục.");
    if (!String(data.get("price") ?? "").trim() || !Number.isSafeInteger(price) || price <= 0) return formError("Giá nhập tham chiếu phải là số nguyên dương trong giới hạn xử lý.");
    if (!String(data.get("leadDays") ?? "").trim() || !Number.isInteger(leadDays) || leadDays < 0 || leadDays > 365) return formError("Giao dự kiến phải là số nguyên từ 0 đến 365 ngày.");
    const entry = { sku, price, leadDays, updatedAt: new Date().toISOString() };
    supplier.catalog ||= [];
    const index = supplier.catalog.findIndex((item) => item.sku === sku);
    if (index < 0) supplier.catalog.push(entry);
    else supplier.catalog[index] = entry;
    addAudit("Cập nhật danh mục cung ứng", supplier.id, `${sku} · ${money(price)} · ${leadDays} ngày`);
    closeDialog(); render(true); showSecondaryDetails("supplier", supplier.id); toast("Đã cập nhật danh mục cung ứng.");
  }, { subtitle: supplier.name, input: () => {
    const form = document.getElementById("action-form");
    const sku = form.elements.sku.value;
    if (selectedSku === sku) return;
    selectedSku = sku;
    const row = supplierSupplyCatalog(supplier).find((entry) => entry.sku === sku);
    form.elements.price.value = row?.price ?? "";
    form.elements.leadDays.value = row?.leadDays ?? "";
  } });
}

function lineEditorRow(index, purchase = false, values = {}) {
  const products = state.products.filter((product) => product.status === "product_active");
  return `<div class="cart-row" data-cart-row><div class="field"><label for="cart-sku-${index}">Sản phẩm</label><select class="select" name="cartSku" id="cart-sku-${index}">${products.map((product) => `<option value="${product.sku}" ${product.sku === values.sku ? "selected" : ""}>${escapeHtml(product.name)} · ${product.unit}</option>`).join("")}</select></div><div class="field"><label for="cart-qty-${index}">Số lượng</label><input class="input" id="cart-qty-${index}" name="cartQty" type="number" min="1" step="1" value="${values.qty ?? 1}" required></div>${purchase ? `<div class="field"><label for="cart-price-${index}">Giá mua (VND)</label><input class="input" id="cart-price-${index}" name="cartPrice" type="number" min="1" step="1" value="${values.price ?? ""}" required></div>` : ""}<button type="button" class="icon-btn" data-action="remove-cart-row" aria-label="Xóa dòng">${icon("trash")}</button></div>`;
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

function purchaseEvidenceField(label) {
  return field("evidence", label, `<input class="input" id="form-evidence" name="evidence" type="file" required accept=".pdf,.jpg,.jpeg,.png">`, "PDF/JPG/PNG tối đa 2 MB.");
}

async function savePurchaseEvidence(file, reference, stillCurrent) {
  if (!file.size) throw new Error("Tệp chứng từ đang trống.");
  const [attachment] = await storeAttachments([file], reference);
  if (stillCurrent()) return attachment;
  delete state.attachments[attachment.id];
  persistWorkspace();
  throw new Error("Hồ sơ đã thay đổi trong lúc lưu chứng từ. Mở lại hồ sơ và thử lại.");
}

function minimumStockProposal() {
  const deficient = state.products.filter((product) => product.status === "product_active" && availableOf(product) < product.min);
  const groups = state.suppliers.map((supplier) => {
    const catalog = supplierSupplyCatalog(supplier);
    const lines = deficient.flatMap((product) => {
      const supply = catalog.find((item) => item.sku === product.sku);
      return supply ? [{ sku: product.sku, qty: product.min - availableOf(product), price: supply.price }] : [];
    });
    return { supplier: supplier.id, lines };
  });
  groups.sort((a, b) => b.lines.length - a.lines.length);
  return { deficient, group: groups[0] };
}

function showPurchaseRequestForm(automatic = false) {
  if (!guardAction("new-purchase-request") || (automatic && !guardAction("auto-purchase-request"))) return;
  const proposal = automatic ? minimumStockProposal() : null;
  if (automatic && !proposal.deficient.length) return toast("Không có sản phẩm dưới định mức tồn tối thiểu.", "info");
  if (!state.products.length || !state.suppliers.length) return toast("Thêm sản phẩm và nhà cung cấp trước khi lập yêu cầu mua.", "info");
  if (automatic && !proposal.group?.lines.length) return toast("Chưa có danh mục cung ứng cho các sản phẩm dưới định mức. Bổ sung nhà cung cấp và giá tham khảo trước khi đề xuất.", "warning");
  const suggested = proposal?.group;
  const banner = automatic ? `<div class="banner info mb-16">Đề xuất theo tồn khả dụng dưới định mức tối thiểu. Nhà cung cấp được chọn đáp ứng nhiều SKU thiếu nhất: ${suggested.lines.length}/${proposal.deficient.length} SKU. Số lượng = định mức − khả dụng; đơn giá là giá tham khảo. Kiểm tra, chỉnh sửa và đính kèm báo giá trước khi tự gửi phê duyệt; hệ thống không tự gửi.</div>` : "";
  showForm(automatic ? "Đề xuất nhập hàng từ tồn tối thiểu" : "Lập yêu cầu mua hàng", `${banner}<div class="form-grid">${selectField("supplier", "Nhà cung cấp", state.suppliers.map((supplier) => [supplier.id, supplier.name]), suggested?.supplier)}${inputField("needed", "Ngày cần hàng", "date", isoDate(todayText()), "required")}${inputField("note", "Lý do mua hàng", "text", automatic ? "Bổ sung hàng dưới định mức tồn tối thiểu" : "", "required")}${purchaseEvidenceField("Báo giá của nhà cung cấp")}</div><div class="section-heading mt-24"><h3>Chi tiết đề xuất</h3><button type="button" class="btn btn-secondary btn-sm" data-action="add-cart-row" data-purchase="true">Thêm dòng</button></div><div id="cart-lines">${suggested ? suggested.lines.map((line, index) => lineEditorRow(index, true, line)).join("") : lineEditorRow(0, true)}</div><div class="banner info mt-16" id="cart-summary"></div>`, async (data) => {
    const needed = String(data.get("needed") || "");
    if (needed < isoDate(todayText())) return formError("Ngày cần hàng không được trước hôm nay.");
    const parsedNeeded = new Date(`${needed}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(needed) || !Number.isFinite(+parsedNeeded) || parsedNeeded.toISOString().slice(0, 10) !== needed) return formError("Nhập ngày cần hàng hợp lệ.");
    let cart;
    try { cart = readCart(data, true); } catch (error) { return formError(error.message); }
    const supplier = data.get("supplier"), file = data.get("evidence"), note = data.get("note").trim();
    const amount = cart.reduce((sum, line) => sum + line.qty * line.price, 0);
    if (!file?.name) return formError("Đính kèm báo giá của nhà cung cấp trước khi gửi duyệt.");
    if (!guardAction("new-purchase-request") || !note || !state.suppliers.some((item) => item.id === supplier) || !Number.isSafeInteger(amount)) return formError("Kiểm tra nhà cung cấp, lý do mua và tổng giá trị đề xuất.");
    const code = nextCode(state.purchaseRequests, "code", `YCM-${new Date().getFullYear()}-`);
    const dialog = activeDialog;
    const attachment = await savePurchaseEvidence(file, code, () => activeDialog === dialog && guardAction("new-purchase-request") && needed >= isoDate(todayText()) && state.suppliers.some((item) => item.id === supplier) && cart.every((line) => productBySku(line.sku)?.status === "product_active") && !state.purchaseRequests.some((item) => item.code === code));
    const request = { code, supplier, requester: currentUser().name, createdAt: todayText(), needed: displayDate(needed), status: "pending", amount, lines: cart, note, quoteAttachmentId: attachment.id, approvals: { accountant: false, director: false } };
    state.purchaseRequests.unshift(request);
    ["accountant", "director"].forEach((role) => state.approvals.unshift({ id: nextCode(state.approvals, "id", "AP-", 4), type: "purchase", ref: request.code, title: role === "accountant" ? "Kiểm tra tài chính mua hàng" : "Phê duyệt yêu cầu mua", assignee: role, status: "pending", createdAt: nowStamp(), age: "Vừa gửi", requester: currentUser().name, amount: request.amount, summary: request.note, lines: structuredClone(cart), evidence: [attachment.name] }));
    addAudit("Gửi duyệt yêu cầu mua", request.code, money(request.amount));
    closeDialog(); render(true); toast("Đã gửi yêu cầu đến Kế toán và Giám đốc.");
  }, { drawer: false, submitLabel: "Gửi phê duyệt", input: () => updateCartSummary() });
  document.getElementById("action-form").dataset.purchase = "true";
  updateCartSummary();
}

function showPurchaseOrderForm(code) {
  const available = (request) => request && purchaseRequestEligible(request) && !state.purchaseOrders.some((order) => order.request === request.code);
  const requests = state.purchaseRequests.filter(available);
  if (!requests.length) return toast("Chưa có yêu cầu đủ hai phê duyệt và chưa lập đơn đặt hàng.", "info");
  showForm("Lập đơn đặt hàng", `${selectField("request", "Yêu cầu mua đã duyệt", requests.map((request) => [request.code, `${request.code} · ${supplierName(request.supplier)}`]), code)}${inputField("receiveDate", "Ngày nhận dự kiến", "date", isoDate(todayText()), "required")}${inputField("terms", "Điều khoản thanh toán", "text", "", "required")}`, (data) => {
    const request = state.purchaseRequests.find((item) => item.code === data.get("request"));
    if (!guardAction("create-po") || !available(request)) return formError("Yêu cầu mua không còn đủ điều kiện lập đơn đặt hàng.");
    const order = { code: nextCode(state.purchaseOrders, "code", `PO-${new Date().getFullYear()}-`), supplier: request.supplier, request: request.code, createdAt: todayText(), receiveDate: displayDate(data.get("receiveDate")), amount: request.amount, status: "receiving", receipt: "", terms: data.get("terms"), lines: structuredClone(request.lines) };
    state.purchaseOrders.unshift(order); addAudit("Lập đơn đặt hàng", order.code, request.code);
    closeDialog(); navigate("purchase-orders"); toast("Đã lập đơn đặt hàng.");
  });
}

function canStartPoReceipt(order, refused = null) {
  if (!order || !order.lines?.length) return false;
  const attempts = state.receipts.filter((receipt) => receipt.po === order.code && !receipt.source);
  return refused ? order.status === "returned" && order.receipt === refused.code && refused.status === "returned" && attempts.includes(refused) && attempts.every((receipt) => receipt.status === "returned")
    : order.status === "receiving" && !order.receipt && !attempts.length;
}

function showReceiptForm(code, previousCode) {
  const action = previousCode ? "redeliver-po" : "create-receipt";
  if (!guardAction(action)) return;
  const previous = previousCode && receiptByCode(previousCode);
  const orders = state.purchaseOrders.filter((order) => previousCode ? order.code === code && previous && canStartPoReceipt(order, previous) : canStartPoReceipt(order));
  if (!orders.length || (code && !orders.some((order) => order.code === code))) return toast("Đơn đặt hàng không còn có thể mở phiếu tiếp nhận mới.", "info");
  const fields = previous ? `<p class="small mb-16">${escapeHtml(code)} · Giao lại sau phiếu ${escapeHtml(previous.code)}. Kiểm đếm và đính kèm chứng từ mới; phiếu đã trả lô được giữ nguyên.</p>${inputField("eta", "Ngày nhận lô giao lại", "date", isoDate(todayText()), "required")}`
    : selectField("order", "Đơn đặt hàng", orders.map((order) => [order.code, `${order.code} · ${supplierName(order.supplier)}`]), code);
  showForm(previous ? "Tiếp nhận lô giao lại" : "Tạo phiếu tiếp nhận", fields, (data) => {
    const order = state.purchaseOrders.find((item) => item.code === (previous ? code : data.get("order")));
    if (!guardAction(action) || !canStartPoReceipt(order, previous)) return formError("Đơn đặt hàng đã thay đổi hoặc đã có phiếu tiếp nhận.");
    const receipt = { code: nextCode(state.receipts, "code", `PN-${new Date().getFullYear()}-`), po: order.code, supplier: order.supplier, eta: previous ? displayDate(data.get("eta")) : order.receiveDate, status: "receiving", owner: currentUser().name, lines: order.lines.map((line) => ({ sku: line.sku, ordered: line.qty, received: null, good: null, damaged: null, counted: false })), evidence: [], note: "" };
    if (previous) receipt.previousReceipt = previous.code;
    state.receipts.unshift(receipt); order.receipt = receipt.code; order.status = "receiving";
    addAudit(previous ? "Tiếp nhận lô giao lại" : "Tạo phiếu tiếp nhận", receipt.code, previous ? `${order.code} · sau phiếu ${previous.code}` : order.code);
    closeDialog(); navigate(`receipts/${receipt.code}`);
  }, { submitLabel: "Tạo phiếu" });
}

function showPurchaseFinanceForm(code, adjustment = false) {
  const action = adjustment ? "record-purchase-cost" : "record-supplier-payment";
  if (!guardAction(action)) return;
  const receipt = adjustment ? receiptByCode(code) : null;
  const order = state.purchaseOrders.find((item) => item.code === (adjustment ? receipt?.po : code));
  const canRecord = () => order && state.purchaseOrders.includes(order) && (!adjustment || (receiptByCode(code) === receipt && purchaseCostReceipt(order) === receipt && !receipt.costAdjustment));
  if (!canRecord()) return toast("Không tìm thấy hồ sơ mua hàng cần ghi nhận.", "warning");
  const title = adjustment ? "Ghi nhận điều chỉnh chi phí" : "Đối chiếu thanh toán nhà cung cấp";
  const amount = inputField("amount", adjustment ? "Mức tăng / giảm chi phí đã xác minh (VND)" : "Số tiền thực tế đã trả (VND)", "number", "", adjustment ? "required step=1" : "required min=1 step=1") + (adjustment ? '<p class="hint">Nhập số có dấu; nhập 0 nếu đã đối chiếu và không có điều chỉnh.</p>' : "");
  const details = adjustment ? inputField("note", "Căn cứ điều chỉnh đã đối chiếu", "text", "", "required maxlength=240") : inputField("date", "Ngày thực tế thanh toán", "date", isoDate(todayText()), `required max=${isoDate(todayText())}`);
  showForm(title, `<div class="banner info mb-16"><div><strong>${escapeHtml(order.code)} · ${escapeHtml(supplierName(order.supplier))}</strong><div>${adjustment ? `Phiếu nhập đã xác nhận: ${escapeHtml(receipt.code)}. Không tự tính hoặc hạch toán điều chỉnh.` : `Điều khoản: ${escapeHtml(order.terms || "Chưa ghi nhận")}. Chỉ lưu chứng từ đã đối chiếu; không thực hiện thanh toán.`}</div></div></div>${amount}${details}${inputField("reference", "Số chứng từ đối chiếu", "text", "", "required maxlength=120")}${purchaseEvidenceField("Chứng từ đã kiểm tra")}<label class="small"><input type="checkbox" name="verified" required> Tôi đã đối chiếu chứng từ và xác minh số tiền với hồ sơ này.</label>`, async (data) => {
    const rawAmount = String(data.get("amount") ?? "").trim(), value = Number(rawAmount);
    const reference = String(data.get("reference") ?? "").trim(), file = data.get("evidence");
    const note = String(data.get("note") ?? "").trim(), date = String(data.get("date") ?? "");
    const duplicate = () => !adjustment && (order.supplierPayments || []).some((entry) => entry.reference.toLowerCase() === reference.toLowerCase());
    const validTotal = () => adjustment || Number.isSafeInteger((order.supplierPayments || []).reduce((sum, entry) => sum + entry.amount, 0) + value);
    if (!guardAction(action) || !canRecord()) return formError("Hồ sơ không còn có thể ghi nhận.");
    if (!rawAmount || !Number.isSafeInteger(value) || (!adjustment && value <= 0) || !validTotal()) return formError("Kiểm tra số tiền theo đơn vị VND.");
    if (!reference || reference.length > 120 || !file?.name || !data.has("verified")) return formError("Cần số chứng từ, tệp và xác nhận đã kiểm tra.");
    if (adjustment && (!note || note.length > 240)) return formError("Nhập căn cứ điều chỉnh đã đối chiếu.");
    if (!adjustment) {
      const parsed = new Date(`${date}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== date || date > isoDate(todayText())) return formError("Ngày thực tế thanh toán không hợp lệ hoặc ở tương lai.");
      if (duplicate()) return formError("Chứng từ này đã được ghi nhận trên đơn đặt hàng.");
    }
    const dialog = activeDialog;
    const attachment = await savePurchaseEvidence(file, adjustment ? receipt.code : order.code, () => activeDialog === dialog && guardAction(action) && canRecord() && !duplicate() && validTotal());
    const record = { reference, evidenceId: attachment.id, verifiedAt: new Date().toISOString(), verifiedBy: currentUser().name, verifiedById: state.activeUserId };
    if (adjustment) receipt.costAdjustment = { ...record, delta: value, note };
    else (order.supplierPayments ||= []).push({ ...record, amount: value, date: displayDate(date) });
    addAudit(title, adjustment ? receipt.code : order.code, `${reference} · ${money(value)}`, "success");
    closeDialog(); render(true); toast("Đã lưu kết quả đối chiếu, không thực hiện giao dịch.");
  }, { submitLabel: "Lưu kết quả đối chiếu" });
}

function showBasicReceiptForm() {
  if (!state.products.some((product) => product.status === "product_active")) return toast("Thêm sản phẩm trước khi lập phiếu nhập.", "warning");
  showForm("Lập phiếu nhập từ chứng từ nguồn", `${inputField("source", "Số chứng từ nguồn đã kiểm tra", "text", "", "required maxlength=120")}${inputField("note", "Kết quả đối chiếu", "text", "", "required maxlength=240")}<div class="section-heading mt-16"><h3>Số lượng theo chứng từ</h3><button type="button" class="btn btn-secondary btn-sm" data-action="add-cart-row">Thêm dòng</button></div><div id="cart-lines">${lineEditorRow(0)}</div>`, (data) => {
    const source = data.get("source").trim(), note = data.get("note").trim();
    const skus = data.getAll("cartSku"), quantities = data.getAll("cartQty");
    const lines = skus.map((sku, index) => ({ sku, ordered: Number(quantities[index]), received: null, good: null, damaged: null, counted: false }));
    if (!source || !note || !lines.length || new Set(skus).size !== skus.length || lines.some((line) => productBySku(line.sku)?.status !== "product_active" || !Number.isSafeInteger(line.ordered) || line.ordered < 1)) return formError("Nhập chứng từ, kết quả đối chiếu và số lượng nguyên dương cho từng SKU không trùng.");
    if (state.receipts.some((receipt) => receipt.source?.toLowerCase() === source.toLowerCase())) return formError("Chứng từ nguồn này đã có phiếu nhập.");
    const receipt = { code: nextCode(state.receipts, "code", `PN-${new Date().getFullYear()}-`), po: "", source, supplier: "", eta: todayText(), owner: currentUser().name, status: "receiving", lines, evidence: [], note };
    state.receipts.unshift(receipt);
    addAudit("Lập phiếu nhập từ chứng từ nguồn", receipt.code, source);
    closeDialog(); navigate(`receipts/${receipt.code}`);
  }, { submitLabel: "Lập phiếu" });
}

function createWholesaleOrder(code) {
  const contract = contractByCode(code);
  if (!contract || contract.status !== "active") return toast("Hoàn tất kiểm tra, ký và lưu hợp đồng trước khi tạo đơn thực hiện.", "warning");
  const existing = state.orders.find((order) => order.contract === code && order.status !== "cancelled");
  if (existing) return navigate(`orders/${existing.code}`);
  const customer = customerById(contract.customerId);
  showForm("Tạo đơn thực hiện hợp đồng", shippingAddressFields(customer), (data) => {
    if (contractByCode(code) !== contract || contract.status !== "active") return formError("Hợp đồng không còn đủ điều kiện tạo đơn.");
    if (state.orders.some((order) => order.contract === code && order.status !== "cancelled")) return formError("Hợp đồng đã có đơn thực hiện.");
    const address = selectedShippingAddress(data, customer);
    if (!address) return formError("Chọn hoặc nhập địa chỉ nhận hàng hợp lệ.");
    const order = { code: nextCode(state.orders, "code", `SO-${new Date().getFullYear()}-`), customerId: contract.customerId, type: "Bán sỉ", channel: "Hợp đồng", quote: contract.quote, contract: code, owner: currentUser().name, created: todayText(), createdAt: new Date().toISOString(), status: "pending_payment", total: contract.value, paid: contract.paid, lines: contract.lines.map((line) => ({ ...line, held: 0, shipped: 0 })), address, note: "" };
    if (orderEligible(order)) { order.status = "eligible"; order.eligibleAt = order.createdAt; }
    state.orders.unshift(order); addAudit("Tạo đơn từ hợp đồng", order.code, code);
    navigate(`orders/${order.code}`); toast("Đã tạo đơn thực hiện hợp đồng.");
  }, { subtitle: `${code} · ${customerName(contract.customerId)} · ${money(contract.value)}. Đơn sử dụng lịch thanh toán và giao hàng của hợp đồng.`, submitLabel: "Tạo đơn hàng", input: updateShippingAddressField });
}

function showDeliverySchedule(code) {
  const actor = deliveryActionActor("schedule-delivery");
  const delivery = state.deliveries.find((item) => item.code === code);
  if (!actor || !delivery) return;
  const blocked = deliveryReturnBlock(delivery);
  if (blocked) return toast(blocked, "warning");
  const { status, scheduledAt, resultRecordedAt } = delivery;
  const remaining = deliveryOutstandingItems(delivery);
  if (!["delivery_pending", "failed", "delivery_partial"].includes(status) || !remaining.length) return;
  const customer = customerById(delivery.customerId);
  const addressFields = shippingAddressFields(customer, delivery.address || orderByCode(delivery.order)?.address, "Địa chỉ giao");
  showForm(status === "delivery_pending" ? "Bàn giao vận chuyển" : "Lên lịch giao lại phần chưa giao", `<p class="small muted">Số lượng bàn giao lần này: ${remaining.map(({ sku, qty }) => `${escapeHtml(sku)}: ${num(qty)}`).join(" · ")}</p><div class="form-grid">${inputField("carrier", "Đơn vị vận chuyển", "text", delivery.carrier || "", "required")}${inputField("planned", "Ngày giao dự kiến", "date", isoDate(todayText()), "required")}${inputField("fee", "Phí vận chuyển (VND)", "number", delivery.fee || 0, "required min=0 step=1")}${selectField("payer", "Bên chịu phí", [["SoulWine", "SoulWine"], ["Khách hàng", "Khách hàng"]], delivery.payer)}${addressFields}${inputField("tracking", "Mã vận đơn", "text", delivery.tracking || "")}</div>`, (data) => {
    if (deliveryActionActor("schedule-delivery") !== actor || !state.deliveries.includes(delivery) || delivery.status !== status || delivery.scheduledAt !== scheduledAt || delivery.resultRecordedAt !== resultRecordedAt || (delivery.shipmentId && deliveryShipment(delivery)?.delivery !== code)) return formError("Chuyến giao không còn ở trạng thái có thể bàn giao.");
    const conflict = deliveryReturnBlock(delivery);
    if (conflict) return formError(conflict);
    const address = selectedShippingAddress(data, customer);
    const carrier = String(data.get("carrier") || "").trim(), planned = data.get("planned"), fee = Number(data.get("fee")), payer = data.get("payer");
    if (!address || !carrier || !/^\d{4}-\d{2}-\d{2}$/.test(planned) || !Number.isSafeInteger(fee) || fee < 0 || !["SoulWine", "Khách hàng"].includes(payer)) return formError("Nhập lịch giao, đơn vị vận chuyển, địa chỉ, phí và bên chịu phí hợp lệ.");
    const order = orderByCode(delivery.order);
    if (!order || order.status === "cancelled") return formError("Đơn hàng không còn được giao.");
    Object.assign(delivery, { attempts: deliveryAttempts(delivery), carrier, planned: displayDate(planned), fee, payer, address, tracking: data.get("tracking"), status: "shipping", scheduledAt: new Date().toISOString() });
    order.status = "shipping";
    addAudit("Bàn giao vận chuyển", code, `${carrier} · ${remaining.map(({ sku, qty }) => `${sku}: ${qty}`).join(", ")}`); closeDialog(); render(true); toast("Đã lưu lịch và thông tin vận chuyển.");
  }, { input: updateShippingAddressField });
}

function showReturnForm(receiveDirectly = false) {
  const action = receiveDirectly ? "new-undelivered-return" : "new-return";
  const actor = deliveryActionActor(action);
  if (!actor) return;
  const returnableItems = (delivery) => {
    const order = orderByCode(delivery?.order);
    const kind = deliveryReturnKind(delivery);
    if (!order || !kind || delivery.status === "returned" || (receiveDirectly && kind !== "undelivered")) return [];
    return (delivery.items || []).filter(({ sku }) => productBySku(sku) && order.lines.some((line) => line.sku === sku) && deliveryReturnRemaining(delivery, sku) > 0);
  };
  const deliveries = state.deliveries.filter((delivery) => returnableItems(delivery).length);
  if (!deliveries.length) return toast(receiveDirectly ? "Không còn lượng chưa giao để lập phiếu mới. Nếu đã có phiếu chờ nhận, mở phiếu đó để ghi thực nhận." : "Không có chuyến đã giao hoặc giao thất bại còn hàng để tiếp nhận hoàn.", "info");
  const context = receiveDirectly ? `${deliveryTimestampField("Hàng trả về thực tế lúc")}${inputField("reason", "Căn cứ bàn giao / ghi chú kiểm đếm", "text", "", "required maxlength=240")}<p class="small muted">Nếu đã có phiếu chờ nhận, mở phiếu đó để ghi thực nhận. Bước này chưa cập nhật tồn.</p>` : `${selectField("source", "Nguyên nhân thuộc trách nhiệm", [["", "Chọn bên chịu trách nhiệm"], ["SoulWine", "SoulWine"], ["Vận chuyển", "Đơn vị vận chuyển"]])}${inputField("reason", "Mô tả lỗi và căn cứ", "text", "", "required maxlength=240")}${inputField("evidence", "Bằng chứng đổi trả (ảnh hoặc biên bản)", "file", "", "accept=.jpg,.jpeg,.png,.pdf")}`;
  showForm(receiveDirectly ? "Nhận hàng giao không thành công" : "Tiếp nhận yêu cầu đổi trả", `${selectField("delivery", "Chuyến giao", [["", "Chọn chuyến giao"], ...deliveries.map((delivery) => [delivery.code, `${delivery.code} · ${delivery.order} · ${customerName(delivery.customerId)} · ${STATUS_META[delivery.status]?.label || delivery.status}`])])}${selectField("sku", "Sản phẩm", [["", "Chọn chuyến giao trước"]])}${inputField("qty", receiveDirectly ? "Số thực nhận" : "Số lượng hoàn", "number", receiveDirectly ? "" : 1, "required min=1 step=1")}${context}`, async (data) => {
    if (deliveryActionActor(action) !== actor) return formError("Vai trò hoặc dữ liệu đã thay đổi. Tải lại hồ sơ và thử lại.");
    const delivery = state.deliveries.find((item) => item.code === data.get("delivery"));
    const sku = data.get("sku"), qty = Number(data.get("qty")), reason = String(data.get("reason") || "").trim(), source = data.get("source");
    if (!returnableItems(delivery).some((item) => item.sku === sku)) return formError("Chọn chuyến giao hợp lệ và sản phẩm còn được hoàn trên chuyến đó.");
    if (!Number.isSafeInteger(qty) || qty <= 0 || qty > deliveryReturnRemaining(delivery, sku)) return formError("Số lượng hoàn phải là số nguyên dương và không vượt phần còn được hoàn trên chuyến này.");
    const receivedAt = receiveDirectly ? deliveryTimestamp(data) : "";
    if (!reason || reason.length > 240 || (receiveDirectly ? !receivedAt : !["SoulWine", "Vận chuyển"].includes(source))) return formError(receiveDirectly ? "Cần thời điểm thực nhận và căn cứ bàn giao." : "Chọn bên chịu trách nhiệm và nêu lỗi, căn cứ đổi trả.");
    const proof = data.get("evidence");
    if (!receiveDirectly && !proof?.name) return formError("Đính kèm bằng chứng đổi trả (ảnh hoặc biên bản).");
    const order = orderByCode(delivery.order);
    const record = { code: nextCode(state.returns, "code", `DT-${new Date().getFullYear()}-`, 4), order: order.code, customerId: order.customerId, delivery: delivery.code, returnKind: deliveryReturnKind(delivery), sku, qty, reason, source, status: "inspecting", createdAt: todayText(), evidence: [], note: "Chờ nhận hàng thực tế và kiểm tra" };
    state.returns.unshift(record);
    if (receiveDirectly) {
      record.note = "Kho đã nhận hàng giao không thành công";
      recordReturnReceipt(record, receivedAt, reason);
    } else {
      if (proof?.name) { const [file] = await storeAttachments([proof], record.code); record.evidence.push(file.id); }
      addAudit("Tiếp nhận yêu cầu đổi trả", record.code, `${delivery.code} · ${record.source}: ${record.reason}`);
    }
    closeDialog(); render(true); toast(receiveDirectly ? "Đã lưu thực nhận; chưa thay đổi tồn kho." : "Đã tạo yêu cầu; tồn chỉ cập nhật sau khi kiểm tra và xác nhận nhập.");
  }, { input: () => {
    const form = document.getElementById("action-form");
    const delivery = state.deliveries.find((item) => item.code === form.elements.delivery.value);
    const skuInput = form.elements.sku;
    if (skuInput.dataset.delivery !== (delivery?.code || "")) {
      skuInput.dataset.delivery = delivery?.code || "";
      skuInput.innerHTML = `<option value="">${delivery ? "Chọn sản phẩm" : "Chọn chuyến giao trước"}</option>${returnableItems(delivery).map(({ sku }) => `<option value="${escapeHtml(sku)}">${escapeHtml(`${sku} · ${productBySku(sku).name} · Còn được hoàn: ${deliveryReturnRemaining(delivery, sku)}`)}</option>`).join("")}`;
    }
    if (skuInput.value) form.elements.qty.max = deliveryReturnRemaining(delivery, skuInput.value);
    else form.elements.qty.removeAttribute("max");
  } });
}

function handleManagementAction(action, data) {
  return handleManagementActionAsync(action, data);
}

async function handleManagementActionAsync(action, data) {
  switch (action) {
    case "new-product": return showProductForm();
    case "edit-product": return showProductForm(data.sku);
    case "new-supplier": return showSupplierForm();
    case "opening-stock": return showOpeningStock();
    case "new-purchase-request": return showPurchaseRequestForm();
    case "create-po": return showPurchaseOrderForm(data.code);
    case "create-receipt": return showReceiptForm(data.code);
    case "create-basic-receipt": return showBasicReceiptForm();
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
    case "reload-workspace": return confirmAction("Tải dữ liệu mới", serverSyncConnected() || (serverSync.enabled && serverSync.token) ? "Thay thế nội dung đang mở bằng bản dữ liệu dùng chung mới nhất từ máy chủ. Thay đổi cục bộ chưa được ghi sẽ bị bỏ." : "Thay thế nội dung đang mở bằng dữ liệu đã lưu từ cửa sổ khác.", async () => {
      if (serverSync.enabled && serverSync.token) { await serverSyncAdoptServerData(true); return; }
      const payload = JSON.parse(localStorage.getItem(WORKSPACE_KEY)); hydrateWorkspace(payload); await ensureSeedCredentials(); render(true);
    });
    case "connect-sync": {
      if (!guardAction("connect-sync")) return;
      const raw = String(document.getElementById("form-syncUrl")?.value || "").trim().replace(/\/+$/, "");
      if (!/^https?:\/\/[^\s]+$/i.test(raw)) return toast("Nhập địa chỉ máy chủ hợp lệ (http hoặc https).", "warning");
      if (!serverSync.sessionLogin) return toast("Đăng nhập lại trên thiết bị này, rồi mở Cài đặt để kết nối máy chủ.", "warning");
      const reachable = await serverSyncTestConnection(raw);
      if (!reachable) return toast("Không tìm thấy SoulWine API tại địa chỉ này. Kiểm tra máy chủ đã chạy chưa.", "warning");
      writeSyncConfig({ enabled: true, baseUrl: raw });
      serverSync.enabled = true;
      serverSync.baseUrl = raw;
      serverSync.state = "connecting";
      addAudit("Kết nối dữ liệu dùng chung", raw, `Tài khoản máy chủ: ${serverSync.sessionLogin.email}`);
      await serverSyncFinishLogin(serverSync.sessionLogin.email, serverSync.sessionLogin.apiPassword, serverSync.sessionLogin.newPassword, serverSync.sessionLogin.role);
      render(true);
      return toast(serverSync.state === "active" ? "Đã kết nối và đồng bộ dữ liệu dùng chung." : serverSync.lastError || "Máy chủ chưa chấp nhận kết nối; dữ liệu vẫn trên thiết bị.", serverSync.state === "active" ? "info" : "warning");
    }
    case "disconnect-sync": {
      if (!guardAction("disconnect-sync")) return;
      writeSyncConfig({ enabled: false, baseUrl: serverSync.baseUrl });
      serverSync.enabled = false;
      serverSyncClearToken();
      serverSync.state = "off";
      serverSync.lastError = "";
      addAudit("Ngắt kết nối dữ liệu dùng chung", "Máy chủ", "Dữ liệu trở lại lưu trên thiết bị");
      render(true);
      return toast("Đã ngắt kết nối. Dữ liệu tiếp tục lưu trên thiết bị.");
    }
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
        payload = { ...payload, revision, savedAt: new Date().toISOString(), data: sanitizeDataTypeNotes(payload.data) };
        localStorage.setItem(WORKSPACE_KEY, JSON.stringify(payload));
        hydrateWorkspace(payload);
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
  for (const supplier of data.suppliers) {
    if (supplier.catalog === undefined) continue;
    if (!Array.isArray(supplier.catalog) || supplier.catalog.some((entry) => !entry || !skus.has(entry.sku) || !Number.isSafeInteger(entry.price) || entry.price <= 0 || !Number.isSafeInteger(entry.leadDays) || entry.leadDays < 0 || entry.leadDays > 365 || typeof entry.updatedAt !== "string" || !Number.isFinite(Date.parse(entry.updatedAt))) || new Set(supplier.catalog.map((entry) => entry.sku)).size !== supplier.catalog.length) throw new Error("Danh mục cung ứng nhà cung cấp không hợp lệ.");
  }
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
  if (data.receipts.some((item) => !Array.isArray(item.lines) || !Array.isArray(item.evidence) || (item.costAdjustment && !Number.isSafeInteger(item.costAdjustment.delta)))) throw new Error("Hồ sơ tiếp nhận không hợp lệ.");
  if (data.receipts.some((item) => item.varianceNote !== undefined && (typeof item.varianceNote !== "string" || item.varianceNote.length > 1000))) throw new Error("Loại và nguyên nhân sai lệch không hợp lệ.");
  for (const item of data.returns) {
    const resolution = item.financialResolution;
    if (resolution === undefined) continue;
    if (!resolution || typeof resolution !== "object") throw new Error("Kết quả xử lý tài chính đổi trả không hợp lệ.");
    const evidence = Array.isArray(item.resolutionEvidence) ? item.resolutionEvidence.filter((entry) => entry.track === "finance" && entry.evidenceId === resolution.evidenceId && entry.reference === resolution.reference && entry.actorId === resolution.actorId && entry.actorRole === "accountant") : [];
    const file = data.attachments?.[resolution.evidenceId];
    const resolvedAt = Date.parse(resolution.resolvedAt);
    if (resolution.status !== "resolved" || resolution.authorized !== true || resolution.verified !== true || resolution.actorRole !== "accountant" || !data.users.some((user) => user.id === resolution.actorId) || typeof resolution.authorizationReference !== "string" || !resolution.authorizationReference.trim() || resolution.authorizationReference.length > 120 || typeof resolution.note !== "string" || !resolution.note.trim() || resolution.note.length > 240 || typeof resolution.reference !== "string" || !resolution.reference.trim() || resolution.reference.length > 120 || !Number.isFinite(resolvedAt) || !evidence || evidence.length !== 1 || !Number.isFinite(Date.parse(evidence[0].recordedAt)) || Date.parse(evidence[0].recordedAt) > resolvedAt || (item.postedAt && Date.parse(item.postedAt) > resolvedAt) || !file || file.reference !== item.code || !(file.size > 0) || typeof file.content !== "string" || !file.content) throw new Error("Kết quả xử lý tài chính đổi trả không hợp lệ.");
  }
  if (data.stocktakes.some((item) => !Array.isArray(item.lines))) throw new Error("Hồ sơ kiểm kê không hợp lệ.");
  const rules = data.settings.rules;
  if (rules.allowStocktakeCancellation !== undefined && typeof rules.allowStocktakeCancellation !== "boolean") throw new Error("Quy tắc hủy kỳ kiểm kê không hợp lệ.");
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
