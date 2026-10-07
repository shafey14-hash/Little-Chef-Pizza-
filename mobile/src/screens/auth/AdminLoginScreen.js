// src/screens/auth/AdminLoginScreen.js
//
// "Admin Login — Restaurant staff only." — mirrors index.html's
// admin-login view (app-only corner button leads here) and js/auth.js's
// admin handler: a customer/guest session must never silently become an
// admin session, so any non-admin session is signed out first.

import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import AuthLayout, { AuthHeading, AuthMuted } from "./AuthLayout";
import { Button, Field, Input } from "../../ui/components";
import { toast } from "../../ui/toast";
import { useAuth } from "../../state/auth";
import { COLORS, FONTS, SIZES } from "../../theme";

export default function AdminLoginScreen() {
  const { profile, signInAdmin, signOut } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!username.trim() || !password)
      return toast("Please enter your username and password.", "error");
    if (profile && profile.role !== "admin") await signOut();
    setBusy(true);
    const { error } = await signInAdmin({
      username: username.trim(),
      password,
    });
    setBusy(false);
    if (error) return toast(error, "error");
    // profile.role === "admin" → root navigator switches to the admin stack.
  }

  return (
    <AuthLayout back>
      <AuthHeading>Admin Login</AuthHeading>
      <AuthMuted>Restaurant staff only.</AuthMuted>

      <Field label="Username">
        <Input
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
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

      <Button
        title="Log In"
        loading={busy}
        loadingText="Logging in…"
        onPress={submit}
      />
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
});
