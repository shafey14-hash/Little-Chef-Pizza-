// src/screens/admin/AdminOrdersScreen.js
//
// Port of admin/orders.html + initOrders (js/admin.js): global search
// (order #, customer, phone), six status sections with live counts, full
// order cards and the status-transition buttons (payment approve/reject,
// confirm/reject, out for delivery, delivered, cancel, failed delivery).
// Live via the orders realtime channel — no refresh needed.

import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import {
  approvePayment,
  cancelOrder,
  confirmOrder,
  listAllOrders,
  markDelivered,
  markFailedDelivery,
  markOutForDelivery,
  rejectOrder,
  rejectPayment,
  subscribeToOrders,
} from "../../lib/db";
import { fmtDate, friendlyError, pkr, timeAgo } from "../../lib/format";
import { Button } from "../../ui/components";
import { toast } from "../../ui/toast";
import {
  AdminShell,
  Badge,
  EmptyState,
  SearchBar,
  adminBadge,
  adminStatusLabel,
  confirmAsync,
  openScreenshot,
} from "./adminUi";
import { COLORS, FONTS, RADIUS, SIZES, SPACING } from "../../theme";

const SECTIONS = [
  ["payment_verification", "Payment Verification"],
  ["pending", "Pending Orders"],
  ["confirmed", "Confirmed Orders"],
  ["out_for_delivery", "Out for Delivery"],
  ["delivered", "Delivered"],
  ["rejected", "Rejected Orders"],
];

export default function AdminOrdersScreen() {
  const navigation = useNavigation();
  const [orders, setOrders] = useState(null);
  const [activeSection, setActiveSection] = useState("payment_verification");
  const [searchTerm, setSearchTerm] = useState("");

  async function loadOrders() {
    const { data, error } = await listAllOrders();
    if (error) toast("Unable to load orders: " + error, "error");
    setOrders(data);
  }

  useEffect(() => {
    let alive = true;
    const wrapped = async () => {
      if (!alive) return;
      await loadOrders();
    };
    wrapped();
    const unsubscribe = subscribeToOrders(wrapped);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  function matchesSearch(o, q) {
    return (
      o.order_number.toLowerCase().includes(q) ||
      o.customer_name.toLowerCase().includes(q) ||
      o.customer_phone.includes(q)
    );
  }

  function renderList() {
    const q = searchTerm.trim().toLowerCase();
    if (q) {
      const results = orders.filter((o) => matchesSearch(o, q));
      if (!results.length)
        return (
          <EmptyState
            icon="🔍"
            title={`No orders match "${searchTerm}"`}
            text="Searches order #, customer name, and phone — across every section."
          />
        );
      return (
        <View>
          <Text style={styles.searchNote}>
            {results.length} result{results.length === 1 ? "" : "s"} across
            all sections for "{searchTerm}"
          </Text>
          <View style={styles.stack}>
            {results.map((o) => (
              <OrderCard key={o.id} o={o} onChanged={loadOrders} />
            ))}
          </View>
        </View>
      );
    }

    const sectionLabel = SECTIONS.find(([k]) => k === activeSection)[1];
    const sectionOrders = orders.filter((o) => o.status === activeSection);
    if (!sectionOrders.length)
      return (
        <EmptyState
          icon="🧾"
          title="Nothing here"
          text={`No orders in ${adminStatusLabel(activeSection).toLowerCase()} right now.`}
        />
      );
    return (
      <View style={styles.stack}>
        {sectionOrders.map((o) => (
          <OrderCard key={o.id} o={o} onChanged={loadOrders} />
        ))}
      </View>
    );
  }

  return (
    <AdminShell navigation={navigation} active="AdminOrders">
      <Text style={styles.h1}>Orders</Text>
      <SearchBar
        value={searchTerm}
        onChangeText={setSearchTerm}
        placeholder="Search by order #, customer name, or phone…"
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        style={styles.chipScroll}
      >
        {SECTIONS.map(([key, label]) => {
          const n = (orders || []).filter((o) => o.status === key).length;
          const active = !searchTerm && key === activeSection;
          return (
            <Pressable
              key={key}
              onPress={() => {
                setActiveSection(key);
                setSearchTerm("");
              }}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {label}
                {n ? ` ${n}` : ""}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {orders === null ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : (
        renderList()
      )}
    </AdminShell>
  );
}

// ------------------------------------------------------------ order card

function OrderCard({ o, onChanged }) {
  const [busy, setBusy] = useState(null); // action name while its button spins

  function actionButton(title, action, { variant, loadingText, confirm } = {}) {
    async function press() {
      if (confirm) {
        const ok = await confirmAsync(confirm.title, confirm);
        if (!ok) return;
      }
      setBusy(action);
      const { data, error } = await RUNNERS[action](o.id);
      setBusy(null);
      if (error) return toast(friendlyError(error), "error");
      toast(confirm?.success || `${o.order_number} updated.`, "success");
      onChanged();
    }
    return (
      <Button
        title={title}
        variant={variant}
        small
        loading={busy === action}
        loadingText={loadingText}
        disabled={!!busy}
        onPress={press}
        style={styles.actionBtn}
      />
    );
  }

  function actions() {
    if (o.status === "payment_verification")
      return (
        <>
          {o.payment_screenshot_path ? (
            <ScreenshotButton />
          ) : null}
          {actionButton("Approve", "approve", {
            variant: "primary",
            loadingText: "Approving…",
            confirm: {
              title: "Approve this payment?",
              message: "The order will move to Confirmed Orders.",
              confirmText: "Approve",
              success: `${o.order_number} approved — moved to Confirmed Orders.`,
            },
          })}
          {actionButton("Reject", "rejectPayment", {
            variant: "danger",
            loadingText: "Rejecting…",
            confirm: {
              title: "Reject this payment?",
              message: "The order will move to Rejected Orders.",
              confirmText: "Reject",
              danger: true,
              success: `${o.order_number} rejected.`,
            },
          })}
        </>
      );
    if (o.status === "pending")
      return (
        <>
          {actionButton("Confirm Order", "confirm", {
            variant: "primary",
            loadingText: "Confirming…",
            confirm: {
              title: "Confirm this order?",
              message: "It will move to Confirmed Orders.",
              confirmText: "Confirm",
              success: `${o.order_number} confirmed — moved to Confirmed Orders.`,
            },
          })}
          {actionButton("Reject Order", "rejectOrder", {
            variant: "danger",
            loadingText: "Rejecting…",
            confirm: {
              title: "Reject this order?",
              message: "It will move to Rejected Orders.",
              confirmText: "Reject",
              danger: true,
              success: `${o.order_number} rejected.`,
            },
          })}
        </>
      );
    if (o.status === "confirmed")
      return (
        <>
          {actionButton("Out for Delivery", "outForDelivery", {
            variant: "primary",
            loadingText: "Updating…",
            success: `${o.order_number} is now out for delivery.`,
          })}
          {actionButton("Cancel Order", "cancel", {
            variant: "danger",
            loadingText: "Cancelling…",
            confirm: {
              title: "Cancel this order?",
              message: "It will move to Rejected Orders as Cancelled.",
              confirmText: "Cancel Order",
              danger: true,
              success: `${o.order_number} cancelled.`,
            },
          })}
        </>
      );
    if (o.status === "out_for_delivery")
      return (
        <>
          {actionButton("Marked as Delivered", "delivered", {
            variant: "primary",
            loadingText: "Updating…",
            confirm: {
              title: "Mark this order as delivered?",
              confirmText: "Mark Delivered",
              success: `${o.order_number} marked as delivered.`,
            },
          })}
          {actionButton("Mark Failed Delivery", "failed", {
            variant: "danger",
            loadingText: "Updating…",
            confirm: {
              title: "Mark this delivery as failed?",
              message: "It will move to Rejected Orders as Failed Delivery.",
              confirmText: "Mark Failed",
              danger: true,
              success: `${o.order_number} marked as failed delivery.`,
            },
          })}
        </>
      );
    if (o.status === "rejected" && o.payment_screenshot_path)
      return <ScreenshotButton />;
    return null;
  }

  function ScreenshotButton() {
    return (
      <Button
        title="View Screenshot"
        variant="ghost"
        small
        loading={busy === "screenshot"}
        loadingText="Loading…"
        disabled={!!busy}
        onPress={async () => {
          setBusy("screenshot");
          await openScreenshot(o.payment_screenshot_path);
          setBusy(null);
        }}
        style={styles.actionBtn}
      />
    );
  }

  const lineItems = [...o.items, ...o.deals];
  return (
    <View style={[styles.card, { borderLeftColor: EDGE[o.status] || COLORS.line }]}>
      <View style={styles.cardTop}>
        <Text style={styles.orderNum}>{o.order_number}</Text>
        <Badge colors={adminBadge(o.status)}>
          {adminStatusLabel(o.status, o.rejection_reason)}
        </Badge>
      </View>
      <Text style={styles.meta}>
        {timeAgo(o.created_at)} · {fmtDate(o.created_at)} ·{" "}
        {o.order_type.toUpperCase()}
        {o.delivery_address ? ` · ${o.delivery_address}` : ""}
      </Text>
      <View style={{ marginBottom: 10 }}>
        <View style={styles.customerRow}>
          <Text style={styles.customerName}>{o.customer_name}</Text>
          <Badge colors={{ bg: "#f0ece3", fg: COLORS.inkSoft }}>
            {o.customer_type}
          </Badge>
        </View>
        <Text style={styles.mutedSmall}>
          📞 {o.customer_phone}
          {o.alt_contact_phone ? ` · Alt: ${o.alt_contact_phone}` : ""}
          {o.customer_email ? ` · ${o.customer_email}` : ""}
        </Text>
        {o.special_instructions ? (
          <Text style={styles.mutedSmall}>📝 {o.special_instructions}</Text>
        ) : null}
      </View>
      <View style={styles.lineItems}>
        {lineItems.map((l, i) => (
          <View key={i} style={styles.lineItem}>
            <Text style={styles.lineItemName}>
              <Text style={styles.qty}>{l.quantity}×</Text>{" "}
              {l.product_name_snapshot || l.deal_name_snapshot}
            </Text>
            <Text style={styles.lineItemTotal}>{pkr(l.line_total)}</Text>
          </View>
        ))}
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Subtotal</Text>
        <Text style={styles.summaryValue}>{pkr(o.subtotal)}</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Delivery Charges</Text>
        <Text style={styles.summaryValue}>
          {o.delivery_charge ? pkr(o.delivery_charge) : "—"}
        </Text>
      </View>
      <View style={[styles.summaryRow, styles.summaryTotal]}>
        <Text style={styles.summaryTotalLabel}>Total</Text>
        <Text style={styles.summaryTotalValue}>{pkr(o.total)}</Text>
      </View>
      <View style={{ marginTop: 8 }}>
        <Badge colors={{ bg: "#f0ece3", fg: COLORS.inkSoft }}>
          {o.payment_method === "easypaisa" ? "EasyPaisa" : "Cash on Delivery"}
        </Badge>
      </View>
      {actions() ? (
        <View style={styles.actionsRow}>{actions()}</View>
      ) : null}
    </View>
  );
}

const RUNNERS = {
  approve: approvePayment,
  rejectPayment,
  confirm: confirmOrder,
  rejectOrder,
  outForDelivery: markOutForDelivery,
  delivered: markDelivered,
  cancel: cancelOrder,
  failed: markFailedDelivery,
};

// order-card--<status> border-left colours (css/customer.css)
const EDGE = {
  payment_verification: COLORS.warn,
  pending: COLORS.gold,
  confirmed: COLORS.line,
  out_for_delivery: "#ef7a22",
  delivered: COLORS.success,
  rejected: COLORS.danger,
};

const styles = StyleSheet.create({
  h1: {
    fontSize: SIZES.h1,
    fontFamily: FONTS.display,
    color: COLORS.ink,
    marginBottom: SPACING.sm,
  },
  muted: {
    color: COLORS.inkSoft,
    fontFamily: FONTS.body,
    fontSize: SIZES.body,
    paddingVertical: 24,
    textAlign: "center",
  },
  searchNote: {
    fontSize: 13,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    marginBottom: 14,
  },
  chipScroll: { marginBottom: SPACING.md },
  chipRow: { gap: 8, paddingRight: SPACING.gutter },
  chip: {
    borderWidth: 1.5,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.pill,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  chipActive: { backgroundColor: COLORS.black, borderColor: COLORS.black },
  chipText: {
    fontSize: SIZES.small,
    fontFamily: FONTS.bodySemi,
    color: COLORS.ink,
  },
  chipTextActive: { color: COLORS.gold },

  stack: { gap: 14 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderLeftWidth: 4,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 4,
  },
  orderNum: {
    fontFamily: FONTS.display,
    fontSize: 16,
    color: COLORS.ink,
  },
  meta: {
    fontSize: 12.5,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    marginBottom: 10,
  },
  customerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  customerName: {
    fontSize: 15,
    fontFamily: FONTS.display,
    color: COLORS.ink,
  },
  mutedSmall: {
    fontSize: 12.5,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    lineHeight: 18,
  },
  lineItems: { marginBottom: 8 },
  lineItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 3,
  },
  lineItemName: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: FONTS.body,
    color: COLORS.ink,
  },
  qty: { fontFamily: FONTS.bodyBold },
  lineItemTotal: {
    fontSize: 13.5,
    fontFamily: FONTS.bodySemi,
    color: COLORS.ink,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  summaryLabel: {
    fontSize: 13,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
  },
  summaryValue: {
    fontSize: 13,
    fontFamily: FONTS.bodySemi,
    color: COLORS.ink,
  },
  summaryTotal: {
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    marginTop: 4,
    paddingTop: 8,
  },
  summaryTotalLabel: {
    fontSize: 14,
    fontFamily: FONTS.bodyBold,
    color: COLORS.ink,
  },
  summaryTotalValue: {
    fontSize: 15,
    fontFamily: FONTS.bodyBold,
    color: COLORS.red,
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  actionBtn: { height: 36 },
});
