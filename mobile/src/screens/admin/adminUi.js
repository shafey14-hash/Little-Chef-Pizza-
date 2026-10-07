// src/screens/admin/adminUi.js
//
// Shared building blocks for the five admin screens — native ports of the
// web admin markup (js/admin.js + css/admin.css): status labels/badges,
// the admin header with section nav + logout, search bar, empty states,
// the confirm dialog (window.confirm), a modal form shell (window.prompt)
// and the image upload cell.

import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { COLORS, FONTS, RADIUS, SIZES, SPACING } from "../../theme";
import { Button } from "../../ui/components";
import { toast } from "../../ui/toast";
import { useAuth } from "../../state/auth";
import {
  getScreenshotUrl,
  removeMenuImage,
  removeMenuImageFile,
  setMenuImage,
  uploadMenuImage,
} from "../../lib/db";

// ------------------------------------------------------------ statuses
// js/admin.js statusLabel / statusBadgeClass — identical copy + colours.

export function adminStatusLabel(s, rejectionReason) {
  if (s === "rejected") {
    return (
      { cancelled: "Cancelled", failed_delivery: "Failed Delivery" }[
        rejectionReason
      ] || "Rejected"
    );
  }
  return (
    {
      payment_verification: "Payment Verification",
      pending: "Pending",
      confirmed: "Confirmed",
      out_for_delivery: "Out for Delivery",
      delivered: "Delivered",
      rejected: "Rejected",
    }[s] || s
  );
}

const BADGE_COLORS = {
  payment_verification: { bg: COLORS.warnBg, fg: COLORS.warn },
  pending: { bg: "#fbeec3", fg: "#8a6a10" },
  confirmed: { bg: COLORS.successBg, fg: COLORS.success },
  out_for_delivery: { bg: COLORS.warnBg, fg: COLORS.warn },
  delivered: { bg: COLORS.successBg, fg: COLORS.success },
  rejected: { bg: COLORS.dangerBg, fg: COLORS.danger },
};

export function adminBadge(s) {
  return BADGE_COLORS[s] || { bg: "#f0ece3", fg: COLORS.inkSoft };
}

export function Badge({ colors, style, children }) {
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }, style]}>
      <Text style={[styles.badgeText, { color: colors.fg }]}>{children}</Text>
    </View>
  );
}

// --------------------------------------------------------------- shell
const NAV = [
  ["AdminDashboard", "Dashboard"],
  ["AdminOrders", "Orders"],
  ["AdminProducts", "Products"],
  ["AdminDeals", "Deals"],
  ["AdminHistory", "History"],
];

export function AdminShell({ navigation, active, children }) {
  const { signOut } = useAuth();

  async function doLogout() {
    const ok = await confirmAsync("Log out of the admin area?", {
      confirmText: "Log Out",
      danger: true,
    });
    if (ok) await signOut();
  }

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <View style={styles.shellHeader}>
        <View style={styles.shellBrandRow}>
          <Text style={styles.shellBrand}>🍕 Little Chef Admin</Text>
          <Pressable onPress={doLogout} hitSlop={8}>
            <Text style={styles.shellLogout}>Log Out</Text>
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.navRow}
        >
          {NAV.map(([route, label]) => (
            <Pressable
              key={route}
              onPress={() => navigation.navigate(route)}
              style={[styles.navPill, active === route && styles.navPillActive]}
            >
              <Text
                style={[
                  styles.navPillText,
                  active === route && styles.navPillTextActive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.shellInner}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

// -------------------------------------------------------------- basics

export function SearchBar({ value, onChangeText, placeholder }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={COLORS.inkSoft}
      style={styles.search}
    />
  );
}

export function EmptyState({ icon, title, text }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      {text ? <Text style={styles.emptyText}>{text}</Text> : null}
    </View>
  );
}

export function Loading({ label = "Loading…" }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={COLORS.red} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

// ------------------------------------------------------------- dialogs

/** window.confirm — resolves true/false. */
export function confirmAsync(title, { message, confirmText = "OK", danger = false } = {}) {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        {
          text: confirmText,
          style: danger ? "destructive" : "default",
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/** window.prompt(s) — a modal form shell. Return true from onSubmit to
 * close, false/undefined to keep it open (e.g. invalid input). */
export function ModalShell({
  visible,
  title,
  submitText = "Save",
  submitDanger = false,
  busy = false,
  onCancel,
  onSubmit,
  children,
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.modalOverlay} onPress={onCancel}>
        <Pressable style={styles.modalCard} onPress={null}>
          <Text style={styles.modalTitle}>{title}</Text>
          <View onStartShouldSetResponder={() => true}>{children}</View>
          <View style={styles.modalActions}>
            <Button title="Cancel" variant="ghost" small onPress={onCancel} style={{ flex: 1 }} />
            <Button
              title={submitText}
              variant={submitDanger ? "danger" : "primary"}
              small
              loading={busy}
              onPress={() => onSubmit()}
              style={{ flex: 1 }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function DialogField({ label, style, ...props }) {
  return (
    <View style={[styles.dlgField, style]}>
      {label ? <Text style={styles.dlgLabel}>{label}</Text> : null}
      <TextInput
        style={styles.dlgInput}
        placeholderTextColor={COLORS.inkSoft}
        {...props}
      />
    </View>
  );
}

// ---------------------------------------------------------- image cell
// buildImageCell (js/admin.js): thumbnail + Upload/Change + Remove.
// The replaced file is deleted from Storage so the bucket stays tidy.

export function menuImageSaver(itemId) {
  return (patch) =>
    patch.image_url
      ? setMenuImage(itemId, patch.image_url)
      : removeMenuImage(itemId);
}

export function ImageCell({ item, folder, saveItem, onChanged }) {
  const [busy, setBusy] = useState(null); // "upload" | "remove" | null

  async function pick() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast("Allow photo access to upload images.", "error");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
      toast("Image must be 5MB or smaller.", "error");
      return;
    }

    setBusy("upload");
    const { data, error } = await uploadMenuImage(asset, folder);
    if (error) {
      setBusy(null);
      return toast(error, "error");
    }
    const oldUrl = item.image_url;
    const { error: saveErr } = await saveItem({ image_url: data.url });
    setBusy(null);
    if (saveErr) {
      toast(saveErr, "error");
      await removeMenuImageFile(data.path);
      return;
    }
    if (oldUrl) await removeMenuImageFile(oldUrl);
    onChanged();
    toast("Image uploaded.", "success");
  }

  async function remove() {
    const ok = await confirmAsync("Remove this image?", {
      confirmText: "Remove",
      danger: true,
    });
    if (!ok) return;
    setBusy("remove");
    await removeMenuImageFile(item.image_url);
    const { error } = await saveItem({ image_url: null });
    setBusy(null);
    if (error) return toast(error, "error");
    onChanged();
    toast("Image removed.", "success");
  }

  return (
    <View style={styles.imgCell}>
      <View style={styles.imgThumb}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.imgThumbImg} />
        ) : (
          <Text style={styles.imgThumbEmpty}>No image</Text>
        )}
      </View>
      <View style={styles.imgCellBtns}>
        <Button
          title={item.image_url ? "Change" : "Upload"}
          variant="ghost"
          small
          loading={busy === "upload"}
          loadingText="Uploading…"
          disabled={!!busy}
          onPress={pick}
          style={styles.imgCellBtn}
        />
        <Button
          title="Remove"
          variant="danger"
          small
          loading={busy === "remove"}
          loadingText="Removing…"
          disabled={!!busy || !item.image_url}
          onPress={remove}
          style={styles.imgCellBtn}
        />
      </View>
    </View>
  );
}

// --------------------------------------------------------- screenshot
// "View Screenshot" — fetches a fresh signed URL and opens it.

export async function openScreenshot(path) {
  const { data: url, error } = await getScreenshotUrl(path);
  if (error || !url) return toast("Could not load screenshot.", "error");
  Linking.openURL(url);
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.cream },
  shellHeader: {
    backgroundColor: COLORS.black,
    paddingHorizontal: SPACING.gutter,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 10,
  },
  shellBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shellBrand: {
    color: COLORS.gold,
    fontFamily: FONTS.display,
    fontSize: SIZES.h3,
  },
  shellLogout: {
    color: "#d8d2c8",
    fontFamily: FONTS.bodySemi,
    fontSize: SIZES.small,
  },
  navRow: { gap: 8, paddingRight: SPACING.gutter },
  navPill: {
    borderWidth: 1,
    borderColor: "#3a342c",
    borderRadius: RADIUS.pill,
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: "#1a1815",
  },
  navPillActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  navPillText: {
    color: "#d8d2c8",
    fontFamily: FONTS.bodySemi,
    fontSize: SIZES.small,
  },
  navPillTextActive: { color: COLORS.black },
  shellInner: { padding: SPACING.gutter, paddingBottom: 48 },

  search: {
    height: SIZES.inputH,
    borderWidth: 1.5,
    borderColor: COLORS.line,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.md,
    fontSize: SIZES.body,
    fontFamily: FONTS.body,
    color: COLORS.ink,
    marginBottom: SPACING.md,
  },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    alignSelf: "flex-start",
  },
  badgeText: { fontSize: SIZES.tiny, fontFamily: FONTS.bodyBold },

  empty: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyIcon: { fontSize: 42, marginBottom: 12 },
  emptyTitle: {
    fontSize: SIZES.h3,
    fontFamily: FONTS.display,
    color: COLORS.ink,
    textAlign: "center",
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13.5,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    textAlign: "center",
    lineHeight: 20,
  },

  loading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 48,
  },
  loadingText: { color: COLORS.inkSoft, fontFamily: FONTS.body },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(12,11,10,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xl,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
  },
  modalTitle: {
    fontSize: SIZES.h3,
    fontFamily: FONTS.display,
    color: COLORS.ink,
    marginBottom: SPACING.md,
  },
  modalActions: { flexDirection: "row", gap: 10, marginTop: SPACING.sm },
  dlgField: { marginBottom: SPACING.md },
  dlgLabel: {
    fontSize: SIZES.small,
    fontFamily: FONTS.bodySemi,
    color: COLORS.ink,
    marginBottom: 6,
  },
  dlgInput: {
    height: SIZES.inputH,
    borderWidth: 1.5,
    borderColor: COLORS.line,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.md,
    fontSize: SIZES.body,
    fontFamily: FONTS.body,
    color: COLORS.ink,
  },

  imgCell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 6,
  },
  imgThumb: {
    width: 54,
    height: 54,
    borderRadius: RADIUS.sm,
    backgroundColor: "#f0ece3",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  imgThumbImg: { width: "100%", height: "100%" },
  imgThumbEmpty: {
    color: "#c7bea9",
    fontSize: 10,
    fontFamily: FONTS.bodySemi,
  },
  imgCellBtns: { flex: 1, flexDirection: "row", gap: 8 },
  imgCellBtn: { flex: 1, height: 36, paddingHorizontal: 8 },
});
