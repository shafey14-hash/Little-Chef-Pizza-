// src/ui/AppHeader.js
//
// Matches the website's topnav brand header (.topnav .brand + .topnav__right):
// 36px logo mark, "Little Chef Pizza" display bold, "Pizza & Fast Food" subtitle,
// user greeting ("Hi, Name" or "Guest"), and bucket count pill.

import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { COLORS, FONTS, RADIUS, SIZES, shadowCard } from "../theme";
import { useAuth } from "../state/auth";
import { useCart } from "../state/cart";

const LOGO_BADGE = require("../../assets/logo-badge.png");

export default function AppHeader({ title, subtitle, hideBrand = false }) {
  const navigation = useNavigation();
  const { profile } = useAuth();
  const { itemCount } = useCart();

  const firstName = profile?.full_name
    ? profile.full_name.trim().split(" ")[0]
    : null;

  return (
    <View style={styles.header}>
      {!hideBrand ? (
        <Pressable
          style={styles.brand}
          onPress={() => navigation.navigate("Home")}
          hitSlop={6}
        >
          <Image source={LOGO_BADGE} style={styles.logo} resizeMode="contain" />
          <View style={styles.brandText}>
            <Text style={styles.brandName}>Little Chef Pizza</Text>
            <Text style={styles.brandTag}>Pizza &amp; Fast Food</Text>
          </View>
        </Pressable>
      ) : (
        <View style={styles.titleCol}>
          {title ? <Text style={styles.headerTitle}>{title}</Text> : null}
          {subtitle ? <Text style={styles.headerSub}>{subtitle}</Text> : null}
        </View>
      )}

      <View style={styles.right}>
        {firstName ? (
          <View style={styles.whoPill}>
            <Text style={styles.whoText} numberOfLines={1}>
              Hi, {firstName}
            </Text>
          </View>
        ) : (
          <View style={[styles.whoPill, styles.whoGuest]}>
            <Text style={styles.whoGuestText}>Guest</Text>
          </View>
        )}

        <Pressable
          style={styles.bucketPill}
          onPress={() => navigation.navigate("Bucket")}
          hitSlop={6}
          accessibilityLabel="View bucket"
        >
          <Text style={styles.bucketIcon}>🧺</Text>
          <View style={styles.bucketBadge}>
            <Text style={styles.bucketBadgeText}>{itemCount}</Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 56,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logo: {
    width: 36,
    height: 36,
  },
  brandText: {
    justifyContent: "center",
  },
  brandName: {
    color: COLORS.ink,
    fontSize: 14,
    fontFamily: FONTS.display,
    letterSpacing: -0.3,
    lineHeight: 17,
  },
  brandTag: {
    color: COLORS.goldDark,
    fontSize: 9,
    fontFamily: FONTS.bodySemi,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  titleCol: {
    justifyContent: "center",
  },
  headerTitle: {
    color: COLORS.ink,
    fontSize: 16,
    fontFamily: FONTS.display,
  },
  headerSub: {
    color: COLORS.inkSoft,
    fontSize: 11,
    fontFamily: FONTS.body,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  whoPill: {
    backgroundColor: COLORS.cream,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
    maxWidth: 95,
  },
  whoText: {
    color: COLORS.ink,
    fontSize: 11,
    fontFamily: FONTS.bodySemi,
  },
  whoGuest: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  whoGuestText: {
    color: COLORS.inkSoft,
    fontSize: 11,
    fontFamily: FONTS.bodyMed,
  },
  bucketPill: {
    backgroundColor: COLORS.gold,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    gap: 5,
    ...shadowCard,
  },
  bucketIcon: {
    fontSize: 13,
  },
  bucketBadge: {
    backgroundColor: COLORS.white,
    borderRadius: 999,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  bucketBadgeText: {
    color: COLORS.black,
    fontSize: 10,
    fontFamily: FONTS.bodyBold,
    lineHeight: 12,
  },
});
