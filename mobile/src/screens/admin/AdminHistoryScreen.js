// src/screens/admin/AdminHistoryScreen.js
//
// Port of js/admin.js initHistory: permanently-retained list of delivered
// and rejected orders with search by order #, customer or phone.

import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  AdminShell,
  Badge,
  EmptyState,
  Loading,
  SearchBar,
  adminBadge,
  adminStatusLabel,
} from "../../screens/admin/adminUi";
import { listAllOrders } from "../../lib/db";
import { fmtDate, pkr } from "../../lib/format";
import { toast } from "../../ui/toast";
import { COLORS, FONTS, RADIUS, SPACING } from "../../theme";

function HistoryRow({ o }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.orderNum}>{o.order_number}</Text>
        <Badge colors={adminBadge(o.status)}>
          {adminStatusLabel(o.status, o.rejection_reason)}
        </Badge>
      </View>
      <Text style={styles.meta}>
        {fmtDate(o.delivered_at || o.rejected_at || o.created_at)} ·{" "}
        {o.customer_name} · {o.customer_phone}
      </Text>
      <View style={styles.rowMain}>
        <Text style={styles.type}>{o.order_type}</Text>
        <Text style={styles.total}>{pkr(o.total)}</Text>
      </View>
    </View>
  );
}

export default function AdminHistoryScreen({ navigation }) {
  const [orders, setOrders] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await listAllOrders();
      if (!alive) return;
      if (error) {
        toast("Unable to load order history: " + error, "error");
        setOrders([]);
        return;
      }
      setOrders(data.filter((o) => o.status === "delivered" || o.status === "rejected"));
    })();
    return () => {
      alive = false;
    };
  }, []);

  const q = searchTerm.trim().toLowerCase();
  const filtered = !orders
    ? null
    : !q
      ? orders
      : orders.filter(
          (o) =>
            o.order_number.toLowerCase().includes(q) ||
            o.customer_name.toLowerCase().includes(q) ||
            (o.customer_phone || "").includes(q),
        );

  return (
    <AdminShell navigation={navigation} active="AdminHistory">
      <Text style={styles.title}>Order History</Text>
      <Text style={styles.subtitle}>
        Delivered and rejected orders — permanently retained.
      </Text>
      <SearchBar
        value={searchTerm}
        onChangeText={setSearchTerm}
        placeholder="Search by order #, customer or phone…"
      />

      {!orders ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <EmptyState icon="🗂️" title="No finished orders yet" />
      ) : (
        filtered.map((o) => <HistoryRow key={o.id} o={o} />)
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 22,
    fontFamily: FONTS.display,
    color: COLORS.ink,
  },
  subtitle: {
    fontSize: 12.5,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    lineHeight: 18,
    marginTop: 2,
  },
  row: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  rowMain: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  orderNum: {
    fontSize: 14,
    fontFamily: FONTS.bodyBold,
    color: COLORS.ink,
  },
  meta: {
    fontSize: 12,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    marginTop: 4,
  },
  type: {
    fontSize: 12.5,
    fontFamily: FONTS.bodySemi,
    color: COLORS.ink,
    textTransform: "capitalize",
  },
  total: {
    fontSize: 13,
    fontFamily: FONTS.bodyBold,
    color: COLORS.red,
  },
});
