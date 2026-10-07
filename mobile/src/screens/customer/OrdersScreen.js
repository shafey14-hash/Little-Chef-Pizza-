// src/screens/customer/OrdersScreen.js
//
// Port of customer/orders.html: "My Orders" list for the signed-in
// customer — status badges, live updates via the orders realtime channel
// (no reload needed), and a flash highlight on cards whose status just
// changed. Guests see the same "create an account" block as the website.

import React, { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../../state/auth";
import { listForUser, subscribeToOrders } from "../../lib/db";
import { fmtDate, pkr } from "../../lib/format";
import { Button } from "../../ui/components";
import { toast } from "../../ui/toast";
import { COLORS, FONTS, RADIUS, SIZES, SPACING } from "../../theme";

const STATUS_LABEL = {
  payment_verification: "Payment Verification",
  pending: "Pending",
  confirmed: "Confirmed",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  rejected: "Rejected",
};
const REJECTION_LABEL = {
  cancelled: "Cancelled",
  failed_delivery: "Failed Delivery",
};
const STATUS_BADGE = {
  payment_verification: { bg: COLORS.warnBg, fg: COLORS.warn },
  pending: { bg: "#fbeec3", fg: "#8a6a10" },
  confirmed: { bg: COLORS.successBg, fg: COLORS.success },
  out_for_delivery: { bg: COLORS.warnBg, fg: COLORS.warn },
  delivered: { bg: COLORS.successBg, fg: COLORS.success },
  rejected: { bg: COLORS.dangerBg, fg: COLORS.danger },
};
// order-card--<status> border-left colors (css/customer.css)
const STATUS_EDGE = {
  payment_verification: COLORS.warn,
  pending: COLORS.gold,
  confirmed: COLORS.line,
  out_for_delivery: "#ef7a22",
  delivered: COLORS.success,
  rejected: COLORS.danger,
};

export default function OrdersScreen() {
  const navigation = useNavigation();
  const { profile, setGuest } = useAuth();
  const [orders, setOrders] = useState(null); // null = still loading
  const previousStatuses = useRef(null); // order_number -> "status|reason"
  const [justUpdated, setJustUpdated] = useState({}); // order_number -> true
  const flashTimers = useRef([]);

  useEffect(() => {
    if (!profile) return undefined;

    async function loadAndRender() {
      const { data, error } = await listForUser(profile.id);
      if (error) {
        toast("Unable to load your orders: " + error, "error");
        return;
      }
      const nextStatuses = {};
      const flashes = {};
      data.forEach((o) => {
        nextStatuses[o.order_number] =
          o.status + "|" + (o.rejection_reason || "");
        if (
          previousStatuses.current &&
          previousStatuses.current[o.order_number] &&
          previousStatuses.current[o.order_number] !== nextStatuses[o.order_number]
        ) {
          flashes[o.order_number] = true;
        }
      });
      previousStatuses.current = nextStatuses;
      setOrders(data);
      if (Object.keys(flashes).length) {
        setJustUpdated((prev) => ({ ...prev, ...flashes }));
        const t = setTimeout(
          () =>
            setJustUpdated((prev) => {
              const next = { ...prev };
              Object.keys(flashes).forEach((n) => delete next[n]);
              return next;
            }),
          2200,
        );
        flashTimers.current.push(t);
      }
    }

    loadAndRender();
    const unsubscribe = subscribeToOrders(loadAndRender, {
      userId: profile.id,
    });
    const timers = flashTimers.current;
    return () => {
      unsubscribe();
      timers.forEach(clearTimeout);
    };
  }, [profile]);

  if (!profile) {
    return (
      <SafeAreaView style={styles.safe} edges={["left", "right"]}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🔒</Text>
          <Text style={styles.emptyTitle}>
            Create an account to see your order history
          </Text>
          <Text style={styles.emptyText}>
            Guest orders are still received by the restaurant, but only
            registered customers can view past orders here.
          </Text>
          <Button
            title="Login / Create Account"
            variant="primary"
            style={{ marginTop: 14 }}
            onPress={async () => {
              await setGuest(false);
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (orders === null) {
    return (
      <SafeAreaView style={styles.safe} edges={["left", "right"]}>
        <View style={styles.center}>
          <Text style={styles.muted}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.inner}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.h1}>My Orders</Text>

        {orders.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🧾</Text>
            <Text style={styles.emptyTitle}>Make your first order!</Text>
            <Text style={styles.emptyText}>
              You haven't ordered anything yet. Browse the menu and treat
              yourself — it'll show up right here once placed.
            </Text>
            <Button
              title="Browse Menu"
              variant="primary"
              style={{ marginTop: 14 }}
              onPress={() => navigation.navigate("Menu")}
            />
          </View>
        ) : (
          <View style={styles.stack}>
            {orders.map((o) => {
              const rejectedWithReason =
                o.status === "rejected" && o.rejection_reason;
              const label = rejectedWithReason
                ? REJECTION_LABEL[o.rejection_reason] || "Rejected"
                : STATUS_LABEL[o.status] || o.status;
              const badge = STATUS_BADGE[o.status] || {
                bg: "#f0ece3",
                fg: COLORS.inkSoft,
              };
              const itemsText = [...o.items, ...o.deals]
                .map(
                  (l) =>
                    `${l.product_name_snapshot || l.deal_name_snapshot} × ${l.quantity}`,
                )
                .join(", ");
              const edge = STATUS_EDGE[o.status] || COLORS.line;
              const flashed = !!justUpdated[o.order_number];
              return (
                <View
                  key={o.order_number}
                  style={[
                    styles.orderCard,
                    { borderLeftColor: edge },
                    flashed && styles.orderCardFlash,
                  ]}
                >
                  <View style={styles.cardTop}>
                    <Text style={styles.orderNum}>{o.order_number}</Text>
                    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.badgeText, { color: badge.fg }]}>
                        {label}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.meta}>
                    {fmtDate(o.created_at)} · {o.order_type.toUpperCase()}
                  </Text>
                  <Text style={styles.items}>{itemsText}</Text>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total</Text>
                    <Text style={styles.totalValue}>{pkr(o.total)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.cream },
  inner: { padding: SPACING.gutter, paddingBottom: 32 },
  h1: {
    fontSize: SIZES.h1,
    fontFamily: FONTS.display,
    color: COLORS.ink,
    marginBottom: 16,
  },
  stack: { gap: 14 },
  orderCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderLeftWidth: 4,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  orderCardFlash: {
    backgroundColor: "#fdf6e0",
    borderColor: COLORS.gold,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 6,
  },
  orderNum: {
    fontFamily: FONTS.display,
    fontWeight: "700",
    fontSize: 16,
    color: COLORS.ink,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    alignSelf: "flex-start",
  },
  badgeText: { fontSize: 12, fontWeight: "700" },
  meta: {
    fontSize: 13,
    color: COLORS.inkSoft,
    fontFamily: FONTS.body,
    marginBottom: 10,
  },
  items: {
    fontSize: 13.5,
    color: COLORS.inkSoft,
    fontFamily: FONTS.body,
    lineHeight: 20,
    marginBottom: 10,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    paddingTop: 10,
  },
  totalLabel: {
    fontSize: 14,
    fontFamily: FONTS.bodyBold,
    color: COLORS.ink,
  },
  totalValue: {
    fontSize: 15,
    fontFamily: FONTS.bodyBold,
    color: COLORS.red,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  muted: { color: COLORS.inkSoft, fontFamily: FONTS.body, fontSize: SIZES.body },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyIcon: { fontSize: 42, marginBottom: 12 },
  emptyTitle: {
    fontSize: SIZES.h3,
    fontFamily: FONTS.display,
    color: COLORS.ink,
    textAlign: "center",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13.5,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 320,
  },
});
