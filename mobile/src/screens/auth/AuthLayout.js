// src/screens/auth/AuthLayout.js
//
// Shared shell for the auth views — mirrors the website's auth modal:
// centered brand block, dark backdrop feel, optional "← Back".

import React from "react";
import { Image, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { COLORS, FONTS, SIZES, SPACING } from "../../theme";

export default function AuthLayout({ title, tag, back, children, wide }) {
  const navigation = useNavigation();
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "android" ? undefined : "padding"}
        style={styles.flex}
      >
        <View style={[styles.stage, wide && styles.stageWide]}>
          {back ? (
            <Pressable style={styles.back} onPress={() => navigation.goBack()}>
              <Text style={styles.backText}>← Back</Text>
            </Pressable>
          ) : null}

          {title ? (
            <View style={styles.brand}>
              <Image
                source={require("../../../assets/logo-badge.png")}
                style={styles.logo}
              />
              <Text style={styles.title}>{title}</Text>
              {tag ? <Text style={styles.tag}>{tag}</Text> : null}
            </View>
          ) : null}

          {children}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function AuthHeading({ children }) {
  return <Text style={styles.heading}>{children}</Text>;
}

export function AuthMuted({ children, style }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

// The app-only "Log in as Admin" pill (bottom-left on the website, shown on
// the welcome + login views). Always visible here — this IS the app.
export function AdminCorner() {
  const navigation = useNavigation();
  return (
    <Pressable
      style={styles.adminCorner}
      onPress={() => navigation.navigate("AdminLogin")}
    >
      <Text style={styles.adminCornerText}>Log in as Admin</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.cream },
  flex: { flex: 1 },
  stage: {
    flex: 1,
    justifyContent: "center",
    padding: SPACING.xl,
  },
  stageWide: { justifyContent: "flex-start", paddingTop: SPACING.xl * 2 },
  back: { alignSelf: "flex-start", marginBottom: SPACING.md, padding: 4 },
  backText: {
    color: COLORS.inkSoft,
    fontSize: SIZES.small,
    fontFamily: FONTS.bodySemi,
  },
  brand: { alignItems: "center", marginBottom: SPACING.lg },
  logo: { width: 72, height: 72, borderRadius: 36, marginBottom: 10 },
  title: {
    fontSize: SIZES.h2,
    fontFamily: FONTS.display,
    color: COLORS.ink,
  },
  tag: {
    fontSize: SIZES.tiny,
    fontFamily: FONTS.bodySemi,
    letterSpacing: 2,
    color: COLORS.gold,
    marginTop: 2,
  },
  heading: {
    fontSize: SIZES.h2,
    fontFamily: FONTS.display,
    color: COLORS.ink,
    textAlign: "center",
    marginBottom: SPACING.md,
  },
  muted: {
    fontSize: SIZES.body,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    textAlign: "center",
    marginBottom: SPACING.md,
    lineHeight: 20,
  },
  adminCorner: {
    position: "absolute",
    left: 14,
    bottom: 14,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(231,185,63,.45)",
    backgroundColor: "rgba(12,11,10,.82)",
  },
  adminCornerText: {
    color: COLORS.cream,
    fontSize: 12.5,
    fontFamily: FONTS.bodySemi,
    letterSpacing: 0.6,
  },
});
