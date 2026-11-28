const SYNC_CONFIG_KEY = "soulwine.serverSync";
const SYNC_TOKEN_KEY = "soulwine.syncToken";
const serverSync = { enabled: false, baseUrl: "", token: "", state: "off", lastError: "", lastSyncAt: "", serverRevision: 0, busy: false, sessionLogin: null };

function readSyncConfig() { try { return JSON.parse(localStorage.getItem(SYNC_CONFIG_KEY)) || {}; } catch { return {}; } }
function writeSyncConfig(config) { try { localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(config)); } catch { toast("Trình duyệt không cho lưu cấu hình đồng bộ.", "warning"); } }

function serverSyncConnected() { return !!(serverSync.enabled && serverSync.baseUrl && serverSync.token && !serverSync.busy); }
function serverSyncClearToken() { serverSync.token = ""; try { sessionStorage.removeItem(SYNC_TOKEN_KEY); } catch {} }

async function syncFetch(pathname, options = {}) {
  const headers = { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) };
  try {
    const response = await fetch(`${serverSync.baseUrl}${pathname}`, { method: options.method || "GET", headers, body: options.body });
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    return { ok: response.ok, status: response.status, data };
  } catch { return { ok: false, status: 0, data: null }; }
}

function initServerSync() {
  const config = readSyncConfig();
  serverSync.enabled = !!config.enabled;
  serverSync.baseUrl = String(config.baseUrl || "").replace(/\/+$/, "");
  try { serverSync.token = sessionStorage.getItem(SYNC_TOKEN_KEY) || ""; } catch { serverSync.token = ""; }
  serverSync.state = serverSync.token ? "connecting" : serverSync.enabled ? "authNeeded" : "off";
}

async function serverSyncResumeSession() {
  if (!serverSync.enabled || !serverSync.baseUrl || !serverSync.token) return;
  serverSync.busy = true;
  try {
    const meta = await syncFetch("/api/workspace?meta=1", { token: serverSync.token });
    if (meta.status === 401 || meta.status === 403) { serverSyncClearToken(); serverSync.state = "authNeeded"; return; }
    if (!meta.ok) { serverSync.state = "unreachable"; serverSync.lastError = "Không kết nối được máy chủ dữ liệu dùng chung."; return; }
    serverSync.state = "active";
    serverSync.lastError = "";
    serverSync.serverRevision = meta.data.exists ? meta.data.revision : 0;
    if (meta.data.exists && meta.data.revision !== workspaceStatus.revision) await serverSyncAdoptServerData();
  } finally { serverSync.busy = false; renderStorageStatus(); }
}

function serverSyncMergeCredentials(data) {
  if (!Array.isArray(data.credentials) || !state.activeUserId) return data;
  const localEntry = (state.credentials || []).find((entry) => entry.userId === state.activeUserId);
  const index = data.credentials.findIndex((entry) => entry.userId === state.activeUserId);
  if (!localEntry || index === -1) return data;
  const serverEntry = data.credentials[index];
  if (Date.parse(localEntry.updatedAt || 0) > Date.parse(serverEntry.updatedAt || 0) && localEntry.hash !== serverEntry.hash) {
    const credentials = [...data.credentials];
    credentials[index] = localEntry;
    return { ...data, credentials };
  }
  return data;
}

async function serverSyncAdoptServerData(force = false) {
  if (!serverSync.token) return;
  if (!force && (document.getElementById("action-form") || document.querySelector(".drawer.open"))) return;
  const full = await syncFetch("/api/workspace", { token: serverSync.token });
  if (!full.ok || !full.data?.exists) { if (full.status === 401 || full.status === 403) { serverSyncClearToken(); serverSync.state = "authNeeded"; } return; }
  serverSync.serverRevision = full.data.revision;
  if (!force && full.data.revision === workspaceStatus.revision) return;
  let data = full.data.data;
  try {
    validateRestoredData(data);
    data = typeof sanitizeDataTypeNotes === "function" ? sanitizeDataTypeNotes(data) : data;
    data = serverSyncMergeCredentials(data);
    const split = await splitLegacyWarehouseAccount(data, credentialByUserId(WAREHOUSE_DEMO_ACCOUNT.id));
    if (split) endRemovedRoleSession(data.users);
    hydrateWorkspace({ version: 1, revision: full.data.revision, savedAt: full.data.savedAt, data });
    try { localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ version: 1, revision: full.data.revision, savedAt: full.data.savedAt, data })); } catch {}
  } catch { serverSync.state = "unreachable"; serverSync.lastError = "Bản dữ liệu dùng chung trên máy chủ không hợp lệ."; renderStorageStatus(); return; }
  serverSync.state = "active";
  serverSync.lastError = "";
  render(true);
  renderStorageStatus();
}

async function serverSyncPushLocal() {
  if (!serverSyncConnected()) return;
  serverSync.busy = true;
  try {
    const base = Number.isSafeInteger(serverSync.serverRevision) ? serverSync.serverRevision : 0;
    const result = await syncFetch("/api/workspace", { method: "PUT", token: serverSync.token, body: JSON.stringify({ version: 1, baseRevision: base, data: JSON.parse(workspaceStatus.serialized) }) });
    if (result.status === 409) { workspaceStatus.conflict = true; serverSync.state = "conflict"; serverSync.serverRevision = result.data?.details?.currentRevision ?? base; return; }
    if (result.status === 401 || result.status === 403) { serverSyncClearToken(); serverSync.state = "authFailed"; serverSync.lastError = "Phiên máy chủ đã hết; đăng nhập lại để tiếp tục đồng bộ."; return; }
    if (!result.ok) { serverSync.state = "unreachable"; serverSync.lastError = "Máy chủ chưa nhận được bản lưu."; return; }
    serverSync.serverRevision = result.data.revision;
    serverSync.state = "active";
    serverSync.lastSyncAt = result.data.savedAt;
    serverSync.lastError = "";
  } finally { serverSync.busy = false; renderStorageStatus(); }
}

async function serverSyncFinishLogin(email, apiPassword, newPassword, role) {
  if (!serverSync.enabled || !serverSync.baseUrl || !email || !apiPassword) return;
  serverSync.state = "connecting";
  serverSync.busy = true;
  renderStorageStatus();
  try {
    const login = await syncFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password: apiPassword }) });
    if (!login.ok) {
      serverSyncClearToken();
      serverSync.state = login.status === 423 || login.status === 403 ? "authFailed" : login.status === 0 ? "unreachable" : "authFailed";
      serverSync.lastError = login.status === 0 ? "Không kết nối được máy chủ; dữ liệu vẫn trên thiết bị." : "Máy chủ không chấp nhận mật khẩu này; dữ liệu vẫn trên thiết bị.";
      return;
    }
    let token = login.data.token;
    if (login.data.scope === "password-change") {
      if (!newPassword) { serverSyncClearToken(); serverSync.state = "authFailed"; serverSync.lastError = "Máy chủ yêu cầu đổi mật khẩu lần đầu."; return; }
      const change = await syncFetch("/api/auth/change-password", { method: "POST", token, body: JSON.stringify({ currentPassword: apiPassword, newPassword, confirm: newPassword }) });
      if (!change.ok) { serverSyncClearToken(); serverSync.state = "authFailed"; serverSync.lastError = "Máy chủ chưa cập nhật được mật khẩu mới."; return; }
      token = change.data.token;
    }
    if (login.data.role !== role) {
      const selected = await syncFetch("/api/auth/session", { method: "POST", token, body: JSON.stringify({ role }) });
      if (!selected.ok) { serverSyncClearToken(); serverSync.state = "authFailed"; serverSync.lastError = "Vai trò này chưa được gán trên máy chủ."; return; }
      token = selected.data.token || token;
    }
    serverSync.token = token;
    try { sessionStorage.setItem(SYNC_TOKEN_KEY, token); } catch {}
    serverSync.email = email;
    serverSync.state = "active";
    serverSync.lastError = "";
    const meta = await syncFetch("/api/workspace?meta=1", { token: serverSync.token });
    if (!meta.ok) { serverSync.state = "unreachable"; return; }
    serverSync.serverRevision = meta.data.exists ? meta.data.revision : 0;
    if (!meta.data.exists || meta.data.revision === 0) {
      if (workspaceStatus.revision > 0) { serverSync.busy = false; await serverSyncPushLocal(); serverSync.busy = true; }
    } else if (meta.data.revision !== workspaceStatus.revision) {
      serverSync.busy = false;
      await serverSyncAdoptServerData();
      serverSync.busy = true;
    }
  } finally { serverSync.busy = false; renderStorageStatus(); }
}

async function serverSyncChangePasswordRemote(currentPassword, newPassword) {
  if (!serverSync.token) return;
  const result = await syncFetch("/api/auth/change-password", { method: "POST", token: serverSync.token, body: JSON.stringify({ currentPassword, newPassword, confirm: newPassword }) });
  if (result.ok) {
    serverSync.token = result.data.token;
    try { sessionStorage.setItem(SYNC_TOKEN_KEY, result.data.token); } catch {}
    return;
  }
  serverSync.state = result.status === 401 || result.status === 400 ? "authFailed" : "unreachable";
  serverSync.lastError = "Máy chủ chưa cập nhật được mật khẩu này.";
  renderStorageStatus();
}

async function serverSyncLogout() {
  const token = serverSync.token;
  serverSyncClearToken();
  serverSync.state = serverSync.enabled ? "authNeeded" : "off";
  if (!token) return;
  await syncFetch("/api/auth/logout", { method: "POST", token });
  renderStorageStatus();
}

async function serverSyncPoll() {
  if (!serverSyncConnected() || serverSync.busy || document.hidden || workspaceStatus.conflict) return;
  if (document.getElementById("action-form") || document.querySelector(".drawer.open")) return;
  if (JSON.stringify(workspaceData()) !== workspaceStatus.serialized) return;
  const meta = await syncFetch("/api/workspace?meta=1", { token: serverSync.token });
  if (meta.status === 401 || meta.status === 403) { serverSyncClearToken(); serverSync.state = "authFailed"; serverSync.lastError = "Phiên máy chủ đã hết; đăng nhập lại để tiếp tục đồng bộ."; renderStorageStatus(); return; }
  if (!meta.ok || !meta.data?.exists) return;
  if (meta.data.revision > serverSync.serverRevision) await serverSyncAdoptServerData();
}

async function serverSyncTestConnection(baseUrl) {
  const previous = serverSync.baseUrl;
  serverSync.baseUrl = baseUrl;
  const health = await syncFetch("/api/health");
  serverSync.baseUrl = previous;
  return health.ok && health.data?.ok === true;
}

function serverSyncStatusLine() {
  if (!serverSync.enabled) return { text: "Chưa kết nối máy chủ. Dữ liệu nằm trong trình duyệt hiện tại.", tone: "muted" };
  const map = {
    off: ["Chưa kết nối máy chủ.", "muted"],
    authNeeded: ["Đã cấu hình. Đăng nhập lại để bắt đầu đồng bộ.", "info"],
    connecting: ["Đang kết nối máy chủ…", "info"],
    active: [`Đang đồng bộ · bản dùng chung #${serverSync.serverRevision}${serverSync.lastSyncAt ? ` · lưu gần nhất ${new Date(serverSync.lastSyncAt).toLocaleTimeString("vi-VN")}` : ""}`, "success"],
    conflict: ["Máy chủ có bản mới hơn. Tải lại dữ liệu trước khi tiếp tục.", "warning"],
    authFailed: [serverSync.lastError || "Máy chủ từ chối phiên đăng nhập này.", "danger"],
    unreachable: [serverSync.lastError || "Không kết nối được máy chủ.", "danger"]
  };
  const [text, tone] = map[serverSync.state] || map.off;
  return { text, tone };
}

setInterval(() => { if (serverSyncConnected()) serverSyncPoll(); }, 10000);
