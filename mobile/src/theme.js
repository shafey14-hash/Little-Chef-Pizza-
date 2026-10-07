// src/theme.js
//
// Port of the website's CSS design system (css/shared.css tokens) so the
// native app mirrors the exact mobile-responsive look: black/gold brand,
// red primary CTA, cream surfaces, Baloo 2 display + Inter body.

export const COLORS = {
  black: "#0c0b0a",
  gold: "#e7b93f",
  goldDark: "#c99a26",
  red: "#e2222a",
  redDark: "#c31d24",
  cream: "#fbf6ee",
  white: "#ffffff",
  ink: "#1c1712",
  inkSoft: "#5c5347",
  line: "#ece4d6",
  success: "#2e9e5b",
  successBg: "#e8f7ee",
  warn: "#c67c11",
  warnBg: "#fdf2df",
  danger: "#c62828",
  dangerBg: "#fdeaea",
};

export const STATUS_COLORS = {
  payment_verification: "#c67c11",
  pending: "#b98a10",
  confirmed: "#0e8a70",
  out_for_delivery: "#ef7a22",
  delivered: "#2e9e5b",
  rejected: "#c62828",
};

export const STATUS_LABELS = {
  payment_verification: "Verifying Payment",
  pending: "Pending",
  confirmed: "Confirmed",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  rejected: "Rejected",
};

// Family names match the TTFs embedded via the expo-font plugin in app.json
// (same names the @expo-google-fonts packages use).
export const FONTS = {
  display: "Baloo2_700Bold",
  displaySemi: "Baloo2_600SemiBold",
  displayMed: "Baloo2_500Medium",
  displayXBold: "Baloo2_800ExtraBold",
  body: "Inter_400Regular",
  bodyMed: "Inter_500Medium",
  bodySemi: "Inter_600SemiBold",
  bodyBold: "Inter_700Bold",
};

export const RADIUS = { sm: 8, md: 12, lg: 14, xl: 22, pill: 999 };

export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, gutter: 14 };

// Phone spec from the ≤620px breakpoint of the site.
export const SIZES = {
  body: 14,
  small: 12,
  tiny: 11,
  h1: 26,
  h2: 20,
  h3: 16,
  btn: 14,
  btnH: 42,
  inputH: 44,
  tabH: 58,
};

export const shadowCard = {
  shadowColor: "#1c1712",
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
};

export const shadowFloat = {
  shadowColor: "#1c1712",
  shadowOpacity: 0.18,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 6,
};
