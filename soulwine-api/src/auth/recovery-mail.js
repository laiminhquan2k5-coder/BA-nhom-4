import nodemailer from "nodemailer";

export function isRecoveryMailbox(value) {
  if (typeof value !== "string" || value.length > 254 || /\s/.test(value)) return false;
  const [local, domain, extra] = value.split("@");
  return extra === undefined && local.length <= 64 && !!domain &&
    /^[a-z0-9_+!#$%&'*=^`{|}~/?-]+(?:\.[a-z0-9_+!#$%&'*=^`{|}~/?-]+)*$/i.test(local) &&
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(domain);
}

export function createRecoveryMailer(env = process.env) {
  const { SMTP_HOST, SMTP_PORT, SMTP_FROM, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD } = env;
  if (![SMTP_HOST, SMTP_PORT, SMTP_FROM, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD].some(Boolean)) return null;

  const port = Number(SMTP_PORT);
  if (!SMTP_HOST?.trim() || !/^\d+$/.test(SMTP_PORT || "") || port < 1 || port > 65535 || !isRecoveryMailbox(SMTP_FROM)) {
    throw new Error("Configure SMTP_HOST, SMTP_PORT (1-65535), and SMTP_FROM (a single email address) for password recovery.");
  }
  if (SMTP_SECURE !== undefined && !["true", "false"].includes(SMTP_SECURE)) throw new Error("SMTP_SECURE must be true or false.");
  if (Boolean(SMTP_USER) !== Boolean(SMTP_PASSWORD)) throw new Error("Configure SMTP_USER and SMTP_PASSWORD together, or omit both for a trusted relay.");

  const secure = SMTP_SECURE === "true";
  const transport = nodemailer.createTransport({
    host: SMTP_HOST.trim(), port, secure, requireTLS: !secure,
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined,
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000
  });
  return async ({ to, code, expiresMinutes }) => {
    if (!isRecoveryMailbox(to)) throw new Error("Invalid recovery recipient.");
    const info = await transport.sendMail({
      from: { address: SMTP_FROM, name: "SoulWine Operations" },
      to: { address: to, name: "" },
      subject: "SoulWine: Mã đặt lại mật khẩu",
      text: `Mã đặt lại mật khẩu của bạn là ${code}. Mã có hiệu lực trong ${expiresMinutes} phút.\n\nKhông chia sẻ mã này. Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.`
    });
    if (info.accepted?.length !== 1 || info.accepted[0] !== to) throw new Error("SMTP did not accept the recovery message.");
  };
}
