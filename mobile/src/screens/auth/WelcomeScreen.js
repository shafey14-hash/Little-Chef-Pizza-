// src/screens/auth/WelcomeScreen.js
//
// "Welcome. How would you like to continue?" — mirrors index.html's
// welcome view exactly (brand block, two actions, signup line, and the
// app-only "Log in as Admin" corner pill).

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import AuthLayout, { AdminCorner } from "./AuthLayout";
import { Button } from "../../ui/components";
import { useAuth } from "../../state/auth";
import { COLORS, FONTS, SIZES, SPACING } from "../../theme";

export default function WelcomeScreen() {
  const navigation = useNavigation();
  const { setGuest } = useAuth();

  return (
    <AuthLayout title="Little Chef Pizza" tag="PIZZA & FAST FOOD">
      <AdminCorner />
      <Text style={styles.welcomeLine}>
        Welcome. How would you like to continue?
      </Text>
      <View style={styles.actions}>
        <Button
          title="Login as Customer"
          onPress={() => navigation.navigate("Login")}
        />
        <Button
          title="Continue as Guest"
          variant="ghost"
          onPress={() => setGuest(true)}
        />
      </View>
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
  welcomeLine: {
    textAlign: "center",
    fontSize: SIZES.body,
    fontFamily: FONTS.body,
    color: COLORS.ink,
    marginBottom: 22,
  },
  actions: { gap: SPACING.md },
  signupLine: {
    textAlign: "center",
    marginTop: 18,
    fontSize: SIZES.body,
    fontFamily: FONTS.body,
    color: COLORS.ink,
  },
  link: {
    color: COLORS.red,
    fontFamily: FONTS.bodyBold,
  },
});
