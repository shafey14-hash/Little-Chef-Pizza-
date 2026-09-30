/**
 * notify.js — in-app notifications.
 *
 * One bell + dropdown panel (injected into #lcp-notify-slot, which nav.js
 * renders inside the customer topnav and the admin topbar) plus toasts for
 * anything new. Two scopes, two storages:
 *   customer → order status changes + their own new orders
 *   admin    → new incoming orders only
 *
 * How detection works: every sync fetches the order list, diffs it against
 * the last-known statuses saved in localStorage, and turns any difference
 * into a notification item. The very first sync on a device/account only
 * records the current state ("silent seed") so nobody gets flooded with
 * notifications for orders they already know about.
 */
const LCP_NOTIFY = (() => {
  const POLL_MS = 30000;
  const MAX_ITEMS = 50;

  let scope = null;
  let userId = null;
  let storageKey = null;
  let state = { seeded: false, seen: {}, items: [] };
  let started = false;
  let syncing = false;
  let panelOpen = false;
  let pollTimer = null;
  let debounceTimer = null;
  let unsubscribeRealtime = null;

  function u() {
    return LCP_UTIL || {};
  }

  function esc(s) {
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

  function pkr(n) {
    return u().pkr ? u().pkr(n) : "Rs. " + (n == null ? "" : n);
  }

  function timeAgo(ts) {
    const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 45) return "just now";
    const m = Math.floor(s / 60);
    if (m < 60) return m + "m ago";
    const h = Math.floor(m / 60);
    if (h < 24) return h + "h ago";
    const d = Math.floor(h / 24);
    return d + "d ago";
  }

  // ------------------------------------------------------------- storage
  function loadState() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        state = {
          seeded: !!parsed.seeded,
          seen:
            parsed.seen && typeof parsed.seen === "object" ? parsed.seen : {},
          items: Array.isArray(parsed.items) ? parsed.items : [],
        };
      }
    } catch (e) {
      // corrupted entry — start fresh, the next sync silently reseeds
      state = { seeded: false, seen: {}, items: [] };
    }
  }

  function saveState() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (e) {
      /* storage full/blocked — notifications just won't persist */
    }
  }

  // ------------------------------------------------------------- text
  function textFor(kind, o) {
    const n = o.order_number;
    if (kind === "new") {
      const t = (o.order_type || "").toUpperCase();
      return `🔔 New order ${n} placed — ${pkr(o.total)}${t ? ` (${t})` : ""}`;
    }
    if (kind === "rejected") {
      if (o.rejection_reason === "cancelled") return `Order ${n} was cancelled.`;
      if (o.rejection_reason === "failed_delivery")
        return `Order ${n} — delivery failed. Please contact the restaurant.`;
      return `Order ${n} was rejected by the restaurant.`;
    }
    const map = {
      payment_verification: `Order ${n} placed — payment is being verified.`,
      pending: `Order ${n} placed — waiting for the restaurant to confirm it.`,
      confirmed: `Order ${n} has been confirmed by the restaurant. ✅`,
      out_for_delivery: `Order ${n} is out for delivery! 🛵`,
      delivered: `Order ${n} delivered. Enjoy your meal! 🍕`,
    };
    return map[kind] || `Order ${n} status updated.`;
  }

  // ------------------------------------------------------------- ui
  function renderBadge() {
    const badge = document.getElementById("lcp-notify-badge");
    if (!badge) return;
    const unread = state.items.filter((i) => !i.read).length;
    badge.hidden = unread === 0;
    badge.textContent = unread > 9 ? "9+" : String(unread);
  }

  function renderPanel() {
    const list = document.getElementById("lcp-notify-list");
    if (!list) return;
    if (!state.items.length) {
      list.innerHTML = `<div class="notify-panel__empty">No notifications yet.</div>`;
      return;
    }
    list.innerHTML = state.items
      .map(
        (i) => `
        <div class="notify-item ${i.read ? "" : "notify-item--unread"}">
          <span class="notify-item__dot" aria-hidden="true"></span>
          <div>
            <div class="notify-item__text">${esc(i.text)}</div>
            <div class="notify-item__time">${timeAgo(i.ts)}</div>
          </div>
        </div>`,
      )
      .join("");
  }

  function openPanel() {
    const panel = document.getElementById("lcp-notify-panel");
    const bell = document.getElementById("lcp-notify-bell");
    if (!panel) return;
    panelOpen = true;
    panel.hidden = false;
    bell?.setAttribute("aria-expanded", "true");
    let changed = false;
    state.items.forEach((i) => {
      if (!i.read) {
        i.read = true;
        changed = true;
      }
    });
    if (changed) saveState();
    renderBadge();
    renderPanel();
  }

  function closePanel() {
    const panel = document.getElementById("lcp-notify-panel");
    const bell = document.getElementById("lcp-notify-bell");
    if (!panel) return;
    panelOpen = false;
    panel.hidden = true;
    bell?.setAttribute("aria-expanded", "false");
  }

  function bindEvents() {
    const bell = document.getElementById("lcp-notify-bell");
    const clearBtn = document.getElementById("lcp-notify-clear");
    bell?.addEventListener("click", () => {
      panelOpen ? closePanel() : openPanel();
    });
    clearBtn?.addEventListener("click", () => {
      state.items = [];
      saveState();
      renderBadge();
      renderPanel();
    });
    document.addEventListener("click", (e) => {
      if (!panelOpen) return;
      const wrap = document.getElementById("lcp-notify-slot");
      if (wrap && !wrap.contains(e.target)) closePanel();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && panelOpen) closePanel();
    });
  }

  function injectUi(slot) {
    slot.innerHTML = `
      <div class="notify-wrap">
        <button class="btn btn--icon btn--ghost notify-bell" id="lcp-notify-bell"
                title="Notifications" aria-label="Notifications" aria-expanded="false" aria-haspopup="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
          <span class="notify-bell__badge" id="lcp-notify-badge" hidden>0</span>
        </button>
        <div class="notify-panel" id="lcp-notify-panel" hidden>
          <div class="notify-panel__head">
            <strong>Notifications</strong>
            <button class="notify-panel__clear" id="lcp-notify-clear">Clear all</button>
          </div>
          <div class="notify-list" id="lcp-notify-list"></div>
          <div class="notify-panel__foot"><a href="orders.html">View all orders →</a></div>
        </div>
      </div>`;
  }

  // ------------------------------------------------------------- engine
  async function sync() {
    if (syncing || !LCP_DB?.orders) return;
    syncing = true;
    try {
      const res =
        scope === "admin"
          ? await LCP_DB.orders.listAll()
          : await LCP_DB.orders.listForUser(userId);
      if (res.error) return; // transient — retry on the next tick
      const orders = res.data || [];
      const fresh = [];
      let seenChanged = false;

      orders.forEach((o) => {
        const sig = o.status + "|" + (o.rejection_reason || "");
        const prev = state.seen[o.id];
        if (!state.seeded) {
          state.seen[o.id] = sig;
          seenChanged = true;
          return;
        }
        if (prev === undefined) {
          fresh.push({
            id: `${o.id}|${scope === "admin" ? "new" : sig}`,
            text: textFor(scope === "admin" ? "new" : o.status, o),
            ts: Date.now(),
            read: panelOpen,
          });
        } else if (prev !== sig && scope === "customer") {
          fresh.push({
            id: `${o.id}|${sig}`,
            text: textFor(o.status, o),
            ts: Date.now(),
            read: panelOpen,
          });
        }
        if (prev !== sig) {
          state.seen[o.id] = sig;
          seenChanged = true;
        }
      });

      if (!state.seeded) {
        state.seeded = true;
        saveState();
        renderBadge();
        renderPanel();
        return;
      }
      if (!fresh.length && !seenChanged) return;

      if (fresh.length) {
        state.items = [...fresh, ...state.items].slice(0, MAX_ITEMS);
        renderBadge();
        renderPanel();
        fresh
          .slice(0, 3)
          .forEach((i) => u().toast?.(i.text.replace("🔔 ", ""), "info"));
      }
      saveState();
    } finally {
      syncing = false;
    }
  }

  function scheduleSync() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(sync, 1200);
  }

  // ------------------------------------------------------------- start
  function start(newScope, user) {
    if (started || !user) return;
    const slot = document.getElementById("lcp-notify-slot");
    if (!slot) return;
    started = true;
    scope = newScope;
    userId = user.id;
    storageKey =
      (scope === "admin" ? "lcp_notify_admin-" : "lcp_notify_cust-") + userId;

    injectUi(slot);
    loadState();
    bindEvents();
    renderBadge();
    renderPanel();

    sync();
    pollTimer = setInterval(sync, POLL_MS);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) sync();
    });
    try {
      unsubscribeRealtime = LCP_DB.orders.subscribeToChanges(
        scheduleSync,
        scope === "admin" ? {} : { userId },
      );
    } catch (e) {
      /* realtime unavailable — polling still covers us */
    }
    window.addEventListener("beforeunload", () => {
      clearInterval(pollTimer);
      if (unsubscribeRealtime) unsubscribeRealtime();
    });
  }

  return { start };
})();
