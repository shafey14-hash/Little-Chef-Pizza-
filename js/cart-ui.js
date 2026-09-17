/**
 * cart-ui.js — the right-side cart sidebar and the persistent bucket bar.
 * Mounted once per page by LCP_NAV.mountCustomer(). Reuses LCP_CART for
 * state/calculations — this file is purely rendering + interaction.
 */
const LCP_CART_UI = (() => {
  let mounted = false;

  async function mount() {
    if (mounted) return;
    mounted = true;

    document.body.insertAdjacentHTML(
      "beforeend",
      `
      <div class="bucket-bar" id="bucket-bar" hidden aria-label="Your bucket">
        <span class="bucket-bar__arrow" aria-hidden="true">🛒</span>
        <div class="bucket-bar__items" id="bucket-bar-items" role="button" tabindex="0" aria-label="Open bucket"></div>
        <div class="bucket-bar__summary">
          <span id="bucket-bar-subtotal"></span>
          <span class="bucket-bar__arrow" aria-hidden="true">→</span>
        </div>
      </div>
      <div class="cart-sidebar-overlay" id="cart-sidebar-overlay">
        <aside class="cart-sidebar" role="dialog" aria-label="Your bucket">
          <div class="cart-sidebar__header">
            <h3>Your Bucket</h3>
            <button id="cart-sidebar-close" aria-label="Close" class="btn btn--icon btn--ghost">✕</button>
          </div>
          <div class="cart-sidebar__body" id="cart-sidebar-body"></div>
          <div class="cart-sidebar__footer">
            <div class="summary-row summary-row--total"><span>Subtotal</span><span id="cart-sidebar-subtotal">Rs. 0</span></div>
            <a href="${inCustomerFolder() ? "checkout.html" : "customer/checkout.html"}" class="btn btn--primary btn--block" id="cart-sidebar-checkout">Checkout</a>
          </div>
        </aside>
      </div>
    `,
    );

    document
      .getElementById("cart-sidebar-close")
      .addEventListener("click", close);
    document
      .getElementById("cart-sidebar-overlay")
      .addEventListener("click", (e) => {
        if (e.target.id === "cart-sidebar-overlay") close();
      });
    const bar = document.getElementById("bucket-bar");
    bar.addEventListener("click", open);
    bar.addEventListener("keydown", (e) => {
      if (e.key === "Enter") open();
    });
    document
      .getElementById("lcp-bucket-trigger")
      ?.addEventListener("click", open);

    LCP_CART.onChange(render);
    // Load the catalog BEFORE the first render — otherwise, on any page
    // loaded with items already in the bucket (from a previous page),
    // every item would briefly (or until the next cart change) show as
    // "Unavailable item" simply because the catalog hadn't loaded yet.
    await LCP_loadCatalogCache();
    render();
  }

  /** Called on pages (like the full bucket.html page) that already show
   * full cart details inline — avoids a confusing duplicate floating bar
   * that opens a second copy of the same thing you're already looking at. */
  async function mountWithoutBar() {
    if (mounted) return;
    await mount();
    document.getElementById("bucket-bar")?.remove();
  }

  function inCustomerFolder() {
    return window.location.pathname.includes("/customer/");
  }

  function open() {
    render();
    document.getElementById("cart-sidebar-overlay").classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function close() {
    document.getElementById("cart-sidebar-overlay").classList.remove("open");
    document.body.style.overflow = "";
  }

  function render() {
    const state = LCP_CART.getState();
    const bar = document.getElementById("bucket-bar");
    if (bar) {
      const allLines = [...state.items, ...state.deals];
      bar.hidden = allLines.length === 0;
      const itemsHost = document.getElementById("bucket-bar-items");
      itemsHost.innerHTML = "";
      allLines.forEach((line) => {
        itemsHost.appendChild(
          LCP_UTIL.el("span", { class: "bucket-bar__chip" }, [
            LCP_UTIL.el("span", {}, line.name),
            LCP_UTIL.el(
              "span",
              { class: "bucket-bar__chip-qty" },
              String(line.qty),
            ),
          ]),
        );
      });
      document.getElementById("bucket-bar-subtotal").textContent = LCP_UTIL.pkr(
        state.subtotal,
      );
    }

    const pillCount = document.querySelector(".bucket-pill__count");
    if (pillCount) pillCount.textContent = state.itemCount;

    const body = document.getElementById("cart-sidebar-body");
    if (!body) return;
    body.innerHTML = "";

    if (state.items.length === 0 && state.deals.length === 0) {
      body.innerHTML = `<div class="empty-state"><div class="empty-state__icon">🧺</div><p>Your bucket is empty.</p></div>`;
      document.getElementById("cart-sidebar-subtotal").textContent =
        LCP_UTIL.pkr(0);
      return;
    }

    function line(item, isDeal) {
      const row = LCP_UTIL.el("div", { class: "cart-sidebar__line" });
      row.appendChild(
        LCP_UTIL.el("div", { class: "stack flex-1" }, [
          LCP_UTIL.el("span", { class: "bucket-line__name" }, item.name),
          LCP_UTIL.el(
            "span",
            { class: "muted" },
            LCP_UTIL.pkr(item.unit_price) + " each",
          ),
        ]),
      );
      const stepper = LCP_UTIL.el("div", { class: "qty-stepper" });
      const minus = LCP_UTIL.el("button", { type: "button" }, "−");
      const qtyEl = LCP_UTIL.el("span", {}, String(item.qty));
      const plus = LCP_UTIL.el("button", { type: "button" }, "+");
      minus.addEventListener("click", () => {
        isDeal
          ? LCP_CART.setDealQty(item.deal_id, item.qty - 1)
          : LCP_CART.setProductQty(item.product_id, item.size, item.qty - 1);
      });
      plus.addEventListener("click", () => {
        isDeal
          ? LCP_CART.setDealQty(item.deal_id, item.qty + 1)
          : LCP_CART.setProductQty(item.product_id, item.size, item.qty + 1);
      });
      stepper.append(minus, qtyEl, plus);
      row.appendChild(stepper);
      row.appendChild(
        LCP_UTIL.el(
          "span",
          {
            class: "price",
            style: "width:70px; text-align:right; font-size:13px;",
          },
          LCP_UTIL.pkr(item.line_total),
        ),
      );
      return row;
    }

    state.items.forEach((i) => body.appendChild(line(i, false)));
    state.deals.forEach((d) => body.appendChild(line(d, true)));
    document.getElementById("cart-sidebar-subtotal").textContent = LCP_UTIL.pkr(
      state.subtotal,
    );
  }

  return { mount, mountWithoutBar, open, close };
})();
