// src/screens/customer/DealsScreen.js
//
// Port of customer/deals.html: page intro + full deals list (web uses the
// same dealCard renderer as the home page's featured section).

import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DealCard, Skeleton } from "../../ui/cards";
import { COLORS, FONTS, SIZES, SPACING } from "../../theme";
import { getCatalog, loadCatalog } from "../../state/catalog";

export default function DealsScreen() {
  const [deals, setDeals] = useState(null);

  useEffect(() => {
    let alive = true;
    loadCatalog().then(() => {
      if (alive) setDeals(getCatalog().deals);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <ScrollView contentContainerStyle={styles.inner} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Little Chef Deals</Text>
        <Text style={styles.intro}>
          Great combos, great prices. Deal composition and pricing may be
          updated by the restaurant from time to time.
        </Text>

        <View style={styles.stack}>
          {deals === null
            ? [0, 1, 2].map((i) => <Skeleton key={i} height={110} />)
            : deals.length === 0
              ? <View style={styles.empty}>
                  <Text style={styles.emptyIcon}>🏷️</Text>
                  <Text style={styles.emptyTitle}>No deals available right now</Text>
                </View>
              : deals.map((d) => <DealCard key={d.id} deal={d} />)}
        </View>
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
  title: {
    fontSize: SIZES.h1,
    fontFamily: FONTS.display,
    color: COLORS.ink,
    marginBottom: 8,
  },
  intro: {
    fontSize: 13,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    lineHeight: 19,
    marginBottom: 20,
  },
  stack: { gap: 16 },
  empty: { alignItems: "center", paddingVertical: 60, paddingHorizontal: 20 },
  emptyIcon: { fontSize: 42, marginBottom: 10 },
  emptyTitle: {
    color: COLORS.inkSoft,
    fontSize: SIZES.h3,
    fontFamily: FONTS.display,
  },
});
