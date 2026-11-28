const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const OTP_MINUTES = 5;
const MAX_OTP_ATTEMPTS = 5;
// Public fixtures for the browser-local demo, not API accounts.
const INITIAL_ACCOUNTS = {
  "U-001": { email: "quynh.nguyen@soulwine.vn", password: "SW-Giamdoc@2026" },
  "U-002": { email: "hanh.nguyen@soulwine.vn", password: "SW-Ketoan@2026" },
  "U-003": { email: "thu.pham@soulwine.vn", password: "SW-Banhang@2026" },
  "U-004": { email: "huyen.pham@soulwine.vn", password: "SW-Nvbanhang@2026" },
  "U-005": { email: "ngan.pham@soulwine.vn", password: "SW-Kho@2026" },
  [WAREHOUSE_DEMO_ACCOUNT.id]: { email: WAREHOUSE_DEMO_ACCOUNT.email, password: "SW-ThuKho@2026" }
};
const loginFlow = { mode: "login", email: "", userId: "", error: "", notice: "", otp: null, initialPassword: "", newPassword: "" };
let otpTimer = null;
let authBootError = "";

function authHex(buffer) { return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }

async function hashPassword(password, salt) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${password}`));
  return authHex(digest);
}

function randomToken(bytes = 16) { return authHex(crypto.getRandomValues(new Uint8Array(bytes))); }

function generateOtpCode() { return String(100000 + crypto.getRandomValues(new Uint32Array(1))[0] % 900000); }

function passwordPolicyError(password) {
  if (password.length < 8 || password.length > 64) return "Mật khẩu cần từ 8 đến 64 ký tự.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Mật khẩu cần ít nhất một chữ cái và một chữ số.";
  if (/\s/.test(password)) return "Mật khẩu không được chứa khoảng trắng.";
  return "";
}

function credentialByUserId(id) { return state.credentials.find((item) => item.userId === id); }
function credentialByEmail(email) { return state.credentials.find((item) => item.email.toLowerCase() === String(email).trim().toLowerCase()); }

async function makeCredential(userId, email, password, mustChange) {
  const salt = randomToken();
  return { userId, email: String(email).trim().toLowerCase(), salt, hash: await hashPassword(password, salt), mustChange: !!mustChange, failedAttempts: 0, locked: false, lockUntil: null, pending: false, updatedAt: new Date().toISOString() };
}

async function writeCredential(userId, email, password, mustChange) {
  const entry = await makeCredential(userId, email, password, mustChange);
  const existing = credentialByUserId(userId);
  if (existing) Object.assign(existing, entry);
  else state.credentials.push(entry);
  return existing || entry;
}

async function splitLegacyWarehouseAccount(data, retainedCredential) {
  const director = data.users.find((user) => user.id === "U-001" && user.email?.toLowerCase() === INITIAL_ACCOUNTS["U-001"].email && user.roleIds.includes("director") && user.roleIds.includes("warehouse_manager"));
  if (!director) return false;
  const credentials = data.credentials || [];
  const { id, email } = WAREHOUSE_DEMO_ACCOUNT;
  const hasManager = data.users.some((user) => user !== director && user.status === "user_active" && user.roleIds.includes("warehouse_manager") && !user.roleIds.includes("director") && credentials.some((entry) => entry.userId === user.id && !entry.pending && entry.hash));
  if (!hasManager) {
    if (data.users.some((user) => user.id === id || user.email?.toLowerCase() === email) || credentials.some((entry) => entry.userId === id || entry.email?.toLowerCase() === email)) return false;
    const credential = retainedCredential?.userId === id && retainedCredential.email === email ? structuredClone(retainedCredential) : await makeCredential(id, email, INITIAL_ACCOUNTS[id].password, true);
    data.users.push(structuredClone(WAREHOUSE_DEMO_ACCOUNT));
    credentials.push(credential);
    data.credentials = credentials;
  }
  director.roleIds = director.roleIds.filter((role) => role !== "warehouse_manager");
  director.role = director.roleIds.map((role) => ROLES[role].label).join(" / ");
  return true;
}

function endRemovedRoleSession(users = state.users) {
  if (!state.loggedIn || users.some((user) => user.id === state.activeUserId && user.status === "user_active" && user.roleIds.includes(state.role))) return;
  state.loggedIn = false;
  try { sessionStorage.removeItem(PROFILE_KEY); } catch {}
  serverSync.sessionLogin = null;
  serverSyncLogout();
  resetLoginFlow();
}

async function ensureSeedCredentials() {
  if (workspaceStatus.error === "corrupt" || workspaceStatus.conflict) return;
  const empty = !state.credentials.length;
  if (empty) {
    for (const user of state.users) {
      if (credentialByUserId(user.id)) continue;
      const preset = INITIAL_ACCOUNTS[user.id];
      if (preset && (user.id !== WAREHOUSE_DEMO_ACCOUNT.id || user.email === preset.email)) {
        const email = user.email || preset.email;
        if (!user.email) user.email = email;
        await writeCredential(user.id, email, preset.password, true);
      } else {
        const slug = user.name.toLocaleLowerCase("vi").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
        state.credentials.push({ userId: user.id, email: `${slug}@soulwine.vn`, salt: "", hash: "", mustChange: true, failedAttempts: 0, locked: false, lockUntil: null, pending: true, updatedAt: new Date().toISOString() });
      }
    }
  }
  const split = await splitLegacyWarehouseAccount(state);
  if (split) endRemovedRoleSession();
  if (empty || split) persistWorkspace();
}

function loginStatusChip(user) {
  const credential = credentialByUserId(user.id);
  if (!credential) return statusChip("draft", "Chưa có hồ sơ đăng nhập");
  if (credential.pending) return statusChip("draft", "Chưa đặt mật khẩu");
  if (credential.locked) return statusChip("user_locked", "Tạm khóa đăng nhập");
  if (credential.mustChange) return statusChip("pending", "Chờ đổi mật khẩu đầu tiên");
  return statusChip("user_active", "Đã kích hoạt");
}

function authError(message) {
  loginFlow.notice = "";
  loginFlow.error = message;
  renderLoginScreen();
  return false;
}

function authNotice(message) {
  loginFlow.error = "";
  loginFlow.notice = message;
  renderLoginScreen();
  return true;
}

function resetLoginFlow() {
  loginFlow.mode = "login";
  loginFlow.userId = "";
  loginFlow.error = "";
  loginFlow.notice = "";
  loginFlow.otp = null;
  loginFlow.initialPassword = "";
  loginFlow.newPassword = "";
}

function loginBrandPanel() {
  return `<div class="login-brand"><div class="login-brand-top"><img class="login-logo" src="assets/logo2.png" alt="SoulWine"></div><div class="login-quote"><div class="login-eyebrow">SoulWine Operations</div><h1>Từng chai chính hãng,<br>từng đơn chuẩn mực.</h1><p>Hệ thống vận hành nội bộ của SoulWine — nối báo giá, hợp đồng, kho hàng và thanh toán vào một nguồn dữ liệu duy nhất, đồng hành cùng hoạt động phân phối rượu toàn quốc.</p></div><div class="login-brand-foot">SoulWine Operations · Vận hành nội bộ</div></div>`;
}

function renderLoginScreen() {
  clearInterval(otpTimer);
  const root = document.getElementById("login-screen");
  if (state.loggedIn) return;
  if (workspaceStatus.error === "corrupt") {
    root.innerHTML = `<div class="recovery-entry">${storageRecoveryView()}</div>`;
    return;
  }
  const feedback = loginFlow.error ? `<div class="banner danger" role="alert">${icon("alert")}<div>${escapeHtml(loginFlow.error)}</div></div>` : loginFlow.notice ? `<div class="banner success" role="status">${icon("check-circle")}<div>${escapeHtml(loginFlow.notice)}</div></div>` : authBootError ? `<div class="banner danger" role="alert">${icon("alert")}<div>${escapeHtml(authBootError)}</div></div>` : "";
  const passwordField = (name, label, autoComplete) => `<div class="field"><label for="form-${name}">${label}</label><div class="input-affix"><input class="input" id="form-${name}" name="${name}" type="password" ${autoComplete} required minlength="8" maxlength="64"><button type="button" class="password-toggle" data-toggle-password="form-${name}" aria-label="Hiện hoặc ẩn mật khẩu">${icon("eye")}</button></div></div>`;
  let card = "";
  if (loginFlow.mode === "login") {
    card = `<form class="login-card" id="login-form" novalidate>
      <span class="eyebrow">ĐĂNG NHẬP</span>
      <h2>Chào mừng trở lại</h2>
      <p class="muted">Tài khoản dùng chung giữa các bộ phận khi máy chủ dữ liệu đã kết nối; chưa kết nối thì dữ liệu nằm trong trình duyệt này.</p>
      ${feedback}
      <div class="field"><label for="login-email">Email</label><input class="input" id="login-email" name="email" type="email" autocomplete="username" value="${escapeHtml(loginFlow.email)}" required></div>
      <div class="field"><label for="login-password">Mật khẩu</label><div class="input-affix"><input class="input" id="login-password" name="password" type="password" autocomplete="current-password" required><button type="button" class="password-toggle" data-toggle-password="login-password" aria-label="Hiện hoặc ẩn mật khẩu">${icon("eye")}</button></div></div>
      <button class="btn btn-primary btn-block mt-16" type="submit">${icon("logout")} Đăng nhập</button>
      <div class="login-row"><button class="link-btn" type="button" data-auth-mode="forgot">Quên mật khẩu demo?</button></div>
    </form>`;
  } else if (loginFlow.mode === "must-change") {
    card = `<form class="login-card" id="must-change-form" novalidate>
      <span class="eyebrow">BẢO MẬT TÀI KHOẢN</span>
      <h2>Đổi mật khẩu lần đầu</h2>
      <p class="muted">Mật khẩu hiện tại do Giám đốc cấp chỉ dùng để đăng nhập. Đặt mật khẩu riêng để tiếp tục.</p>
      ${feedback}
      ${passwordField("password", "Mật khẩu mới", 'autocomplete="new-password"')}
      <div class="field"><label for="form-confirm">Nhập lại mật khẩu mới</label><input class="input" id="form-confirm" name="confirm" type="password" autocomplete="new-password" required></div>
      <div class="hint">Từ 8 đến 64 ký tự, gồm chữ cái và chữ số, không chứa khoảng trắng.</div>
      <button class="btn btn-primary btn-block mt-16" type="submit">${icon("check")} Đặt mật khẩu và tiếp tục</button>
      <div class="login-row"><button class="link-btn" type="button" data-auth-mode="login">Hủy và quay lại đăng nhập</button></div>
    </form>`;
  } else if (loginFlow.mode === "role") {
    const user = state.users.find((item) => item.id === loginFlow.userId);
    const roles = (user?.roleIds || []).filter((key) => ROLES[key]);
    card = `<form class="login-card" id="role-form" novalidate>
      <span class="eyebrow">CHỌN VAI TRÒ</span>
      <h2>Vai trò làm việc hôm nay</h2>
      <p class="muted">${escapeHtml(user?.name || "")} được phân công ${roles.length} vai trò. Giao diện và thẩm quyền thay đổi theo lựa chọn.</p>
      ${feedback}
      <div class="role-choice">${roles.map((key) => `<button type="button" class="role-choice-item" data-login-role="${key}">${icon("user")}<span><strong>${ROLES[key].label}</strong><small>${ROLES[key].dept}</small></span>${icon("chevron-right")}</button>`).join("")}</div>
      <div class="login-row"><button class="link-btn" type="button" data-auth-mode="login">Đăng nhập tài khoản khác</button></div>
    </form>`;
  } else if (loginFlow.mode === "forgot") {
    card = `<form class="login-card" id="forgot-form" novalidate>
      <span class="eyebrow">KHÔI PHỤC QUYỀN TRUY CẬP</span>
      <h2>Quên mật khẩu</h2>
      <p class="muted">Chỉ đặt lại mật khẩu demo lưu trong trình duyệt này. Mã xác nhận có hiệu lực ${OTP_MINUTES} phút, hiển thị tại đây và không được gửi qua email.</p>
      ${feedback}
      <div class="field"><label for="forgot-email">Email đăng ký</label><input class="input" id="forgot-email" name="email" type="email" autocomplete="username" value="${escapeHtml(loginFlow.email)}" required></div>
      <button class="btn btn-primary btn-block mt-16" type="submit">${icon("arrow-right")} Tạo mã demo</button>
      <div class="login-row"><button class="link-btn" type="button" data-auth-mode="login">Quay lại đăng nhập</button></div>
    </form>`;
  } else if (loginFlow.mode === "forgot-otp") {
    const otp = loginFlow.otp;
    const seconds = Math.max(0, Math.floor((otp.expiresAt - Date.now()) / 1000));
    card = `<form class="login-card" id="forgot-otp-form" novalidate>
      <span class="eyebrow">KHÔI PHỤC QUYỀN TRUY CẬP</span>
      <h2>Nhập mã xác nhận</h2>
      <p class="muted">Mã 6 chữ số đã được tạo cho <strong>${escapeHtml(otp.email)}</strong>.</p>
      ${feedback}
      <div class="field"><label for="otp-code">Mã xác nhận (OTP)</label><input class="input" id="otp-code" name="code" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></div>
      <button class="btn btn-primary btn-block mt-16" type="submit">${icon("check")} Xác nhận mã</button>
      <div class="login-row"><button class="link-btn" type="button" data-auth-mode="forgot">Đổi email khác</button><button class="link-btn" type="button" data-auth-mode="resend">Tạo mã mới</button></div>
      <div class="otp-inbox" aria-live="polite">
        <div class="otp-inbox-head">${icon("mail")}<div><strong>Mã demo trên thiết bị</strong><small>Không có email nào được gửi. Mã này không dùng được cho tài khoản máy chủ.</small></div></div>
        <div class="otp-inbox-body"><strong>Mã khôi phục demo: <span class="otp-code">${otp.code}</span></strong><span class="otp-countdown" id="otp-countdown">Còn ${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}</span></div>
      </div>
    </form>`;
  } else if (loginFlow.mode === "forgot-reset") {
    card = `<form class="login-card" id="forgot-reset-form" novalidate>
      <span class="eyebrow">KHÔI PHỤC QUYỀN TRUY CẬP</span>
      <h2>Đặt mật khẩu mới</h2>
      <p class="muted">Mật khẩu mới áp dụng ngay, mở khóa đăng nhập và thay mọi mật khẩu cũ của <strong>${escapeHtml(loginFlow.otp?.email || loginFlow.email)}</strong>.</p>
      ${feedback}
      ${passwordField("password", "Mật khẩu mới", 'autocomplete="new-password"')}
      <div class="field"><label for="form-confirm">Nhập lại mật khẩu mới</label><input class="input" id="form-confirm" name="confirm" type="password" autocomplete="new-password" required></div>
      <div class="hint">Từ 8 đến 64 ký tự, gồm chữ cái và chữ số, không chứa khoảng trắng.</div>
      <button class="btn btn-primary btn-block mt-16" type="submit">${icon("check")} Hoàn tất khôi phục</button>
    </form>`;
  }
  root.innerHTML = `${loginBrandPanel()}<div class="login-form-wrap">${card}</div>`;
  const emailInput = root.querySelector("#login-email, #forgot-email, #otp-code, input");
  if (emailInput) emailInput.focus();
  if (loginFlow.mode === "forgot-otp" && loginFlow.otp) {
    otpTimer = setInterval(() => {
      const element = document.getElementById("otp-countdown");
      if (!element) return clearInterval(otpTimer);
      const seconds = Math.max(0, Math.floor((loginFlow.otp.expiresAt - Date.now()) / 1000));
      element.textContent = seconds ? `Còn ${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}` : "Mã đã hết hạn. Chọn Tạo mã mới.";
    }, 1000);
  }
}

function proceedToWorkspace() {
  const user = state.users.find((item) => item.id === loginFlow.userId);
  const roles = (user?.roleIds || []).filter((key) => ROLES[key]);
  if (roles.length > 1) { loginFlow.mode = "role"; loginFlow.error = ""; loginFlow.notice = ""; return renderLoginScreen(); }
  finishLogin(roles[0]);
}

function finishLogin(role) {
  const userId = loginFlow.userId;
  const email = loginFlow.email;
  const initialPassword = loginFlow.initialPassword;
  const newPassword = loginFlow.newPassword;
  resetLoginFlow();
  serverSync.sessionLogin = { email, apiPassword: initialPassword, newPassword, role };
  enterWorkspace(userId, role);
  addAudit("Đăng nhập hệ thống", email, `Vai trò: ${ROLES[role].label}`);
  toast(`Xin chào ${currentUser().name}.`, "info");
  serverSyncFinishLogin(email, initialPassword, newPassword, role);
}

async function attemptLogin(form) {
  const email = form.email.value.trim();
  const password = form.password.value;
  if (!email || !password) return authError("Nhập email và mật khẩu để đăng nhập.");
  const credential = credentialByEmail(email);
  if (!credential) return authError("Email hoặc mật khẩu không đúng.");
  if (credential.pending) return authError("Tài khoản chưa có mật khẩu. Liên hệ Giám đốc để được cấp.");
  if (credential.locked && credential.lockUntil && new Date(credential.lockUntil) > new Date()) {
    const until = new Date(credential.lockUntil).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" });
    return authError(`Tài khoản tạm khóa đến ${until} sau nhiều lần nhập sai. Dùng “Quên mật khẩu” hoặc liên hệ Giám đốc.`);
  }
  if (credential.locked) { credential.locked = false; credential.failedAttempts = 0; credential.lockUntil = null; }
  const user = state.users.find((item) => item.id === credential.userId);
  if (!user || user.status !== "user_active") return authError("Hồ sơ không còn hiệu lực. Liên hệ Giám đốc.");
  if (await hashPassword(password, credential.salt) !== credential.hash) {
    credential.failedAttempts = (credential.failedAttempts || 0) + 1;
    if (credential.failedAttempts >= MAX_FAILED_LOGINS) {
      credential.locked = true;
      credential.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString();
      persistWorkspace();
      return authError(`Nhập sai ${MAX_FAILED_LOGINS} lần. Tài khoản tạm khóa ${LOCK_MINUTES} phút; dùng “Quên mật khẩu” để khôi phục.`);
    }
    persistWorkspace();
    return authError(`Email hoặc mật khẩu không đúng. Còn ${MAX_FAILED_LOGINS - credential.failedAttempts} lần thử.`);
  }
  credential.failedAttempts = 0;
  credential.locked = false;
  credential.lockUntil = null;
  persistWorkspace();
  loginFlow.email = credential.email;
  loginFlow.userId = credential.userId;
  loginFlow.initialPassword = password;
  state.activeUserId = user.id;
  if (credential.mustChange) { loginFlow.mode = "must-change"; loginFlow.error = ""; loginFlow.notice = ""; return renderLoginScreen(); }
  proceedToWorkspace();
}

async function applyNewPassword(credential, password, auditLabel) {
  await writeCredential(credential.userId, credential.email, password, false);
  const updated = credentialByUserId(credential.userId);
  updated.pending = false;
  persistWorkspace();
  addAudit(auditLabel, updated.email, "Mật khẩu đã được cập nhật");
}

async function submitMustChange(form) {
  const credential = credentialByUserId(loginFlow.userId);
  const password = form.password.value;
  const confirm = form.confirm.value;
  const policy = passwordPolicyError(password);
  if (policy) return authError(policy);
  if (password !== confirm) return authError("Mật khẩu nhập lại chưa khớp.");
  if (await hashPassword(password, credential.salt) === credential.hash) return authError("Mật khẩu mới phải khác mật khẩu hiện tại.");
  await applyNewPassword(credential, password, "Đổi mật khẩu lần đầu");
  loginFlow.newPassword = password;
  loginFlow.error = "";
  loginFlow.notice = "";
  proceedToWorkspace();
}

function issueDemoOtp(email) {
  loginFlow.otp = { email, code: generateOtpCode(), expiresAt: Date.now() + OTP_MINUTES * 60000, attempts: 0 };
}

function startForgotPassword(form) {
  const email = form.email.value.trim();
  if (!email) return authError("Nhập email đăng ký của tài khoản.");
  const credential = credentialByEmail(email);
  if (!credential) return authError("Email chưa được đăng ký trong hệ thống.");
  loginFlow.email = credential.email;
  loginFlow.userId = credential.userId;
  issueDemoOtp(credential.email);
  loginFlow.mode = "forgot-otp";
  loginFlow.error = "";
  loginFlow.notice = "";
  renderLoginScreen();
}

function verifyOtp(form) {
  const otp = loginFlow.otp;
  if (!otp) { loginFlow.mode = "forgot"; return authError("Phiên khôi phục đã kết thúc. Bắt đầu lại."); }
  const code = form.code.value.trim();
  if (Date.now() >= otp.expiresAt) return authError(`Mã đã hết hạn sau ${OTP_MINUTES} phút. Chọn “Tạo mã mới”.`);
  if (!/^\d{6}$/.test(code)) return authError("Nhập mã gồm đúng 6 chữ số.");
  otp.attempts += 1;
  if (code !== otp.code) {
    if (otp.attempts >= MAX_OTP_ATTEMPTS) {
      loginFlow.mode = "forgot";
      loginFlow.otp = null;
      return authError(`Nhập sai ${MAX_OTP_ATTEMPTS} lần. Bắt đầu lại để tạo mã mới.`);
    }
    return authError(`Mã chưa đúng. Còn ${MAX_OTP_ATTEMPTS - otp.attempts} lần nhập.`);
  }
  otp.verified = true;
  loginFlow.mode = "forgot-reset";
  loginFlow.error = "";
  loginFlow.notice = "";
  renderLoginScreen();
}

async function submitResetPassword(form) {
  if (!loginFlow.otp?.verified || Date.now() >= loginFlow.otp.expiresAt) {
    loginFlow.mode = "forgot";
    loginFlow.otp = null;
    return authError("Phiên khôi phục demo đã kết thúc. Bắt đầu lại.");
  }
  const credential = credentialByUserId(loginFlow.userId);
  const password = form.password.value;
  const confirm = form.confirm.value;
  const policy = passwordPolicyError(password);
  if (policy) return authError(policy);
  if (password !== confirm) return authError("Mật khẩu nhập lại chưa khớp.");
  if (!credential) { loginFlow.mode = "forgot"; loginFlow.otp = null; return authError("Tài khoản không còn tồn tại. Bắt đầu lại."); }
  await applyNewPassword(credential, password, "Khôi phục mật khẩu demo");
  const updated = credentialByUserId(credential.userId);
  updated.mustChange = false;
  updated.failedAttempts = 0;
  updated.locked = false;
  updated.lockUntil = null;
  persistWorkspace();
  const email = updated.email;
  loginFlow.otp = null;
  loginFlow.mode = "login";
  loginFlow.email = email;
  loginFlow.userId = "";
  authNotice("Đã khôi phục quyền truy cập. Đăng nhập bằng mật khẩu mới.");
}

function showChangePasswordForm() {
  const credential = credentialByUserId(state.activeUserId);
  if (!credential) return toast("Hồ sơ chưa có thông tin đăng nhập.", "warning");
  showForm("Đổi mật khẩu", `<div class="form-grid">${inputField("current", "Mật khẩu hiện tại", "password", "", "required autocomplete=current-password")}${inputField("password", "Mật khẩu mới", "password", "", "required minlength=8 maxlength=64 autocomplete=new-password")}${inputField("confirm", "Nhập lại mật khẩu mới", "password", "", "required autocomplete=new-password")}</div><p class="hint mt-12">Từ 8 đến 64 ký tự, gồm chữ cái và chữ số, không chứa khoảng trắng. Mật khẩu được băm trước khi lưu trên thiết bị.</p>`, async (data) => {
    if (await hashPassword(data.get("current"), credential.salt) !== credential.hash) return formError("Mật khẩu hiện tại chưa đúng.");
    const policy = passwordPolicyError(data.get("password"));
    if (policy) return formError(policy);
    if (data.get("password") !== data.get("confirm")) return formError("Mật khẩu nhập lại chưa khớp.");
    if (await hashPassword(data.get("password"), credential.salt) === credential.hash) return formError("Mật khẩu mới phải khác mật khẩu hiện tại.");
    await applyNewPassword(credential, data.get("password"), "Đổi mật khẩu");
    serverSyncChangePasswordRemote(data.get("current"), data.get("password"));
    closeDialog();
    toast("Đã đổi mật khẩu. Lần đăng nhập sau dùng mật khẩu mới.");
  }, { submitLabel: "Đổi mật khẩu" });
}

function showResetPasswordForm(userId) {
  const user = state.users.find((item) => item.id === userId);
  if (!user) return;
  const credential = credentialByUserId(userId);
  showForm(`Cấp lại mật khẩu · ${user.name}`, `<div class="form-grid">${inputField("email", "Email đăng nhập", "email", credential?.email || user.email || "", "required")}${inputField("password", "Mật khẩu ban đầu mới", "password", "", "required minlength=8 maxlength=64 autocomplete=new-password")}${inputField("confirm", "Nhập lại mật khẩu", "password", "", "required autocomplete=new-password")}</div><label class="checkline mt-12"><input type="checkbox" name="mustChange" checked> Yêu cầu nhân sự đổi mật khẩu ở lần đăng nhập đầu tiên</label><p class="hint mt-12">Mật khẩu mới mở khóa đăng nhập và thay mọi mật khẩu cũ. Chỉ chia sẻ trực tiếp với nhân sự liên quan.</p>`, async (data) => {
    const email = data.get("email").trim().toLowerCase();
    const conflict = credentialByEmail(email);
    if (conflict && conflict.userId !== userId) return formError("Email đã thuộc tài khoản khác.");
    const policy = passwordPolicyError(data.get("password"));
    if (policy) return formError(policy);
    if (data.get("password") !== data.get("confirm")) return formError("Mật khẩu nhập lại chưa khớp.");
    await writeCredential(userId, email, data.get("password"), data.has("mustChange"));
    if (!user.email) user.email = email;
    persistWorkspace();
    addAudit("Cấp lại mật khẩu", email, user.name);
    closeDialog();
    showDialog({ title: "Đã cấp lại mật khẩu", small: true, body: `<p class="small">Mật khẩu ban đầu mới của <strong>${escapeHtml(user.name)}</strong>:</p><div class="issued-password">${escapeHtml(data.get("password"))}</div><p class="hint">Chỉ hiển thị một lần trong phiên này. Chuyển trực tiếp cho nhân sự; không gửi qua kênh không bảo mật.</p>`, footer: `<button class="btn btn-primary" data-action="close-dialog">Đã hiểu</button>` });
  }, { submitLabel: "Cấp mật khẩu mới" });
}

function unlockLoginAccount(userId) {
  const credential = credentialByUserId(userId);
  if (!credential) return;
  confirmAction("Mở khóa đăng nhập", "Cho phép tài khoản đăng nhập lại ngay; bộ đếm nhập sai đặt về 0.", () => {
    credential.locked = false;
    credential.lockUntil = null;
    credential.failedAttempts = 0;
    persistWorkspace();
    addAudit("Mở khóa đăng nhập", credential.email, "Khởi tạo lại bộ đếm nhập sai");
    render(true);
    toast("Đã mở khóa đăng nhập.");
  });
}

async function createUserCredential(userId, email, password, mustChange) {
  await writeCredential(userId, email, password, mustChange);
  persistWorkspace();
}

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!["login-form", "must-change-form", "forgot-form", "forgot-otp-form", "forgot-reset-form", "role-form"].includes(form.id)) return;
  event.preventDefault();
  if (form.id === "login-form") return attemptLogin(form);
  if (form.id === "must-change-form") return submitMustChange(form);
  if (form.id === "forgot-form") return startForgotPassword(form);
  if (form.id === "forgot-otp-form") return verifyOtp(form);
  if (form.id === "forgot-reset-form") return submitResetPassword(form);
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element) || state.loggedIn) return;
  const mode = target.closest("[data-auth-mode]");
  if (mode) {
    event.preventDefault();
    const next = mode.dataset.authMode;
    if (next === "resend") {
      const previous = loginFlow.otp;
      if (!previous) { loginFlow.mode = "forgot"; return renderLoginScreen(); }
      issueDemoOtp(previous.email);
      loginFlow.error = "";
      loginFlow.notice = "Đã tạo mã mới. Mã trước đó không còn hiệu lực.";
      return renderLoginScreen();
    }
    loginFlow.otp = null;
    loginFlow.mode = next === "forgot" ? "forgot" : "login";
    loginFlow.error = "";
    loginFlow.notice = "";
    return renderLoginScreen();
  }
  const role = target.closest("[data-login-role]");
  if (role) { event.preventDefault(); return finishLogin(role.dataset.loginRole); }
  const toggle = target.closest("[data-toggle-password]");
  if (toggle) {
    event.preventDefault();
    const input = document.getElementById(toggle.dataset.togglePassword);
    if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
    toggle.classList.toggle("active");
  }
});
