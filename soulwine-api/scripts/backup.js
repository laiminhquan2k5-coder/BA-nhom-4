import { DatabaseSync, backup } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../src/config.js";

export async function backupWorkspace(dataDir = config.dataDir) {
  const source = path.join(dataDir, "soulwine.sqlite");
  if (!fs.existsSync(source)) throw new Error("Chưa có cơ sở dữ liệu. Khởi động API trước khi sao lưu.");
  const destinationDir = path.join(dataDir, "backups");
  fs.mkdirSync(destinationDir, { recursive: true, mode: 0o700 });
  const destination = path.join(destinationDir, `soulwine-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`);
  const database = new DatabaseSync(source, { readOnly: true });
  try { await backup(database, destination); } finally { database.close(); }
  return destination;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  backupWorkspace().then((destination) => console.log(`Đã sao lưu nhất quán SQLite: ${destination}`)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
