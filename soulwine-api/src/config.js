import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  production: process.env.NODE_ENV === "production",
  logRequests: process.env.LOG_REQUESTS !== "false",
  bootstrapAdmin: { email: process.env.BOOTSTRAP_ADMIN_EMAIL || "", password: process.env.BOOTSTRAP_ADMIN_PASSWORD || "", name: process.env.BOOTSTRAP_ADMIN_NAME || "Quản trị SoulWine" },
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || "127.0.0.1",
  dataDir: process.env.DATA_DIR || path.join(here, "..", "data"),
  sessionTtlMinutes: Number(process.env.SESSION_TTL_MINUTES || 720),
  bodyLimitBytes: 1024 * 1024,
  workspaceLimitBytes: 32 * 1024 * 1024,
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:4173,http://127.0.0.1:4173").split(",").map((origin) => origin.trim()).filter(Boolean),
  auth: {
    maxFailedLogins: 5,
    lockMinutes: 15,
    otpMinutes: 5,
    otpResendSeconds: 60,
    maxOtpAttempts: 5,
    scryptKeyLength: 64
  },
  seedAccounts: [
    { id: "U-001", name: "Nguyễn Như Quỳnh", email: "quynh.nguyen@soulwine.vn", dept: "Ban Giám đốc", roleIds: ["director"] },
    { id: "U-002", name: "Nguyễn Thị Mỹ Hạnh", email: "hanh.nguyen@soulwine.vn", dept: "Kế toán", roleIds: ["accountant"] },
    { id: "U-003", name: "Phạm Hà Thu", email: "thu.pham@soulwine.vn", dept: "Kinh doanh", roleIds: ["sales_manager"] },
    { id: "U-004", name: "Phạm Thị Khánh Huyền", email: "huyen.pham@soulwine.vn", dept: "Kinh doanh", roleIds: ["sales_staff"] },
    { id: "U-005", name: "Phạm Kim Ngân", email: "ngan.pham@soulwine.vn", dept: "Kho", roleIds: ["warehouse_staff"] },
    { id: "U-THUKHO", name: "Thủ kho", email: "thukho@soulwine.vn", dept: "Kho", roleIds: ["warehouse_manager"] }
  ],
  initialPasswords: {
    "U-001": "SW-Giamdoc@2026",
    "U-002": "SW-Ketoan@2026",
    "U-003": "SW-Banhang@2026",
    "U-004": "SW-Nvbanhang@2026",
    "U-005": "SW-Kho@2026",
    "U-THUKHO": "SW-ThuKho@2026"
  },
  internalEntities: ["sessions", "outbox", "credentials"]
};

export const ROLES = {
  director: "Giám đốc",
  accountant: "Kế toán",
  sales_manager: "Quản lý bán hàng",
  sales_staff: "Nhân viên bán hàng",
  warehouse_manager: "Quản lý kho",
  warehouse_staff: "Nhân viên kho"
};

export const POLICY = {
  "stock.read": Object.keys(ROLES),
  "audit.read": ["director", "accountant", "sales_manager"],
  "settings.read": Object.keys(ROLES),
  "settings.write": ["director"],
  "users.read": ["director"],
  "users.write": ["director"],
  "credentials.reissue": ["director"],
  "credentials.unlock": ["director"],
  "products.read": Object.keys(ROLES),
  "products.write": ["director", "sales_manager"],
  "customers.read": Object.keys(ROLES),
  "customers.write": ["director", "sales_manager", "sales_staff"],
  "suppliers.read": ["director", "accountant", "warehouse_manager"],
  "suppliers.write": ["director", "warehouse_manager"],
  "quotes.read": ["director", "accountant", "sales_manager", "sales_staff"],
  "quotes.write": ["director", "sales_manager", "sales_staff"],
  "quotes.submit": ["director", "sales_manager", "sales_staff"],
  "quotes.confirm": ["sales_manager", "sales_staff"],
  "approvals.read": ["director", "accountant", "sales_manager"],
  "approvals.decide": ["director", "accountant", "sales_manager"],
  "contracts.read": ["director", "accountant", "sales_manager", "sales_staff"],
  "contracts.write": ["sales_manager", "sales_staff"],
  "contracts.checklist.customerConfirm": ["sales_manager", "sales_staff"],
  "contracts.checklist.accountantCheck": ["accountant"],
  "contracts.checklist.directorSign": ["director"],
  "contracts.checklist.customerSign": ["sales_manager", "accountant"],
  "contracts.checklist.scan": ["sales_manager", "accountant"],
  "orders.read": ["director", "accountant", "sales_manager", "sales_staff", "warehouse_manager"],
  "orders.createRetail": ["sales_manager", "sales_staff"],
  "orders.reserve": ["warehouse_manager"],
  "orders.issue": ["warehouse_manager"],
  "payments.read": ["director", "accountant", "sales_manager", "sales_staff"],
  "payments.record": ["accountant", "sales_staff"],
  "payments.confirm": ["accountant"],
  "reservations.read": ["director", "sales_manager", "sales_staff", "warehouse_manager", "warehouse_staff"],
  "reservations.release": ["warehouse_manager"],
  "receipts.read": ["director", "accountant", "warehouse_manager", "warehouse_staff"],
  "receipts.write": ["warehouse_manager", "warehouse_staff"],
  "receipts.confirm": ["warehouse_manager"],
  "stocktakes.read": ["director", "accountant", "warehouse_manager", "warehouse_staff"],
  "stocktakes.write": ["warehouse_manager", "warehouse_staff"],
  "stocktakes.manage": ["warehouse_manager"],
  "purchaseRequests.read": ["director", "accountant", "warehouse_manager"],
  "purchaseRequests.write": ["warehouse_manager"],
  "purchaseOrders.read": ["director", "accountant", "warehouse_manager"],
  "purchaseOrders.write": ["warehouse_manager"],
  "deliveries.read": ["director", "accountant", "sales_manager", "sales_staff", "warehouse_manager"],
  "deliveries.manage": ["sales_manager", "sales_staff", "warehouse_manager"],
  "returns.read": ["director", "accountant", "sales_manager", "sales_staff", "warehouse_manager"],
  "returns.write": ["sales_manager", "sales_staff"],
  "returns.inspect": ["warehouse_manager"],
  "movements.read": ["director", "accountant", "sales_manager", "warehouse_manager", "warehouse_staff"],
  "documents.read": ["director", "accountant", "sales_manager"],
  "documents.write": ["director", "accountant", "sales_manager"]
};

export function policyAllows(role, permission) {
  const allowed = POLICY[permission];
  if (!allowed) return false;
  return allowed.includes(role);
}
