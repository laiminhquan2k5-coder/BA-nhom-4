import crypto from "node:crypto";
import { config, ROLES } from "../config.js";
import { ApiError, badRequest, conflict, forbidden, tooMany, unauthorized } from "../http/http.js";
import { hashOtp, hashPassword, hashToken, newOtpCode, newToken, passwordPolicyError, verifyOtp, verifyPassword } from "./passwords.js";
import { isRecoveryMailbox } from "./recovery-mail.js";

export function credentialByEmail(store, email) {
  const normalized = String(email || "").trim().toLowerCase();
  return store.list("credentials").find((credential) => credential.email.toLowerCase() === normalized) || null;
}

export function resolveSession(store, req) {
  const header = req.headers.authorization || "";
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const session = store.find("sessions", hashToken(token));
  if (!session || session.revokedAt || !(Date.parse(session.expiresAt) > Date.now())) return null;
  const user = store.find("users", session.userId);
  if (!user || user.status !== "user_active" || (session.role && !user.roleIds.includes(session.role))) return null;
  return session;
}

export function requireSession(ctx) {
  const current = resolveSession(ctx.store, ctx.req);
  if (!current || current.token !== ctx.session?.token) unauthorized();
  ctx.session = current;
  ctx.user = ctx.store.find("users", current.userId);
  ctx.actor = { id: ctx.user.id, name: ctx.user.name, role: current.role, authenticated: true };
  return ctx.session;
}

function responseToken(ctx) {
  return ctx.req.headers.authorization.slice(7).trim();
}

function invalidateOtps(tx, email) {
  for (const entry of tx.list("outbox")) {
    if (entry.email === email && entry.purpose === "password-reset") {
      entry.consumedAt ||= new Date().toISOString();
      if (Object.hasOwn(entry, "code")) entry.code = null;
    }
  }
}

export function requireFullSession(ctx) {
  const session = requireSession(ctx);
  if (session.scope !== "full") {
    if (session.scope === "password-change") throw new ApiError(403, "must_change_password", "Cần đổi mật khẩu lần đầu trước khi sử dụng.");
    unauthorized();
  }
  if (!session.role) throw new ApiError(403, "role_required", "Chọn vai trò làm việc trước khi tiếp tục.", { roles: ctx.user.roleIds });
  return session;
}

export function requirePermission(ctx, permission) {
  requireFullSession(ctx);
  if (ctx.permissionDenied(permission)) forbidden("forbidden", `Thao tác thuộc quyền khác. Vai trò hiện tại: ${ROLES[ctx.session.role]}.`);
}

function touchActor(tx, email) {
  const credential = tx.list("credentials").find((item) => item.email === email);
  return credential ? tx.find("users", credential.userId) : null;
}

export function login(store, ctx, body) {
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) badRequest("invalid_input", "Nhập email và mật khẩu.");
  const actorOf = () => {
    const user = store.find("users", store.list("credentials").find((credential) => credential.email === email)?.userId);
    return { id: user?.id || null, name: user?.name || email, role: null, authenticated: false };
  };
  let sessionToken = null;
  const { result } = store.transact({ actor: actorOf(), action: "auth.login", commitOnErrorCodes: ["invalid_credentials", "locked"], requestId: ctx.requestId, method: ctx.method, route: "auth/login", ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
    const credential = tx.list("credentials").find((item) => item.email === email);
    if (!credential || credential.pending) {
      tx.note(`Đăng nhập thất bại: email không khớp (${email}).`);
      throw new ApiError(401, "invalid_credentials", "Email hoặc mật khẩu không đúng.");
    }
    const user = tx.find("users", credential.userId);
    if (!user || user.status !== "user_active") {
      tx.note(`Đăng nhập thất bại: hồ sơ ${email} không còn hiệu lực.`);
      throw new ApiError(403, "inactive_user", "Hồ sơ không còn hiệu lực. Liên hệ Giám đốc.");
    }
    if (credential.locked && credential.lockUntil && new Date(credential.lockUntil) > new Date()) {
      tx.note(`Đăng nhập bị từ chối: tài khoản ${email} đang tạm khóa.`);
      tooMany(`Tài khoản tạm khóa đến ${new Date(credential.lockUntil).toISOString()}.`);
    }
    if (credential.locked && (!credential.lockUntil || new Date(credential.lockUntil) <= new Date())) {
      credential.locked = false;
      credential.failedAttempts = 0;
      credential.lockUntil = null;
    }
    if (!verifyPassword(password, credential.salt, credential.hash)) {
      credential.failedAttempts = (credential.failedAttempts || 0) + 1;
      if (credential.failedAttempts >= config.auth.maxFailedLogins) {
        credential.locked = true;
        credential.lockUntil = new Date(Date.now() + config.auth.lockMinutes * 60000).toISOString();
        tx.note(`Tài khoản ${email} bị tạm khóa sau ${config.auth.maxFailedLogins} lần nhập sai.`);
        tooMany(`Nhập sai ${config.auth.maxFailedLogins} lần. Tài khoản tạm khóa ${config.auth.lockMinutes} phút.`);
      }
      tx.note(`Đăng nhập thất bại: sai mật khẩu (${email}), còn ${config.auth.maxFailedLogins - credential.failedAttempts} lần thử.`);
      throw new ApiError(401, "invalid_credentials", `Email hoặc mật khẩu không đúng. Còn ${config.auth.maxFailedLogins - credential.failedAttempts} lần thử.`);
    }
    credential.failedAttempts = 0;
    credential.locked = false;
    credential.lockUntil = null;
    const token = newToken();
    const now = new Date();
    tx.list("sessions").push({
      token: hashToken(token),
      userId: user.id,
      role: user.roleIds.length === 1 ? user.roleIds[0] : null,
      scope: credential.mustChange ? "password-change" : "full",
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + config.sessionTtlMinutes * 60000).toISOString(),
      revokedAt: null,
      ip: ctx.ip
    });
    sessionToken = token;
    tx.note(`Đăng nhập thành công: ${user.name} (${email}).`);
    return { user, credential };
  });
  const { user, credential } = result;
  return {
    token: sessionToken,
    scope: credential.mustChange ? "password-change" : "full",
    mustChange: credential.mustChange,
    selectRole: !credential.mustChange && user.roleIds.length > 1,
    role: user.roleIds.length === 1 ? user.roleIds[0] : null,
    expiresAt: store.find("sessions", hashToken(sessionToken)).expiresAt,
    user: { id: user.id, name: user.name, email: credential.email, roleIds: user.roleIds, dept: user.dept }
  };
}

export function selectRole(store, ctx, body) {
  const session = requireSession(ctx);
  const role = String(body.role || "");
  if (!ctx.user.roleIds.includes(role)) badRequest("invalid_role", "Vai trò không thuộc phân công của bạn.");
  store.transact({ actor: ctx.actor, action: "auth.select_role", requestId: ctx.requestId, method: ctx.method, route: "auth/session", ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
    const record = tx.find("sessions", session.token);
    record.role = role;
    tx.note(`${ctx.user.name} chọn vai trò làm việc: ${ROLES[role]}.`);
  });
  return { token: responseToken(ctx), role, scope: session.scope, user: publicUser(store, session.userId) };
}

export function changePassword(store, ctx, body) {
  const session = requireSession(ctx);
  const current = String(body.currentPassword || "");
  const next = String(body.newPassword || "");
  const confirm = String(body.confirm || next);
  const policy = passwordPolicyError(next);
  if (policy) badRequest("weak_password", policy);
  if (next !== confirm) badRequest("mismatch", "Mật khẩu nhập lại chưa khớp.");
  store.transact({ actor: ctx.actor, action: "auth.change_password", requestId: ctx.requestId, method: ctx.method, route: "auth/change-password", ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
    const credential = tx.find("credentials", session.userId);
    if (!verifyPassword(current, credential.salt, credential.hash)) {
      tx.note(`${ctx.user.name} đổi mật khẩu thất bại: mật khẩu hiện tại chưa đúng.`);
      badRequest("wrong_current", "Mật khẩu hiện tại chưa đúng.");
    }
    if (verifyPassword(next, credential.salt, credential.hash)) badRequest("same_password", "Mật khẩu mới phải khác mật khẩu hiện tại.");
    const { salt, hash } = hashPassword(next);
    credential.salt = salt;
    credential.hash = hash;
    credential.mustChange = false;
    credential.updatedAt = new Date().toISOString();
    invalidateOtps(tx, credential.email);
    tx.list("sessions").forEach((item) => { if (item.userId === session.userId && item.token !== session.token) item.revokedAt = new Date().toISOString(); });
    const record = tx.find("sessions", session.token);
    record.scope = "full";
    tx.note(`${ctx.user.name} đổi mật khẩu thành công; các phiên khác đã bị thu hồi.`);
  });
  return { token: responseToken(ctx), scope: "full", user: publicUser(store, session.userId) };
}

function requireRecoveryMailer(recoveryMailer) {
  if (!recoveryMailer) throw new ApiError(503, "recovery_unavailable", "Khôi phục qua email chưa được cấu hình. Liên hệ người quản trị.");
}

export async function forgotPassword(store, ctx, body, recoveryMailer) {
  requireRecoveryMailer(recoveryMailer);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isRecoveryMailbox(email)) badRequest("invalid_input", "Nhập địa chỉ email hợp lệ.");
  const meta = { requestId: ctx.requestId, method: ctx.method, route: "auth/forgot", ip: ctx.ip, userAgent: ctx.userAgent };
  const response = {
    expiresMinutes: config.auth.otpMinutes,
    retryAfterSeconds: config.auth.otpResendSeconds,
    message: "Nếu tài khoản đủ điều kiện và thư được gửi thành công, bạn sẽ nhận được mã đặt lại mật khẩu."
  };
  const code = newOtpCode();
  const { result: challenge } = store.transact({ ...meta, action: "auth.forgot_password" }, (tx) => {
    const credential = credentialByEmail(tx, email);
    const user = credential && tx.find("users", credential.userId);
    if (!credential || credential.pending || user?.status !== "user_active") {
      tx.note("Không phát hành mã khôi phục cho yêu cầu này.");
      return;
    }
    const now = Date.now();
    const entries = tx.list("outbox");
    if (entries.some((entry) => entry.channel === "smtp" && entry.email === email && entry.purpose === "password-reset" && now - Date.parse(entry.createdAt) < config.auth.otpResendSeconds * 1000)) {
      tx.note("Yêu cầu mã khôi phục trong thời gian chờ gửi lại.");
      return;
    }
    invalidateOtps(tx, email);
    const salt = crypto.randomBytes(16).toString("hex");
    const id = `OB-${crypto.randomUUID()}`;
    entries.push({
      id, email, userId: credential.userId, salt, hash: hashOtp(code, salt), purpose: "password-reset", channel: "smtp",
      createdAt: new Date(now).toISOString(), sentAt: null, expiresAt: null, consumedAt: null, attempts: 0
    });
    return id;
  });
  if (!challenge) return response;

  // Keep SMTP outside the SQLite transaction. Pending challenges cannot be redeemed.
  let accepted = false;
  try {
    await recoveryMailer({ to: email, code, expiresMinutes: config.auth.otpMinutes });
    accepted = true;
  } catch {
    // Do not log transport errors, which can contain credentials or message details.
  }
  store.transact({ ...meta, action: accepted ? "auth.recovery_sent" : "auth.recovery_delivery_failed", status: accepted ? 200 : 502 }, (tx) => {
    const entry = tx.find("outbox", challenge);
    if (entry && !entry.consumedAt) {
      const now = Date.now();
      if (accepted) {
        entry.sentAt = new Date(now).toISOString();
        entry.expiresAt = new Date(now + config.auth.otpMinutes * 60000).toISOString();
      } else {
        entry.consumedAt = new Date(now).toISOString();
      }
    }
    tx.note(accepted ? "Máy chủ SMTP đã nhận thư khôi phục." : "Không thể gửi thư khôi phục qua SMTP.");
  });
  return response;
}

export function resetPassword(store, ctx, body, recoveryMailer) {
  requireRecoveryMailer(recoveryMailer);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isRecoveryMailbox(email)) badRequest("invalid_input", "Nhập địa chỉ email hợp lệ.");
  const code = String(body.code || "").trim();
  const next = String(body.newPassword || "");
  const policy = passwordPolicyError(next);
  if (policy) badRequest("weak_password", policy);
  const actorOf = () => {
    const user = touchActor(store, email);
    return { id: user?.id || null, name: user?.name || email, role: null, authenticated: false };
  };
  store.transact({ actor: actorOf(), action: "auth.reset_password", commitOnErrorCodes: ["otp_invalid", "otp_locked"], requestId: ctx.requestId, method: ctx.method, route: "auth/reset-password", ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
    const credential = credentialByEmail(tx, email);
    const entry = credential && [...tx.list("outbox")].reverse().find((item) => item.email === email && item.userId === credential.userId && item.purpose === "password-reset" && item.channel === "smtp" && item.sentAt && !item.consumedAt);
    if (!entry) { tx.note(`Đặt lại mật khẩu thất bại: không có mã hợp lệ cho ${email}.`); throw new ApiError(400, "otp_missing", "Chưa có mã xác nhận hợp lệ. Gửi lại yêu cầu quên mật khẩu."); }
    if (credential.pending || tx.find("users", credential.userId)?.status !== "user_active") forbidden("inactive_user", "Hồ sơ không còn hiệu lực.");
    if (!(Date.parse(entry.expiresAt) > Date.now())) { tx.note(`Đặt lại mật khẩu thất bại: mã OTP của ${email} hết hạn.`); throw new ApiError(400, "otp_expired", `Mã đã hết hạn sau ${config.auth.otpMinutes} phút.`); }
    if (entry.attempts >= config.auth.maxOtpAttempts) {
      invalidateOtps(tx, email);
      conflict("otp_locked", "Mã đã bị khóa. Bắt đầu lại với mã mới.");
    }
    entry.attempts += 1;
    if (!/^\d{6}$/.test(code) || !verifyOtp(code, entry.salt, entry.hash)) {
      if (entry.attempts >= config.auth.maxOtpAttempts) {
        invalidateOtps(tx, email);
        conflict("otp_locked", `Nhập sai ${config.auth.maxOtpAttempts} lần. Bắt đầu lại với mã mới.`);
      }
      tx.note(`Đặt lại mật khẩu thất bại: mã OTP chưa đúng cho ${email}.`);
      throw new ApiError(400, "otp_invalid", `Mã chưa đúng. Còn ${config.auth.maxOtpAttempts - entry.attempts} lần nhập.`);
    }
    if (verifyPassword(next, credential.salt, credential.hash)) badRequest("same_password", "Mật khẩu mới phải khác mật khẩu cũ.");
    const { salt, hash } = hashPassword(next);
    credential.salt = salt;
    credential.hash = hash;
    credential.mustChange = false;
    credential.failedAttempts = 0;
    credential.locked = false;
    credential.lockUntil = null;
    credential.pending = false;
    credential.updatedAt = new Date().toISOString();
    invalidateOtps(tx, email);
    tx.list("sessions").forEach((item) => { if (item.userId === credential.userId) item.revokedAt = new Date().toISOString(); });
    tx.note(`Khôi phục quyền truy cập thành công cho ${email}; các phiên đăng nhập cũ đã bị thu hồi.`);
  });
  return { message: "Đã khôi phục quyền truy cập. Đăng nhập bằng mật khẩu mới." };
}

export function logout(store, ctx) {
  const session = requireSession(ctx);
  store.transact({ actor: ctx.actor, action: "auth.logout", requestId: ctx.requestId, method: ctx.method, route: "auth/logout", ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
    const record = tx.find("sessions", session.token);
    record.revokedAt = new Date().toISOString();
    tx.note(`${ctx.user?.name || "Người dùng"} đăng xuất.`);
  });
  return { message: "Đã đăng xuất." };
}

export function publicUser(store, userId) {
  const user = store.find("users", userId);
  if (!user) return null;
  const credential = store.find("credentials", userId);
  return { id: user.id, name: user.name, email: credential?.email || user.email, dept: user.dept, roleIds: user.roleIds, status: user.status };
}

export function reissuePassword(store, ctx, targetUserId, body) {
  const password = String(body.password || "");
  const policy = passwordPolicyError(password);
  if (policy) badRequest("weak_password", policy);
  const email = String(body.email || "").trim().toLowerCase();
  const target = store.find("users", targetUserId);
  if (!target) throw new ApiError(404, "not_found", "Không tìm thấy hồ sơ nhân sự.");
  if (email && store.list("credentials").some((credential) => credential.email === email && credential.userId !== targetUserId)) conflict("email_taken", "Email đã thuộc tài khoản khác.");
  if (body.mustChange !== undefined && typeof body.mustChange !== "boolean") badRequest("invalid_input", "mustChange phải là true hoặc false.");
  const mustChange = body.mustChange === undefined ? true : body.mustChange;
  let tokenPair = null;
  store.transact({ actor: ctx.actor, action: "credentials.reissue", requestId: ctx.requestId, method: ctx.method, route: `users/${targetUserId}/password`, ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
    const credential = tx.find("credentials", targetUserId);
    if (credential) invalidateOtps(tx, credential.email);
    if (email) invalidateOtps(tx, email);
    tokenPair = hashPassword(password);
    if (credential) {
      credential.salt = tokenPair.salt;
      credential.hash = tokenPair.hash;
      credential.mustChange = mustChange;
      credential.failedAttempts = 0;
      credential.locked = false;
      credential.lockUntil = null;
      credential.pending = false;
      credential.updatedAt = new Date().toISOString();
      if (email) credential.email = email;
    } else {
      if (!email) badRequest("invalid_input", "Tài khoản chưa có email; cần nhập email đăng nhập.");
      tx.list("credentials").push({ userId: targetUserId, email, salt: tokenPair.salt, hash: tokenPair.hash, mustChange, failedAttempts: 0, locked: false, lockUntil: null, pending: false, updatedAt: new Date().toISOString() });
    }
    if (email) tx.find("users", targetUserId).email = email;
    tx.list("sessions").forEach((item) => { if (item.userId === targetUserId) item.revokedAt = new Date().toISOString(); });
    tx.note(`${ctx.actor.name} cấp lại mật khẩu ban đầu cho ${target.name}.`);
  });
  return { message: "Đã cấp lại mật khẩu. Chuyển trực tiếp cho nhân sự; không gửi qua kênh không bảo mật.", mustChange };
}

export function unlockAccount(store, ctx, targetUserId) {
  const target = store.find("users", targetUserId);
  const credential = store.find("credentials", targetUserId);
  if (!target || !credential) throw new ApiError(404, "not_found", "Không tìm thấy hồ sơ đăng nhập.");
  store.transact({ actor: ctx.actor, action: "credentials.unlock", requestId: ctx.requestId, method: ctx.method, route: `users/${targetUserId}/unlock`, ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
    const record = tx.find("credentials", targetUserId);
    record.locked = false;
    record.lockUntil = null;
    record.failedAttempts = 0;
    tx.note(`${ctx.actor.name} mở khóa đăng nhập cho ${target.name}; bộ đếm nhập sai đặt về 0.`);
  });
  return { message: "Đã mở khóa đăng nhập." };
}
