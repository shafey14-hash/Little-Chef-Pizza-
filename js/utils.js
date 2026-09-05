/**
 * utils.js — shared helpers used across every page.
 */
const LCP_UTIL = (() => {

  // Tiny non-cryptographic hash used ONLY for the localStorage demo mode.
  // In the real Supabase build, this is replaced entirely by Supabase Auth
  // (or a secure Edge Function) — see supabase/policies.sql notes.
  function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return "h" + h.toString(36) + str.length;
  }

  function pkr(amount) {
    if (amount == null) return "TBD";
    return "Rs. " + Math.round(amount).toLocaleString("en-PK");
  }

  function qs(sel, root = document) { return root.querySelector(sel); }
  function qsa(sel, root = document) { return [...root.querySelectorAll(sel)]; }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const c of [].concat(children)) {
      if (c == null) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  }

  // ---- Toasts ----
  function ensureToastHost() {
    let host = qs("#lcp-toast-host");
    if (!host) {
      host = el("div", { id: "lcp-toast-host", class: "lcp-toast-host", role: "status", "aria-live": "polite" });
      document.body.appendChild(host);
    }
    return host;
  }
  function toast(message, type = "info") {
    const host = ensureToastHost();
    const node = el("div", { class: `lcp-toast lcp-toast--${type}` }, message);
    host.appendChild(node);
    requestAnimationFrame(() => node.classList.add("show"));
    setTimeout(() => {
      node.classList.remove("show");
      setTimeout(() => node.remove(), 250);
    }, 3200);
  }

  // ---- Confirm dialog (promise-based, replaces window.confirm) ----
  function confirmDialog(message, { confirmText = "Confirm", danger = false } = {}) {
    return new Promise((resolve) => {
      const overlay = el("div", { class: "lcp-modal-overlay" });
      const box = el("div", { class: "lcp-modal" }, [
        el("p", { class: "lcp-modal__msg" }, message),
        el("div", { class: "lcp-modal__actions" }, [
          el("button", { class: "btn btn--ghost", onclick: () => close(false) }, "Cancel"),
          el("button", { class: `btn ${danger ? "btn--danger" : "btn--primary"}`, onclick: () => close(true) }, confirmText),
        ]),
      ]);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add("show"));
      function close(result) {
        overlay.classList.remove("show");
        setTimeout(() => overlay.remove(), 200);
        resolve(result);
      }
    });
  }

  function setLoading(button, isLoading, loadingText = "Please wait…") {
    if (!button) return;
    if (isLoading) {
      button.dataset.originalText = button.dataset.originalText || button.textContent;
      button.textContent = loadingText;
      button.disabled = true;
      button.classList.add("is-loading");
    } else {
      button.textContent = button.dataset.originalText || button.textContent;
      button.disabled = false;
      button.classList.remove("is-loading");
    }
  }

  function friendlyError(err) {
    // Never surface raw technical errors to the user.
    if (typeof err === "string") return err;
    return "Something went wrong. Please try again.";
  }

  function requireGuard(condition, redirectTo, message) {
    if (!condition) {
      if (message) sessionStorage.setItem("lcp_flash", message);
      window.location.href = redirectTo;
      return false;
    }
    return true;
  }

  function flashPop() {
    const msg = sessionStorage.getItem("lcp_flash");
    if (msg) {
      sessionStorage.removeItem("lcp_flash");
      setTimeout(() => toast(msg, "info"), 100);
    }
  }

  function fmtDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
      " · " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  function debounce(fn, ms = 250) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  return { hash, pkr, qs, qsa, el, toast, confirmDialog, setLoading, friendlyError, requireGuard, flashPop, fmtDate, debounce };
})();
