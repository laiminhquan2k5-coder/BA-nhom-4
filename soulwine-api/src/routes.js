import { ApiError, badRequest, forbidden, corsHeaders, notFound } from "./http/http.js";
import { changePassword, forgotPassword, login, logout, reissuePassword, resetPassword, requirePermission, requireSession, requireFullSession, selectRole, unlockAccount } from "./auth/auth.js";
import { availableOf, eligibilityReason, orderEligible, services, stockSummary } from "./domain/domain.js";
import { queryJournal } from "./store/store.js";
import { readSharedWorkspace, saveSharedWorkspace } from "./store/shared-workspace.js";

function requirePerm(ctx, permission) {
  requirePermission(ctx, permission);
}

function collection(name) {
  return (ctx) => ({ items: ctx.store.list(name), total: ctx.store.list(name).length });
}

function findOne(ctx, name, key) {
  const record = ctx.store.find(name, key);
  if (!record) notFound("Không tìm thấy bản ghi.");
  return record;
}

export function registerRoutes(router, store, recoveryMailer) {
  router.get("/api", () => ({ name: "SoulWine Operations API", version: "1.0.0", health: "/api/health", authentication: "Bearer session token", storage: "SQLite WAL", audit: "/api/audit" }));
  router.get("/api/health", () => ({ ok: true, revision: store.state.revision, uptimeSeconds: Math.round(process.uptime()) }));
  router.post("/api/activity", (ctx) => {
    requireFullSession(ctx);
    const action = ctx.body.action;
    if (!["screen.viewed", "search.executed", "export.requested"].includes(action)) throw new ApiError(400, "invalid_activity", "Loại hoạt động không được hỗ trợ.");
    const screen = String(ctx.body.screen || "").trim();
    if (!/^[a-z0-9_.\/-]{1,80}$/i.test(screen)) throw new ApiError(400, "invalid_screen", "Mã màn hình không hợp lệ.");
    store.transact({ actor: ctx.actor, action: `ui.${action}`, requestId: ctx.requestId, method: ctx.method, route: ctx.pattern, ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => tx.note(`Hoạt động giao diện: ${action} · ${screen}`));
    return { recorded: true, requestId: ctx.requestId };
  });

  router.post("/api/auth/login", (ctx) => login(store, ctx, ctx.body));
  router.post("/api/auth/forgot", (ctx) => forgotPassword(store, ctx, ctx.body, recoveryMailer));
  router.post("/api/auth/reset-password", (ctx) => resetPassword(store, ctx, ctx.body, recoveryMailer));
  router.post("/api/auth/logout", (ctx) => { requireSession(ctx); return logout(store, ctx); });
  router.post("/api/auth/session", (ctx) => selectRole(store, ctx, ctx.body));
  router.post("/api/auth/change-password", (ctx) => changePassword(store, ctx, ctx.body));

  router.get("/api/users", (ctx) => { requirePerm(ctx, "users.read"); return { items: store.list("users").map((user) => ({ ...user, credential: (() => { const credential = store.find("credentials", user.id); return { email: credential.email, mustChange: credential.mustChange, locked: credential.locked, lockUntil: credential.lockUntil, pending: credential.pending }; })() })), total: store.list("users").length }; });
  router.post("/api/users", (ctx) => { requirePerm(ctx, "users.write"); return services.users.create(store, ctx, ctx.body); });
  router.patch("/api/users/:id", (ctx) => { requirePerm(ctx, "users.write"); return services.users.update(store, ctx, ctx.params.id, ctx.body); });
  router.post("/api/users/:id/password", (ctx) => { requirePerm(ctx, "credentials.reissue"); return reissuePassword(store, ctx, ctx.params.id, ctx.body); });
  router.post("/api/users/:id/unlock", (ctx) => { requirePerm(ctx, "credentials.unlock"); return unlockAccount(store, ctx, ctx.params.id); });

  router.get("/api/settings", (ctx) => { requirePerm(ctx, "settings.read"); return store.list("settings")[0]; });
  router.put("/api/settings", (ctx) => { requirePerm(ctx, "settings.write"); return services.settings.update(store, ctx, ctx.body); });

  router.get("/api/stock", (ctx) => { requirePerm(ctx, "stock.read"); return { items: stockSummary(store), locked: !!store.list("stocktakes").find((period) => period.locked && period.status !== "completed") }; });
  router.get("/api/movements", (ctx) => { requirePerm(ctx, "movements.read"); return collection("movements")(ctx); });

  router.get("/api/products", (ctx) => { requirePerm(ctx, "products.read"); return collection("products")(ctx); });
  router.get("/api/products/:id", (ctx) => { requirePerm(ctx, "products.read"); const product = findOne(ctx, "products", ctx.params.id); return { ...product, available: availableOf(product) }; });
  router.post("/api/products", (ctx) => { requirePerm(ctx, "products.write"); return services.products.create(store, ctx, ctx.body); });
  router.patch("/api/products/:id", (ctx) => { requirePerm(ctx, "products.write"); return services.products.update(store, ctx, ctx.params.id, ctx.body); });
  router.delete("/api/products/:id", (ctx) => { requirePerm(ctx, "products.write"); return services.products.remove(store, ctx, ctx.params.id); });

  router.get("/api/customers", (ctx) => { requirePerm(ctx, "customers.read"); return collection("customers")(ctx); });
  router.get("/api/customers/:id", (ctx) => { requirePerm(ctx, "customers.read"); return findOne(ctx, "customers", ctx.params.id); });
  router.post("/api/customers", (ctx) => { requirePerm(ctx, "customers.write"); return services.customers.create(store, ctx, ctx.body); });
  router.patch("/api/customers/:id", (ctx) => { requirePerm(ctx, "customers.write"); return services.customers.update(store, ctx, ctx.params.id, ctx.body); });
  router.delete("/api/customers/:id", (ctx) => { requirePerm(ctx, "customers.write"); return services.customers.remove(store, ctx, ctx.params.id); });

  router.get("/api/suppliers", (ctx) => { requirePerm(ctx, "suppliers.read"); return collection("suppliers")(ctx); });
  router.post("/api/suppliers", (ctx) => { requirePerm(ctx, "suppliers.write"); return services.suppliers.create(store, ctx, ctx.body); });

  router.get("/api/quotes", (ctx) => { requirePerm(ctx, "quotes.read"); return collection("quotes")(ctx); });
  router.get("/api/quotes/:code", (ctx) => { requirePerm(ctx, "quotes.read"); const quote = findOne(ctx, "quotes", ctx.params.code); return { ...quote, totals: { subtotal: quote.lines.reduce((sum, line) => sum + line.price * line.qty, 0), discount: quote.lines.reduce((sum, line) => sum + Math.round(line.price * line.qty * ((line.discount || 0) / 100)), 0) } }; });
  router.post("/api/quotes", (ctx) => { requirePerm(ctx, "quotes.write"); return services.quotes.create(store, ctx, ctx.body); });
  router.post("/api/quotes/:code/submit", (ctx) => { requirePerm(ctx, "quotes.submit"); return services.quotes.submit(store, ctx, ctx.params.code, ctx.body); });
  router.post("/api/quotes/:code/confirm", (ctx) => { requirePerm(ctx, "quotes.confirm"); return services.quotes.confirm(store, ctx, ctx.params.code, ctx.body); });

  router.get("/api/approvals", (ctx) => { requirePerm(ctx, "approvals.read"); let items = store.list("approvals"); if (ctx.query.status) items = items.filter((item) => item.status === ctx.query.status); return { items, total: items.length }; });
  router.post("/api/approvals/:id/decide", (ctx) => { requirePerm(ctx, "approvals.decide"); return services.approvals.decide(store, ctx, ctx.params.id, ctx.body); });

  router.get("/api/contracts", (ctx) => { requirePerm(ctx, "contracts.read"); return collection("contracts")(ctx); });
  router.get("/api/contracts/:code", (ctx) => { requirePerm(ctx, "contracts.read"); return findOne(ctx, "contracts", ctx.params.code); });
  router.post("/api/contracts", (ctx) => { requirePerm(ctx, "contracts.write"); return services.contracts.create(store, ctx, ctx.body); });
  router.post("/api/contracts/:code/checklist/:field", (ctx) => { requirePerm(ctx, `contracts.checklist.${ctx.params.field}`); return services.contracts.checklist(store, ctx, ctx.params.code, ctx.params.field, ctx.body); });
  router.post("/api/contracts/:code/shipments", (ctx) => { requirePerm(ctx, "contracts.write"); return services.contracts.addShipment(store, ctx, ctx.params.code, ctx.body); });
  router.post("/api/contracts/:code/order", (ctx) => { requirePerm(ctx, "contracts.write"); return services.contracts.createOrder(store, ctx, ctx.params.code); });

  router.get("/api/orders", (ctx) => { requirePerm(ctx, "orders.read"); return collection("orders")(ctx); });
  router.get("/api/orders/:code", (ctx) => { requirePerm(ctx, "orders.read"); const order = findOne(ctx, "orders", ctx.params.code); return { ...order, eligible: orderEligible(order, store), eligibility: eligibilityReason(order, store) }; });
  router.post("/api/orders", (ctx) => { requirePerm(ctx, "orders.createRetail"); return services.orders.createRetail(store, ctx, ctx.body); });
  router.post("/api/orders/:code/reserve", (ctx) => { requirePerm(ctx, "orders.reserve"); return services.orders.reserve(store, ctx, ctx.params.code, ctx.body); });
  router.post("/api/orders/:code/issue", (ctx) => { requirePerm(ctx, "orders.issue"); return services.orders.issue(store, ctx, ctx.params.code); });

  router.get("/api/reservations", (ctx) => { requirePerm(ctx, "reservations.read"); return collection("reservations")(ctx); });
  router.delete("/api/reservations/:id", (ctx) => { requirePerm(ctx, "reservations.release"); return services.reservations.release(store, ctx, ctx.params.id, ctx.body); });

  router.get("/api/payments", (ctx) => { requirePerm(ctx, "payments.read"); return collection("payments")(ctx); });
  router.post("/api/payments", (ctx) => { requirePerm(ctx, "payments.record"); return services.payments.create(store, ctx, ctx.body); });
  router.post("/api/payments/:id/confirm", (ctx) => { requirePerm(ctx, "payments.confirm"); return services.payments.confirm(store, ctx, ctx.params.id); });

  router.get("/api/receipts", (ctx) => { requirePerm(ctx, "receipts.read"); return collection("receipts")(ctx); });
  router.post("/api/receipts", (ctx) => { requirePerm(ctx, "receipts.write"); return services.receipts.create(store, ctx, ctx.body); });
  router.put("/api/receipts/:code/counts", (ctx) => { requirePerm(ctx, "receipts.write"); return services.receipts.setCounts(store, ctx, ctx.params.code, ctx.body); });
  router.post("/api/receipts/:code/evidence", (ctx) => { requirePerm(ctx, "receipts.write"); return services.receipts.addEvidence(store, ctx, ctx.params.code, ctx.body); });
  router.post("/api/receipts/:code/confirm", (ctx) => { requirePerm(ctx, "receipts.confirm"); return services.receipts.decide(store, ctx, ctx.params.code, { decision: "confirm" }); });
  router.post("/api/receipts/:code/return", (ctx) => { requirePerm(ctx, "receipts.confirm"); return services.receipts.decide(store, ctx, ctx.params.code, { decision: "return" }); });

  router.get("/api/purchase-requests", (ctx) => { requirePerm(ctx, "purchaseRequests.read"); return collection("purchaseRequests")(ctx); });
  router.post("/api/purchase-requests", (ctx) => { requirePerm(ctx, "purchaseRequests.write"); return services.purchase.createRequest(store, ctx, ctx.body); });
  router.get("/api/purchase-orders", (ctx) => { requirePerm(ctx, "purchaseOrders.read"); return collection("purchaseOrders")(ctx); });
  router.post("/api/purchase-orders", (ctx) => { requirePerm(ctx, "purchaseOrders.write"); return services.purchase.createOrder(store, ctx, ctx.body); });

  router.get("/api/stocktakes", (ctx) => { requirePerm(ctx, "stocktakes.read"); return collection("stocktakes")(ctx); });
  router.post("/api/stocktakes", (ctx) => { requirePerm(ctx, "stocktakes.manage"); return services.stocktakes.create(store, ctx, ctx.body); });
  router.post("/api/stocktakes/:code/counts", (ctx) => { requirePerm(ctx, "stocktakes.write"); return services.stocktakes.setCount(store, ctx, ctx.params.code, ctx.body); });
  router.post("/api/stocktakes/:code/finish", (ctx) => { requirePerm(ctx, "stocktakes.manage"); return services.stocktakes.finish(store, ctx, ctx.params.code); });
  router.post("/api/stocktakes/:code/adjust", (ctx) => { requirePerm(ctx, "stocktakes.manage"); return services.stocktakes.adjust(store, ctx, ctx.params.code, ctx.body); });
  router.post("/api/stocktakes/:code/report", (ctx) => { requirePerm(ctx, "stocktakes.manage"); return services.stocktakes.report(store, ctx, ctx.params.code); });
  router.post("/api/stocktakes/:code/complete", (ctx) => { requirePerm(ctx, "stocktakes.manage"); return services.stocktakes.complete(store, ctx, ctx.params.code); });

  router.get("/api/deliveries", (ctx) => { requirePerm(ctx, "deliveries.read"); return collection("deliveries")(ctx); });
  router.post("/api/deliveries/:code/schedule", (ctx) => { requirePerm(ctx, "deliveries.manage"); return services.deliveries.schedule(store, ctx, ctx.params.code, ctx.body); });
  router.post("/api/deliveries/:code/result", (ctx) => { requirePerm(ctx, "deliveries.manage"); return services.deliveries.result(store, ctx, ctx.params.code, ctx.body); });

  router.get("/api/returns", (ctx) => { requirePerm(ctx, "returns.read"); return collection("returns")(ctx); });
  router.post("/api/returns", (ctx) => { requirePerm(ctx, "returns.write"); return services.returns.create(store, ctx, ctx.body); });
  router.post("/api/returns/:code/inspect", (ctx) => { requirePerm(ctx, "returns.inspect"); return services.returns.inspect(store, ctx, ctx.params.code, ctx.body); });

  router.get("/api/documents", (ctx) => { requirePerm(ctx, "documents.read"); return collection("documents")(ctx); });
  router.post("/api/documents", (ctx) => {
    requirePerm(ctx, "documents.write");
    const code = String(ctx.body.code || "").trim();
    if (!code || !String(ctx.body.file || "").trim()) throw new ApiError(400, "invalid_input", "Cần mã chứng từ và tên tệp.");
    if (store.find("documents", code)) throw new ApiError(409, "code_taken", "Số chứng từ đã tồn tại.");
    let created = null;
    store.transact({ actor: ctx.actor, action: "documents.create", requestId: ctx.requestId, method: ctx.method, route: "documents", ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
      if (tx.find("documents", code)) throw new ApiError(409, "code_taken", "Số chứng từ đã tồn tại.");
      created = { code, type: String(ctx.body.type || "Khác"), record: String(ctx.body.record || ""), date: ctx.body.date || new Date().toISOString().slice(0, 10), amount: Number(ctx.body.amount) || 0, file: String(ctx.body.file).slice(0, 200), owner: ctx.actor.name, createdAt: new Date().toISOString() };
      tx.list("documents").push(created);
      tx.note(`${ctx.actor.name} lưu chứng từ ${code}.`);
    });
    return created;
  });

  router.get("/api/workspace", (ctx) => {
    requireFullSession(ctx);
    const record = readSharedWorkspace(ctx.store);
    if (!record) return { exists: false, revision: 0, savedAt: null };
    if (ctx.query.meta === "1") return { exists: true, revision: record.revision, savedAt: record.savedAt };
    return { exists: true, version: 1, revision: record.revision, savedAt: record.savedAt, data: record.data };
  });

  router.put("/api/workspace", (ctx) => {
    requireFullSession(ctx);
    return saveSharedWorkspace(ctx.store, { actor: ctx.actor, requestId: ctx.requestId, method: ctx.method, route: ctx.pattern, ip: ctx.ip, userAgent: ctx.userAgent }, ctx.body);
  });

  router.get("/api/audit", (ctx) => {
    requirePerm(ctx, "audit.read");
    if (ctx.query.includeInternal === "1" && ctx.session.role !== "director") forbidden("internal_audit_forbidden", "Chỉ Giám đốc được xem nhật ký hệ thống đã che thông tin nhạy cảm.");
    const page = Math.max(1, Number(ctx.query.page) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(ctx.query.pageSize) || 25));
    const events = queryJournal(store, { entity: ctx.query.entity, key: ctx.query.key, actorId: ctx.query.actorId, action: ctx.query.action, from: ctx.query.from, to: ctx.query.to, q: ctx.query.q, includeInternal: ctx.query.includeInternal === "1" });
    const slice = events.slice((page - 1) * pageSize, page * pageSize).map((event) => ({ seq: event.seq, at: event.at, requestId: event.requestId, actor: event.actor, action: event.action, kind: event.kind, entity: event.entity, key: event.key, summary: event.summary, changes: event.changes, status: event.status, method: event.method, route: event.route, ip: event.ip }));
    return { events: slice, page, pageSize, total: events.length, revision: store.state.revision };
  });

  router.get("/api/audit/export", (ctx) => {
    requirePerm(ctx, "audit.read");
    if (ctx.query.includeInternal === "1" && ctx.session.role !== "director") forbidden("internal_audit_forbidden", "Chỉ Giám đốc được xuất nhật ký hệ thống.");
    const events = queryJournal(store, { entity: ctx.query.entity, key: ctx.query.key, actorId: ctx.query.actorId, action: ctx.query.action, from: ctx.query.from, to: ctx.query.to, q: ctx.query.q, includeInternal: ctx.query.includeInternal === "1" }).slice(0, 5000);
    const cell = (value) => { let text = String(value ?? ""); if (typeof value !== "number" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`; return `"${text.replace(/"/g, '""')}"`; };
    const header = ["seq", "at", "actor", "role", "action", "kind", "entity", "key", "summary", "status", "method", "route", "ip"].map(cell).join(";");
    const rows = events.map((event) => [event.seq, event.at, event.actor?.name, event.actor?.role, event.action, event.kind, event.entity, event.key, event.summary, event.status, event.method, event.route, event.ip].map(cell).join(";"));
    const csv = "\uFEFF" + [header, ...rows].join("\r\n");
    ctx.res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="soulwine-audit.csv"', ...corsHeaders(ctx) });
    ctx.res.end(csv);
  });

  router.get("/api/audit/:seq", (ctx) => {
    requirePerm(ctx, "audit.read");
    const seq = Number(ctx.params.seq);
    if (!Number.isSafeInteger(seq) || seq <= 0) throw new ApiError(400, "invalid_event_id", "Mã sự kiện phải là số nguyên dương.");
    const event = store.auditEvent(seq);
    if (!event) notFound("Không tìm thấy bản ghi nhật ký.");
    if (["credentials", "sessions", "outbox"].includes(event.entity) && ctx.session.role !== "director") forbidden("internal_audit_forbidden", "Chỉ Giám đốc được xem chi tiết nhật ký hệ thống.");
    return event;
  });

}
