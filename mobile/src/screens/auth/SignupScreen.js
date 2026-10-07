// src/screens/auth/SignupScreen.js
//
// "Create Your Account" — mirrors index.html's customer-signup view +
// js/auth.js submit handler: same field order, same validation order and
// messages, address pre-filled from the location gate, and the same
// → verify-OTP handoff (password captured for auto sign-in after verify).

import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import AuthLayout, { AuthHeading } from "./AuthLayout";
import { Button, Field, Input } from "../../ui/components";
import { toast } from "../../ui/toast";
import { useAuth } from "../../state/auth";
import { getStoredLocation } from "../../state/location";
import {
  validateFullName,
  validatePassword,
  validatePhone,
} from "../../lib/format";
import { COLORS, FONTS, SIZES } from "../../theme";

export default function SignupScreen() {
  const navigation = useNavigation();
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [phone, setPhone] = useState("");
  const [altPhone, setAltPhone] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);

  // Signup's address field defaults to whatever location was selected in
  // the gate (still fully editable) — same as the website.
  useEffect(() => {
    (async () => {
      const loc = await getStoredLocation();
      if (loc?.address) setAddress((a) => a || loc.address);
    })();
  }, []);

  async function submit() {
    const errors = [
      validateFullName(fullName),
      validatePassword(password),
      validatePhone(phone),
    ].filter(Boolean);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errors.push("Please enter a valid email address.");
    if (altPhone.trim()) {
      const e2 = validatePhone(altPhone);
      if (e2)
        errors.push(
          "Alternative " + e2.charAt(0).toLowerCase() + e2.slice(1),
        );
    }
    if (errors.length) return toast(errors[0], "error");

    setBusy(true);
    const loc = await getStoredLocation();
    const { data, error } = await signUp({
      full_name: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      alt_phone: altPhone.trim() || null,
      password,
      address: address.trim() || null,
      area: loc ? loc.address : null,
    });
    setBusy(false);
    if (error) return toast(error, "error");

    navigation.navigate("VerifyOtp", {
      email: data.email,
      password, // captured now so we can auto-login after verification
      note: `We've sent a 6-digit code to ${data.email} — enter it below to finish creating your account.`,
    });
  }

  return (
    <AuthLayout back>
      <AuthHeading>Create Your Account</AuthHeading>

      <Field label="Full Name">
        <Input value={fullName} onChangeText={setFullName} />
      </Field>
      <Field label="Email">
        <Input
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
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
      <Field label="Contact Number">
        <Input
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
      </Field>
      <Field label="Alternative Number (optional)">
        <Input
          value={altPhone}
          onChangeText={setAltPhone}
          keyboardType="phone-pad"
        />
      </Field>
      <Field label="Address">
        <Input
          value={address}
          onChangeText={setAddress}
          placeholder="House / street / details"
          maxLength={400}
        />
        <Text style={styles.hint}>
          Pre-filled from the location you selected — edit if needed.
        </Text>
      </Field>

      <Button
        title="Create Account"
        loading={busy}
        loadingText="Creating account…"
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
  hint: {
    fontSize: SIZES.tiny,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    marginTop: 4,
  },
});
