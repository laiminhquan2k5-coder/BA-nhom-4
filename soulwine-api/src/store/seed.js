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

export function splitLegacyWarehouseAccount(store) {
  if (config.production) return;
  const directorSeed = config.seedAccounts[0];
  const legacy = (user) => user?.email?.toLowerCase() === directorSeed.email && user.roleIds.includes("director") && user.roleIds.includes("warehouse_manager");
  if (!legacy(store.find("users", directorSeed.id))) return;
  store.transact({ action: "users.split_warehouse_account" }, (tx) => {
    const director = tx.find("users", directorSeed.id);
    if (!legacy(director)) return;
    const account = config.seedAccounts.find((item) => item.id === "U-THUKHO");
    const users = tx.list("users"), credentials = tx.list("credentials");
    const hasManager = users.some((user) => user !== director && user.status === "user_active" && user.roleIds.includes("warehouse_manager") && !user.roleIds.includes("director") && credentials.some((entry) => entry.userId === user.id && !entry.pending && entry.hash));
    const now = new Date().toISOString();
    if (!hasManager) {
      if (users.some((user) => user.id === account.id || user.email?.toLowerCase() === account.email) || credentials.some((entry) => entry.userId === account.id || entry.email?.toLowerCase() === account.email)) return;
      const { salt, hash } = hashPassword(config.initialPasswords[account.id]);
      users.push({ ...structuredClone(account), phone: "", status: "user_active", createdAt: now });
      credentials.push({ userId: account.id, email: account.email, salt, hash, mustChange: true, failedAttempts: 0, locked: false, lockUntil: null, pending: false, updatedAt: now });
    }
    director.roleIds = director.roleIds.filter((role) => role !== "warehouse_manager");
    for (const session of tx.list("sessions")) {
      if (session.userId === director.id && session.role === "warehouse_manager") session.revokedAt ||= now;
    }
    tx.note("Tách vai trò Thủ kho khỏi tài khoản Giám đốc, giữ nguyên thông tin đăng nhập hiện có.");
  });
}
