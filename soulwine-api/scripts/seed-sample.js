import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../src/config.js";
import { Store } from "../src/store/store.js";
import { seedState } from "../src/store/seed.js";

const require = createRequire(import.meta.url);
const { SAMPLE_SET_ID, createSamplePlan } = require("../../soulwine-shared/sample-data.cjs");
const BUSINESS_COLLECTIONS = [
  "products", "customers", "suppliers", "quotes", "approvals", "contracts", "orders", "payments",
  "reservations", "issues", "deliveries", "returns", "receipts", "purchaseRequests", "purchaseOrders",
  "documents", "movements", "stocktakes"
];

export function seedSampleData(dataDir = config.dataDir) {
  if (config.production) throw new Error("Sample data seeding is disabled in production.");
  const store = new Store(dataDir, seedState);
  try {
    store.load();
    const { result } = store.transact({
      action: "sample.seed", source: "sample", method: "CLI", route: "scripts/seed-sample.js",
      actor: { id: "system", name: "Sample data seeder", role: "system", authenticated: false, source: "sample" }
    }, (tx) => {
      const plan = createSamplePlan({ collections: tx.draft.collections, users: tx.list("users"), now: new Date() });
      const counts = Object.fromEntries(BUSINESS_COLLECTIONS.map((name) => [name, 0]));
      if (!plan.alreadyLoaded) {
        for (const name of BUSINESS_COLLECTIONS) {
          if (plan.removeSampleSets?.length) {
            const records = tx.list(name);
            for (let index = records.length - 1; index >= 0; index--) if (plan.removeSampleSets.includes(records[index].sampleSet)) records.splice(index, 1);
          }
          const records = plan.collections[name];
          tx.list(name).push(...records);
          counts[name] = records.length;
        }
        const settings = tx.find("settings", "singleton");
        if (settings?.rules?.receiptTolerance === null) settings.rules.receiptTolerance = plan.defaults.receiptTolerance;
        tx.note(`Loaded illustrative compact sample set ${SAMPLE_SET_ID}; source: sample. ${plan.removeSampleSets?.length ? "Only previous marked sample records were replaced. " : ""}Accounts, credentials and user-created records were preserved.`);
        for (const scenario of plan.scenarios) {
          tx.note(`Illustrative sample scenario ${scenario.code}: ${scenario.title}. Roles: ${scenario.roles.join(", ")}. Records: ${JSON.stringify(scenario.records)}.`);
        }
      }
      return { sampleSet: SAMPLE_SET_ID, namespace: plan.namespace, skipped: plan.alreadyLoaded, counts,
        total: Object.values(counts).reduce((sum, count) => sum + count, 0), scenarios: plan.scenarios };
    });
    return result;
  } finally { store.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = seedSampleData();
    console.log(report.skipped ? `Sample set ${report.sampleSet} already loaded; no changes.` : `Loaded ${report.total} illustrative sample records (${report.sampleSet}).`);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
