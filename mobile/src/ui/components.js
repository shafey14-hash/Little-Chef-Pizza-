// src/ui/components.js
//
// Shared building blocks mirroring the website's component classes
// (.btn, .field/input, .card, .status-pill, qty steppers) at the ≤620px
// phone spec.

import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  COLORS,
  FONTS,
  RADIUS,
  SIZES,
  SPACING,
  shadowCard,
  STATUS_COLORS,
  STATUS_LABELS,
} from "../theme";

// ---------------------------------------------------------------- button
export function Button({
  title,
  onPress,
  variant = "primary", // primary | ghost | danger | gold
  disabled,
  loading,
  loadingText,
  style,
  textStyle,
  small,
}) {
  const bg = {
    primary: COLORS.red,
    ghost: "transparent",
    danger: COLORS.danger,
    gold: COLORS.gold,
  }[variant];
  const fg =
    variant === "ghost"
      ? COLORS.ink
      : variant === "gold"
        ? COLORS.black
        : COLORS.white;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: pressed && variant !== "ghost" ? shade(bg) : bg },
        variant === "ghost" && styles.btnGhost,
        (disabled || loading) && styles.btnDisabled,
        style,
      ]}
    >
      {loading ? (
        <View style={styles.btnRow}>
          <ActivityIndicator color={fg} size="small" />
          <Text style={[styles.btnText, { color: fg }, textStyle]}>
            {" " + (loadingText || "Please wait…")}
          </Text>
        </View>
      ) : (
        <Text style={[styles.btnText, { color: fg }, textStyle]}>{title}</Text>
      )}
    </Pressable>
  );
}

function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 255) - 28);
  const g = Math.max(0, ((n >> 8) & 255) - 28);
  const b = Math.max(0, (n & 255) - 28);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// ----------------------------------------------------------------- field
export function Field({ label, error, children }) {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      {children}
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function Input({ style, ...props }) {
  return (
    <TextInput
      placeholderTextColor={COLORS.inkSoft}
      style={[styles.input, style]}
      {...props}
    />
  );
}

// ------------------------------------------------------------------ card
export function Card({ style, children }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// ----------------------------------------------------------- status pill
export function StatusPill({ status }) {
  const color = STATUS_COLORS[status] || COLORS.inkSoft;
  return (
    <View style={[styles.pill, { backgroundColor: color + "1f" }]}>
      <View style={[styles.pillDot, { backgroundColor: color }]} />
      <Text style={[styles.pillText, { color }]}>{STATUS_LABELS[status] || status}</Text>
    </View>
  );
}

// ------------------------------------------------------------ qty stepper
export function QtyStepper({ value, onChange, min = 0, max = 99, small }) {
  const btn = (label, disabled, action) => (
    <Pressable
      onPress={action}
      disabled={disabled}
      style={[styles.stepBtn, small && styles.stepBtnSmall, disabled && { opacity: 0.35 }]}
    >
      <Text style={styles.stepBtnText}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={[styles.stepper, small && styles.stepperSmall]}>
      {btn("−", value <= min, () => onChange(Math.max(min, value - 1)))}
      <Text style={[styles.stepValue, small && styles.stepValueSmall]}>{value}</Text>
      {btn("+", value >= max, () => onChange(Math.min(max, value + 1)))}
    </View>
  );
}

// ---------------------------------------------------------------- screen
export function Screen({ scroll = true, style, children, ...props }) {
  if (scroll) {
    return (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.screenInner, style]}
        {...props}
      >
        {children}
      </ScrollView>
    );
  }
  return (
    <View style={[styles.screenInner, style]} {...props}>
      {children}
    </View>
  );
}

export function SectionTitle({ children, style }) {
  return <Text style={[styles.sectionTitle, style]}>{children}</Text>;
}

export function Hero({ title, subtitle }) {
  return (
    <LinearGradient
      colors={[COLORS.black, "#241d13"]}
      style={styles.hero}
    >
      <Text style={styles.heroTitle}>{title}</Text>
      {subtitle ? <Text style={styles.heroSubtitle}>{subtitle}</Text> : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: SIZES.btnH,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.xl,
  },
  btnSmall: { height: 36, paddingHorizontal: SPACING.lg },
  btnGhost: { borderWidth: 1.5, borderColor: COLORS.line, backgroundColor: COLORS.white },
  btnDisabled: { opacity: 0.5 },
  btnRow: { flexDirection: "row", alignItems: "center" },
  btnText: {
    fontSize: SIZES.btn,
    fontFamily: FONTS.bodySemi,
    letterSpacing: 0.2,
  },
  field: { marginBottom: SPACING.md },
  fieldLabel: {
    fontSize: SIZES.small,
    fontFamily: FONTS.bodySemi,
    color: COLORS.ink,
    marginBottom: 6,
  },
  fieldError: {
    fontSize: SIZES.tiny,
    fontFamily: FONTS.body,
    color: COLORS.danger,
    marginTop: 4,
  },
  input: {
    height: SIZES.inputH,
    borderWidth: 1.5,
    borderColor: COLORS.line,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.md,
    fontSize: SIZES.body,
    fontFamily: FONTS.body,
    color: COLORS.ink,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: SPACING.md,
    ...shadowCard,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: RADIUS.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
  },
  pillDot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontSize: SIZES.tiny, fontFamily: FONTS.bodySemi },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: COLORS.line,
    borderRadius: RADIUS.pill,
    overflow: "hidden",
    backgroundColor: COLORS.white,
  },
  stepperSmall: { height: 30 },
  stepBtn: {
    width: 36,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnSmall: { width: 30, height: 28 },
  stepBtnText: {
    fontSize: 17,
    fontFamily: FONTS.bodyBold,
    color: COLORS.ink,
    marginTop: -2,
  },
  stepValue: {
    minWidth: 30,
    textAlign: "center",
    fontSize: SIZES.body,
    fontFamily: FONTS.bodyBold,
    color: COLORS.ink,
  },
  stepValueSmall: { fontSize: SIZES.small },
  screenInner: {
    padding: SPACING.gutter,
    paddingBottom: 120,
  },
  sectionTitle: {
    fontSize: SIZES.h3,
    fontFamily: FONTS.display,
    color: COLORS.ink,
    marginBottom: SPACING.sm,
  },
  hero: {
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  heroTitle: {
    fontSize: SIZES.h1,
    fontFamily: FONTS.display,
    color: COLORS.gold,
    lineHeight: 32,
  },
  heroSubtitle: {
    fontSize: SIZES.body,
    fontFamily: FONTS.body,
    color: "#d8d2c8",
    marginTop: 6,
  },
});
