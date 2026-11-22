import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { ApiError } from "../http/http.js";

export const COLLECTIONS = Object.fromEntries(Object.entries({
  users: "id", credentials: "userId", sessions: "token", outbox: "id", products: "sku", customers: "id", suppliers: "id",
  quotes: "code", approvals: "id", contracts: "code", orders: "code", payments: "id", reservations: "id", issues: "code",
  deliveries: "code", returns: "code", receipts: "code", purchaseRequests: "code", purchaseOrders: "code", documents: "code",
  movements: "id", stocktakes: "code", settings: "id"
}).map(([name, key]) => [name, { key }]));

export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}
export function deepEqual(a, b) { return stableStringify(a) === stableStringify(b); }
export function fieldDiff(before, after) {
  const result = {};
  for (const key of new Set([...Object.keys(before || {}), ...Object.keys(after || {})])) {
    if (!deepEqual(before?.[key], after?.[key])) result[key] = { before: before?.[key] ?? null, after: after?.[key] ?? null };
  }
  return Object.keys(result).length ? result : null;
}

function redact(value, entity) {
  if (value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map((item) => redact(item, entity));
  if (typeof value !== "object") return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (/password|secret|authorization|^(?:salt|hash|token|tokenHash|codeHash|otp)$/i.test(key) || (entity === "outbox" && key === "code")) continue;
    result[key] = redact(item, entity);
  }
  return result;
}

function changesBetween(before, after) {
  const changes = [];
  for (const [entity, { key: primaryKey }] of Object.entries(COLLECTIONS)) {
    const oldRecords = new Map(before[entity].map((record) => [String(record[primaryKey]), record]));
    const newRecords = new Map(after[entity].map((record) => [String(record[primaryKey]), record]));
    for (const key of new Set([...oldRecords.keys(), ...newRecords.keys()])) {
      const previous = oldRecords.get(key), current = newRecords.get(key);
      if (deepEqual(previous, current)) continue;
      const oldValue = redact(previous, entity), newValue = redact(current, entity);
      changes.push({ entity, key: entity === "sessions" ? crypto.createHash("sha256").update(key).digest("hex").slice(0, 16) : key,
        kind: !previous ? "create" : !current ? "delete" : "update", before: oldValue, after: newValue,
        changes: previous && current ? fieldDiff(oldValue, newValue) : null });
    }
  }
  return changes;
}

export class Store {
  constructor(dataDir, seedFn) {
    this.dataDir = dataDir;
    this.dbPath = path.join(dataDir, "soulwine.sqlite");
    this.seedFn = seedFn;
    this.state = null;
    this.db = null;
    this.inTransaction = false;
  }

  load() {
    fs.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(this.dbPath);
    try {
      this.db.exec(`
        PRAGMA journal_mode=WAL;
        PRAGMA synchronous=FULL;
        PRAGMA busy_timeout=5000;
        CREATE TABLE IF NOT EXISTS workspace_state (
          singleton INTEGER PRIMARY KEY CHECK (singleton=1), revision INTEGER NOT NULL, payload TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS shared_workspace (
          singleton INTEGER PRIMARY KEY CHECK (singleton=1), revision INTEGER NOT NULL, saved_at TEXT NOT NULL, payload TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS audit_events (
          seq INTEGER PRIMARY KEY AUTOINCREMENT, revision INTEGER NOT NULL, at TEXT NOT NULL,
          request_id TEXT, actor_id TEXT, action TEXT NOT NULL, entity TEXT NOT NULL, entity_key TEXT,
          payload TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_audit_request ON audit_events(request_id);
        CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity,entity_key,seq);
        CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor_id,seq);
        CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_events(at);
        CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT,'Audit events are append-only'); END;
        CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT,'Audit events are append-only'); END;
      `);
      this.db.exec("BEGIN IMMEDIATE");
      let row = this.db.prepare("SELECT revision,payload FROM workspace_state WHERE singleton=1").get();
      if (!row) {
        const seed = this.seedFn();
        this.validateState(seed);
        this.db.prepare("INSERT INTO workspace_state VALUES(1,?,?)").run(seed.revision, JSON.stringify(seed.collections));
        row = { revision: seed.revision, payload: JSON.stringify(seed.collections) };
      }
      this.state = { revision: row.revision, collections: JSON.parse(row.payload) };
      this.validateState(this.state);
      this.db.exec("COMMIT");
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch {}
      this.db.close(); this.db = null;
      throw new Error(`Không thể mở dữ liệu. Bản lưu hiện có không bị khởi tạo lại: ${error.message}`);
    }
  }

  validateState(state) {
    if (!Number.isSafeInteger(state?.revision) || state.revision < 0 || !state.collections) throw new Error("Invalid workspace state");
    for (const [name, { key }] of Object.entries(COLLECTIONS)) {
      const records = state.collections[name];
      if (!Array.isArray(records)) throw new Error(`Missing collection ${name}`);
      const keys = records.map((record) => record?.[key]);
      if (keys.some((value) => value === undefined || value === null || value === "") || new Set(keys).size !== keys.length) throw new Error(`Invalid or duplicate key in ${name}`);
    }
    const finiteValues = (value) => {
      if (typeof value === "number" && !Number.isFinite(value)) throw new ApiError(400, "invalid_numeric_state", "Giá trị số không hợp lệ.");
      if (value && typeof value === "object") Object.values(value).forEach(finiteValues);
    };
    finiteValues(state.collections);
    for (const product of state.collections.products) {
      if (![product.physical, product.held, product.damaged].every((value) => Number.isSafeInteger(value) && value >= 0) || product.physical < product.held + product.damaged) throw new ApiError(409, "invalid_stock_state", "Tồn vật lý không thể thấp hơn lượng giữ và hàng lỗi.");
    }
    for (const order of state.collections.orders) {
      if (order.lines.some((line) => ![line.qty, line.held, line.shipped].every((value) => Number.isSafeInteger(value) && value >= 0) || line.qty < line.held + line.shipped)) throw new ApiError(409, "invalid_order_quantities", "Tổng lượng giữ và đã xuất không được vượt lượng đặt.");
    }
  }

  refresh() {
    const row = this.db.prepare("SELECT revision,payload FROM workspace_state WHERE singleton=1").get();
    if (row.revision !== this.state.revision) {
      const candidate = { revision: row.revision, collections: JSON.parse(row.payload) };
      this.validateState(candidate); this.state = candidate;
    }
  }
  get journal() { return this.db.prepare("SELECT seq,payload FROM audit_events ORDER BY seq").all().map((row) => ({ ...JSON.parse(row.payload), seq: row.seq })); }
  hasRequestEvents(requestId) { return !!this.db.prepare("SELECT 1 FROM audit_events WHERE request_id=? LIMIT 1").get(requestId); }
  auditEvent(seq) { const row = this.db.prepare("SELECT seq,payload FROM audit_events WHERE seq=?").get(seq); return row ? { ...JSON.parse(row.payload), seq: row.seq } : null; }
  list(name) { return this.state.collections[name]; }
  find(name, key) { return this.list(name).find((record) => String(record[COLLECTIONS[name].key]) === String(key)) || null; }
  nextCode(name, prefix, width = 3) {
    const max = Math.max(0, ...this.list(name).map((record) => Number(String(record[COLLECTIONS[name].key]).split("-").pop()) || 0));
    return `${prefix}${String(max + 1).padStart(width, "0")}`;
  }
  saveSnapshot() { if (this.db && !this.inTransaction) this.db.exec("PRAGMA wal_checkpoint(PASSIVE)"); }
  close() { if (this.db) { this.saveSnapshot(); this.db.close(); this.db = null; } }

  transact(meta, fn) {
    if (this.inTransaction) throw new Error("Nested transactions are not supported");
    this.db.exec("BEGIN IMMEDIATE"); this.inTransaction = true;
    let committed = false;
    let result, failure = null;
    const events = [];
    try {
      this.refresh();
      const original = this.state;
      let draft = structuredClone(original);
      let notes = [];
      let callbackOpen = true;
      const ensureOpen = () => { if (!callbackOpen) throw new Error("Transaction callback has already completed"); };
      const tx = { draft, actor: structuredClone(meta.actor || null), list: (name) => { ensureOpen(); return draft.collections[name]; },
        find: (name, key) => { ensureOpen(); return draft.collections[name].find((record) => String(record[COLLECTIONS[name].key]) === String(key)) || null; },
        nextCode: (name, prefix, width = 3) => {
          ensureOpen();
          const max = Math.max(0, ...draft.collections[name].map((record) => Number(String(record[COLLECTIONS[name].key]).split("-").pop()) || 0));
          return `${prefix}${String(max + 1).padStart(width, "0")}`;
        }, note: (summary) => { ensureOpen(); notes.push(String(summary)); } };
      try {
        result = fn(tx);
        if (result?.then) { Promise.resolve(result).catch(() => {}); throw new Error("Transaction callbacks must be synchronous"); }
      } catch (error) {
        failure = error;
        const mayCommitSecurityAttempt = error instanceof ApiError && meta.commitOnErrorCodes?.includes(error.code);
        if (!mayCommitSecurityAttempt) draft = structuredClone(original);
        notes = [`Thao tác không thành công: ${error instanceof ApiError ? error.message : "Lỗi xử lý nội bộ"}`];
      } finally { callbackOpen = false; }
      result = failure || result === undefined ? undefined : structuredClone(result);
      this.validateState(draft);
      const changes = changesBetween(original.collections, draft.collections);
      const revision = original.revision + 1;
      const at = new Date().toISOString();
      const shared = { revision, at, requestId: meta.requestId || null, actor: meta.actor || null, action: meta.action || "state.change",
        method: meta.method || null, route: meta.route || null, status: failure ? failure.status || 500 : meta.status || 200,
        ip: meta.ip || null, userAgent: meta.userAgent || null, durationMs: meta.durationMs ?? null };
      const entries = [...changes, ...notes.map((summary) => ({ kind: "activity", entity: "activity", key: null, before: null, after: null, changes: null, summary }))];
      if (entries.length) {
        const insert = this.db.prepare("INSERT INTO audit_events(revision,at,request_id,actor_id,action,entity,entity_key,payload) VALUES(?,?,?,?,?,?,?,?)");
        for (const entry of entries) {
          const event = { ...shared, ...entry };
          const inserted = insert.run(revision, at, shared.requestId, shared.actor?.id || null, shared.action, entry.entity, entry.key, JSON.stringify(event));
          events.push({ ...event, seq: Number(inserted.lastInsertRowid) });
        }
        draft.revision = revision;
        this.db.prepare("UPDATE workspace_state SET revision=?,payload=? WHERE singleton=1").run(revision, JSON.stringify(draft.collections));
      }
      this.db.exec("COMMIT"); committed = true;
      this.state = draft;
    } catch (error) {
      if (!committed) this.db.exec("ROLLBACK");
      throw error;
    } finally { this.inTransaction = false; }
    if (failure) throw failure;
    return { result, events };
  }
}

export function queryJournal(store, filters = {}) {
  const clauses = [], values = [];
  if (!filters.includeInternal) clauses.push("entity NOT IN ('sessions','outbox','credentials')");
  for (const [field, column] of [["entity", "entity"], ["key", "entity_key"], ["actorId", "actor_id"], ["action", "action"]]) {
    if (filters[field] && filters[field] !== "all") { clauses.push(`${column}=?`); values.push(String(filters[field])); }
  }
  if (filters.from) { clauses.push("at>=?"); values.push(filters.from); }
  if (filters.to) { clauses.push("at<=?"); values.push(filters.to); }
  let events = store.db.prepare(`SELECT seq,payload FROM audit_events ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY seq DESC`).all(...values).map((row) => ({ ...JSON.parse(row.payload), seq: row.seq }));
  if (filters.q) { const term = String(filters.q).toLowerCase(); events = events.filter((event) => `${event.action} ${event.entity} ${event.key ?? ""} ${event.actor?.name ?? ""} ${event.summary ?? ""}`.toLowerCase().includes(term)); }
  return events;
}
