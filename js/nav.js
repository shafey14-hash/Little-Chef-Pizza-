/**
 * nav.js — builds the shared customer navbar + footer, and the admin shell.
 * Keeping this in one place means every page's navigation stays consistent.
 */
const LCP_NAV = (() => {
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
            <span class="brand__mark">LC</span>
            <span class="brand__text">
              <span class="brand__name">Little Chef Pizza</span>
              <span class="brand__tag">PIZZA &amp; FAST FOOD</span>
            </span>
          </a>
          <nav class="nav" aria-label="Main">${linkHtml}</nav>
          <div class="topnav__right">
            ${who}
            <button class="btn btn--gold btn--sm bucket-pill" id="lcp-bucket-trigger" aria-label="View bucket">
              🧺 <span class="bucket-pill__label">Bucket</span> <span class="bucket-pill__count">${cart.itemCount}</span>
            </button>
            ${user ? `<button class="btn btn--icon btn--ghost" id="lcp-logout-icon" title="Log out" aria-label="Log out">⎋</button>` : ""}
          </div>
        </div>
      </header>
      <nav class="mobile-tabbar" aria-label="Mobile navigation">${tabHtml}</nav>
    `,
    );

    document
      .getElementById("lcp-logout-icon")
      ?.addEventListener("click", doLogout);
  }

  function customerFooter() {
    const r = LCP_SEED.restaurant;
    document.body.insertAdjacentHTML(
      "beforeend",
      `
      <footer class="site-footer">
        <div class="container footer__grid">
          <div>
            <div class="brand brand--on-dark">
              <span class="brand__mark">LC</span>
              <span class="brand__text">
                <span class="brand__name">${r.name}</span>
                <span class="brand__tag">PIZZA &amp; FAST FOOD</span>
              </span>
            </div>
            <p class="footer__about">Freshly made pizza, wings, rolls &amp; more — delivered fast across Gujrat city, or ready for takeaway and dine-in.</p>
          </div>
          <div>
            <h4>Quick Links</h4>
            <a href="menu.html">Menu</a><a href="deals.html">Deals</a><a href="orders.html">My Orders</a><a href="bucket.html">Order Now</a>
          </div>
          <div>
            <h4>Contact</h4>
            <p>${r.address}</p>
            <p>Tel: ${r.phone_primary}<br>Phone: ${r.phone_secondary}<br>WhatsApp: ${r.phone_whatsapp}</p>
            <p class="footer__delivery-note">${r.delivery_note}</p>
            <a class="btn btn--gold btn--sm" target="_blank" rel="noopener"
               href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address)}">Get Directions</a>
          </div>
        </div>
        <div class="footer__bottom">© ${new Date().getFullYear()} Little Chef Pizza. All rights reserved.</div>
      </footer>
    `,
    );
  }

  async function doLogout() {
    await LCP_DB.auth.signOut();
    sessionStorage.removeItem("lcp_guest");
    if (window.location.pathname.includes("/admin/")) {
      window.location.href = "login.html";
    } else if (window.location.pathname.includes("/customer/")) {
      window.location.href = "../index.html";
    } else {
      window.location.href = "index.html";
    }
  }

  async function mountCustomer(activePage) {
    await LCP_DB.auth.init(); // wait for the real Supabase session before rendering who's logged in
    LCP_UTIL.flashPop();
    customerHeader(activePage);
    customerFooter();
    LCP_CART_UI.mount();
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
            <span class="brand__mark">LC</span>
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
          </header>
          <main class="admin-content container" id="admin-content"></main>
        </div>
      </div>
    `,
    );
    document
      .getElementById("lcp-admin-logout")
      .addEventListener("click", doLogout);
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
