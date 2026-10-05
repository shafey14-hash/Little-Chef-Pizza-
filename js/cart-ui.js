/**
 * cart-ui.js — floating cart bar (adaptive), cart drawer (desktop side sheet /
 * mobile bottom sheet), shared cart line renderer, and the add-to-cart
 * fly animation. Reuses LCP_CART for all state — this file is rendering +
 * interaction only. Mounted once per page by LCP_NAV.mountCustomer().
 */
const LCP_CART_UI = (() => {
  let mounted = false;
  let catalogReady = false;
  let lastTrigger = null;
  let savedScrollY = 0;
  let drag = null;
  let prevCount = 0;

  const BAR_STATES = ["full", "compact", "icon"];
  const reduceMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const byId = (id) => document.getElementById(id);

  async function mount() {
    if (mounted) return;
    mounted = true;

    document.body.insertAdjacentHTML(
      "beforeend",
      `
      <button class="cartbar" id="cartbar" data-state="full" hidden
        aria-label="Open your bucket">
        <span class="cartbar__icon" aria-hidden="true">🧺</span>
        <span class="cartbar__badge" id="cartbar-badge">0</span>
        <span class="cartbar__label">Items</span>
        <span class="cartbar__sep" aria-hidden="true">·</span>
        <span class="cartbar__total" id="cartbar-total">Rs. 0</span>
        <span class="cartbar__chev" aria-hidden="true">→</span>
      </button>

      <div class="cart-overlay" id="cart-overlay">
        <div class="cart-sheet" id="cart-sheet" role="dialog" aria-modal="true"
          aria-label="Your bucket">
          <div class="cart-sheet__handle" id="cart-sheet-handle" aria-hidden="true"></div>
          <div class="cart-sheet__header" id="cart-sheet-header">
            <h3 class="cart-sheet__title">Your Bucket
              <span class="cart-sheet__count" id="cart-sheet-count"></span></h3>
            <button id="cart-sheet-close" aria-label="Close bucket"
              class="btn btn--icon btn--ghost">✕</button>
          </div>
          <div class="cart-sheet__body" id="cart-sheet-body"></div>
          <div class="cart-sheet__footer">
            <div class="cart-sheet__issue" id="cart-sheet-issue" hidden></div>
            <div class="summary-row summary-row--total">
              <span>Subtotal</span><span id="cart-sheet-subtotal">Rs. 0</span>
            </div>
            <p class="cart-sheet__note">Delivery calculated at checkout · free within 3 km</p>
            <a href="${inCustomerFolder() ? "checkout.html" : "customer/checkout.html"}"
              class="btn btn--primary btn--block" id="cart-sheet-checkout">Proceed to Checkout</a>
          </div>
        </div>
      </div>
      `,
    );

    const bar = byId("cartbar");
    bar.addEventListener("click", () => open(bar));
    document
      .getElementById("lcp-bucket-trigger")
      ?.addEventListener("click", (e) => open(e.currentTarget));
    // Compact the bar automatically if its content ever outgrows the viewport.
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(() => fitBar()).observe(bar);
    }
    window.addEventListener("resize", () => fitBar());

    byId("cart-sheet-close").addEventListener("click", close);
    byId("cart-sheet-checkout").addEventListener("click", (e) => {
      if (e.currentTarget.getAttribute("aria-disabled") === "true") {
        e.preventDefault();
        LCP_UTIL.toast(
          "Remove unavailable items from your bucket first.",
          "error",
        );
      }
    });
    byId("cart-overlay").addEventListener("click", (e) => {
      if (e.target.id === "cart-overlay") close();
    });
    document.addEventListener("keydown", onKeydown);
    bindSwipeClose();

    LCP_CART.onChange(render);
    // Load the catalog BEFORE the first render — otherwise items restored
    // from a previous page flash "Unavailable" until the next cart change.
    await LCP_loadCatalogCache();
    catalogReady = true;
    render();
  }

  /** Pages (like bucket.html) that show the full cart inline: mount the
   * drawer but skip the floating bar so it never duplicates the page. */
  async function mountWithoutBar() {
    if (mounted) return;
    await mount();
    byId("cartbar")?.remove();
    // render() already ran while the bar existed and set this for the toast
    // lift — with no bar there is nothing to lift them over.
    document.body.classList.remove("has-cartbar");
  }

  function inCustomerFolder() {
    return window.location.pathname.includes("/customer/");
  }

  /* ------------------------------------------------------------ open/close */

  function open(trigger) {
    lastTrigger = trigger || null;
    render();
    byId("cart-overlay").classList.add("open");
    lockScroll();
    setTimeout(() => byId("cart-sheet-close").focus(), 60);
  }

  function close() {
    const overlay = byId("cart-overlay");
    if (!overlay.classList.contains("open")) return;
    overlay.classList.remove("open");
    const sheet = byId("cart-sheet");
    sheet.style.transform = "";
    unlockScroll();
    if (lastTrigger && document.contains(lastTrigger)) {
      lastTrigger.focus();
    }
    lastTrigger = null;
  }

  function onKeydown(e) {
    const overlay = byId("cart-overlay");
    if (!overlay || !overlay.classList.contains("open")) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      trapTab(e);
    }
  }

  function trapTab(e) {
    const sheet = byId("cart-sheet");
    const focusables = LCP_UTIL.qsa(
      'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
      sheet,
    ).filter((n) => n.getClientRects().length > 0);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /* --------------------------------------------------------- scroll lock */

  function lockScroll() {
    savedScrollY = window.scrollY;
    document.body.classList.add("cart-locked");
    document.body.style.top = `-${savedScrollY}px`;
  }
  function unlockScroll() {
    document.body.classList.remove("cart-locked");
    document.body.style.top = "";
    window.scrollTo(0, savedScrollY);
  }

  /* ------------------------------------------------------- swipe to close
   * Drag source is ONLY the grab-handle and the header strip, so item
   * scrolling and quantity taps are never hijacked. Mobile sheet only. */
  function bindSwipeClose() {
    const start = (e) => {
      const overlay = byId("cart-overlay");
      if (!overlay.classList.contains("open")) return;
      if (!window.matchMedia("(max-width: 860px)").matches) return;
      if (reduceMotion()) return;
      if (!e.touches || e.touches.length !== 1) return;
      drag = { y: e.touches[0].clientY, dy: 0 };
    };
    const move = (e) => {
      if (!drag) return;
      drag.dy = Math.max(0, e.touches[0].clientY - drag.y);
      const sheet = byId("cart-sheet");
      sheet.style.transition = "none";
      sheet.style.transform = `translateY(${drag.dy}px)`;
    };
    const end = () => {
      if (!drag) return;
      const sheet = byId("cart-sheet");
      sheet.style.transition = "";
      if (drag.dy > 90) {
        sheet.style.transform = "";
        close();
      } else {
        sheet.style.transform = "";
      }
      drag = null;
    };
    const zone = () => byId("cart-sheet-handle");
    ["touchstart", "touchmove", "touchend", "touchcancel"].forEach((type) => {
      document.addEventListener(type, (e) => {
        if (type === "touchstart") {
          const t = e.target;
          if (
            t.closest?.("#cart-sheet-handle") ||
            t.closest?.("#cart-sheet-header")
          ) {
            start(e);
          }
        } else if (type === "touchmove") {
          move(e);
        } else {
          end();
        }
      }, { passive: true });
    });
  }

  /* -------------------------------------------------------------- bar fit
   * Full → compact → icon, chosen by measuring the bar itself so the state
   * is always correct regardless of viewport, font metrics, or language. */
  function fitBar() {
    const bar = byId("cartbar");
    if (!bar || bar.hidden) return;
    let chosen = BAR_STATES[BAR_STATES.length - 1];
    for (const state of BAR_STATES) {
      bar.dataset.state = state;
      if (bar.scrollWidth <= bar.clientWidth + 2) {
        chosen = state;
        break;
      }
    }
    bar.dataset.state = chosen;
  }

  function pulseBar() {
    const bar = byId("cartbar");
    if (!bar || bar.hidden) return;
    bar.classList.remove("cartbar--pulse");
    void bar.offsetWidth; // restart the animation
    bar.classList.add("cartbar--pulse");
  }

  function bumpBadge(count) {
    const badge = byId("cartbar-badge");
    if (!badge) return;
    badge.textContent = count;
    if (count !== prevCount) {
      badge.classList.remove("cartbar__badge--bump");
      void badge.offsetWidth;
      badge.classList.add("cartbar__badge--bump");
    }
  }

  /* --------------------------------------------------------------- render */

  function render() {
    const state = LCP_CART.getState();
    const allLines = [...state.items, ...state.deals];
    const count = state.itemCount;

    // Nav pill (top-right on desktop) mirrors the same count.
    const pillCount = document.querySelector(".bucket-pill__count");
    if (pillCount) pillCount.textContent = count;

    const bar = byId("cartbar");
    if (bar) {
      bar.hidden = allLines.length === 0;
      document.body.classList.toggle("has-cartbar", !bar.hidden);
      if (!bar.hidden) {
        bumpBadge(count);
        byId("cartbar-total").textContent = LCP_UTIL.pkr(state.subtotal);
        fitBar();
      } else {
        document.body.classList.remove("has-cartbar");
      }
    }
    prevCount = count;

    renderSheet(state, allLines);
  }

  function renderSheet(state, allLines) {
    const body = byId("cart-sheet-body");
    if (!body) return;
    body.innerHTML = "";
    byId("cart-sheet-count").textContent = allLines.length
      ? `${state.itemCount} item${state.itemCount === 1 ? "" : "s"}`
      : "";
    byId("cart-sheet-subtotal").textContent = LCP_UTIL.pkr(state.subtotal);

    const checkout = byId("cart-sheet-checkout");
    const issue = byId("cart-sheet-issue");
    if (state.hasIssue) {
      issue.hidden = false;
      issue.textContent =
        "Some items are unavailable or changed price — review them before checkout.";
      checkout.classList.add("btn--disabled-look");
      checkout.setAttribute("aria-disabled", "true");
    } else {
      issue.hidden = true;
      checkout.classList.remove("btn--disabled-look");
      checkout.removeAttribute("aria-disabled");
    }

    if (!catalogReady && allLines.length) {
      for (let i = 0; i < 3; i++) {
        body.appendChild(
          LCP_UTIL.el("div", { class: "cart-line cart-line--skeleton" }, [
            LCP_UTIL.el("div", { class: "skeleton", style: "width:56px;height:56px;border-radius:12px;" }),
            LCP_UTIL.el("div", { class: "stack", style: "gap:8px;flex:1;" }, [
              LCP_UTIL.el("div", { class: "skeleton", style: "height:14px;width:70%;" }),
              LCP_UTIL.el("div", { class: "skeleton", style: "height:12px;width:40%;" }),
            ]),
          ]),
        );
      }
      return;
    }

    if (allLines.length === 0) {
      const menuHref = inCustomerFolder() ? "menu.html" : "customer/menu.html";
      body.appendChild(
        LCP_UTIL.el("div", { class: "cart-empty" }, [
          LCP_UTIL.el("div", { class: "cart-empty__icon", "aria-hidden": "true" }, "🧺"),
          LCP_UTIL.el("h4", {}, "Your bucket is empty"),
          LCP_UTIL.el("p", {}, "Add something delicious from the menu."),
          LCP_UTIL.el("a", { class: "btn btn--gold", href: menuHref }, "Browse Menu"),
        ]),
      );
      return;
    }

    state.items.forEach((i) => body.appendChild(lineRow(i, false)));
    state.deals.forEach((d) => body.appendChild(lineRow(d, true)));

    if (LCP_CATALOG_CACHE.lastError) {
      body.appendChild(
        LCP_UTIL.el("p", { class: "cart-sheet__netwarn" },
          "Couldn't refresh live menu prices — totals use the last loaded menu."),
      );
    }
  }

  /* ----------------------------------------------------------- line rows
   * Shared by the drawer and the full bucket page (lineRow is exported). */
  function lineRow(item, isDeal) {
    const maxQty = isDeal ? 20 : 50;
    const blocked = item.missing || item.unavailable;
    const label = item.base_name || item.name;

    const row = LCP_UTIL.el("div", {
      class: "cart-line" + (blocked ? " cart-line--blocked" : ""),
    });

    const thumb = LCP_UTIL.el("div", { class: "cart-line__thumb", "aria-hidden": "true" });
    if (item.image_url) {
      thumb.appendChild(LCP_UTIL.el("img", { src: item.image_url, alt: "", loading: "lazy" }));
    } else {
      thumb.textContent = (label || "?").trim().charAt(0).toUpperCase();
    }

    const info = LCP_UTIL.el("div", { class: "cart-line__info" }, [
      LCP_UTIL.el("span", { class: "cart-line__name" }, label),
      item.variant
        ? LCP_UTIL.el("span", { class: "cart-line__variant" }, item.variant)
        : null,
    ]);
    if (blocked) {
      info.appendChild(
        LCP_UTIL.el("span", { class: "badge badge--danger" },
          item.missing ? "No longer on the menu" : "Currently unavailable"),
      );
    } else if (item.priceChanged) {
      info.appendChild(
        LCP_UTIL.el("span", { class: "cart-line__flag" },
          `Price updated — now ${LCP_UTIL.pkr(item.unit_price)} each`),
      );
    }
    if (!blocked) {
      info.appendChild(
        LCP_UTIL.el("span", { class: "cart-line__unit" },
          `${LCP_UTIL.pkr(item.unit_price)} each`),
      );
    }

    const setQty = (q) => {
      if (isDeal) LCP_CART.setDealQty(item.deal_id, q);
      else LCP_CART.setProductQty(item.product_id, item.size, q, item.option);
    };
    const remove = () => {
      if (isDeal) LCP_CART.removeDeal(item.deal_id);
      else LCP_CART.removeProduct(item.product_id, item.size, item.option);
    };

    const right = LCP_UTIL.el("div", { class: "cart-line__right" });
    right.appendChild(
      LCP_UTIL.el("span", { class: "cart-line__total" }, LCP_UTIL.pkr(item.line_total)),
    );

    if (blocked) {
      const rm = LCP_UTIL.el("button", {
        type: "button",
        class: "cart-line__remove",
        "aria-label": `Remove ${label}`,
      }, "Remove");
      rm.addEventListener("click", remove);
      right.appendChild(rm);
    } else {
      const stepper = LCP_UTIL.el("div", { class: "qty-stepper" });
      const atMin = item.qty <= 1;
      const minus = LCP_UTIL.el("button", {
        type: "button",
        class: "qty-stepper__btn" + (atMin ? " qty-stepper__btn--remove" : ""),
        "aria-label": atMin ? `Remove ${label}` : `Decrease ${label} quantity`,
      }, atMin ? "✕" : "−");
      minus.addEventListener("click", () => {
        // At qty 1 the minus becomes a remove action — never a silent 0.
        if (item.qty <= 1) remove();
        else setQty(item.qty - 1);
      });
      const qtyEl = LCP_UTIL.el("span", {
        class: "qty-stepper__qty",
        "aria-live": "polite",
        "aria-label": `${label} quantity`,
      }, String(item.qty));
      const atMax = item.qty >= maxQty;
      const plus = LCP_UTIL.el("button", {
        type: "button",
        class: "qty-stepper__btn",
        "aria-label": `Increase ${label} quantity`,
      }, "+");
      if (atMax) plus.disabled = true;
      plus.addEventListener("click", () => setQty(item.qty + 1));
      stepper.append(minus, qtyEl, plus);
      right.appendChild(stepper);

      const rm = LCP_UTIL.el("button", {
        type: "button",
        class: "cart-line__remove",
        "aria-label": `Remove ${label}`,
      }, "Remove");
      rm.addEventListener("click", remove);
      right.appendChild(rm);
    }

    row.append(thumb, info, right);
    return row;
  }

  /* -------------------------------------------------- add-to-cart flight */

  function flyToCart(sourceEl, imageUrl) {
    const bar = byId("cartbar");
    const pill = document.querySelector(".bucket-pill");
    const target =
      bar && !bar.hidden
        ? bar
        : pill && pill.getClientRects().length > 0
          ? pill
          : null;

    if (!target || !sourceEl || reduceMotion()) {
      pulseBar();
      return;
    }
    const from = sourceEl.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const size = 46;
    const node = LCP_UTIL.el("div", { class: "cart-fly", "aria-hidden": "true" });
    if (imageUrl) node.style.backgroundImage = `url("${imageUrl}")`;
    node.style.left = `${from.left + from.width / 2 - size / 2}px`;
    node.style.top = `${from.top + from.height / 2 - size / 2}px`;
    document.body.appendChild(node);

    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const anim = node.animate(
      [
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.15}px) scale(0.85)`, opacity: 0.95, offset: 0.45 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.2)`, opacity: 0.55 },
      ],
      { duration: 520, easing: "cubic-bezier(.45,.05,.35,1)" },
    );
    anim.onfinish = () => {
      node.remove();
      pulseBar();
    };
  }

  return { mount, mountWithoutBar, open, close, lineRow, flyToCart };
})();
