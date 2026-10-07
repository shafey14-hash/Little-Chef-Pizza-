// src/screens/customer/TrackScreen.js
//
// Port of customer/track.html: track any order by its order number via
// the track_order RPC — live status card with icon, "time ago" stamp,
// rejection reason and the item list. Can be pre-filled via route params
// (the web equivalent of track.html?id=LCP-123).

import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Input } from "../../ui/components";
import { trackOrder } from "../../lib/db";
import { timeAgo } from "../../lib/format";
import { COLORS, FONTS, RADIUS, SIZES, SPACING, shadowCard } from "../../theme";

const STATUS_MAP = {
  payment_verification: { label: "Payment Verification", icon: "⏳", cls: "pending" },
  pending: { label: "Pending", icon: "🕒", cls: "pending" },
  confirmed: { label: "Preparing", icon: "👨‍🍳", cls: "confirmed" },
  out_for_delivery: { label: "On the way", icon: "🛵", cls: "out_for_delivery" },
  delivered: { label: "Delivered", icon: "✅", cls: "delivered" },
  rejected: { label: "Cancelled", icon: "❌", cls: "rejected" },
};
// .status-card.<cls> .status-icon tint/colors (track.html <style>)
const CLS_COLORS = {
  pending: { bg: "rgba(245, 158, 11, 0.15)", fg: "#d97706" },
  confirmed: { bg: "rgba(59, 130, 246, 0.15)", fg: "#2563eb" },
  out_for_delivery: { bg: "rgba(139, 92, 246, 0.15)", fg: "#7c3aed" },
  delivered: { bg: "rgba(16, 185, 129, 0.15)", fg: "#059669" },
  rejected: { bg: "rgba(239, 68, 68, 0.15)", fg: "#dc2626" },
};

export default function TrackScreen({ route }) {
  const [value, setValue] = useState(route?.params?.orderNumber || "");
  const [tracking, setTracking] = useState(false);
  // result: { kind: "none" } | { kind: "error", message } | { kind: "notfound" } | { kind: "order", order }
  const [result, setResult] = useState({ kind: "none" });

  const doTrack = useCallback(async (raw) => {
    const val = String(raw ?? "").trim().toUpperCase();
    if (!val || tracking) return;
    setTracking(true);
    const { data, error } = await trackOrder(val);
    setTracking(false);
    if (error) setResult({ kind: "error", message: error });
    else if (!data) setResult({ kind: "notfound" });
    else setResult({ kind: "order", order: data });
  }, [tracking]);

  useEffect(() => {
    if (route?.params?.orderNumber) doTrack(route.params.orderNumber);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.h1}>Track Your Order</Text>
          <Text style={styles.heroSub}>
            Enter your order number to see live status.
          </Text>
          <View style={styles.searchBox}>
            <Input
              style={styles.searchInput}
              placeholder="e.g. LCP-12345"
              autoCapitalize="characters"
              autoCorrect={false}
              value={value}
              onChangeText={setValue}
              onSubmitEditing={() => doTrack(value)}
              returnKeyType="search"
            />
            <Button
              title="Track"
              onPress={() => doTrack(value)}
              loading={tracking}
              loadingText="…"
              style={styles.searchBtn}
            />
          </View>
        </View>

        {result.kind === "error" ? (
          <StatusCard>
            <Text style={styles.muted}>{result.message}</Text>
          </StatusCard>
        ) : result.kind === "notfound" ? (
          <StatusCard>
            <View style={[styles.iconCircle, { backgroundColor: "rgba(0,0,0,0.04)" }]}>
              <Text style={styles.iconText}>🤷</Text>
            </View>
            <Text style={[styles.statusTitle, { fontSize: 20 }]}>Order not found</Text>
            <Text style={[styles.muted, { marginTop: 8 }]}>
              Please check the order number and try again.
            </Text>
          </StatusCard>
        ) : result.kind === "order" ? (
          <OrderCard order={result.order} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatusCard({ children }) {
  return <View style={[styles.statusCard, styles.center]}>{children}</View>;
}

function OrderCard({ order: o }) {
  const info = STATUS_MAP[o.status] || { label: o.status, icon: "📌", cls: "pending" };
  const tint = CLS_COLORS[info.cls] || { bg: "rgba(0,0,0,0.04)", fg: COLORS.ink };
  return (
    <StatusCard>
      <View style={[styles.iconCircle, { backgroundColor: tint.bg }]}>
        <Text style={[styles.iconText, { color: tint.fg }]}>{info.icon}</Text>
      </View>
      <Text style={styles.statusTitle}>{info.label}</Text>
      <Text style={styles.statusTime}>Ordered {timeAgo(o.created_at)}</Text>

      {o.status === "rejected" && o.rejection_reason ? (
        <Text style={styles.reason}>Reason: {o.rejection_reason}</Text>
      ) : null}

      <View style={styles.itemsList}>
        <Text style={styles.itemsTitle}>Order Items</Text>
        {(o.items || []).map((i, idx) => (
          <View
            key={idx}
            style={styles.trackItem}
          >
            <View style={styles.itemQty}>
              <Text style={styles.itemQtyText}>{i.quantity}</Text>
            </View>
            <Text style={styles.itemName}>
              {i.name}
              {i.size ? <Text style={styles.itemSize}> ({i.size})</Text> : null}
            </Text>
          </View>
        ))}
      </View>
    </StatusCard>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.cream },
  inner: { paddingBottom: 40 },
  hero: {
    alignItems: "center",
    paddingTop: 44,
    paddingHorizontal: SPACING.lg,
    paddingBottom: 32,
    marginBottom: 24,
    backgroundColor: "rgba(226,34,42,0.06)",
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  h1: {
    fontSize: 32,
    fontFamily: FONTS.display,
    color: COLORS.red,
    marginBottom: 10,
    textAlign: "center",
  },
  heroSub: {
    fontSize: SIZES.body,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    marginBottom: 22,
  },
  searchBox: {
    flexDirection: "row",
    alignSelf: "stretch",
    maxWidth: 480,
    width: "100%",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.pill,
    overflow: "hidden",
    ...shadowCard,
  },
  searchInput: {
    flex: 1,
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
    height: 54,
  },
  searchBtn: {
    borderRadius: 0,
    height: 54,
    paddingHorizontal: 24,
  },
  statusCard: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    padding: 24,
    marginHorizontal: SPACING.gutter,
    ...shadowCard,
  },
  center: { alignItems: "center" },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  iconText: { fontSize: 32 },
  statusTitle: {
    fontSize: 24,
    fontFamily: FONTS.displayXBold,
    color: COLORS.ink,
    marginBottom: 4,
  },
  statusTime: {
    fontSize: 14,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    marginBottom: 18,
  },
  reason: {
    fontSize: 13.5,
    fontFamily: FONTS.body,
    color: COLORS.red,
    marginBottom: 14,
    textAlign: "center",
  },
  muted: {
    fontSize: SIZES.body,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    textAlign: "center",
  },
  itemsList: {
    alignSelf: "stretch",
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.08)",
    paddingTop: 18,
  },
  itemsTitle: {
    fontSize: 14,
    fontFamily: FONTS.bodySemi,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: COLORS.inkSoft,
    marginBottom: 10,
  },
  trackItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  itemQty: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: COLORS.cream,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  itemQtyText: {
    fontSize: 13,
    fontFamily: FONTS.bodyBold,
    color: COLORS.ink,
  },
  itemName: {
    flex: 1,
    fontSize: SIZES.body,
    fontFamily: FONTS.bodyMed,
    color: COLORS.ink,
  },
  itemSize: {
    fontSize: 12,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
  },
});
