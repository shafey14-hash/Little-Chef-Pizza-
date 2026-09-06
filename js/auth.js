/**
 * auth.js — drives index.html: the welcome modal, customer login/signup,
 * admin login, and guest mode. Redirects on success.
 */
(async function () {
  // If already logged in, skip the modal straight to the right portal.
  const existing = await LCP_DB.auth.init();
  if (existing) {
    window.location.href = existing.role === "admin" ? "admin/index.html" : "customer/home.html";
    return;
  }

  const modal = document.getElementById("auth-modal");

  function showView(name) {
    LCP_UTIL.qsa(".auth-view", modal).forEach((v) => (v.hidden = v.dataset.view !== name));
  }
  LCP_UTIL.qsa("[data-goto]", modal).forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      showView(btn.dataset.goto);
    });
  });

  document.getElementById("btn-guest").addEventListener("click", () => {
    sessionStorage.setItem("lcp_guest", "1");
    window.location.href = "customer/home.html";
  });

  // Show/hide password toggles
  LCP_UTIL.qsa("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.toggle);
      const isPwd = input.type === "password";
      input.type = isPwd ? "text" : "password";
      btn.textContent = isPwd ? "Hide" : "Show";
    });
  });

  // Populate delivery-area dropdown on signup (read-only select, no free typing — per spec)
  const areaSelect = document.getElementById("su-area");
  LCP_SEED.delivery_areas.forEach((area) => {
    const opt = document.createElement("option");
    opt.value = area; opt.textContent = area;
    areaSelect.appendChild(opt);
  });
  const addressInput = document.getElementById("su-address");
  areaSelect.addEventListener("change", () => {
    // Selected area auto-prefixes the address field, as required.
    const base = areaSelect.value ? areaSelect.value + ", " : "";
    const rest = addressInput.value.replace(/^.*?,\s*/, "");
    addressInput.value = areaSelect.value ? base + rest : rest;
  });

  // ---------------- Customer Login ----------------
  document.getElementById("form-customer-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]");
    const username = document.getElementById("cl-username").value.trim();
    const password = document.getElementById("cl-password").value;
    if (!username || !password) return LCP_UTIL.toast("Please enter your username and password.", "error");
    LCP_UTIL.setLoading(btn, true, "Logging in…");
    const { data, error } = await LCP_DB.auth.signIn({ username, password, expectRole: "customer" });
    LCP_UTIL.setLoading(btn, false);
    if (error) return LCP_UTIL.toast(error, "error");
    sessionStorage.removeItem("lcp_guest");
    window.location.href = "customer/home.html";
  });

  document.getElementById("cl-forgot").addEventListener("click", (e) => {
    e.preventDefault();
    LCP_UTIL.toast("Please contact the restaurant to reset your password: " + LCP_SEED.restaurant.phone_primary, "info");
  });

  // ---------------- Customer Signup ----------------
  document.getElementById("form-customer-signup").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]");
    const full_name = document.getElementById("su-fullname").value.trim();
    const username = document.getElementById("su-username").value.trim();
    const password = document.getElementById("su-password").value;
    const confirm = document.getElementById("su-confirm").value;
    const phone = document.getElementById("su-phone").value.trim();
    const area = document.getElementById("su-area").value || null;
    const address = document.getElementById("su-address").value.trim() || null;

    const errors = [
      LCP_VALID.fullName(full_name),
      LCP_VALID.username(username),
      LCP_VALID.password(password),
      LCP_VALID.confirmPassword(confirm, password),
      LCP_VALID.phone(phone),
    ].filter(Boolean);
    if (errors.length) return LCP_UTIL.toast(errors[0], "error");

    LCP_UTIL.setLoading(btn, true, "Creating account…");
    const { data, error } = await LCP_DB.auth.signUp({ username, password, full_name, phone, area, address });
    LCP_UTIL.setLoading(btn, false);
    if (error) return LCP_UTIL.toast(error, "error");
    sessionStorage.removeItem("lcp_guest");
    LCP_UTIL.toast("Account created! Welcome, " + full_name.split(" ")[0] + ".", "success");
    setTimeout(() => (window.location.href = "customer/home.html"), 500);
  });

  // ---------------- Admin Login ----------------
  document.getElementById("form-admin-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]");
    const username = document.getElementById("al-username").value.trim();
    const password = document.getElementById("al-password").value;
    LCP_UTIL.setLoading(btn, true, "Logging in…");
    const { data, error } = await LCP_DB.auth.signIn({ username, password, expectRole: "admin" });
    LCP_UTIL.setLoading(btn, false);
    if (error) return LCP_UTIL.toast(error, "error");
    window.location.href = "admin/index.html";
  });
})();
