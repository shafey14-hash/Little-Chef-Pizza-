// src/screens/customer/ProductDetailScreen.js
//
// Port of customer/product.html + js/menu.js initProductPage: large image,
// category badge, name/description, unavailable notice, size + option
// pills, live price, qty stepper (1–50), block Add button with the
// "Added ✓" flash.

import React, { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { QtyStepper } from "../../ui/components";
import { PickerPill } from "../../ui/cards";
import { toast } from "../../ui/toast";
import { COLORS, FONTS, RADIUS, SIZES, SPACING } from "../../theme";
import { addProduct } from "../../state/cart";
import { categoryById, getCatalog, loadCatalog } from "../../state/catalog";

export default function ProductDetailScreen({ navigation, route }) {
  const { id } = route.params;
  const [product, setProduct] = useState(null); // null = loading, "missing" = not found
  const [selectedSize, setSelectedSize] = useState(null);
  const [selectedOption, setSelectedOption] = useState(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let alive = true;
    loadCatalog().then(() => {
      if (!alive) return;
      const found = getCatalog().products.find((p) => p.id === id) || null;
      if (found) {
        setSelectedSize(found.sizes ? Object.keys(found.sizes)[0] : null);
        setSelectedOption(found.options ? found.options[0] : null);
      }
      setProduct(found || "missing");
    });
    return () => {
      alive = false;
    };
  }, [id]);

  if (product === null || product === "missing") {
    return (
      <SafeAreaView style={styles.safe} edges={["left", "right"]}>
        <View style={styles.pad}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <Text style={styles.backLink}>← Back to Menu</Text>
          </Pressable>
          {product === "missing" ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🍕</Text>
              <Text style={styles.emptyTitle}>Item not found</Text>
              <Text style={styles.emptyText}>
                This item may have been removed from the menu.
              </Text>
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  const hasSizes = !!product.sizes;
  const sizeKeys = hasSizes ? Object.keys(product.sizes) : null;
  const price = hasSizes ? product.sizes[selectedSize] : product.price;
  const categoryName = categoryById(product.category_id)?.name || "";

  function addToBucket() {
    addProduct(product, selectedSize, qty, selectedOption);
    toast(
      `${qty} × ${product.name}${selectedOption ? " (" + selectedOption + ")" : ""} added to your bucket.`,
      "success",
    );
    setAdded(true);
    setTimeout(() => setAdded(false), 900);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <ScrollView contentContainerStyle={styles.inner} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.backLink}>← Back to Menu</Text>
        </Pressable>

        <View style={styles.detailImg}>
          {product.image_url ? (
            <Image
              source={{ uri: product.image_url }}
              style={styles.detailImgFill}
            />
          ) : (
            <Text style={styles.detailImgPlaceholder}>{product.name}</Text>
          )}
        </View>

        <View style={styles.badge}>
          <Text style={styles.badgeText}>{categoryName}</Text>
        </View>
        <Text style={styles.name}>{product.name}</Text>
        <Text style={styles.desc}>{product.description || ""}</Text>

        {!product.available ? (
          <View style={styles.noticeBox}>
            <Text style={styles.noticeText}>
              This item is currently unavailable.
            </Text>
          </View>
        ) : null}

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

        <View style={styles.priceRow}>
          <Text style={styles.price}>{`Rs. ${Math.round(price).toLocaleString("en-PK")}`}</Text>
          <QtyStepper value={qty} onChange={setQty} min={1} max={50} />
        </View>

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
            {!product.available
              ? "Currently Unavailable"
              : added
                ? "Added ✓"
                : "Add to Bucket"}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.cream },
  inner: {
    padding: SPACING.gutter,
    paddingBottom: 32,
  },
  pad: { padding: SPACING.gutter },
  backLink: {
    color: COLORS.inkSoft,
    fontSize: SIZES.small,
    fontFamily: FONTS.bodySemi,
    marginBottom: 16,
  },
  detailImg: {
    borderRadius: 16,
    backgroundColor: "#f0ece3",
    aspectRatio: 4 / 3,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 14,
  },
  detailImgFill: { width: "100%", height: "100%" },
  detailImgPlaceholder: {
    color: "#c7bea9",
    fontSize: 14,
    textAlign: "center",
    padding: 24,
    fontFamily: FONTS.bodySemi,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#f0ece3",
    borderRadius: RADIUS.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.inkSoft,
  },
  name: {
    fontSize: 18,
    fontFamily: FONTS.display,
    color: COLORS.ink,
    marginTop: 10,
    marginBottom: 6,
  },
  desc: {
    fontSize: SIZES.body,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    lineHeight: 20,
  },
  noticeBox: {
    backgroundColor: COLORS.warnBg,
    borderColor: "#f0dcae",
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: 16,
    marginTop: 16,
  },
  noticeText: {
    fontSize: SIZES.body,
    color: "#8a5c0c",
    fontFamily: FONTS.body,
  },
  pickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 14,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 18,
    marginBottom: 18,
  },
  price: {
    fontSize: 24,
    fontFamily: FONTS.display,
    color: COLORS.red,
  },
  addBtn: {
    height: SIZES.btnH,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.red,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnDone: { backgroundColor: COLORS.gold },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: {
    color: COLORS.white,
    fontSize: SIZES.btn,
    fontFamily: FONTS.bodyBold,
  },
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
  },
});
