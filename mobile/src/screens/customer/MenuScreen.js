// src/screens/customer/MenuScreen.js
//
// Port of customer/menu.html + js/menu.js initMenuPage: intro copy,
// pill search box, "All" + category chips (only categories that have
// products), 2-column product grid, empty state.

import React, { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ProductCard, Skeleton } from "../../ui/cards";
import { COLORS, FONTS, RADIUS, SIZES, SPACING } from "../../theme";
import { categoryById, getCatalog, loadCatalog } from "../../state/catalog";

export default function MenuScreen({ navigation }) {
  const [catalog, setCatalog] = useState(null);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  useEffect(() => {
    let alive = true;
    loadCatalog().then(() => {
      if (alive) setCatalog(getCatalog());
    });
    return () => {
      alive = false;
    };
  }, []);

  const chips = useMemo(() => {
    if (!catalog) return [];
    return catalog.categories
      .filter((c) => catalog.products.some((p) => p.category_id === c.id))
      .map((c) => ({ id: c.id, name: c.name }));
  }, [catalog]);

  const filtered = useMemo(() => {
    if (!catalog) return null;
    const q = query.trim().toLowerCase();
    return catalog.products.filter((p) => {
      const catMatch =
        activeCategory === "all" || p.category_id === activeCategory;
      const qMatch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (categoryById(p.category_id)?.name || "").toLowerCase().includes(q);
      return catMatch && qMatch;
    });
  }, [catalog, query, activeCategory]);

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.inner}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Our Menu</Text>
        <Text style={styles.intro}>
          Browse everything Little Chef Pizza has to offer — search by name or
          filter by category.
        </Text>

        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search your favourite food…"
            placeholderTextColor={COLORS.inkSoft}
            style={styles.searchInput}
            returnKeyType="search"
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipRow}
          contentContainerStyle={styles.chipContent}
        >
          {[{ id: "all", name: "All" }, ...chips].map((c) => (
            <Pressable
              key={c.id}
              onPress={() => setActiveCategory(c.id)}
              style={[styles.chip, activeCategory === c.id && styles.chipActive]}
            >
              <Text
                style={[
                  styles.chipText,
                  activeCategory === c.id && styles.chipTextActive,
                ]}
              >
                {c.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {!filtered ? (
          <View style={styles.grid}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} height={260} style={styles.gridItem} />
            ))}
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🍕</Text>
            <Text style={styles.emptyTitle}>No items found</Text>
            <Text style={styles.emptyText}>
              Try a different search term or category.
            </Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {filtered.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                categoryName={categoryById(p.category_id)?.name || ""}
                navigation={navigation}
                style={styles.gridItem}
              />
            ))}
          </View>
        )}
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
    marginBottom: 16,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    paddingHorizontal: 18,
    gap: 8,
    marginBottom: 14,
  },
  searchIcon: { fontSize: 14 },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: FONTS.body,
    color: COLORS.ink,
    paddingVertical: 0,
  },
  chipRow: { marginBottom: 14, flexGrow: 0 },
  chipContent: { gap: 10, paddingRight: 14 },
  chip: {
    flexShrink: 0,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.line,
  },
  chipActive: {
    backgroundColor: COLORS.black,
    borderColor: COLORS.black,
  },
  chipText: {
    fontSize: 12.5,
    fontFamily: FONTS.bodySemi,
    color: COLORS.inkSoft,
  },
  chipTextActive: { color: COLORS.gold },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  gridItem: { width: "48.6%", marginBottom: 10 },
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
