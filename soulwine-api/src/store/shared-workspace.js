import { ApiError } from "../http/http.js";

export function readSharedWorkspace(store) {
  const row = store.db.prepare("SELECT revision,saved_at,payload FROM shared_workspace WHERE singleton=1").get();
  return row ? { revision: row.revision, savedAt: row.saved_at, data: JSON.parse(row.payload) } : null;
}

export function saveSharedWorkspace(store, meta, body) {
  if (body.version !== 1) throw new ApiError(400, "invalid_version", "Chỉ hỗ trợ phiên bản dữ liệu dùng chung 1.");
  if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) throw new ApiError(400, "invalid_input", "Nội dung dữ liệu dùng chung không hợp lệ.");
  if (!Number.isSafeInteger(body.baseRevision) || body.baseRevision < 0) throw new ApiError(400, "invalid_input", "Phiên bản cơ sở phải là số nguyên không âm.");
  const db = store.db;
  if (store.inTransaction) throw new ApiError(409, "busy", "Hệ thống đang xử lý giao dịch khác.");
  db.exec("BEGIN IMMEDIATE");
  let committed = false;
  try {
    const row = db.prepare("SELECT revision FROM shared_workspace WHERE singleton=1").get();
    const current = row ? row.revision : 0;
    if (body.baseRevision !== current) {
      db.exec("ROLLBACK");
      throw new ApiError(409, "workspace_conflict", "Dữ liệu dùng chung đã có bản mới hơn trên máy chủ.", { currentRevision: current });
    }
    const revision = current + 1;
    const savedAt = new Date().toISOString();
    const payload = JSON.stringify(body.data);
    if (row) db.prepare("UPDATE shared_workspace SET revision=?,saved_at=?,payload=? WHERE singleton=1").run(revision, savedAt, payload);
    else db.prepare("INSERT INTO shared_workspace VALUES(1,?,?,?)").run(revision, savedAt, payload);
    const event = {
      revision, at: savedAt, requestId: meta.requestId || null, actor: meta.actor || null, action: "workspace.sync",
      method: meta.method || null, route: meta.route || null, status: 200, ip: meta.ip || null, userAgent: meta.userAgent || null,
      durationMs: null, kind: "activity", entity: "sharedWorkspace", key: null, before: null, after: null, changes: null,
      summary: `${meta.actor?.name || "Người dùng"} lưu bản dữ liệu dùng chung #${revision} (${Buffer.byteLength(payload)} bytes).`
    };
    db.prepare("INSERT INTO audit_events(revision,at,request_id,actor_id,action,entity,entity_key,payload) VALUES(?,?,?,?,?,?,?,?)")
      .run(revision, savedAt, event.requestId, event.actor?.id || null, event.action, event.entity, null, JSON.stringify(event));
    db.exec("COMMIT");
    committed = true;
    return { revision, savedAt };
  } finally {
    if (!committed) { try { db.exec("ROLLBACK"); } catch {} }
  }
}
