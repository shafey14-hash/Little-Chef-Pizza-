// src/screens/customer/HomeScreen.js
//
// Port of the new customer/home.html "Little chef. Big flavour." landing
// at the phone spec: dark hero (LC badge brand row, gold headline, floating
// pizza SVG with tags + caption), Popular Right Now grid, Little Chef
// Deals, the Visit Little Chef Pizza directions/contact card (seed
// restaurant — same source as the site footer) and the dark 3-feature
// strip. The app-download banner is intentionally not reproduced — the
// user is already inside the app.

import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from "react-native-svg";
import { Button } from "../../ui/components";
import { DealCard, ProductCard, SectionHead, Skeleton } from "../../ui/cards";
import { COLORS, FONTS, RADIUS, SIZES, SPACING, shadowCard } from "../../theme";
import { getCatalog, loadCatalog } from "../../state/catalog";
import { toast } from "../../ui/toast";
import seed from "../../data/seed-data";

// Hero palette — mirrors the scoped --hh-* tokens of .home-hero on the site.
const HH = {
  bg: "#0b0b0c",
  text: "#f7f4ed",
  muted: "#a5a39e",
  accent: "#ffba59",
  card: "#191817",
  border: "#ffffff16",
};

const LOGO_BADGE = require("../../../assets/logo-badge.png");

const FEATURES = [
  { icon: "🚚", title: "Fast Delivery", text: "Up to 40 minutes across supported Gujrat city areas." },
  { icon: "🥡", title: "Easy Takeaway", text: "Ready in as little as 20 minutes." },
  { icon: "🍕", title: "Fresh Ingredients", text: "Made to order, every single time." },
];

/* ----------------------------------------------------------- pizza art */
/* Native port of the site's inline pizza SVG. The crust/cheese/pepperoni/
   basil gradients are kept; the SVG <pattern> bake texture is replaced by
   explicit spot ellipses (patterns render unreliably across Android SVG
   implementations). Ids are hh-prefixed to stay unique. */

function Pepperoni({ x, y, rotate = 0 }) {
  return (
    <G transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <Circle r={29} fill="#893719" opacity={0.22} transform="translate(2 4)" />
      <Circle r={27} fill="url(#hhPep)" stroke="#8f2d1b" strokeWidth={1.5} />
      <Path
        d="M-16-12Q-6-24 10-17"
        fill="none"
        stroke="#ffab6c"
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.45}
      />
      <G fill="#f5ac75" opacity={0.65}>
        <Ellipse cx={-10} cy={-8} rx={3} ry={2} />
        <Circle cx={8} cy={-12} r={2.5} />
        <Ellipse cx={13} cy={7} rx={3.5} ry={2} />
        <Circle cx={-9} cy={13} r={2} />
        <Ellipse cx={-2} cy={2} rx={2} ry={3} />
      </G>
      <G fill="#76271a" opacity={0.5}>
        <Circle cx={-17} cy={3} r={2} />
        <Circle cx={3} cy={16} r={2.5} />
        <Circle cx={17} cy={-5} r={1.7} />
      </G>
    </G>
  );
}

function BasilLeaf({ x, y, rotate = 0, scale = 1 }) {
  return (
    <G transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      <Path
        d="M0 24C-31 6-24-18 0-29 23-12 27 11 0 24Z"
        fill="#172d17"
        opacity={0.2}
        transform="translate(3 4)"
      />
      <Path d="M0 24C-31 6-24-18 0-29 23-12 27 11 0 24Z" fill="url(#hhBasil)" />
      <Path
        d="M0 22V-23M0 5l-12-10M0-4l10-9"
        stroke="#adc374"
        strokeWidth={1.1}
        fill="none"
        opacity={0.55}
      />
    </G>
  );
}

function PizzaSvg() {
  return (
    <Svg viewBox="0 0 500 500" width="100%" height="100%">
      <Defs>
        <RadialGradient id="hhCrust" cx="40%" cy="35%" r="70%">
          <Stop offset="0" stopColor="#ffda83" />
          <Stop offset="0.74" stopColor="#eeb75e" />
          <Stop offset="0.9" stopColor="#b76527" />
          <Stop offset="1" stopColor="#693213" />
        </RadialGradient>
        <RadialGradient id="hhCheese" cx="35%" cy="30%" r="80%">
          <Stop offset="0" stopColor="#ffe6a0" />
          <Stop offset="0.6" stopColor="#f4c569" />
          <Stop offset="1" stopColor="#dc8a37" />
        </RadialGradient>
        <RadialGradient id="hhPep">
          <Stop offset="0" stopColor="#e46b37" />
          <Stop offset="0.8" stopColor="#b93622" />
          <Stop offset="1" stopColor="#7b2418" />
        </RadialGradient>
        <LinearGradient id="hhBasil" x1="0" y1="0" x2="100%" y2="100%">
          <Stop offset="0" stopColor="#85a64a" />
          <Stop offset="0.5" stopColor="#467631" />
          <Stop offset="1" stopColor="#234821" />
        </LinearGradient>
      </Defs>

      <Circle cx={250} cy={255} r={220} fill="#090909" />
      <Circle cx={250} cy={250} r={218} fill="#b56b31" />
      <Circle cx={250} cy={247} r={215} fill="url(#hhCrust)" />
      <Circle cx={250} cy={247} r={205} fill="none" stroke="#ffdc89" strokeWidth={5} opacity={0.3} />
      <Circle cx={250} cy={247} r={191} fill="#a13e20" />
      <Circle cx={250} cy={247} r={185} fill="url(#hhCheese)" />

      {/* baked cheese spots (pattern replacement) */}
      <G fill="#ac531f" opacity={0.22}>
        <Ellipse cx={150} cy={160} rx={8} ry={4} transform="rotate(-20 150 160)" />
        <Ellipse cx={330} cy={140} rx={7} ry={4} transform="rotate(18 330 140)" />
        <Ellipse cx={360} cy={300} rx={8} ry={4} transform="rotate(-30 360 300)" />
        <Ellipse cx={180} cy={340} rx={7} ry={4} />
        <Ellipse cx={250} cy={230} rx={6} ry={3} />
      </G>
      <G fill="#fff0be" opacity={0.6}>
        <Circle cx={200} cy={130} r={4} />
        <Circle cx={310} cy={240} r={4} />
        <Circle cx={150} cy={260} r={3.5} />
        <Circle cx={280} cy={350} r={4} />
        <Circle cx={220} cy={290} r={3} />
      </G>

      {/* bubbled mozzarella */}
      <G fill="#fff0b0" opacity={0.6}>
        <Path d="M121 186q24-21 43 2t-8 38q-34 8-35-40" />
        <Path d="M278 99q30-9 40 13t-21 31q-30-1-19-44" />
        <Path d="M318 299q26-24 43-3t-4 40q-41 8-39-37" />
        <Ellipse cx={206} cy={330} rx={24} ry={17} />
        <Ellipse cx={238} cy={186} rx={22} ry={14} />
        <Ellipse cx={130} cy={276} rx={18} ry={24} />
      </G>

      {/* crust char */}
      <G fill="#87431c" opacity={0.4}>
        <Ellipse cx={158} cy={62} rx={13} ry={4} transform="rotate(-27 158 62)" />
        <Ellipse cx={367} cy={81} rx={11} ry={4} transform="rotate(34 367 81)" />
        <Ellipse cx={449} cy={229} rx={4} ry={13} />
        <Ellipse cx={84} cy={360} rx={5} ry={13} transform="rotate(-35 84 360)" />
        <Ellipse cx={253} cy={448} rx={15} ry={4} />
        <Ellipse cx={395} cy={388} rx={12} ry={4} transform="rotate(-43 395 388)" />
        <Ellipse cx={48} cy={221} rx={3} ry={11} />
      </G>

      <Pepperoni x={192} y={119} rotate={-15} />
      <Pepperoni x={297} y={151} rotate={25} />
      <Pepperoni x={370} y={216} rotate={-30} />
      <Pepperoni x={234} y={268} rotate={10} />
      <Pepperoni x={160} y={290} rotate={-8} />

      <BasilLeaf x={246} y={196} rotate={20} scale={0.95} />
      <BasilLeaf x={322} y={282} rotate={-42} scale={0.9} />
      <BasilLeaf x={176} y={214} rotate={68} scale={0.85} />
    </Svg>
  );
}

/* Slow 6s float, mirroring the site's hhPizzaFloat. Skipped entirely when
   the user prefers reduced motion. */
function usePizzaFloat() {
  const progress = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduceMotion(!!v);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: 3000, useNativeDriver: true }),
        Animated.timing(progress, { toValue: 0, duration: 3000, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, progress]);

  return {
    translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -11] }),
    rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "1.5deg"] }),
  };
}

/* ------------------------------------------------------------- screen */

export default function HomeScreen({ navigation }) {
  const [catalog, setCatalog] = useState(null);
  const float = usePizzaFloat();

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

  const restaurant = seed.restaurant;
  const mapsUrl =
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(restaurant.address);
  const tel1 = restaurant.phone_primary.replace(/[^\d+]/g, "");
  const tel2 = restaurant.phone_secondary.replace(/[^\d+]/g, "");
  const whatsapp = restaurant.phone_whatsapp.replace(/\D/g, "").replace(/^0/, "92");

  function openUrl(url) {
    Linking.openURL(url).catch(() => toast("Could not open that link.", "error"));
  }

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <ScrollView contentContainerStyle={styles.inner} showsVerticalScrollIndicator={false}>
        {/* ------------------------------------------------- hero */}
        <View style={styles.hero}>
          {/* Brand row — the site's LC-badge topnav, app edition. */}
          <View style={styles.brandRow}>
            <View style={styles.brand}>
              <Image source={LOGO_BADGE} style={styles.brandMark} resizeMode="contain" />
              <View>
                <Text style={styles.brandName}>little chef.</Text>
                <Text style={styles.brandSub}>Pizza &amp; good vibes</Text>
              </View>
            </View>
            <Pressable
              style={styles.orderPill}
              onPress={() => navigation.navigate("Menu")}
              hitSlop={8}
            >
              <Text style={styles.orderPillText}>Order Now ↗</Text>
            </Pressable>
          </View>

          <View style={styles.copy}>
            <View style={styles.eyebrowRow}>
              <View style={styles.eyebrowLine} />
              <Text style={styles.eyebrow}>A little slice of happiness</Text>
            </View>
            <Text style={styles.title}>
              {"Little chef.\n"}
              <Text style={styles.titleAccent}>Big flavour.</Text>
            </Text>
            <Text style={styles.desc}>
              Golden crust. Melty cheese. That one-more-slice feeling. Meet
              your next pizza obsession.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
              onPress={() => navigation.navigate("Menu")}
            >
              <Text style={styles.ctaText}>Explore the menu</Text>
              <Text style={styles.ctaArrow}>↗</Text>
            </Pressable>
            <Text style={styles.note}>♡ A little love in every slice.</Text>
          </View>

          {/* pizza scene with floating tags */}
          <View style={styles.scene}>
            <View style={styles.glow} />
            <View style={styles.orbit} />
            <View style={styles.orbitInner} />
            <Animated.View
              style={[
                styles.parallax,
                { transform: [{ translateY: float.translateY }, { rotate: float.rotate }] },
              ]}
            >
              <View style={styles.art}>
                <PizzaSvg />
              </View>
            </Animated.View>

            <View style={[styles.tag, styles.tagTop]}>
              <Text style={styles.tagIcon}>✦</Text>
              <View>
                <Text style={styles.tagStrong}>Big on flavour</Text>
                <Text style={styles.tagSmall}>Little chef energy.</Text>
              </View>
            </View>
            <View style={[styles.tag, styles.tagBottom]}>
              <Text style={styles.tagIcon}>♡</Text>
              <View>
                <Text style={styles.tagStrong}>Your happy slice</Text>
                <Text style={styles.tagSmall}>Go on. Take another.</Text>
              </View>
            </View>

            <Text style={styles.caption}>love at first bite.</Text>
          </View>

          <View style={styles.heroFooter}>
            <Text style={styles.heroFooterText}>Good food. Better mood.</Text>
            <Text style={[styles.heroFooterText, styles.heroFooterAccent]}>
              The little chef way ↗
            </Text>
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

        {/* --------------------------- shop directions + contact */}
        <View style={styles.section}>
          <SectionHead title="Visit Little Chef Pizza" />
          <View style={styles.shopCard}>
            <View style={styles.shopMain}>
              <Text style={styles.shopTitle}>📍 Directions &amp; details</Text>
              <Text style={styles.shopAddr}>{restaurant.address}</Text>
              <Text style={styles.shopNote}>{restaurant.delivery_note}</Text>
              <Button
                variant="gold"
                title="Get Directions"
                onPress={() => openUrl(mapsUrl)}
                style={styles.shopBtn}
              />
            </View>
            <View style={styles.shopContact}>
              <Pressable style={styles.shopRow} onPress={() => openUrl(`tel:${tel1}`)}>
                <Text style={styles.shopLabel}>Tel</Text>
                <Text style={styles.shopValue}>{restaurant.phone_primary}</Text>
              </Pressable>
              <Pressable style={styles.shopRow} onPress={() => openUrl(`tel:${tel2}`)}>
                <Text style={styles.shopLabel}>Phone</Text>
                <Text style={styles.shopValue}>{restaurant.phone_secondary}</Text>
              </Pressable>
              <Pressable
                style={styles.shopRow}
                onPress={() => openUrl(`https://wa.me/${whatsapp}`)}
              >
                <Text style={styles.shopLabel}>WhatsApp</Text>
                <Text style={styles.shopValue}>{restaurant.phone_whatsapp}</Text>
              </Pressable>
              <Text style={styles.shopHint}>Walk-ins welcome · Dine-in available</Text>
            </View>
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

  /* ------------------------------------------------------- hero */
  hero: {
    backgroundColor: HH.bg,
    paddingHorizontal: SPACING.gutter,
    paddingTop: 20,
    paddingBottom: 0,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 26,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandMark: { width: 36, height: 36 },
  brandName: {
    color: HH.text,
    fontSize: 15,
    fontFamily: FONTS.displayXBold,
    letterSpacing: -0.5,
  },
  brandSub: {
    color: HH.accent,
    fontSize: 8,
    fontFamily: FONTS.bodyBold,
    letterSpacing: 3,
    textTransform: "uppercase",
    marginTop: 2,
  },
  orderPill: {
    borderWidth: 1,
    borderColor: "#ffba5970",
    backgroundColor: "#ffba590c",
    borderRadius: RADIUS.pill,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  orderPillText: {
    color: HH.text,
    fontSize: 11,
    fontFamily: FONTS.bodyBold,
  },

  copy: { alignItems: "center" },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  eyebrowLine: { width: 17, height: 1, backgroundColor: HH.accent },
  eyebrow: {
    color: HH.accent,
    fontSize: 8,
    fontFamily: FONTS.bodyBold,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  title: {
    color: HH.text,
    fontSize: 44,
    fontFamily: FONTS.displayXBold,
    lineHeight: 46,
    letterSpacing: -2.8,
    textAlign: "center",
    marginTop: 15,
    marginBottom: 13,
  },
  titleAccent: {
    color: HH.accent,
    fontFamily: FONTS.display,
    fontStyle: "italic",
    letterSpacing: -2.8,
  },
  desc: {
    color: HH.muted,
    fontSize: 12,
    fontFamily: FONTS.body,
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 285,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
    backgroundColor: HH.accent,
    borderRadius: RADIUS.pill,
    paddingVertical: 13,
    paddingHorizontal: 21,
    marginTop: 20,
  },
  ctaPressed: { opacity: 0.9 },
  ctaText: { color: "#1b140b", fontSize: 12, fontFamily: FONTS.bodyBold },
  ctaArrow: { color: "#1b140b", fontSize: 16 },
  note: {
    color: "#8e8b85",
    fontSize: 10,
    fontFamily: FONTS.body,
    marginTop: 15,
    marginBottom: 8,
  },

  scene: {
    width: 265,
    maxWidth: "83%",
    aspectRatio: 1,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 10,
  },
  glow: {
    position: "absolute",
    width: "76%",
    height: "76%",
    borderRadius: 999,
    backgroundColor: "#e8a13b",
    opacity: 0.07,
  },
  orbit: {
    position: "absolute",
    top: "2%",
    left: "2%",
    right: "2%",
    bottom: "2%",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#ffffff0b",
    transform: [{ rotate: "-22deg" }],
  },
  orbitInner: {
    position: "absolute",
    top: "9%",
    left: "9%",
    right: "9%",
    bottom: "9%",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#ffffff0b",
    borderStyle: "dashed",
    opacity: 0.45,
    transform: [{ rotate: "12deg" }],
  },
  parallax: { width: "89%" },
  art: {
    width: "100%",
    aspectRatio: 1,
    transform: [{ rotate: "-12deg" }],
    shadowColor: "#000000",
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },

  tag: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#191817e8",
    borderWidth: 1,
    borderColor: HH.border,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    shadowColor: "#000000",
    shadowOpacity: 0.3,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  tagTop: { top: "12%", right: "-7%", transform: [{ rotate: "7deg" }] },
  tagBottom: { bottom: "14%", left: "-7%", transform: [{ rotate: "-6deg" }] },
  tagIcon: { color: HH.accent, fontSize: 16 },
  tagStrong: { color: HH.text, fontSize: 9, fontFamily: FONTS.bodySemi },
  tagSmall: { color: HH.muted, fontSize: 8, fontFamily: FONTS.body, marginTop: 2 },
  caption: {
    position: "absolute",
    bottom: "1%",
    right: "16%",
    color: "#82786b",
    fontSize: 11,
    fontFamily: FONTS.body,
    fontStyle: "italic",
  },

  heroFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#ffffff0d",
    paddingVertical: 14,
    marginTop: 4,
  },
  heroFooterText: {
    color: "#777570",
    fontSize: 8,
    fontFamily: FONTS.bodyBold,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  heroFooterAccent: { color: "#bcaa8f" },

  /* --------------------------------------------------- sections */
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

  /* ------------------------------------------------- shop card */
  shopCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 20,
    gap: 20,
    ...shadowCard,
  },
  shopMain: { gap: 10 },
  shopTitle: {
    fontSize: SIZES.h3,
    fontFamily: FONTS.display,
    color: COLORS.ink,
  },
  shopAddr: {
    fontSize: 13,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    lineHeight: 20,
  },
  shopNote: {
    fontSize: 12.5,
    fontFamily: FONTS.bodySemi,
    color: COLORS.goldDark,
  },
  shopBtn: { marginTop: 4, alignSelf: "flex-start" },
  shopContact: {
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    paddingTop: 16,
    gap: 12,
  },
  shopRow: { flexDirection: "row", alignItems: "baseline", gap: 10 },
  shopLabel: {
    minWidth: 62,
    fontSize: 10,
    fontFamily: FONTS.bodyBold,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: COLORS.gold,
  },
  shopValue: {
    fontSize: 14,
    fontFamily: FONTS.bodySemi,
    color: COLORS.ink,
  },
  shopHint: {
    fontSize: SIZES.small,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    marginTop: 2,
  },

  /* ---------------------------------------------- feature strip */
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
