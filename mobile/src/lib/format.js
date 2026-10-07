// src/lib/format.js
//
// Port of js/utils.js formatters (pkr, fmtDate, timeAgo, hash) and
// js/validation.js rules — identical messages so the app feels the same.

export function pkr(amount) {
  if (amount == null) return "TBD";
  return "Rs. " + Math.round(amount).toLocaleString("en-PK");
}

export function fmtDate(iso) {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[d.getMonth()];
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${day} ${month} ${d.getFullYear()} · ${time}`;
}

export function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function friendlyError(err) {
  if (typeof err === "string") return err;
  return "Something went wrong. Please try again.";
}

export function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return "h" + h.toString(36) + str.length;
}

// ---- validation (js/validation.js) ----
export function validateUsername(v) {
  if (!v || v.trim().length < 3) return "Username must be at least 3 characters.";
  if (!/^[a-zA-Z0-9_.]{3,20}$/.test(v))
    return "Username can only contain letters, numbers, dots and underscores.";
  return null;
}
export function validatePassword(v) {
  if (!v || v.length < 6) return "Password must be at least 6 characters.";
  return null;
}
export function validateConfirmPassword(v, orig) {
  if (v !== orig) return "Passwords do not match.";
  return null;
}
export function validateFullName(v) {
  if (!v || v.trim().length < 2) return "Please enter your full name.";
  return null;
}
export function validatePhone(v) {
  if (!v || !/^[0-9+\-\s]{7,15}$/.test(v.trim()))
    return "Please enter a valid phone number.";
  return null;
}
export function validateEmail(v) {
  if (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
    return "Please enter a valid email address.";
  return null;
}
export function validateRequired(v, label) {
  if (!v || !String(v).trim()) return `${label} is required.`;
  return null;
}
