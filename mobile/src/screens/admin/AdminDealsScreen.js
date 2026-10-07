// src/screens/admin/AdminDealsScreen.js
//
// Port of js/admin.js initDeals at the phone breakpoint: searchable deal
// cards from the shared catalog (menu file + admin-created), duplicate-name
// banner, per-deal image/price/availability management and the create-deal
// flow with its duplicate warning.

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
  createDeal,
  deleteDeal,
  setAvailabilityOverride,
  setPriceOverride,
  updateDeal,
} from "../../lib/db";
import { getCatalog, loadCatalog } from "../../state/catalog";

const MUTED_BADGE = { bg: "#f0ece3", fg: COLORS.inkSoft };
const WARN_BADGE = { bg: COLORS.warnBg, fg: COLORS.warn };
const OK_BADGE = { bg: COLORS.successBg, fg: COLORS.success };

function DealCard({ d, onPrice, onToggle, onDelete, onChanged }) {
  const isHardcoded = d.source === "hardcoded";
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.name}>{d.name}</Text>
        {!d.verified ? <Badge colors={WARN_BADGE}>Verify</Badge> : null}
      </View>
      <View style={styles.badgeRow}>
        <Badge colors={MUTED_BADGE}>{isHardcoded ? "Menu File" : "Custom"}</Badge>
        <Badge colors={d.available ? OK_BADGE : MUTED_BADGE}>
          {d.available ? "Active" : "Inactive"}
        </Badge>
      </View>
      {!!d.description && (
        <Text style={styles.desc}>{d.description}</Text>
      )}
      <View style={styles.priceRow}>
        <Text style={styles.price}>{pkr(d.price)}</Text>
      </View>
      <ImageCell
        item={d}
        folder="deals"
        saveItem={menuImageSaver(d.id)}
        onChanged={onChanged}
      />
      <View style={styles.btnRow}>
        <Button
          title="Edit Price"
          variant="gold"
          small
          onPress={() => onPrice(d)}
          style={styles.btn}
        />
        <Button
          title={d.available ? "Deactivate" : "Activate"}
          variant="ghost"
          small
          onPress={() => onToggle(d)}
          style={styles.btn}
        />
        {!isHardcoded && (
          <Button
            title="Delete"
            variant="danger"
            small
            onPress={() => onDelete(d)}
            style={styles.btn}
          />
        )}
      </View>
    </View>
  );
}

export default function AdminDealsScreen({ navigation }) {
  const [catalog, setCatalog] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [priceTarget, setPriceTarget] = useState(null);
  const [priceField, setPriceField] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [cName, setCName] = useState("");
  const [cDesc, setCDesc] = useState("");
  const [cPrice, setCPrice] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const err = await loadCatalog(true);
    if (err) toast("Unable to load deals: " + err, "error");
    setCatalog(getCatalog());
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const err = await loadCatalog();
      if (!alive) return;
      if (err) toast("Unable to load deals: " + err, "error");
      setCatalog(getCatalog());
    })();
    return () => {
      alive = false;
    };
  }, []);

  const deals = catalog ? catalog.deals : null;

  const dupeGroups = useMemo(() => {
    const byName = {};
    (deals || []).forEach((d) => {
      const key = d.name.trim().toLowerCase();
      (byName[key] = byName[key] || []).push(d);
    });
    return Object.values(byName).filter((g) => g.length > 1);
  }, [deals]);

  const q = searchTerm.trim().toLowerCase();
  const filtered = !deals
    ? null
    : !q
      ? deals
      : deals.filter(
          (d) =>
            d.name.toLowerCase().includes(q) ||
            (d.description || "").toLowerCase().includes(q),
        );

  function openPrice(d) {
    setPriceField(String(d.price));
    setPriceTarget(d);
  }

  async function submitPrice() {
    const d = priceTarget;
    const newPrice = Number(priceField);
    if (!newPrice || newPrice <= 0) {
      toast("Please enter a valid price.", "error");
      return false;
    }
    setBusy(true);
    const isHardcoded = d.source === "hardcoded";
    const { error } = isHardcoded
      ? await setPriceOverride(d.id, newPrice)
      : await updateDeal(d.id, { price: newPrice });
    setBusy(false);
    if (error) {
      toast(error, "error");
      return false;
    }
    toast(`${d.name} price updated.`, "success");
    setPriceTarget(null);
    reload();
    return true;
  }

  async function toggleAvail(d) {
    const isHardcoded = d.source === "hardcoded";
    const { error } = isHardcoded
      ? await setAvailabilityOverride(d.id, !d.available)
      : await updateDeal(d.id, { available: !d.available });
    if (error) return toast(error, "error");
    toast(`${d.name} ${d.available ? "deactivated" : "activated"}.`, "success");
    reload();
  }

  async function deleteDealCard(d) {
    const ok = await confirmAsync(`Delete "${d.name}"? This can't be undone.`);
    if (!ok) return;
    const { error } = await deleteDeal(d.id);
    if (error) return toast(error, "error");
    toast(`${d.name} deleted.`, "success");
    reload();
  }

  async function deleteDupe(customCopy) {
    const ok = await confirmAsync(
      `Delete the duplicate "${customCopy.name}" (Custom copy)? The Menu File version will stay.`,
      { confirmText: "Delete Duplicate", danger: true },
    );
    if (!ok) return;
    const { error } = await deleteDeal(customCopy.id);
    if (error) return toast(error, "error");
    toast(`Duplicate "${customCopy.name}" removed.`, "success");
    reload();
  }

  function openCreate() {
    setCName("");
    setCDesc("");
    setCPrice("");
    setCreateOpen(true);
  }

  async function submitCreate() {
    const name = cName.trim();
    if (!name) return false;
    const existing = (deals || []).find(
      (d) => d.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      const isHardcoded = existing.source === "hardcoded";
      const ok = await confirmAsync(
        `A deal named "${existing.name}" already exists${isHardcoded ? " in the menu file" : ""}. Creating another one with the same name will show TWO separate entries on the site, which is confusing for customers. ` +
          (isHardcoded
            ? `If you just want to change its photo, cancel this and use the image button next to it in the list instead.`
            : `If you meant to edit its price, cancel this and use the Edit Price button next to it in the list instead.`) +
          ` Create a duplicate anyway?`,
        { confirmText: "Create Duplicate Anyway", danger: true },
      );
      if (!ok) return false;
    }
    const price = Number(cPrice);
    if (!price || price <= 0) {
      toast("Please enter a valid price.", "error");
      return false;
    }
    setBusy(true);
    const { error } = await createDeal({
      name,
      description: cDesc.trim(),
      price,
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
    <AdminShell navigation={navigation} active="AdminDeals">
      <View style={styles.titleRow}>
        <Text style={styles.title}>Deals</Text>
        <Button title="+ Create Deal" small onPress={openCreate} />
      </View>
      <SearchBar
        value={searchTerm}
        onChangeText={setSearchTerm}
        placeholder="🔍 Search deals…"
      />
      <Text style={styles.intro}>
        Deals from the menu file (js/seed-data.js) show a "Menu File" tag —
        their name/price are edited in code, only their photo is managed here.
        Deals you create with the button above are fully yours to edit or
        remove anytime.
      </Text>

      {dupeGroups.length > 0 && (
        <View style={styles.dupeBanner}>
          <Text style={styles.dupeTitle}>
            ⚠ {dupeGroups.length} duplicate deal name
            {dupeGroups.length === 1 ? "" : "s"} found
          </Text>
          <Text style={styles.dupeText}>
            — the same deal exists more than once and will show twice on the
            site. We recommend keeping the "Menu File" version (always
            reliable) and removing the "Custom" one below.
          </Text>
          {dupeGroups.map((group, i) => {
            const customCopy = group.find((d) => d.source === "admin");
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

      {!deals ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <EmptyState icon="🔍" title={`No deals match "${searchTerm}"`} />
      ) : (
        filtered.map((d) => (
          <DealCard
            key={d.id}
            d={d}
            onPrice={openPrice}
            onToggle={toggleAvail}
            onDelete={deleteDealCard}
            onChanged={reload}
          />
        ))
      )}

      <ModalShell
        visible={!!priceTarget}
        title={priceTarget ? `New price for "${priceTarget.name}" (PKR)` : ""}
        busy={busy}
        onCancel={() => setPriceTarget(null)}
        onSubmit={submitPrice}
      >
        <DialogField
          label="Price (PKR)"
          keyboardType="number-pad"
          value={priceField}
          onChangeText={setPriceField}
        />
      </ModalShell>

      <ModalShell
        visible={createOpen}
        title="Create Deal"
        submitText="Create"
        busy={busy}
        onCancel={() => setCreateOpen(false)}
        onSubmit={submitCreate}
      >
        <DialogField
          label="Deal name (e.g. Deal 7)"
          value={cName}
          onChangeText={setCName}
        />
        <DialogField
          label="Description (e.g. 1 Large Pizza + 1 Drink)"
          value={cDesc}
          onChangeText={setCDesc}
        />
        <DialogField
          label="Deal price (PKR)"
          keyboardType="number-pad"
          value={cPrice}
          onChangeText={setCPrice}
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
  desc: {
    fontSize: 12.5,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    lineHeight: 18,
    marginTop: 6,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: SPACING.sm,
    marginTop: 6,
  },
  price: {
    fontSize: 14,
    fontFamily: FONTS.bodyBold,
    color: COLORS.ink,
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
});
