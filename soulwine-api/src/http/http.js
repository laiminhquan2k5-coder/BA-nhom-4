export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(code, message, details) { throw new ApiError(400, code, message, details); }
export function unauthorized(code, message) { throw new ApiError(401, code || "unauthorized", message || "Yêu cầu đăng nhập."); }
export function forbidden(code, message) { throw new ApiError(403, code || "forbidden", message || "Bạn chưa có quyền thực hiện thao tác này."); }
export function notFound(message) { throw new ApiError(404, "not_found", message || "Không tìm thấy bản ghi."); }
export function conflict(code, message) { throw new ApiError(409, code || "conflict", message || "Dữ liệu đang xung đột."); }
export function tooMany(message) { throw new ApiError(423, "locked", message || "Tài khoản tạm thời bị khóa."); }

export function createRouter() {
  const routes = [];
  const add = (method, pattern, handler) => {
    routes.push({ method, pattern, segments: pattern.split("/").filter(Boolean), handler });
  };
  return {
    get: (pattern, handler) => add("GET", pattern, handler),
    post: (pattern, handler) => add("POST", pattern, handler),
    patch: (pattern, handler) => add("PATCH", pattern, handler),
    put: (pattern, handler) => add("PUT", pattern, handler),
    delete: (pattern, handler) => add("DELETE", pattern, handler),
    match(method, pathname) {
      const parts = pathname.split("/").filter(Boolean);
      for (const route of routes) {
        if (route.method !== method || route.segments.length !== parts.length) continue;
        const params = {};
        let matched = true;
        for (let index = 0; index < route.segments.length; index++) {
          const segment = route.segments[index];
          if (segment.startsWith(":")) {
            try { params[segment.slice(1)] = decodeURIComponent(parts[index]); } catch { throw new ApiError(400, "invalid_path", "Đường dẫn không đúng mã hóa URL."); }
          }
          else if (segment !== parts[index]) { matched = false; break; }
        }
        if (matched) return { handler: route.handler, params, pattern: route.pattern };
      }
      return null;
    }
  };
}

export async function readJsonBody(req, limitBytes) {
  const body = await new Promise((resolve, reject) => {
    const chunks = []; let size = 0, failed = false;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) { if (!failed) reject(new ApiError(413, "payload_too_large", "Nội dung gửi lên vượt giới hạn cho phép.")); failed = true; return; }
      if (!failed) chunks.push(chunk);
    });
    req.on("end", () => { if (!failed) resolve(Buffer.concat(chunks).toString("utf8")); });
    req.on("error", reject);
    req.on("aborted", () => reject(new ApiError(400, "aborted_request", "Yêu cầu gửi lên bị gián đoạn.")));
  });
  if (!body) return {};
  if (!/^application\/json(?:\s*;|$)/i.test(String(req.headers["content-type"] || ""))) throw new ApiError(415, "json_required", "Sử dụng Content-Type: application/json.");
  let value;
  try {
    value = JSON.parse(body);
  } catch {
    throw new ApiError(400, "invalid_json", "Nội dung gửi lên không đúng định dạng JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError(400, "object_required", "Nội dung JSON phải là một đối tượng.");
  const validateKeys = (object, depth = 0) => {
    if (depth > 25) throw new ApiError(400, "json_too_deep", "Cấu trúc JSON quá sâu.");
    for (const [key, child] of Object.entries(object)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) throw new ApiError(400, "invalid_key", "JSON có tên trường không được phép.");
      if (child && typeof child === "object") validateKeys(child, depth + 1);
    }
  };
  validateKeys(value);
  return value;
}

export function json(ctx, status, payload) {
  if (ctx.res.writableEnded || ctx.res.destroyed) return;
  const body = JSON.stringify(payload);
  ctx.res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body), ...corsHeaders(ctx) });
  ctx.res.end(body);
}

export function corsHeaders(ctx) {
  const origin = ctx.req.headers.origin;
  if (!origin || !ctx.corsOrigins.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
    "Access-Control-Expose-Headers": "Content-Disposition, X-Request-Id"
  };
}

export function preflight(ctx) {
  const origin = ctx.req.headers.origin;
  if (!origin || !ctx.corsOrigins.includes(origin)) throw new ApiError(403, "origin_not_allowed", "Origin không được phép truy cập API.");
  ctx.res.writeHead(204, {
    ...corsHeaders(ctx),
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "600"
  });
  ctx.res.end();
}
