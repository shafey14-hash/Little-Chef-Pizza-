/**
 * validation.js — form-level validation used by signup/login/checkout forms.
 * Client-side validation is for UX only; db.js re-validates everything that
 * actually matters before writing data (see orders.create()).
 */
const LCP_VALID = (() => {
  function username(v) {
    if (!v || v.trim().length < 3) return "Username must be at least 3 characters.";
    if (!/^[a-zA-Z0-9_.]{3,20}$/.test(v)) return "Username can only contain letters, numbers, dots and underscores.";
    return null;
  }
  function password(v) {
    if (!v || v.length < 6) return "Password must be at least 6 characters.";
    return null;
  }
  function confirmPassword(v, orig) {
    if (v !== orig) return "Passwords do not match.";
    return null;
  }
  function fullName(v) {
    if (!v || v.trim().length < 2) return "Please enter your full name.";
    return null;
  }
  function phone(v) {
    if (!v || !/^[0-9+\-\s]{7,15}$/.test(v.trim())) return "Please enter a valid phone number.";
    return null;
  }
  function required(v, label) {
    if (!v || !String(v).trim()) return `${label} is required.`;
    return null;
  }

  function applyFieldError(inputEl, message) {
    const group = inputEl.closest(".field");
    if (!group) return;
    let errEl = group.querySelector(".field__error");
    if (!errEl) {
      errEl = document.createElement("span");
      errEl.className = "field__error";
      group.appendChild(errEl);
    }
    errEl.textContent = message || "";
    group.classList.toggle("field--invalid", !!message);
  }

  return { username, password, confirmPassword, fullName, phone, required, applyFieldError };
})();
