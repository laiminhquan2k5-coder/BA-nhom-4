import crypto from "node:crypto";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, policyAllows } from "./src/config.js";
import { ApiError, createRouter, json, preflight, readJsonBody } from "./src/http/http.js";
import { Store } from "./src/store/store.js";
import { seedState, splitLegacyWarehouseAccount } from "./src/store/seed.js";
import { resolveSession } from "./src/auth/auth.js";
import { createRecoveryMailer } from "./src/auth/recovery-mail.js";
import { registerRoutes } from "./src/routes.js";

export function createApp(dataDir = config.dataDir, options = {}) {
  if (!Number.isFinite(config.sessionTtlMinutes) || config.sessionTtlMinutes <= 0) throw new Error("SESSION_TTL_MINUTES phải là số dương.");
  const recoveryMailer = options.recoveryMailer === undefined ? createRecoveryMailer() : options.recoveryMailer;
  const store = new Store(dataDir, seedState);
  store.load();
  try { splitLegacyWarehouseAccount(store); } catch (error) { store.close(); throw error; }
  const router = createRouter();
  registerRoutes(router, store, recoveryMailer);

  const server = http.createServer(async (req, res) => {
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    const ctx = {
      req,
      res,
      store,
      requestId,
      method: req.method,
      pathname: "",
      query: {},
      ip: req.socket.remoteAddress || "",
      userAgent: String(req.headers["user-agent"] || "").slice(0, 200),
      corsOrigins: config.corsOrigins,
      session: null,
      user: null,
      actor: null,
      params: {},
      pattern: "",
      body: {},
      permissionDenied: () => true
    };
    res.setHeader("X-Request-Id", requestId);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    try {
      if (!req.url?.startsWith("/") || req.url.length > 4096) throw new ApiError(400, "invalid_url", "Đường dẫn yêu cầu không hợp lệ.");
      let url;
      try { url = new URL(req.url, "http://localhost"); } catch { throw new ApiError(400, "invalid_url", "Đường dẫn yêu cầu không hợp lệ."); }
      if (url.origin !== "http://localhost") throw new ApiError(400, "invalid_url", "Chỉ chấp nhận đường dẫn nội bộ.");
      ctx.pathname = url.pathname;
      ctx.query = Object.fromEntries(url.searchParams.entries());
      if (req.headers.origin && !config.corsOrigins.includes(req.headers.origin)) throw new ApiError(403, "origin_not_allowed", "Origin không được phép truy cập API.");
      if (req.method === "OPTIONS") return preflight(ctx);
      store.refresh();
      ctx.session = resolveSession(store, req);
      if (ctx.session) {
        ctx.user = store.find("users", ctx.session.userId);
        ctx.actor = { id: ctx.session.userId, name: ctx.user?.name || "Người dùng", role: ctx.session.role, authenticated: true };
      } else {
        ctx.actor = { id: null, name: "Chưa xác định", role: null, authenticated: false };
      }
      ctx.permissionDenied = (permission) => !policyAllows(ctx.session?.role, permission);
      const matched = router.match(req.method, ctx.pathname);
      if (!matched) throw new ApiError(404, "not_found", `Không tìm thấy đường dẫn ${ctx.pathname}.`);
      ctx.params = matched.params;
      ctx.pattern = matched.pattern;
      if (!["GET", "HEAD"].includes(req.method)) ctx.body = await readJsonBody(req, matched.pattern === "/api/workspace" ? config.workspaceLimitBytes : config.bodyLimitBytes);
      const payload = await matched.handler(ctx);
      if (ctx.pathname !== "/api/health" && !store.hasRequestEvents(requestId)) {
        store.transact({ actor: ctx.actor, action: ["GET", "HEAD"].includes(req.method) ? "http.read" : "http.request", requestId, method: req.method, route: ctx.pattern, status: 200, ip: ctx.ip, userAgent: ctx.userAgent, durationMs: Date.now() - startedAt }, (tx) => tx.note(`Đã thực hiện ${req.method} ${ctx.pattern}.`));
      }
      if (payload !== undefined) json(ctx, 200, payload);
      else if (!res.writableEnded) json(ctx, 200, { ok: true });
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      const code = error instanceof ApiError ? error.code : "internal_error";
      const message = error instanceof ApiError ? error.message : "Lỗi hệ thống. Thử lại hoặc liên hệ người quản trị.";
      if (!(error instanceof ApiError)) console.error(`[${requestId}]`, error);
      if (status >= 400) {
        try {
          if (!store.hasRequestEvents(requestId)) {
            store.transact({ actor: ctx.actor, action: "request.rejected", requestId, method: req.method, route: ctx.pattern || "[unmatched]", status, ip: ctx.ip, userAgent: ctx.userAgent, durationMs: Date.now() - startedAt }, (tx) => {
              tx.note(`Yêu cầu bị từ chối (${status}): ${req.method} ${ctx.pattern || "[unmatched]"} · ${message}`);
            });
          }
        } catch { /* Preserve the original response when storage is unavailable. */ }
      }
      json(ctx, status, { code, message, details: error.details, requestId });
    } finally {
      if (options.logging ?? config.logRequests) console.log(JSON.stringify({ at: new Date().toISOString(), level: res.statusCode >= 500 ? "error" : "info", requestId, actorId: ctx.actor?.id || null, method: req.method, route: ctx.pattern || "[unmatched]", status: res.statusCode, durationMs: Date.now() - startedAt }));
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.on("close", () => store.close());
  return { server, store };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { server, store } = createApp();
  server.listen(config.port, config.host, () => {
    console.log(`SoulWine API listening at http://${config.host}:${config.port}`);
    console.log(`Data dir: ${config.dataDir} · revision ${store.state.revision} · journal events ${store.journal.length}`);
  });
  const shutdown = () => {
    store.saveSnapshot();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
