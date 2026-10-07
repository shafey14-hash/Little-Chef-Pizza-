// src/screens/admin/AdminDashboardScreen.js
//
// Port of admin/index.html + initDashboard (js/admin.js): 8 KPI cards
// (today's orders/revenue, queue counts, total customers), the recent
// orders feed and popular products — refreshed live via the orders
// realtime channel, exactly like the website.

import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { listAllOrders, subscribeToOrders } from "../../lib/db";
import { pkr, timeAgo } from "../../lib/format";
import { toast } from "../../ui/toast";
import {
  AdminShell,
  Badge,
  Loading,
  adminBadge,
  adminStatusLabel,
} from "./adminUi";
import { COLORS, FONTS, RADIUS, SIZES, SPACING } from "../../theme";

function isToday(iso) {
  const d = new Date(iso);
  const t = new Date();
  return d.toDateString() === t.toDateString();
}

export default function AdminDashboardScreen() {
  const navigation = useNavigation();
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    let alive = true;

    async function loadAndRender() {
      const { data, error } = await listAllOrders();
      if (!alive) return;
      if (error)
        toast("Some dashboard data couldn't be loaded. Please refresh.", "error");
      setOrders(data);
    }

    loadAndRender();
    const unsubscribe = subscribeToOrders(loadAndRender);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const list = orders || [];
  const todays = list.filter((o) => isToday(o.created_at));
  const revenueToday = todays.reduce((s, o) => s + o.total, 0);
  const count = (status) => list.filter((o) => o.status === status).length;

  const kpis = [
    ["Today's Orders", String(todays.length)],
    ["Today's Revenue", pkr(revenueToday)],
    ["Awaiting Payment Verification", String(count("payment_verification"))],
    ["Pending Orders", String(count("pending"))],
    ["Confirmed Orders", String(count("confirmed"))],
    ["Out for Delivery", String(count("out_for_delivery"))],
    ["Delivered Orders", String(count("delivered"))],
    [
      "Total Customers",
      String(new Set(list.filter((o) => o.user_id).map((o) => o.user_id)).size),
    ],
  ];

  const recent = list.slice(0, 6);

  const counts = {};
  list.forEach((o) =>
    o.items.forEach((i) => {
      counts[i.product_name_snapshot] =
        (counts[i.product_name_snapshot] || 0) + i.quantity;
    }),
  );
  const top = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <AdminShell navigation={navigation} active="AdminDashboard">
      <Text style={styles.h1}>Dashboard</Text>
      {orders === null ? (
        <Loading />
      ) : (
        <>
          {/* ------------------------------------------------ KPIs */}
          <View style={styles.kpiGrid}>
            {kpis.map(([label, value]) => (
              <View key={label} style={styles.kpiCard}>
                <Text style={styles.kpiLabel} numberOfLines={2}>
                  {label}
                </Text>
                <Text style={styles.kpiValue}>{value}</Text>
              </View>
            ))}
          </View>

          {/* --------------------------------------- recent orders */}
          <Text style={styles.h3}>Recent Orders</Text>
          {recent.length === 0 ? (
            <Text style={styles.muted}>No orders yet.</Text>
          ) : (
            <View style={styles.stack}>
              {recent.map((o) => {
                const itemCount = [...o.items, ...o.deals].reduce(
                  (s, l) => s + l.quantity,
                  0,
                );
                return (
                  <View
                    key={o.order_number}
                    style={styles.recentCard}
                  >
                    <View style={styles.recentTop}>
                      <Text style={styles.recentNum}>{o.order_number}</Text>
                      <Badge colors={adminBadge(o.status)}>
                        {adminStatusLabel(o.status, o.rejection_reason)}
                      </Badge>
                    </View>
                    <Text style={styles.recentMeta}>
                      {timeAgo(o.created_at)} · {o.customer_name} ·{" "}
                      {o.order_type} · {itemCount} item
                      {itemCount === 1 ? "" : "s"}
                    </Text>
                    <View style={styles.recentTotalRow}>
                      <Text> </Text>
                      <Text style={styles.recentTotal}>{pkr(o.total)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* ------------------------------------ popular products */}
          <Text style={styles.h3}>Popular Products</Text>
          {top.length === 0 ? (
            <Text style={styles.muted}>No sales data yet.</Text>
          ) : (
            <View style={styles.popularCard}>
              {top.map(([name, qty]) => (
                <View key={name} style={styles.popularRow}>
                  <Text style={styles.popularName} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={styles.popularQty}>{qty} sold</Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  h1: {
    fontSize: SIZES.h1,
    fontFamily: FONTS.display,
    color: COLORS.ink,
    marginBottom: SPACING.md,
  },
  h3: {
    fontSize: SIZES.h3,
    fontFamily: FONTS.display,
    color: COLORS.ink,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  muted: {
    color: COLORS.inkSoft,
    fontFamily: FONTS.body,
    fontSize: SIZES.body,
  },

  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  kpiCard: {
    width: "47.5%",
    flexGrow: 1,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: SPACING.md,
  },
  kpiLabel: {
    fontSize: SIZES.tiny,
    fontFamily: FONTS.bodySemi,
    color: COLORS.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  kpiValue: {
    fontSize: 20,
    fontFamily: FONTS.display,
    color: COLORS.ink,
  },

  stack: { gap: 10 },
  recentCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  recentTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 4,
  },
  recentNum: {
    fontFamily: FONTS.display,
    fontSize: 15,
    color: COLORS.ink,
  },
  recentMeta: {
    fontSize: 12.5,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    marginBottom: 6,
  },
  recentTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  recentTotal: {
    fontFamily: FONTS.bodyBold,
    fontSize: 14,
    color: COLORS.ink,
  },

  popularCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: SPACING.md,
    gap: 10,
  },
  popularRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  popularName: {
    flex: 1,
    fontSize: SIZES.body,
    fontFamily: FONTS.body,
    color: COLORS.ink,
  },
  popularQty: {
    fontSize: SIZES.body,
    fontFamily: FONTS.bodyBold,
    color: COLORS.ink,
  },
});
