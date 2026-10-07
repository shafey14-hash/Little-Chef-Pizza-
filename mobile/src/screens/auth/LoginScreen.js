// src/screens/auth/LoginScreen.js
//
// Customer login — mirrors index.html's customer-login view + js/auth.js
// form handler: identifier (email OR phone via lookup_email_by_phone),
// Show/Hide password, Remember me (visual parity — sessions always
// persist), forgot-password toast, and the unverified-email OTP path.

import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import AuthLayout, { AdminCorner, AuthHeading } from "./AuthLayout";
import { Button, Field, Input } from "../../ui/components";
import { toast } from "../../ui/toast";
import { useAuth } from "../../state/auth";
import seed from "../../data/seed-data";
import { COLORS, FONTS, SIZES } from "../../theme";

export default function LoginScreen() {
  const navigation = useNavigation();
  const { signIn, setGuest, resendSignupOtp } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!identifier.trim() || !password)
      return toast("Please enter your email/phone and password.", "error");
    setBusy(true);
    const { error, needsVerification, email } = await signIn({
      identifier: identifier.trim(),
      password,
      expectRole: "customer",
    });
    setBusy(false);
    if (needsVerification) {
      // A stale code may have expired since signup — send a fresh one in
      // the background (never blocks showing the verify screen).
      resendSignupOtp(email);
      navigation.navigate("VerifyOtp", {
        email,
        password, // captured so we can sign them in right after verification
        note: `Your account isn't verified yet. We've sent a 6-digit code to ${email} — enter it below to continue.`,
      });
      return;
    }
    if (error) return toast(error, "error");
    await setGuest(false);
    // profile is set → the root navigator switches to the main app.
  }

  return (
    <AuthLayout back>
      <AdminCorner />
      <AuthHeading>Customer Login</AuthHeading>

      <Field label="Email or Phone Number">
        <Input
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />
      </Field>
      <Field label="Password">
        <View style={styles.inputGroup}>
          <Input
            style={styles.inputFlex}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPw}
          />
          <Pressable style={styles.toggle} onPress={() => setShowPw(!showPw)}>
            <Text style={styles.toggleText}>{showPw ? "Hide" : "Show"}</Text>
          </Pressable>
        </View>
      </Field>

      <View style={styles.row}>
        <Pressable
          style={styles.rememberRow}
          onPress={() => setRemember(!remember)}
        >
          <View
            style={[styles.checkbox, remember && styles.checkboxOn]}
          >
            {remember ? <Text style={styles.checkMark}>✓</Text> : null}
          </View>
          <Text style={styles.remember}>Remember me</Text>
        </Pressable>
        <Pressable
          onPress={() =>
            toast(
              "Please contact the restaurant to reset your password: " +
                seed.restaurant.phone_primary,
              "info",
            )
          }
        >
          <Text style={styles.forgot}>Forgot password?</Text>
        </Pressable>
      </View>

      <Button
        title="Log In"
        loading={busy}
        loadingText="Logging in…"
        onPress={submit}
      />
      <Text style={styles.signupLine}>
        New customer?{" "}
        <Text
          style={styles.link}
          onPress={() => navigation.navigate("Signup")}
        >
          Create Account
        </Text>
      </Text>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  inputGroup: { flexDirection: "row", alignItems: "center", gap: 8 },
  inputFlex: { flex: 1 },
  toggle: { paddingHorizontal: 4, paddingVertical: 8 },
  toggleText: {
    fontSize: SIZES.small,
    fontFamily: FONTS.bodySemi,
    color: COLORS.inkSoft,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  rememberRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  checkMark: { color: COLORS.white, fontSize: 12, fontWeight: "700" },
  remember: {
    fontSize: 13,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
  },
  forgot: {
    fontSize: 13,
    fontFamily: FONTS.body,
    color: COLORS.red,
  },
  signupLine: {
    textAlign: "center",
    marginTop: 18,
    fontSize: SIZES.body,
    fontFamily: FONTS.body,
    color: COLORS.ink,
  },
  link: { color: COLORS.red, fontFamily: FONTS.bodyBold },
});
