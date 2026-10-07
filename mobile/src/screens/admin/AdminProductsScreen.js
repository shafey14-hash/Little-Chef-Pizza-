// src/screens/admin/AdminProductsScreen.js
//
// Port of js/admin.js initProducts at the phone breakpoint: searchable
// product list from the shared catalog (menu file + admin-created),
// duplicate-name banner, per-product image/price/availability management
// and the create-product flow with its duplicate warning.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../../ui/components";
import {
  AdminShell,
  Badge,
  DialogField,
  EmptyState,
  ImageCell,
  Loading,
  ModalShell,
  SearchBar,
  confirmAsync,
  menuImageSaver,
} from "../../screens/admin/adminUi";
import { COLORS, FONTS, RADIUS, SPACING } from "../../theme";
import { pkr } from "../../lib/format";
import { toast } from "../../ui/toast";
import {
  createProduct,
  deleteProduct,
  setAvailabilityOverride,
  setPriceOverride,
  updateProduct,
} from "../../lib/db";
import { getCatalog, loadCatalog } from "../../state/catalog";

const MUTED_BADGE = { bg: "#f0ece3", fg: COLORS.inkSoft };
const WARN_BADGE = { bg: COLORS.warnBg, fg: COLORS.warn };
const OK_BADGE = { bg: COLORS.successBg, fg: COLORS.success };

function priceCell(p) {
  if (p.sizes)
    return Object.entries(p.sizes)
      .map(([sz, price]) => `${sz}: ${pkr(price)}`)
      .join(" · ");
  return pkr(p.price);
}

function ProductCard({ p, catName, onPrice, onToggle, onDelete, onChanged }) {
  const isHardcoded = p.source === "hardcoded";
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.name}>{p.name}</Text>
        {!p.verified ? <Badge colors={WARN_BADGE}>Verify</Badge> : null}
      </View>
      <View style={styles.badgeRow}>
        {!!catName && <Text style={styles.catText}>{catName}</Text>}
        <Badge colors={MUTED_BADGE}>{isHardcoded ? "Menu File" : "Custom"}</Badge>
        <Badge colors={p.available ? OK_BADGE : MUTED_BADGE}>
          {p.available ? "Available" : "Unavailable"}
        </Badge>
      </View>
      <Text style={styles.priceCell}>{priceCell(p)}</Text>
      <ImageCell
        item={p}
        folder="products"
        saveItem={menuImageSaver(p.id)}
        onChanged={onChanged}
      />
      <View style={styles.btnRow}>
        <Button
          title="Price"
          variant="gold"
          small
          onPress={() => onPrice(p)}
          style={styles.btn}
        />
        <Button
          title={p.available ? "Deactivate" : "Activate"}
          variant="ghost"
          small
          onPress={() => onToggle(p)}
          style={styles.btn}
        />
        {!isHardcoded && (
          <Button
            title="Delete"
            variant="danger"
            small
            onPress={() => onDelete(p)}
            style={styles.btn}
          />
        )}
      </View>
    </View>
  );
}

export default function AdminProductsScreen({ navigation }) {
  const [catalog, setCatalog] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [priceTarget, setPriceTarget] = useState(null);
  const [priceFields, setPriceFields] = useState({});
  const [createOpen, setCreateOpen] = useState(false);
  const [cName, setCName] = useState("");
  const [cCatId, setCCatId] = useState(null);
  const [cPrice, setCPrice] = useState("");
  const [cDesc, setCDesc] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const err = await loadCatalog(true);
    if (err) toast("Unable to load products. Please refresh.", "error");
    setCatalog(getCatalog());
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const err = await loadCatalog();
      if (!alive) return;
      if (err) toast("Unable to load products. Please refresh.", "error");
      setCatalog(getCatalog());
    })();
    return () => {
      alive = false;
    };
  }, []);

  const products = catalog ? catalog.products : null;
  const catName = useMemo(() => {
    const map = {};
    (catalog?.categories || []).forEach((c) => {
      map[c.id] = c.name;
    });
    return map;
  }, [catalog]);

  const dupeGroups = useMemo(() => {
    const byName = {};
    (products || []).forEach((p) => {
      const key = p.name.trim().toLowerCase();
      (byName[key] = byName[key] || []).push(p);
    });
    return Object.values(byName).filter((g) => g.length > 1);
  }, [products]);

  const q = searchTerm.trim().toLowerCase();
  const filtered = !products
    ? null
    : !q
      ? products
      : products.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (catName[p.category_id] || "").toLowerCase().includes(q),
        );

  function openPrice(p) {
    const fields = {};
    if (p.sizes) {
      Object.entries(p.sizes).forEach(([sz, price]) => {
        fields[sz] = String(price);
      });
    } else {
      fields.price = String(p.price);
    }
    setPriceFields(fields);
    setPriceTarget(p);
  }

  async function submitPrice() {
    const p = priceTarget;
    const parsed = {};
    for (const [key, raw] of Object.entries(priceFields)) {
      const val = Number(raw);
      if (!val || val <= 0) {
        toast("Please enter a valid price.", "error");
        return false;
      }
      parsed[key] = val;
    }
    setBusy(true);
    const isHardcoded = p.source === "hardcoded";
    const { error } = isHardcoded
      ? await setPriceOverride(p.id, p.sizes ? parsed : parsed.price)
      : await updateProduct(p.id, p.sizes ? { sizes: parsed } : { price: parsed.price });
    setBusy(false);
    if (error) {
      toast(error, "error");
      return false;
    }
    toast(`${p.name} price updated.`, "success");
    setPriceTarget(null);
    reload();
    return true;
  }

  async function toggleAvail(p) {
    const isHardcoded = p.source === "hardcoded";
    const { error } = isHardcoded
      ? await setAvailabilityOverride(p.id, !p.available)
      : await updateProduct(p.id, { available: !p.available });
    if (error) return toast(error, "error");
    toast(`${p.name} ${p.available ? "deactivated" : "activated"}.`, "success");
    reload();
  }

  async function deleteProductCard(p) {
    const ok = await confirmAsync(`Delete "${p.name}"? This can't be undone.`);
    if (!ok) return;
    const { error } = await deleteProduct(p.id);
    if (error) return toast(error, "error");
    toast(`${p.name} deleted.`, "success");
    reload();
  }

  async function deleteDupe(customCopy) {
    const ok = await confirmAsync(
      `Delete the duplicate "${customCopy.name}" (Custom copy)? The Menu File version will stay.`,
      { confirmText: "Delete Duplicate", danger: true },
    );
    if (!ok) return;
    const { error } = await deleteProduct(customCopy.id);
    if (error) return toast(error, "error");
    toast(`Duplicate "${customCopy.name}" removed.`, "success");
    reload();
  }

  function openCreate() {
    setCName("");
    setCCatId(null);
    setCPrice("");
    setCDesc("");
    setCreateOpen(true);
  }

  async function submitCreate() {
    const name = cName.trim();
    if (!name) return false;
    const existing = (products || []).find(
      (p) => p.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      const isHardcoded = existing.source === "hardcoded";
      const ok = await confirmAsync(
        `A product named "${existing.name}" already exists${isHardcoded ? " in the menu file" : ""}. Creating another one with the same name will show TWO separate entries on the site, which is confusing for customers. ` +
          (isHardcoded
            ? `If you just want to change its photo, cancel this and use the image button next to it in the list instead.`
            : `If you meant to edit its price, cancel this and use the Price button next to it in the list instead.`) +
          ` Create a duplicate anyway?`,
        { confirmText: "Create Duplicate Anyway", danger: true },
      );
      if (!ok) return false;
    }
    if (!cCatId) {
      toast("Please pick a category.", "error");
      return false;
    }
    const price = Number(cPrice);
    if (!price || price <= 0) {
      toast("Please enter a valid price.", "error");
      return false;
    }
    setBusy(true);
    const { error } = await createProduct({
      name,
      description: cDesc.trim(),
      price,
      category_id: cCatId,
      available: true,
    });
    setBusy(false);
    if (error) {
      toast(error, "error");
      return false;
    }
    toast(`${name} created.`, "success");
    setCreateOpen(false);
    reload();
    return true;
  }

  return (
    <AdminShell navigation={navigation} active="AdminProducts">
      <View style={styles.titleRow}>
        <Text style={styles.title}>Products</Text>
        <Button title="+ Create Product" small onPress={openCreate} />
      </View>
      <SearchBar
        value={searchTerm}
        onChangeText={setSearchTerm}
        placeholder="🔍 Search products…"
      />
      <Text style={styles.intro}>
        Products from the menu file (js/seed-data.js) show a "Menu File" tag —
        their name/price are edited in code, only their photo is managed here.
        Products you create with the button above are fully yours to edit or
        remove anytime.
      </Text>

      {dupeGroups.length > 0 && (
        <View style={styles.dupeBanner}>
          <Text style={styles.dupeTitle}>
            ⚠ {dupeGroups.length} duplicate product name
            {dupeGroups.length === 1 ? "" : "s"} found
          </Text>
          <Text style={styles.dupeText}>
            — the same item exists more than once and will show twice on the
            site. We recommend keeping the "Menu File" version (always
            reliable) and removing the "Custom" one below.
          </Text>
          {dupeGroups.map((group, i) => {
            const customCopy = group.find((p) => p.source === "admin");
            return (
              <View key={i} style={styles.dupeRow}>
                <Text style={styles.dupeText}>
                  "{group[0].name}" appears {group.length} times
                </Text>
                {customCopy && (
                  <Button
                    title="Delete the Custom duplicate"
                    variant="danger"
                    small
                    onPress={() => deleteDupe(customCopy)}
                  />
                )}
              </View>
            );
          })}
        </View>
      )}

      {!products ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <EmptyState icon="🔍" title={`No products match "${searchTerm}"`} />
      ) : (
        filtered.map((p) => (
          <ProductCard
            key={p.id}
            p={p}
            catName={catName[p.category_id] || ""}
            onPrice={openPrice}
            onToggle={toggleAvail}
            onDelete={deleteProductCard}
            onChanged={reload}
          />
        ))
      )}

      <ModalShell
        visible={!!priceTarget}
        title={priceTarget ? `New price — ${priceTarget.name}` : ""}
        busy={busy}
        onCancel={() => setPriceTarget(null)}
        onSubmit={submitPrice}
      >
        {priceTarget &&
          (priceTarget.sizes
            ? Object.entries(priceTarget.sizes).map(([sz]) => (
                <DialogField
                  key={sz}
                  label={`${sz} (PKR)`}
                  keyboardType="number-pad"
                  value={priceFields[sz] || ""}
                  onChangeText={(v) =>
                    setPriceFields((f) => ({ ...f, [sz]: v }))
                  }
                />
              ))
            : (
                <DialogField
                  label="Price (PKR)"
                  keyboardType="number-pad"
                  value={priceFields.price || ""}
                  onChangeText={(v) =>
                    setPriceFields((f) => ({ ...f, price: v }))
                  }
                />
              ))}
      </ModalShell>

      <ModalShell
        visible={createOpen}
        title="Create Product"
        submitText="Create"
        busy={busy}
        onCancel={() => setCreateOpen(false)}
        onSubmit={submitCreate}
      >
        <DialogField
          label="Product name"
          value={cName}
          onChangeText={setCName}
        />
        <Text style={styles.fieldLabel}>Category</Text>
        <View style={styles.catChips}>
          {(catalog?.categories || []).map((c) => {
            const active = cCatId === c.id;
            return (
              <Text
                key={c.id}
                onPress={() => setCCatId(c.id)}
                style={[styles.catChip, active && styles.catChipActive]}
              >
                {c.name}
              </Text>
            );
          })}
        </View>
        <DialogField
          label="Price (PKR)"
          keyboardType="number-pad"
          value={cPrice}
          onChangeText={setCPrice}
        />
        <DialogField
          label="Description (optional)"
          value={cDesc}
          onChangeText={setCDesc}
        />
      </ModalShell>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  title: {
    fontSize: 22,
    fontFamily: FONTS.display,
    color: COLORS.ink,
    flexShrink: 1,
  },
  intro: {
    fontSize: 12.5,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    lineHeight: 18,
    marginBottom: SPACING.md,
  },
  dupeBanner: {
    borderWidth: 1,
    borderColor: "#e0c060",
    backgroundColor: "#fff8e0",
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  dupeTitle: {
    fontSize: 13.5,
    fontFamily: FONTS.bodyBold,
    color: "#7a5c00",
    marginBottom: 4,
  },
  dupeText: {
    fontSize: 12.5,
    fontFamily: FONTS.body,
    color: "#7a5c00",
    lineHeight: 18,
  },
  dupeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  card: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: SPACING.xs,
  },
  name: {
    fontSize: 15,
    fontFamily: FONTS.bodyBold,
    color: COLORS.ink,
    flexShrink: 1,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: SPACING.xs,
    marginTop: 6,
  },
  catText: {
    fontSize: 12.5,
    fontFamily: FONTS.bodySemi,
    color: COLORS.ink,
    marginRight: 2,
  },
  priceCell: {
    fontSize: 12.5,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    marginTop: 6,
  },
  btnRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: SPACING.sm,
  },
  btn: {
    flex: 1,
    minWidth: 96,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: FONTS.bodySemi,
    color: COLORS.inkSoft,
    marginTop: SPACING.sm,
    marginBottom: 6,
  },
  catChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  catChip: {
    fontSize: 12,
    fontFamily: FONTS.bodySemi,
    color: COLORS.ink,
    backgroundColor: "#f0ece3",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    overflow: "hidden",
  },
  catChipActive: {
    backgroundColor: COLORS.gold,
    color: COLORS.black,
  },
});
