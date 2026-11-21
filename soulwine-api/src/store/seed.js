import { config } from "../config.js";
import { hashPassword, passwordPolicyError } from "../auth/passwords.js";
import { COLLECTIONS } from "./store.js";

export function seedState() {
  const collections = Object.fromEntries(Object.keys(COLLECTIONS).map((name) => [name, []]));
  const now = new Date().toISOString();
  const accounts = config.production ? [{ id: "U-001", name: config.bootstrapAdmin.name, email: config.bootstrapAdmin.email.trim().toLowerCase(), dept: "Ban Giám đốc", roleIds: ["director"] }] : config.seedAccounts;
  if (config.production && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.bootstrapAdmin.email) || passwordPolicyError(config.bootstrapAdmin.password) || config.bootstrapAdmin.password.length < 12)) throw new Error("Thiết lập BOOTSTRAP_ADMIN_EMAIL và BOOTSTRAP_ADMIN_PASSWORD (ít nhất 12 ký tự) để khởi tạo dữ liệu production.");
  for (const account of accounts) {
    collections.users.push({ id: account.id, name: account.name, email: account.email, phone: "", dept: account.dept, roleIds: [...account.roleIds], status: "user_active", createdAt: now });
    const { salt, hash } = hashPassword(config.production ? config.bootstrapAdmin.password : config.initialPasswords[account.id]);
    collections.credentials.push({ userId: account.id, email: account.email, salt, hash, mustChange: true, failedAttempts: 0, locked: false, lockUntil: null, pending: false, updatedAt: now });
  }
  collections.settings.push({
    id: "singleton",
    organization: { name: "SoulWine", taxId: "", address: "", representative: "", phone: "", email: "" },
    rules: { receiptTolerance: null, quoteValidityDays: 30, holdDays: null, approvalHours: null, quoteReminderDays: 3, shipmentReminderDays: 5, workStart: "08:00", workEnd: "17:00" },
    notifications: { shipment: true, quote: true, approval: true, stock: true, payment: true },
    updatedAt: now
  });
  return { revision: 0, collections };
}
