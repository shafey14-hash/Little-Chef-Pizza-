// src/screens/customer/BucketScreen.js
//
// Port of customer/bucket.html + cart-ui.js lineRow: line rows (56px thumb,
// variant, unit price, price-updated flag, blocked badges), stepper whose
// minus becomes ✕ Remove at qty 1, Clear Bucket confirm, Order Summary
// card (Delivery = TBD at checkout) and the hasIssue checkout guard.

import React from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, QtyStepper } from "../../ui/components";
import { toast } from "../../ui/toast";
import { COLORS, FONTS, RADIUS, SIZES, SPACING, shadowCard } from "../../theme";
import {
  clear,
  removeDeal,
  removeProduct,
  setDealQty,
  setProductQty,
  useCart,
} from "../../state/cart";

function pkr(amount) {
  return "Rs. " + Math.round(amount).toLocaleString("en-PK");
}

function CartLine({ item, isDeal }) {
  const blocked = item.missing || item.unavailable;
  const label = item.base_name || item.name;

  function setQty(q) {
    if (isDeal) setDealQty(item.deal_id, q);
    else setProductQty(item.product_id, item.size, q, item.option);
  }
  function remove() {
    if (isDeal) removeDeal(item.deal_id);
    else removeProduct(item.product_id, item.size, item.option);
  }

  return (
    <View style={[styles.line, blocked && styles.lineBlocked]}>
      <View style={styles.thumb}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.thumbImg} />
        ) : (
          <Text style={styles.thumbLetter}>
            {(label || "?").trim().charAt(0).toUpperCase()}
          </Text>
        )}
      </View>

      <View style={styles.info}>
        <Text style={styles.lineName}>{label}</Text>
        {item.variant ? (
          <Text style={styles.lineVariant}>{item.variant}</Text>
        ) : null}
        {blocked ? (
          <Text style={styles.badgeDanger}>
            {item.missing ? "No longer on the menu" : "Currently unavailable"}
          </Text>
        ) : item.priceChanged ? (
          <Text style={styles.flag}>
            {`Price updated — now ${pkr(item.unit_price)} each`}
          </Text>
        ) : null}
        {!blocked ? (
          <Text style={styles.unit}>{`${pkr(item.unit_price)} each`}</Text>
        ) : null}
      </View>

      <View style={styles.right}>
        <Text style={styles.lineTotal}>{pkr(item.line_total)}</Text>
        {blocked ? (
          <Pressable onPress={remove} hitSlop={6}>
            <Text style={styles.removeLink}>Remove</Text>
          </Pressable>
        ) : (
          <QtyStepper
            value={item.qty}
            min={0}
            max={isDeal ? 20 : 50}
            onChange={(q) => (q <= 0 ? remove() : setQty(q))}
          />
        )}
      </View>
    </View>
  );
}

export default function BucketScreen({ navigation }) {
  const state = useCart();
  const empty = state.items.length === 0 && state.deals.length === 0;

  function confirmClear() {
    Alert.alert("Clear everything from your bucket?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: () => {
          clear();
          toast("Bucket cleared.", "info");
        },
      },
    ]);
  }

  function proceed() {
    if (state.hasIssue) {
      toast("Remove unavailable items from your bucket first.", "error");
      return;
    }
    navigation.navigate("Checkout");
  }

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <ScrollView contentContainerStyle={styles.inner} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Your Bucket</Text>

        {empty ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🧺</Text>
            <Text style={styles.emptyTitle}>Your bucket is empty</Text>
            <Text style={styles.emptyText}>
              Add something delicious from the menu to get started.
            </Text>
            <Button
              title="Browse Menu"
              onPress={() => navigation.navigate("Menu")}
              style={styles.emptyBtn}
            />
          </View>
        ) : (
          <>
            <View style={[styles.card, styles.linesCard]}>
              {state.items.map((i) => (
                <CartLine key={"p" + i.product_id + i.size + i.option} item={i} />
              ))}
              {state.deals.map((d) => (
                <CartLine key={"d" + d.deal_id} item={d} isDeal />
              ))}
              <Button
                title="Clear Bucket"
                variant="ghost"
                small
                onPress={confirmClear}
                style={styles.clearBtn}
              />
            </View>

            <View style={[styles.card, styles.summaryCard]}>
              <Text style={styles.summaryTitle}>Order Summary</Text>
              {state.hasIssue ? (
                <View style={styles.noticeBox}>
                  <Text style={styles.noticeText}>
                    Some items in your bucket are no longer available. Please
                    remove them before checking out.
                  </Text>
                </View>
              ) : null}
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal</Text>
                <Text style={styles.summaryValue}>{pkr(state.subtotal)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Delivery</Text>
                <Text style={styles.summaryValue}>TBD at checkout</Text>
              </View>
              <View style={styles.summaryRowTotal}>
                <Text style={styles.summaryTotalLabel}>Total</Text>
                <Text style={styles.summaryTotalValue}>{pkr(state.subtotal)}</Text>
              </View>
              <Button
                title="Proceed to Checkout"
                onPress={proceed}
                style={[
                  styles.checkoutBtn,
                  state.hasIssue && styles.checkoutBlocked,
                ]}
              />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.cream },
  inner: {
    padding: SPACING.gutter,
    paddingBottom: 120,
  },
  title: {
    fontSize: SIZES.h1,
    fontFamily: FONTS.display,
    color: COLORS.ink,
    marginBottom: 16,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: SPACING.md,
    marginBottom: 14,
    ...shadowCard,
  },

  // line rows ----------------------------------------------------------
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  lineBlocked: { opacity: 0.75 },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: "#f2ede2",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  thumbImg: { width: "100%", height: "100%" },
  thumbLetter: {
    fontFamily: FONTS.displayXBold,
    fontSize: 21,
    color: COLORS.goldDark,
  },
  info: { flex: 1, gap: 3 },
  lineName: {
    fontSize: 14.5,
    fontFamily: FONTS.bodyBold,
    color: COLORS.ink,
    lineHeight: 19,
  },
  lineVariant: {
    fontSize: 12,
    fontFamily: FONTS.bodySemi,
    color: COLORS.inkSoft,
  },
  unit: {
    fontSize: 12,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
  },
  flag: {
    fontSize: 11.5,
    fontFamily: FONTS.bodyBold,
    color: COLORS.warn,
  },
  badgeDanger: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.dangerBg,
    color: COLORS.danger,
    fontSize: SIZES.tiny,
    fontWeight: "700",
    borderRadius: RADIUS.pill,
    paddingVertical: 3,
    paddingHorizontal: 8,
    overflow: "hidden",
  },
  right: { alignItems: "flex-end", gap: 6 },
  lineTotal: {
    fontSize: 14.5,
    fontFamily: FONTS.bodyBold,
    color: COLORS.ink,
  },
  removeLink: {
    color: COLORS.inkSoft,
    fontSize: 11.5,
    fontFamily: FONTS.bodyBold,
    textDecorationLine: "underline",
    paddingVertical: 4,
  },
  clearBtn: {
    alignSelf: "flex-start",
    marginTop: 14,
  },

  // summary ---------------------------------------------------------------
  summaryTitle: {
    fontSize: SIZES.h3,
    fontFamily: FONTS.display,
    color: COLORS.ink,
    marginBottom: 10,
  },
  noticeBox: {
    backgroundColor: COLORS.warnBg,
    borderColor: "#f0dcae",
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: 12,
    marginBottom: 10,
  },
  noticeText: {
    fontSize: SIZES.small,
    color: "#8a5c0c",
    fontFamily: FONTS.body,
    lineHeight: 18,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  summaryLabel: {
    fontSize: 14.5,
    fontFamily: FONTS.body,
    color: COLORS.ink,
  },
  summaryValue: {
    fontSize: 14.5,
    fontFamily: FONTS.bodySemi,
    color: COLORS.ink,
  },
  summaryRowTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    paddingTop: 10,
    marginTop: 2,
  },
  summaryTotalLabel: {
    fontSize: 19,
    fontFamily: FONTS.bodyBold,
    color: COLORS.black,
  },
  summaryTotalValue: {
    fontSize: 19,
    fontFamily: FONTS.bodyBold,
    color: COLORS.black,
  },
  checkoutBtn: { marginTop: 14 },
  checkoutBlocked: { opacity: 0.5 },

  // empty -----------------------------------------------------------------
  empty: { alignItems: "center", paddingVertical: 60, paddingHorizontal: 20 },
  emptyIcon: { fontSize: 42, marginBottom: 10 },
  emptyTitle: {
    color: COLORS.inkSoft,
    fontSize: SIZES.h3,
    fontFamily: FONTS.display,
    marginBottom: 6,
  },
  emptyText: {
    color: COLORS.inkSoft,
    fontSize: SIZES.small,
    fontFamily: FONTS.body,
    textAlign: "center",
  },
  emptyBtn: { marginTop: 14, minWidth: 180 },
});
