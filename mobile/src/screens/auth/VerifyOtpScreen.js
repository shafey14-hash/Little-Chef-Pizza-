// src/screens/auth/VerifyOtpScreen.js
//
// "Verify Your Email" — mirrors index.html's verify-email view + js/auth.js
// handler. Verification does NOT create a session, so when we still hold
// the captured password we sign the customer in right after (with the same
// "Email verified! Welcome, <first name>." toast); otherwise they're sent
// to login, exactly like the website.

import React, { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import AuthLayout, { AuthHeading, AuthMuted } from "./AuthLayout";
import { Button, Field, Input } from "../../ui/components";
import { toast } from "../../ui/toast";
import { useAuth } from "../../state/auth";
import { COLORS, FONTS, SIZES } from "../../theme";

export default function VerifyOtpScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { email, password, note } = route.params || {};
  const { verifySignupOtp, signIn, resendSignupOtp, setGuest } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Verifying…");

  async function submit() {
    const token = code.trim();
    if (!token)
      return toast("Please enter the code from your email.", "error");
    setBusyLabel("Verifying…");
    setBusy(true);
    const { error } = await verifySignupOtp({ email, token });
    if (error) {
      setBusy(false);
      return toast(error, "error");
    }

    // Custom OTP verification confirms the email server-side but does not
    // create a session — sign in with the password captured at signup/login
    // time so the customer lands straight in their account.
    if (password) {
      setBusyLabel("Signing you in…");
      const { data: profile, error: signInError } = await signIn({
        identifier: email,
        password,
        expectRole: "customer",
      });
      setBusy(false);
      if (!signInError && profile) {
        await setGuest(false);
        toast(
          "Email verified! Welcome" +
            (profile.full_name ? ", " + profile.full_name.split(" ")[0] : "") +
            ".",
          "success",
        );
        return; // profile set → root navigator switches to the main app
      }
    }

    setBusy(false);
    toast("Email verified! Please log in to continue.", "success");
    navigation.reset({
      index: 1,
      routes: [{ name: "Welcome" }, { name: "Login" }],
    });
  }

  async function resend() {
    if (!email) return;
    const { error } = await resendSignupOtp(email);
    toast(
      error || "A new code has been sent to your email.",
      error ? "error" : "success",
    );
  }

  return (
    <AuthLayout>
      <AuthHeading>Verify Your Email</AuthHeading>
      <AuthMuted>
        {note ||
          "We've sent a 6-digit code to your email. Enter it below to finish creating your account."}
      </AuthMuted>

      <Field label="Verification Code">
        <Input
          value={code}
          onChangeText={(t) => setCode(t.replace(/[^0-9]/g, ""))}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="123456"
        />
      </Field>

      <Button
        title="Verify & Continue"
        loading={busy}
        loadingText={busyLabel}
        onPress={submit}
      />
      <Text style={styles.resendLine}>
        Didn't get it?{" "}
        <Text style={styles.link} onPress={resend}>
          Resend code
        </Text>
      </Text>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  resendLine: {
    textAlign: "center",
    marginTop: 18,
    fontSize: SIZES.body,
    fontFamily: FONTS.body,
    color: COLORS.ink,
  },
  link: { color: COLORS.red, fontFamily: FONTS.bodyBold },
});
