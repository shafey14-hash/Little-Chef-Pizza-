// src/ui/cards.js
//
// Native ports of the website's product-card / deal-card markup
// (js/menu.js productCard/dealCard) at the ≤620px phone spec:
// 12px card padding, 4/3 image, full-width Add button, 40px deal badge.

import React, { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { COLORS, FONTS, RADIUS, SIZES, SPACING, shadowCard } from "../theme";
import { addProduct, addDeal } from "../state/cart";
import { toast } from "./toast";

function Card({ onPress, style, children }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && onPress && styles.cardPressed,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function PickerPill({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pill, active && styles.pillActive]}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ProductCard({ product, categoryName, navigation, style }) {
  const hasSizes = !!product.sizes;
  const sizeKeys = hasSizes ? Object.keys(product.sizes) : null;
  const [selectedSize, setSelectedSize] = useState(
    hasSizes ? sizeKeys[0] : null,
  );
  const [selectedOption, setSelectedOption] = useState(
    product.options ? product.options[0] : null,
  );
  const [added, setAdded] = useState(false);

  const price = hasSizes ? product.sizes[selectedSize] : product.price;

  function addToBucket() {
    addProduct(product, selectedSize, 1, selectedOption);
    toast(
      `1 × ${product.name}${selectedOption ? " (" + selectedOption + ")" : ""} added to your bucket.`,
      "success",
    );
    setAdded(true);
    setTimeout(() => setAdded(false), 900);
  }

  return (
    <Card
      style={style}
      onPress={() => navigation.navigate("ProductDetail", { id: product.id })}
    >
      <View style={styles.productImg}>
        {product.image_url ? (
          <Image
            source={{ uri: product.image_url }}
            style={styles.productImgFill}
          />
        ) : (
          <Text style={styles.productImgPlaceholder} numberOfLines={3}>
            {product.name}
          </Text>
        )}
        {!product.available ? (
          <View style={styles.unavailableOverlay}>
            <Text style={styles.unavailableText}>Currently Unavailable</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.productName} numberOfLines={1}>
        {product.name}
      </Text>
      <Text style={styles.productDesc} numberOfLines={2}>
        {product.description || categoryName || ""}
      </Text>

      {hasSizes ? (
        <View style={styles.pickerRow}>
          {sizeKeys.map((sz) => (
            <PickerPill
              key={sz}
              label={`${sz} · Rs.${Math.round(product.sizes[sz]).toLocaleString("en-PK")}`}
              active={selectedSize === sz}
              onPress={() => setSelectedSize(sz)}
            />
          ))}
        </View>
      ) : null}

      {product.options ? (
        <View style={styles.pickerRow}>
          {product.options.map((opt) => (
            <PickerPill
              key={opt}
              label={opt}
              active={selectedOption === opt}
              onPress={() => setSelectedOption(opt)}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.productFooter}>
        <Text style={styles.price}>{`Rs. ${Math.round(price).toLocaleString("en-PK")}`}</Text>
        <Pressable
          onPress={addToBucket}
          disabled={!product.available}
          style={[
            styles.addBtn,
            added && styles.addBtnDone,
            !product.available && styles.addBtnDisabled,
          ]}
        >
          <Text style={styles.addBtnText}>
            {!product.available ? "Unavailable" : added ? "Added ✓" : "Add to Bucket"}
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}

export function DealCard({ deal }) {
  const [added, setAdded] = useState(false);
  const badgeText = deal.name.replace("Deal ", "#");

  function addToBucket() {
    addDeal(deal, 1);
    toast(`1 × ${deal.name} added to your bucket.`, "success");
    setAdded(true);
    setTimeout(() => setAdded(false), 900);
  }

  return (
    <Card style={styles.dealCard}>
      <View style={styles.dealTop}>
        {deal.image_url ? (
          <Image
            source={{ uri: deal.image_url }}
            style={styles.dealBadgeImg}
          />
        ) : (
          <View style={styles.dealBadge}>
            <Text style={styles.dealBadgeText}>{badgeText}</Text>
          </View>
        )}
        <View style={styles.dealMid}>
          <Text style={styles.dealName}>{deal.name}</Text>
          <Text style={styles.dealDesc} numberOfLines={2}>
            {deal.description}
          </Text>
          {!deal.verified ? (
            <View style={styles.warnBadge}>
              <Text style={styles.warnBadgeText}>
                Ask staff to confirm exact details
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.dealBottom}>
        <Text style={styles.dealPrice}>{`Rs. ${Math.round(deal.price).toLocaleString("en-PK")}`}</Text>
        <Pressable
          onPress={addToBucket}
          disabled={!deal.available}
          style={[
            styles.dealAddBtn,
            added && styles.addBtnDone,
            !deal.available && styles.addBtnDisabled,
          ]}
        >
          <Text style={[styles.addBtnText, styles.dealAddBtnText]}>
            {!deal.available ? "Unavailable" : added ? "Added ✓" : "Add Deal"}
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}

export function SectionHead({ title, actionLabel, onAction }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Skeleton({ height, style }) {
  return <View style={[styles.skeleton, { height }, style]} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: SPACING.md,
    ...shadowCard,
  },
  cardPressed: { backgroundColor: "#faf4ea" },

  // product card -----------------------------------------------------
  // In the home grid the card is sized by width 48.6% and stretches to
  // the row height via the parent's default alignItems: stretch.
  productImg: {
    aspectRatio: 4 / 3,
    borderRadius: RADIUS.md,
    backgroundColor: "#f0ece3",
    marginBottom: 8,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  productImgFill: { width: "100%", height: "100%" },
  productImgPlaceholder: {
    color: "#c7bea9",
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 10,
    fontFamily: FONTS.bodySemi,
  },
  unavailableOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(12,11,10,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
  },
  unavailableText: {
    color: COLORS.white,
    fontWeight: "700",
    fontSize: 13,
    textAlign: "center",
  },
  productName: {
    fontSize: 16,
    fontFamily: FONTS.display,
    color: COLORS.ink,
    marginBottom: 2,
  },
  productDesc: {
    fontSize: 12,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    marginBottom: 6,
    minHeight: 16,
  },
  pickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginBottom: 8,
  },
  pill: {
    borderWidth: 1.5,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  pillActive: {
    borderColor: COLORS.red,
    backgroundColor: "#fdeceb",
  },
  pillText: {
    fontSize: 11.5,
    fontFamily: FONTS.bodyBold,
    color: COLORS.ink,
  },
  pillTextActive: { color: COLORS.red },
  productFooter: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 6,
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: "auto",
  },
  price: {
    fontSize: 15,
    fontFamily: FONTS.display,
    color: COLORS.red,
  },
  addBtn: {
    flexBasis: "100%",
    height: 36,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.red,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  addBtnDone: { backgroundColor: COLORS.gold },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: {
    color: COLORS.white,
    fontSize: 13,
    fontFamily: FONTS.bodyBold,
  },

  // deal card ----------------------------------------------------------
  dealCard: {},
  dealTop: { flexDirection: "row", gap: SPACING.md, alignItems: "flex-start" },
  dealBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.black,
    alignItems: "center",
    justifyContent: "center",
  },
  dealBadgeText: {
    color: COLORS.gold,
    fontSize: 12,
    fontFamily: FONTS.displayXBold,
  },
  dealBadgeImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f0ece3",
  },
  dealMid: { flex: 1 },
  dealName: {
    fontSize: 16,
    fontFamily: FONTS.display,
    color: COLORS.ink,
    marginBottom: 2,
  },
  dealDesc: {
    fontSize: 12,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    marginBottom: 6,
  },
  warnBadge: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.warnBg,
    borderRadius: RADIUS.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  warnBadgeText: {
    color: COLORS.warn,
    fontSize: SIZES.tiny,
    fontWeight: "700",
  },
  dealBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  dealPrice: {
    fontSize: 16,
    fontFamily: FONTS.display,
    color: COLORS.red,
  },
  dealAddBtn: {
    height: 36,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.gold,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 13,
  },
  dealAddBtnText: { color: COLORS.black },

  // section head ---------------------------------------------------------
  sectionHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: SIZES.h2,
    fontFamily: FONTS.display,
    color: COLORS.ink,
  },
  sectionAction: {
    fontSize: 13,
    fontFamily: FONTS.bodyBold,
    color: COLORS.red,
  },

  // skeleton ---------------------------------------------------------
  skeleton: {
    backgroundColor: "#efe8db",
    borderRadius: RADIUS.md,
  },
});
