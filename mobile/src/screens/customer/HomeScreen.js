// src/screens/customer/HomeScreen.js
//
// Port of customer/home.html at the ≤620px phone spec: hero (poster art on
// top — the site's mobile breakpoint puts .hero__art first), Popular Right
// Now grid (4 featured products), Little Chef Deals (2 featured deals) and
// the dark 3-feature strip. The app-download banner is intentionally not
// reproduced — the user is already inside the app.

import React, { useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../ui/components";
import { DealCard, ProductCard, SectionHead, Skeleton } from "../../ui/cards";
import { COLORS, FONTS, RADIUS, SIZES, SPACING } from "../../theme";
import { getCatalog, loadCatalog } from "../../state/catalog";

const HERO_POSTER =
  "https://little-chef-pizza.vercel.app/assets/images/hero/pizza-hero-poster.jpg";

const FEATURES = [
  { icon: "🚚", title: "Fast Delivery", text: "Up to 40 minutes across supported Gujrat city areas." },
  { icon: "🥡", title: "Easy Takeaway", text: "Ready in as little as 20 minutes." },
  { icon: "🍕", title: "Fresh Ingredients", text: "Made to order, every single time." },
];

export default function HomeScreen({ navigation }) {
  const [catalog, setCatalog] = useState(null);

  useEffect(() => {
    let alive = true;
    loadCatalog().then(() => {
      if (alive) setCatalog(getCatalog());
    });
    return () => {
      alive = false;
    };
  }, []);

  const featuredProducts = catalog
    ? catalog.products.filter((p) => p.featured && p.available).slice(0, 4)
    : null;
  const featuredDeals = catalog
    ? catalog.deals.filter((d) => d.featured && d.available).slice(0, 2)
    : null;

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <ScrollView contentContainerStyle={styles.inner} showsVerticalScrollIndicator={false}>
        {/* ------------------------------------------------- hero */}
        <View style={styles.hero}>
          <View style={styles.heroArt}>
            <Image source={{ uri: HERO_POSTER }} style={styles.heroArtImg} />
          </View>
          <Text style={styles.heroEyebrow}>
            Gujrat's Favourite Pizza &amp; Fast Food
          </Text>
          <Text style={styles.heroTitle}>
            {"Freshly Made.\nSeriously Delicious."}
          </Text>
          <Text style={styles.heroCopy}>
            Order your favourites from Little Chef Pizza — hot, fresh and on
            its way. Delivery across Gujrat city, or ready for takeaway and
            dine-in.
          </Text>
          <View style={styles.heroActions}>
            <Button
              title="Order Now"
              onPress={() => navigation.navigate("Menu")}
              style={styles.heroBtn}
            />
            <Button
              title="Explore Menu"
              variant="ghost"
              onPress={() => navigation.navigate("Menu")}
              style={[styles.heroBtn, styles.heroGhost]}
              textStyle={{ color: COLORS.white }}
            />
          </View>
        </View>

        {/* ------------------------------------ popular right now */}
        <View style={styles.section}>
          <SectionHead
            title="Popular Right Now"
            actionLabel="View full menu →"
            onAction={() => navigation.navigate("Menu")}
          />
          <View style={styles.grid}>
            {featuredProducts === null
              ? [0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} height={260} style={styles.gridItem} />
                ))
              : featuredProducts.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    navigation={navigation}
                    style={styles.gridItem}
                  />
                ))}
          </View>
        </View>

        {/* -------------------------------------- featured deals */}
        <View style={styles.section}>
          <SectionHead
            title="Little Chef Deals"
            actionLabel="See all deals →"
            onAction={() => navigation.navigate("Deals")}
          />
          <View style={styles.stack}>
            {featuredDeals === null
              ? [0, 1].map((i) => (
                  <Skeleton key={i} height={100} />
                ))
              : featuredDeals.map((d) => <DealCard key={d.id} deal={d} />)}
          </View>
        </View>

        {/* --------------------------------------- feature strip */}
        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f.title} style={styles.featureCol}>
              <Text style={styles.featureIcon}>{f.icon}</Text>
              <Text style={styles.featureTitle}>{f.title}</Text>
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.cream },
  inner: { paddingBottom: 32 },

  hero: {
    backgroundColor: COLORS.black,
    paddingHorizontal: SPACING.gutter,
    paddingTop: 26,
    paddingBottom: 30,
  },
  heroArt: {
    aspectRatio: 16 / 8,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: "#2a2724",
    backgroundColor: "#1b1815",
    overflow: "hidden",
    marginBottom: 24,
  },
  heroArtImg: { width: "100%", height: "100%" },
  heroEyebrow: {
    color: COLORS.gold,
    fontFamily: FONTS.bodyBold,
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 8,
  },
  heroTitle: {
    color: COLORS.white,
    fontSize: 18,
    fontFamily: FONTS.display,
    lineHeight: 25,
    marginBottom: 8,
  },
  heroCopy: {
    color: "#cfc7b8",
    fontSize: 13,
    fontFamily: FONTS.body,
    lineHeight: 19,
  },
  heroActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  heroBtn: { flex: 1, height: 42 },
  heroGhost: { borderColor: "#3a3630", backgroundColor: "transparent" },

  section: {
    paddingHorizontal: SPACING.gutter,
    paddingTop: 26,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  gridItem: { width: "48.6%", marginBottom: 10 },
  stack: { gap: 16 },

  features: {
    backgroundColor: COLORS.black,
    marginTop: 26,
    paddingVertical: 26,
    paddingHorizontal: SPACING.gutter,
    flexDirection: "row",
    gap: 12,
  },
  featureCol: { flex: 1, alignItems: "center" },
  featureIcon: { fontSize: 30, lineHeight: 34, marginBottom: 8 },
  featureTitle: {
    color: COLORS.gold,
    fontSize: 13,
    fontFamily: FONTS.display,
    marginBottom: 4,
    textAlign: "center",
  },
  featureText: {
    color: "#c9c1b3",
    fontSize: SIZES.small,
    fontFamily: FONTS.body,
    textAlign: "center",
    lineHeight: 17,
  },
});
