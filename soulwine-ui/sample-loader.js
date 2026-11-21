const SAMPLE_BACKUP_KEY = "soulwine.before-linked-sample.v2-compact";

function cleanDataTypeText(text) {
  if (typeof text !== "string" || !text) return text;
  let value = text
    .replace(/^\s*(?:Minh họa|Dữ liệu mẫu)\s*(?:·|:|-|–)\s*/i, "")
    .replace(/Hồ sơ khách hàng(?: giả lập)?,\s*không liên hệ thực tế\.?/gi, "")
    .replace(/Hồ sơ (?:khách hàng|nhà cung cấp) giả lập\.?/gi, "")
    .replace(/Dữ liệu mẫu liên kết giữa nhân sự kinh doanh, kế toán và kho\./gi, "Đề nghị xem xét và phê duyệt theo hồ sơ đính kèm.")
    .replace(/Đơn hàng giả lập có thanh toán và chứng từ liên kết/gi, "Đơn bán lẻ.")
    .replace(/Đơn vị giao nhận Minh Họa/gi, "Viettel Post")
    .replace(/Đường Minh Họa/gi, "Nguyễn Trãi")
    .replace(/\(địa chỉ minh họa\)/gi, "")
    .replace(/Đơn hàng giả lập có /gi, "Đơn hàng có ")
    .replace(/\s*(?:·\s*)?giả lập\b/gi, "")
    .replace(/\s{2,}/g, " ");
  return value.trim();
}

function sanitizeDataTypeNotes(node) {
  if (typeof node === "string") return cleanDataTypeText(node);
  if (Array.isArray(node)) return node.map(sanitizeDataTypeNotes);
  if (node && typeof node === "object") {
    const result = {};
    for (const [key, value] of Object.entries(node)) result[key] = sanitizeDataTypeNotes(value);
    return result;
  }
  return node;
}

function installLinkedSampleData({ automatic = false } = {}) {
  const api = globalThis.SoulWineSampleData;
  if (!api) throw new Error("Chưa tải được dữ liệu khởi tạo. Tải lại trang rồi thử lại.");
  if (workspaceStatus.error || workspaceStatus.conflict) throw new Error("Khắc phục trạng thái lưu trữ trước khi bổ sung dữ liệu.");
  if (automatic && (state.sampleData?.suppressAutoLoad || state.sampleData?.installedSets?.includes(api.SAMPLE_SET_ID) || sessionStorage.getItem("soulwine.sample.autoload") === "disabled")) return { skipped: true };
  const before = structuredClone(workspaceData());
  const plan = api.createSamplePlan({ collections: before, users: before.users, now: new Date() });
  if (plan.alreadyLoaded) return { skipped: true, sampleSet: plan.sampleSet };
  const candidate = structuredClone(before);
  for (const key of api.COLLECTION_KEYS) candidate[key] = [...candidate[key].filter((record) => !plan.removeSampleSets.includes(record.sampleSet)), ...plan.collections[key]];
  for (const [id, attachment] of Object.entries(candidate.attachments)) if (plan.removeSampleSets.includes(attachment.sampleSet)) delete candidate.attachments[id];
  candidate.audit = [...candidate.audit.filter((entry) => !plan.removeSampleSets.includes(entry.sampleSet)), ...plan.activity].sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));
  for (const [id, attachment] of Object.entries(plan.attachments)) {
    if (candidate.attachments[id]) throw new Error("Mã tệp khởi tạo trùng bản lưu hiện có. Không thay đổi dữ liệu.");
    candidate.attachments[id] = attachment;
  }
  if (candidate.settings.rules.receiptTolerance === null) candidate.settings.rules.receiptTolerance = plan.defaults.receiptTolerance;
  candidate.sampleData = { ...(before.sampleData || {}), suppressAutoLoad: false, installedSets: [...new Set([...(before.sampleData?.installedSets || []), plan.sampleSet])], sampleSet: plan.sampleSet, namespace: plan.namespace, installedAt: new Date().toISOString(), scenarios: plan.scenarios, counts: plan.summary.counts };
  const imported = { id: `A-${plan.namespace}-IMPORT`, time: nowStamp(), timestamp: new Date().toISOString(), actor: state.loggedIn ? currentUser().name : "Hệ thống", actorId: state.loggedIn ? state.activeUserId : null, role: state.loggedIn ? currentUser().label : "Khởi tạo dữ liệu", action: "Khởi tạo dữ liệu nghiệp vụ", object: plan.namespace, detail: "Đã bổ sung danh mục và giao dịch vận hành; bảo toàn hồ sơ và mật khẩu hiện có.", tone: "info", sampleSet: plan.sampleSet };
  candidate.audit.unshift(imported);
  validateRestoredData(candidate);
  const raw = localStorage.getItem(WORKSPACE_KEY);
  const original = raw ? JSON.parse(raw) : { version: 1, revision: workspaceStatus.revision, savedAt: workspaceStatus.savedAt, data: before };
  if (original.revision !== workspaceStatus.revision) { workspaceStatus.conflict = true; throw new Error("Dữ liệu vừa thay đổi ở cửa sổ khác. Tải dữ liệu mới trước khi bổ sung."); }
  try {
    if (!localStorage.getItem(SAMPLE_BACKUP_KEY)) localStorage.setItem(SAMPLE_BACKUP_KEY, JSON.stringify(original));
  } catch {
    throw new Error("Không đủ dung lượng tạo bản sao lưu trước khi bổ sung dữ liệu. Dữ liệu hiện tại được giữ nguyên.");
  }
  hydrateWorkspace({ version: 1, revision: original.revision, savedAt: original.savedAt, data: candidate });
  workspaceStatus.serialized = JSON.stringify(before);
  if (!persistWorkspace()) {
    const failure = workspaceStatus.error;
    const conflict = workspaceStatus.conflict;
    hydrateWorkspace({ ...original, data: before });
    workspaceStatus.serialized = JSON.stringify(original.data);
    workspaceStatus.error = failure; workspaceStatus.conflict = conflict;
    throw new Error("Chưa thể lưu dữ liệu. Bản dữ liệu trước đó không bị ghi đè.");
  }
  return { skipped: false, ...plan.summary, namespace: plan.namespace, scenarios: plan.scenarios };
}
