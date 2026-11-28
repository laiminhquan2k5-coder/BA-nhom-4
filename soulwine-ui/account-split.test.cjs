const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

function fixture() {
  const context = vm.createContext({ crypto, TextEncoder, structuredClone, document: { addEventListener() {} } });
  for (const file of ["data.js", "auth.js"]) vm.runInContext(readFileSync(join(__dirname, file), "utf8"), context, { filename: file });
  vm.runInContext(`
    const PROFILE_KEY = "profile";
    const workspaceStatus = { error: "", conflict: false };
    const sessionStorage = new Map();
    sessionStorage.removeItem = (key) => sessionStorage.delete(key);
    const serverSync = { sessionLogin: null, loggedOut: false };
    function serverSyncLogout() { serverSync.loggedOut = true; }
    function persistWorkspace() {}
  `, context);
  return (code) => vm.runInContext(code, context);
}

test("fresh demo seeds one identity and distinct credential for each role", async () => {
  const run = fixture();
  await run("ensureSeedCredentials()");
  assert.equal(run('state.users.find(user => user.id === "U-001").roleIds.join()'), "director");
  assert.equal(run('state.users.find(user => user.id === "U-THUKHO").roleIds.join()'), "warehouse_manager");
  assert.equal(run('credentialByEmail("thukho@soulwine.vn").mustChange'), true);
  assert.equal(await run('hashPassword(INITIAL_ACCOUNTS["U-THUKHO"].password, credentialByUserId("U-THUKHO").salt).then(hash => hash === credentialByUserId("U-THUKHO").hash)'), true);
});

test("legacy demo migrates once without resetting changed password or old business data", async () => {
  const run = fixture();
  run(`
    state.users.pop(); state.users[0].roleIds.push("warehouse_manager");
    state.orders.push({code:"EXISTING", ownerId:"U-001"});
    state.role = "warehouse_manager"; state.loggedIn = true;
    sessionStorage.set(PROFILE_KEY, "old role");
  `);
  await run('writeCredential("U-001", "quynh.nguyen@soulwine.vn", "ChangedDirector2026", false)');
  const prior = run('JSON.stringify(credentialByUserId("U-001"))');
  await run("ensureSeedCredentials()");
  assert.equal(run('JSON.stringify(credentialByUserId("U-001"))'), prior);
  assert.equal(run("state.users[0].roleIds.join()"), "director");
  assert.equal(run("state.loggedIn || sessionStorage.has(PROFILE_KEY)"), false);
  assert.equal(run("serverSync.loggedOut"), true);
  assert.equal(run("state.orders[0].ownerId"), "U-001");
  const manager = run('JSON.stringify(credentialByUserId("U-THUKHO"))');
  await run("ensureSeedCredentials()");
  assert.equal(run('JSON.stringify(credentialByUserId("U-THUKHO"))'), manager);
  assert.equal(run('state.users.filter(user => user.id === "U-THUKHO").length'), 1);
});

test("legacy workspace preserves an already provisioned dedicated manager", async () => {
  const run = fixture();
  run('state.users.pop(); state.users[0].roleIds.push("warehouse_manager"); state.users.push({ id: "U-006", email: "existing@example.test", status: "user_active", roleIds: ["warehouse_manager"] });');
  await run('writeCredential("U-006", "existing@example.test", "ExistingManager2026", false)');
  const prior = run('JSON.stringify(credentialByUserId("U-006"))');
  await run("ensureSeedCredentials()");
  assert.equal(run("state.users[0].roleIds.join()"), "director");
  assert.equal(run('JSON.stringify(credentialByUserId("U-006"))'), prior);
  assert.equal(run('state.users.some(user => user.id === "U-THUKHO")'), false);
});
