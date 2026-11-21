const SAMPLE_BACKUP_KEY = "soulwine.before-linked-sample.v2-compact";

function installLinkedSampleData({ automatic = false } = {}) {
  const api = globalThis.SoulWineSampleData;
  if (!api) throw new Error("Chưa tải được bộ dữ liệu liên kết. Tải lại trang rồi thử lại.");
  if (workspaceStatus.error || workspaceStatus.conflict) throw new Error("Khắc phục trạng thái lưu trữ trước khi nạp dữ liệu mẫu.");
  if (automatic && (state.sampleData?.suppressAutoLoad || state.sampleData?.installedSets?.includes(api.SAMPLE_SET_ID) || sessionStorage.getItem("soulwine.sample.autoload") === "disabled")) return { skipped: true };
  const before = structuredClone(workspaceData());
  const plan = api.createSamplePlan({ collections: before, users: before.users, now: new Date() });
  if (plan.alreadyLoaded) return { skipped: true, sampleSet: plan.sampleSet };
  const candidate = structuredClone(before);
  for (const key of api.COLLECTION_KEYS) candidate[key] = [...candidate[key].filter((record) => !plan.removeSampleSets.includes(record.sampleSet)), ...plan.collections[key]];
  for (const [id, attachment] of Object.entries(candidate.attachments)) if (plan.removeSampleSets.includes(attachment.sampleSet)) delete candidate.attachments[id];
  candidate.audit = [...candidate.audit, ...plan.activity].sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));
  for (const [id, attachment] of Object.entries(plan.attachments)) {
    if (candidate.attachments[id]) throw new Error("Mã tệp dữ liệu mẫu trùng bản lưu hiện có. Không thay đổi dữ liệu.");
    candidate.attachments[id] = attachment;
  }
  if (candidate.settings.rules.receiptTolerance === null) candidate.settings.rules.receiptTolerance = plan.defaults.receiptTolerance;
  candidate.sampleData = { ...(before.sampleData || {}), suppressAutoLoad: false, installedSets: [...new Set([...(before.sampleData?.installedSets || []), plan.sampleSet])], sampleSet: plan.sampleSet, namespace: plan.namespace, installedAt: new Date().toISOString(), scenarios: plan.scenarios, counts: plan.summary.counts };
  const imported = { id: `A-${plan.namespace}-IMPORT`, time: nowStamp(), timestamp: new Date().toISOString(), actor: state.loggedIn ? currentUser().name : "Hệ thống", actorId: state.loggedIn ? state.activeUserId : null, role: state.loggedIn ? currentUser().label : "Khởi tạo dữ liệu", action: "Nạp bộ dữ liệu mẫu gọn", object: plan.sampleSet, detail: `Dữ liệu ${plan.namespace}; ${plan.removeSampleSets.length ? "rút gọn bộ mẫu cũ, " : ""}bảo toàn bản ghi tự nhập, hồ sơ và mật khẩu.`, tone: "info", sampleSet: plan.sampleSet };
  candidate.audit.unshift(imported);
  validateRestoredData(candidate);
  const raw = localStorage.getItem(WORKSPACE_KEY);
  const original = raw ? JSON.parse(raw) : { version: 1, revision: workspaceStatus.revision, savedAt: workspaceStatus.savedAt, data: before };
  if (original.revision !== workspaceStatus.revision) { workspaceStatus.conflict = true; throw new Error("Dữ liệu vừa thay đổi ở cửa sổ khác. Tải dữ liệu mới trước khi nạp mẫu."); }
  try {
    if (!localStorage.getItem(SAMPLE_BACKUP_KEY)) localStorage.setItem(SAMPLE_BACKUP_KEY, JSON.stringify(original));
  } catch {
    throw new Error("Không đủ dung lượng tạo bản sao lưu trước khi nạp mẫu. Dữ liệu hiện tại được giữ nguyên.");
  }
  hydrateWorkspace({ version: 1, revision: original.revision, savedAt: original.savedAt, data: candidate });
  // The candidate must still be written even though hydration updates the comparison cache.
  workspaceStatus.serialized = JSON.stringify(before);
  if (!persistWorkspace()) {
    const failure = workspaceStatus.error;
    const conflict = workspaceStatus.conflict;
    hydrateWorkspace({ ...original, data: before });
    workspaceStatus.serialized = JSON.stringify(original.data);
    workspaceStatus.error = failure; workspaceStatus.conflict = conflict;
    throw new Error("Chưa thể lưu dữ liệu mẫu. Bản dữ liệu trước đó không bị ghi đè.");
  }
  return { skipped: false, ...plan.summary, namespace: plan.namespace, scenarios: plan.scenarios };
}

function sampleDataNotice() {
  if (!state.sampleData?.sampleSet || !state.products.some((product) => product.sampleSet === state.sampleData.sampleSet)) return "";
  return `<div class="banner info mb-16" id="sample-data-notice">${icon("users")}<div><strong>Bộ dữ liệu mẫu liên kết giữa các vai trò.</strong> Tài khoản và mật khẩu của bạn được giữ nguyên. Các hồ sơ có ghi chú “Minh họa” và cùng dùng một không gian dữ liệu trên trình duyệt này.</div><button class="btn btn-secondary btn-sm" data-action="sample-guide">Xem kịch bản</button></div>`;
}

function sampleRecordLink(code) {
  const destinations = [["quotes", "code"], ["contracts", "code"], ["orders", "code"], ["receipts", "code"], ["stocktakes", "code"], ["payments", "id"], ["approvals", "id"], ["deliveries", "code"], ["returns", "code"], ["purchase-requests", "code"]];
  const collections = { "purchase-requests": "purchaseRequests" };
  for (const [route, key] of destinations) {
    const record = state[collections[route] || route]?.find((item) => item[key] === code);
    if (!record) continue;
    const detail = ["quotes", "contracts", "orders", "receipts", "stocktakes"].includes(route);
    const destination = detail ? hrefFor(route, code) : hrefFor(route);
    return routeAllowed(route) ? `<a class="file-chip" href="${destination}">${escapeHtml(code)} ${icon("chevron-right")}</a>` : `<span class="file-chip" title="Hồ sơ thuộc vai trò khác">${escapeHtml(code)}</span>`;
  }
  return `<span class="file-chip">${escapeHtml(code)}</span>`;
}

function showSampleGuide() {
  const scenarios = state.sampleData?.scenarios || [];
  showDialog({ title: "Các luồng dữ liệu mẫu liên kết", subtitle: "Đăng xuất rồi đăng nhập bằng tài khoản được phân công để tiếp tục cùng một hồ sơ.", wide: true, drawer: true,
    body: `<div class="banner info mb-16">Các vai trò cùng thấy dữ liệu thuộc quyền của mình. Dữ liệu mẫu được gắn nguồn minh họa, không phải giao dịch hoặc chứng từ thật.</div>${scenarios.map((scenario) => `<section class="sample-scenario"><div class="section-title">${escapeHtml(scenario.code)}</div><h3>${escapeHtml(scenario.title)}</h3><p class="hint">${scenario.roles.map((role) => ROLES[role].label).join(" → ")}</p><div class="flex flex-wrap gap-8 mt-12">${scenario.records.map(sampleRecordLink).join("")}</div></section>`).join("") || '<p class="muted">Chưa nạp bộ dữ liệu mẫu vào không gian này.</p>'}` });
}

function loadSampleFromSettings() {
  if (state.role !== "director") return toast("Chỉ Giám đốc được nạp bổ sung dữ liệu mẫu.", "warning");
  confirmAction("Nạp dữ liệu mẫu liên kết", "Bổ sung sản phẩm, khách hàng, báo giá, hợp đồng, giao dịch kho và thanh toán liên kết. Không xóa hoặc đổi dữ liệu, hồ sơ hay mật khẩu hiện có. Ngưỡng tiếp nhận 5% chỉ được điền nếu chưa thiết lập.", () => {
    try {
      const result = installLinkedSampleData();
      render(true);
      toast(result.skipped ? "Bộ dữ liệu mẫu đã được nạp; không tạo thêm bản ghi trùng." : "Đã nạp dữ liệu liên kết. Đổi tài khoản để xử lý tiếp các hồ sơ chung.");
    } catch (error) { toast(error.message, "error"); }
  }, false, "Nạp dữ liệu mẫu");
}

function downloadBeforeSample() {
  const snapshot = localStorage.getItem(SAMPLE_BACKUP_KEY);
  if (!snapshot) return toast("Chưa có bản sao lưu trước khi nạp mẫu trên thiết bị này.", "info");
  downloadBlob(new Blob([snapshot], { type: "application/json" }), "SoulWine-truoc-khi-nap-du-lieu-mau.json");
}
