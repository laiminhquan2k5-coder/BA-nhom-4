import crypto from "node:crypto";

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash: derived };
}

export function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(expectedHash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function passwordPolicyError(password) {
  if (typeof password !== "string" || password.length < 8 || password.length > 64) return "Mật khẩu cần từ 8 đến 64 ký tự.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Mật khẩu cần ít nhất một chữ cái và một chữ số.";
  if (/\s/.test(password)) return "Mật khẩu không được chứa khoảng trắng.";
  return "";
}

export function hashOtp(code, salt) {
  return crypto.scryptSync(code, salt, 32).toString("hex");
}

export function verifyOtp(code, salt, expectedHash) {
  const a = Buffer.from(hashOtp(code, salt), "hex");
  const b = Buffer.from(expectedHash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function newToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function newOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}
