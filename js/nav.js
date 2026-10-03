/**
 * nav.js — builds the shared customer navbar + footer, and the admin shell.
 * Keeping this in one place means every page's navigation stays consistent.
 */
const LCP_NAV = (() => {
  // Running inside the native Android app (Capacitor)? Flag the root element
  // so CSS can hide website-only things like the app download section.
  if (window.Capacitor?.isNativePlatform?.()) {
    document.documentElement.classList.add("is-app");
  }

  // Native Firebase push (Android app only): lazily load the bridge and keep
  // whichever user is signed in attached to this device's FCM token. Every
  // page that uses nav.js lives exactly one folder deep, so the relative
  // path is the same for customer/ and admin/. NOTE: app-push.js declares a
  // top-level `const LCP_APP_PUSH`, which does NOT become a window property —
  // reach it through this helper with a typeof guard, never window.*.
  let appPushUser = null;
  function appPush() {
    return typeof LCP_APP_PUSH !== "undefined" ? LCP_APP_PUSH : null;
  }
  function startAppPush(user) {
    appPushUser = user || null;
    if (!window.Capacitor?.isNativePlatform?.()) return;
    if (appPush()) {
      appPush().start(appPushUser);
      return;
    }
    if (!document.getElementById("lcp-app-push-script")) {
      const s = document.createElement("script");
      s.id = "lcp-app-push-script";
      s.src = "../js/app-push.js";
      s.onload = () => appPush()?.start(appPushUser);
      document.head.appendChild(s);
    }
  }

  function isGuest() {
    return (
      !LCP_DB.auth.currentUser() && sessionStorage.getItem("lcp_guest") === "1"
    );
  }
  function currentUser() {
    return LCP_DB.auth.currentUser();
  }

  function customerHeader(activePage) {
    const user = currentUser();
    const guest = isGuest();
    const cart = LCP_CART.getState();
    const links = [
      ["home", "Home", "home.html", "🏠"],
      ["menu", "Menu", "menu.html", "🍕"],
      ["deals", "Deals", "deals.html", "🏷️"],
      ["orders", "My Orders", "orders.html", "🧾"],
      ["profile", "Profile", "profile.html", "👤"],
    ];

    const linkHtml = links
      .map(([key, label, href]) => {
        const active = key === activePage ? "nav__link--active" : "";
        return `<a class="nav__link ${active}" href="${href}">${label}</a>`;
      })
      .join("");

    const tabHtml = links
      .map(([key, label, href, icon]) => {
        const active = key === activePage ? "mobile-tabbar__item--active" : "";
        return `<a class="mobile-tabbar__item ${active}" href="${href}">
                <span class="mobile-tabbar__icon" aria-hidden="true">${icon}</span>
                <span class="mobile-tabbar__label">${label}</span>
              </a>`;
      })
      .join("");

    const who = user
      ? `<span class="nav__who">Hi, ${escapeHtml(user.full_name.split(" ")[0])}</span>`
      : guest
        ? `<span class="nav__who nav__who--guest">Browsing as Guest</span>`
        : "";

    document.body.insertAdjacentHTML(
      "afterbegin",
      `
      <header class="topnav">
        <div class="container topnav__inner">
          <a href="home.html" class="brand">
            <img class="brand__mark" src="../assets/images/logo/logo-badge.png" alt="Little Chef Pizza logo" width="44" height="44" />
            <span class="brand__text">
              <span class="brand__name">Little Chef Pizza</span>
              <span class="brand__tag">Pizza &amp; Fast Food</span>
            </span>
          </a>
          <nav class="nav" aria-label="Main">${linkHtml}</nav>
          <div class="topnav__right">
            ${who}
            <button class="btn btn--gold btn--sm bucket-pill" id="lcp-bucket-trigger" aria-label="View bucket">
              🧺 <span class="bucket-pill__label">Bucket</span> <span class="bucket-pill__count">${cart.itemCount}</span>
            </button>
            <span class="notify-slot" id="lcp-notify-slot"></span>
            ${
              user
                ? `<button class="btn btn--icon btn--ghost" id="lcp-logout-icon" title="Log out" aria-label="Log out">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
            </button>`
                : ""
            }
          </div>
        </div>
      </header>
      <nav class="mobile-tabbar" aria-label="Mobile navigation">${tabHtml}</nav>
    `,
    );

    document
      .getElementById("lcp-logout-icon")
      ?.addEventListener("click", (e) => doLogout(e.currentTarget));
  }

  function customerFooter() {
    const r = LCP_SEED.restaurant;
    const tel1 = String(r.phone_primary).replace(/[^0-9+]/g, "");
    const tel2 = String(r.phone_secondary).replace(/[^0-9+]/g, "");
    const wa = String(r.phone_whatsapp).replace(/\D/g, "").replace(/^0/, "92");
    document.body.insertAdjacentHTML(
      "beforeend",
      `
      <footer class="site-footer">
        <div class="container">
          <div class="footer__main">
            <div class="footer__col footer__col--brand">
              <a href="home.html" class="brand brand--on-dark">
                <img class="brand__mark" src="../assets/images/logo/logo-badge.png" alt="Little Chef Pizza logo" width="44" height="44" />
                <span class="brand__text">
                  <span class="brand__name">${r.name}</span>
                  <span class="brand__tag">Pizza &amp; Fast Food</span>
                </span>
              </a>
              <p class="footer__about">Freshly made pizza, wings, rolls &amp; more — delivered fast across Gujrat, or ready for takeaway &amp; dine-in.</p>
            </div>
            <nav class="footer__col footer__links" aria-label="Footer">
              <h4>Explore</h4>
              <a href="menu.html">Menu</a>
              <a href="deals.html">Deals</a>
              <a href="orders.html">My Orders</a>
              <a href="bucket.html">Order Now</a>
              <a href="download.html" class="app-only-hide">Get the App</a>
            </nav>
            <div class="footer__col footer__col--contact">
              <h4>Contact</h4>
              <p class="footer__addr">${r.address}</p>
              <div class="footer__phones">
                <a class="footer__phone" href="tel:${tel1}"><span class="footer__phone-label">Tel</span>${r.phone_primary}</a>
                <a class="footer__phone" href="tel:${tel2}"><span class="footer__phone-label">Phone</span>${r.phone_secondary}</a>
                <a class="footer__phone" href="https://wa.me/${wa}" target="_blank" rel="noopener"><span class="footer__phone-label">WhatsApp</span>${r.phone_whatsapp}</a>
              </div>
              <p class="footer__delivery-note">${r.delivery_note}</p>
              <a class="btn btn--gold btn--sm" target="_blank" rel="noopener"
                 href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address)}">Get Directions</a>
            </div>
          </div>
          <div class="footer__bottom">© ${new Date().getFullYear()} Little Chef Pizza — All rights reserved.</div>
        </div>
      </footer>
    `,
    );
  }

  async function doLogout(triggerBtn) {
    if (triggerBtn) LCP_UTIL.setLoading(triggerBtn, true, "Logging out…");
    // Detach this device's FCM token BEFORE the session dies (the endpoint
    // needs a live access token), so a logged-out device stops receiving
    // order notifications.
    try {
      await appPush()?.unregister?.();
    } catch (e) {
      /* best-effort */
    }
    try {
      await LCP_DB.auth.signOut();
    } catch (err) {
      console.error("Logout error (continuing anyway):", err);
      // Even if the network call fails, we still clear local state and
      // redirect below — a stuck "logging out…" button with no feedback
      // is worse than a slightly-late server-side session cleanup.
    }
    sessionStorage.removeItem("lcp_guest");
    sessionStorage.setItem("lcp_flash", "You've been logged out.");
    if (window.location.pathname.includes("/admin/")) {
      window.location.href = "login.html";
    } else if (window.location.pathname.includes("/customer/")) {
      window.location.href = "../index.html";
    } else {
      window.location.href = "index.html";
    }
  }

  async function mountCustomer(activePage, opts = {}) {
    await LCP_DB.auth.init(); // wait for the real Supabase session before rendering who's logged in
    LCP_UTIL.flashPop();
    customerHeader(activePage);
    // The big site footer belongs to the landing page only — inner sections
    // stay clean and scroll-focused.
    if (activePage === "home") customerFooter();
    opts.noBucketBar
      ? await LCP_CART_UI.mountWithoutBar()
      : await LCP_CART_UI.mount();
    LCP_NOTIFY?.start("customer", currentUser());
    startAppPush(currentUser());
    return currentUser();
  }

  // ---------------------------------------------------------------- admin
  function requireAdmin() {
    const user = currentUser();
    if (!user || user.role !== "admin") {
      sessionStorage.setItem(
        "lcp_flash",
        "Please log in as admin to continue.",
      );
      window.location.href = "login.html";
      return null;
    }
    return user;
  }

  async function mountAdmin(activePage) {
    await LCP_DB.auth.init(); // wait for the real Supabase session before checking the role
    const admin = requireAdmin();
    if (!admin) return null;
    const links = [
      ["dashboard", "Dashboard", "index.html"],
      ["orders", "Orders", "orders.html"],
      ["products", "Products & Prices", "products.html"],
      ["deals", "Deals", "deals.html"],
      ["history", "Order History", "history.html"],
    ];
    document.body.insertAdjacentHTML(
      "afterbegin",
      `
      <div class="admin-shell">
        <aside class="admin-sidebar">
          <div class="brand brand--on-dark" style="padding:20px 18px 10px;">
            <img class="brand__mark" src="../assets/images/logo/logo-badge.png" alt="Little Chef Pizza logo" width="44" height="44" />
            <span class="brand__text"><span class="brand__name">Little Chef</span><span class="brand__tag">ADMIN</span></span>
          </div>
          <nav class="admin-nav">
            ${links.map(([k, l, h]) => `<a href="${h}" class="${k === activePage ? "active" : ""}">${l}</a>`).join("")}
          </nav>
          <button class="admin-logout" id="lcp-admin-logout">Log out</button>
        </aside>
        <div class="admin-main">
          <header class="admin-topbar">
            <div>
              <strong>Little Chef Pizza — Admin</strong>
              <span class="muted" style="margin-left:8px;">${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</span>
            </div>
            <span class="badge badge--gold">${escapeHtml(admin.full_name)}</span>
            <span class="notify-slot" id="lcp-notify-slot"></span>
          </header>
          <main class="admin-content container" id="admin-content"></main>
        </div>
      </div>
    `,
    );
    document
      .getElementById("lcp-admin-logout")
      .addEventListener("click", (e) => doLogout(e.currentTarget));

    // Mobile/tablet: the header bar (topbar) owns the very top and the nav
    // strip sits directly below it — so re-home the sidebar between the
    // topbar and the content at this breakpoint. Desktop keeps the sidebar
    // as the shell's first child (left column).
    const adminNavMq = window.matchMedia("(max-width: 860px)");
    const placeAdminNav = () => {
      const shell = document.querySelector(".admin-shell");
      if (!shell) return;
      const sidebar = shell.querySelector(".admin-sidebar");
      const mainCol = shell.querySelector(".admin-main");
      if (!sidebar || !mainCol) return;
      if (adminNavMq.matches) {
        mainCol.insertBefore(sidebar, mainCol.querySelector(".admin-content"));
      } else {
        shell.insertBefore(sidebar, mainCol);
      }
    };
    placeAdminNav();
    if (adminNavMq.addEventListener) {
      adminNavMq.addEventListener("change", placeAdminNav);
    }

    LCP_NOTIFY?.start("admin", admin);
    startAppPush(admin);
    return admin;
  }

  function escapeHtml(s) {
    return String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }

  return {
    mountCustomer,
    mountAdmin,
    requireAdmin,
    currentUser,
    isGuest,
    doLogout,
    escapeHtml,
  };
})();
