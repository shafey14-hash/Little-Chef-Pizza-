// src/screens/customer/ProfileScreen.js
//
// Port of customer/profile.html + its inline script: profile summary,
// Edit Details modal (details form → address editor → email verification),
// orders shortcut card, contact info and logout. The Leaflet map has no
// keyless native equivalent, so the address editor shows the same
// "Map preview unavailable" fallback the website uses — address search
// and Locate Me stay fully functional.

import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../../state/auth";
import {
  CENTER,
  FREE_RADIUS_KM,
  RADIUS_KM,
  forwardGeocode,
  getCurrentPosition,
  getStoredLocation,
  haversineKm,
  reverseGeocode,
  saveLocation,
} from "../../state/location";
import seed from "../../data/seed-data";
import {
  listForUser,
  requestEmailChange,
  settingsGet,
  updateProfile,
  verifyEmailChange,
} from "../../lib/db";
import {
  validateEmail,
  validateFullName,
  validatePhone,
} from "../../lib/format";
import { Button, Field, Input } from "../../ui/components";
import { toast } from "../../ui/toast";
import { COLORS, FONTS, RADIUS, SIZES, SPACING, shadowCard } from "../../theme";

export default function ProfileScreen() {
  const navigation = useNavigation();
  const { profile, setGuest, signOut, refreshProfile } = useAuth();

  const [modalOpen, setModalOpen] = useState(false);
  const [ordersCount, setOrdersCount] = useState(null);
  const [deliveryCharge, setDeliveryCharge] = useState(250);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!profile) return;
    listForUser(profile.id).then(({ data }) => {
      setOrdersCount((data || []).length);
    });
  }, [profile]);

  useEffect(() => {
    settingsGet("delivery_charge").then((v) => {
      const n = Number(v);
      if (n > 0) setDeliveryCharge(n);
    });
  }, []);

  if (!profile) {
    return (
      <SafeAreaView style={styles.safe} edges={["left", "right"]}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🔒</Text>
          <Text style={styles.emptyTitle}>Please log in first</Text>
          <Text style={styles.emptyText}>
            Log in or create an account first to view your profile and manage
            your details.
          </Text>
          <Button
            title="Login / Create Account"
            style={{ marginTop: 14 }}
            onPress={async () => {
              await setGuest(false);
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const since = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      })
    : null;

  const ordersSub =
    ordersCount === null
      ? "View all past orders"
      : ordersCount === 0
        ? "No orders yet"
        : ordersCount === 1
          ? "1 order placed so far"
          : `${ordersCount} orders placed so far`;

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.inner}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.h1}>Your Profile</Text>

        {/* header card */}
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(profile.full_name || "?").trim().charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.flex1}>
              <Text style={styles.headerName}>{profile.full_name || ""}</Text>
              {since ? <Text style={styles.headerSince}>Member since {since}</Text> : null}
            </View>
          </View>
        </View>

        {/* details card */}
        <View style={styles.card}>
          <View style={styles.sectionHead}>
            <Text style={styles.h3}>Your Details</Text>
            <Button
              title="✏️ Edit Details"
              variant="ghost"
              small
              onPress={() => setModalOpen(true)}
            />
          </View>
          <SummaryRow label="Full Name" value={profile.full_name || "—"} />
          <SummaryRow label="Phone" value={profile.phone || "—"} />
          <SummaryRow label="Alternative Phone" value={profile.alt_phone || "Not added"} />
          <SummaryRow label="Email" value={profile.email || "—"} />
          <SummaryRow label="Address" value={profile.address || "Not set yet"} last />
        </View>

        {/* orders link */}
        <Pressable
          onPress={() => navigation.navigate("Orders")}
          style={({ pressed }) => [styles.card, styles.ordersLink, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.ordersIcon}>
            <Text style={{ fontSize: 22 }}>🧾</Text>
          </View>
          <View style={styles.flex1}>
            <Text style={styles.ordersTitle}>Your Orders</Text>
            <Text style={styles.ordersSub}>{ordersSub}</Text>
          </View>
          <Text style={styles.chevron}>→</Text>
        </Pressable>

        {/* need help */}
        <View style={styles.card}>
          <Text style={styles.h3}>Need Help?</Text>
          <Text style={styles.helpText}>
            Questions about an order, delivery, or your account? Reach us
            directly:
          </Text>
          <Text style={styles.contactLine}>📞 {seed.restaurant.phone_primary}</Text>
          <Text style={styles.contactLine}>💬 WhatsApp: {seed.restaurant.phone_whatsapp}</Text>
        </View>

        <Button
          title="Log Out"
          variant="ghost"
          loading={loggingOut}
          loadingText="Logging out…"
          style={styles.logoutBtn}
          onPress={async () => {
            setLoggingOut(true);
            try {
              await signOut();
            } finally {
              setLoggingOut(false);
            }
          }}
        />
      </ScrollView>

      <EditProfileModal
        visible={modalOpen}
        profile={profile}
        deliveryCharge={deliveryCharge}
        refreshProfile={refreshProfile}
        onClose={() => setModalOpen(false)}
      />
    </SafeAreaView>
  );
}

function SummaryRow({ label, value, last }) {
  return (
    <View style={[styles.pfRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.pfRowLabel}>{label}</Text>
      <Text style={styles.pfRowValue}>{value}</Text>
    </View>
  );
}

// ------------------------------------------------------------------ modal
function EditProfileModal({ visible, profile, deliveryCharge, refreshProfile, onClose }) {
  const [view, setView] = useState("details"); // details | address | verify

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [altPhone, setAltPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const [pendingAddress, setPendingAddress] = useState(null); // confirmed in the address view, not saved yet
  const [selection, setSelection] = useState(null); // working selection inside the address view
  const [addressInput, setAddressInput] = useState("");
  const [locMsg, setLocMsg] = useState({
    kind: "muted",
    text: "Set your location to check delivery — free delivery within 3 km, up to 5 km.",
  });
  const [locating, setLocating] = useState(false);
  const geocodeTimer = useRef(null);

  const [newEmail, setNewEmail] = useState(null); // email awaiting verification
  const [otp, setOtp] = useState("");
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  function openModal() {
    setFullName(profile.full_name || "");
    setPhone(profile.phone || "");
    setAltPhone(profile.alt_phone || "");
    setEmail(profile.email || "");
    setAddress(profile.address || "");
    setFieldErrors({});
    setPendingAddress(null);
    setSelection(null);
    setNewEmail(null);
    setOtp("");
    setView("details");
  }

  useEffect(() => {
    if (visible) openModal();
    return () => {
      if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, profile?.id]);

  function openAddressView() {
    const base = pendingAddress || getStoredLocation();
    let sel = null;
    let input = "";
    if (base && base.lat && base.lng && base.address) {
      sel = { lat: base.lat, lng: base.lng, address: base.address };
      input = base.address;
    } else {
      input = address || "";
    }
    setSelection(sel);
    setAddressInput(input);
    renderLocStatus(sel);
    setView("address");
  }

  function backFromAddress() {
    setSelection(null);
    setView("details");
  }

  function renderLocStatus(sel) {
    if (!sel) {
      setLocMsg({
        kind: "muted",
        text: "Set your location to check delivery — free delivery within 3 km, up to 5 km.",
      });
      return;
    }
    const distance = haversineKm(CENTER.lat, CENTER.lng, sel.lat, sel.lng);
    if (distance <= RADIUS_KM) {
      const freeMsg =
        distance <= FREE_RADIUS_KM
          ? " · Free delivery ✓"
          : ` · Delivery fee Rs. ${deliveryCharge} applies (over 3 km)`;
      setLocMsg({
        kind: "ok",
        text: `✓ Within delivery range (${distance.toFixed(1)} km away)${freeMsg}`,
      });
    } else {
      setLocMsg({
        kind: "error",
        text: "Delivery is only available within 5 km. You are too far.",
      });
    }
  }

  function useLocation(lat, lng, addr) {
    const sel = { lat, lng, address: addr };
    setSelection(sel);
    setAddressInput(addr);
    renderLocStatus(sel);
  }

  function locateMe() {
    setLocating(true);
    getCurrentPosition()
      .then(async ({ lat, lng }) => {
        try {
          const addr = await reverseGeocode(lat, lng);
          useLocation(lat, lng, addr);
        } catch {
          useLocation(lat, lng, `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        }
      })
      .catch(() => {
        setLocMsg({
          kind: "error",
          text: "Location access denied. Please allow location access, or type your address below.",
        });
      })
      .finally(() => setLocating(false));
  }

  function onAddressType(text) {
    setAddressInput(text);
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    const q = text.trim();
    if (q.length < 3) return;
    geocodeTimer.current = setTimeout(async () => {
      setLocMsg({ kind: "muted", text: "Checking location…" });
      try {
        const result = await forwardGeocode(q);
        if (!result) {
          setSelection(null);
          setLocMsg({
            kind: "error",
            text: "Couldn't find that address. Try being more specific, or use Locate Me.",
          });
          return;
        }
        useLocation(result.lat, result.lng, text.trim() || result.address);
      } catch {
        setLocMsg({
          kind: "error",
          text: "Couldn't check that address right now. Please try again.",
        });
      }
    }, 900);
  }

  function confirmAddress() {
    if (!selection) return;
    setPendingAddress({ ...selection });
    setAddress(selection.address);
    setView("details");
  }

  async function saveDetails() {
    if (saving) return;
    setFieldErrors({});
    const errs = {};
    const eName = validateFullName(fullName.trim());
    if (eName) errs.fullName = eName;
    const ePhone = validatePhone(phone.trim());
    if (ePhone) errs.phone = ePhone;
    if (altPhone.trim()) {
      const eAlt = validatePhone(altPhone.trim());
      if (eAlt) errs.altPhone = "Please enter a valid alternative number.";
    }
    let eEmail = null;
    if (!email.trim()) eEmail = "Please enter your email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      eEmail = "Please enter a valid email address.";
    if (eEmail) errs.email = eEmail;
    if (!address.trim()) errs.address = "Please set your address first.";

    const list = Object.values(errs);
    if (list.length) {
      setFieldErrors(errs);
      const anyEmpty = !fullName.trim() || !phone.trim() || !email.trim() || !address.trim();
      toast(
        anyEmpty
          ? "Please fill in all the fields — only the alternative phone is optional."
          : list[0],
        "error",
      );
      return;
    }

    const emailChanged =
      email.trim().toLowerCase() !== (profile.email || "").toLowerCase();

    setSaving(true);
    const { error } = await updateProfile(profile.id, {
      full_name: fullName.trim(),
      phone: phone.trim(),
      alt_phone: altPhone.trim() || null,
      address: address.trim(),
    });
    if (error) {
      setSaving(false);
      toast(error, "error");
      return;
    }
    await refreshProfile();

    if (pendingAddress) await saveLocation(pendingAddress);

    if (emailChanged) {
      const res = await requestEmailChange(email.trim());
      setSaving(false);
      if (res.error) {
        toast(res.error, "error");
        return;
      }
      setNewEmail(res.data.email);
      setOtp("");
      setView("verify");
      return;
    }

    setSaving(false);
    onClose();
    toast("Your details have been saved.", "success");
  }

  async function verifyCode() {
    const code = otp.trim();
    if (!/^\d{6}$/.test(code)) {
      toast("Please enter the 6-digit code from your new email.", "error");
      return;
    }
    setVerifying(true);
    const { error } = await verifyEmailChange({ email: newEmail, token: code });
    setVerifying(false);
    if (error) {
      toast(error, "error");
      return;
    }
    await refreshProfile();
    onClose();
    toast("Email updated — use your new email to log in from now on.", "success");
  }

  async function resendCode() {
    if (!newEmail || resending) return;
    setResending(true);
    const { error } = await requestEmailChange(newEmail);
    setResending(false);
    toast(
      error || "A new code has been sent to your new email.",
      error ? "error" : "success",
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {view === "details" ? (
              <>
                <Text style={styles.modalTitle}>Edit Details</Text>
                <Field label="Full Name" error={fieldErrors.fullName}>
                  <Input value={fullName} onChangeText={setFullName} autoCorrect={false} />
                </Field>
                <Field label="Phone" error={fieldErrors.phone}>
                  <Input
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    autoCorrect={false}
                  />
                </Field>
                <Field label="Alternative Phone (optional)" error={fieldErrors.altPhone}>
                  <Input
                    value={altPhone}
                    onChangeText={setAltPhone}
                    keyboardType="phone-pad"
                    autoCorrect={false}
                  />
                </Field>
                <Field
                  label="Email"
                  error={fieldErrors.email}
                >
                  <Input
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </Field>
                <Text style={styles.hint}>
                  Changing your email requires verification — we'll send a
                  6-digit code to the new address.
                </Text>
                <Field label="Address" error={fieldErrors.address}>
                  <View style={styles.addressRow}>
                    <Input
                      style={styles.addressInput}
                      value={address}
                      editable={false}
                      placeholder="No address saved yet — tap Edit"
                    />
                    <Button
                      title="📍 Edit"
                      variant="ghost"
                      small
                      onPress={openAddressView}
                    />
                  </View>
                </Field>
                <Text style={[styles.hint, { marginBottom: 12 }]}>
                  Your saved delivery address. Tap Edit to set it on the map.
                </Text>
                <View style={styles.modalActions}>
                  <Button title="Cancel" variant="ghost" onPress={onClose} style={styles.flex1} />
                  <Button
                    title="Save Changes"
                    onPress={saveDetails}
                    loading={saving}
                    loadingText="Saving…"
                    style={styles.flex1}
                  />
                </View>
              </>
            ) : view === "address" ? (
              <>
                <Button
                  title="← Back"
                  variant="ghost"
                  small
                  onPress={backFromAddress}
                  style={styles.backBtn}
                />
                <Text style={styles.modalTitle}>Edit Address</Text>
                <Text style={styles.modalIntro}>
                  Set your delivery location — locate it automatically or type
                  it manually. Free delivery within 3 km, we deliver up to 5 km.
                </Text>
                <View style={styles.mapFallback}>
                  <Text style={styles.mapFallbackText}>
                    Map preview unavailable — you can still set your location
                    below.
                  </Text>
                </View>
                <Field label="Type Your Address">
                  <Input
                    value={addressInput}
                    onChangeText={onAddressType}
                    placeholder="House / street / area — e.g. Bhimber Road, Gujrat"
                    autoCorrect={false}
                  />
                </Field>
                <Button
                  title="📍 Locate Me"
                  variant="ghost"
                  loading={locating}
                  loadingText="Locating…"
                  onPress={locateMe}
                  style={styles.locateBtn}
                />
                <Text
                  style={[
                    styles.locStatus,
                    locMsg.kind === "ok" && { color: COLORS.success },
                    locMsg.kind === "error" && { color: COLORS.danger },
                  ]}
                >
                  {locMsg.text}
                </Text>
                <View style={styles.modalActions}>
                  <Button
                    title="Cancel"
                    variant="ghost"
                    onPress={backFromAddress}
                    style={styles.flex1}
                  />
                  <Button
                    title="Confirm Address"
                    onPress={confirmAddress}
                    disabled={!selection}
                    style={styles.flex1}
                  />
                </View>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>Verify Your New Email</Text>
                <Text style={styles.modalIntro}>
                  We've sent a 6-digit code to{" "}
                  <Text style={styles.strong}>{newEmail}</Text>. Enter it below
                  to finish changing your email.
                </Text>
                <Field label="Verification Code">
                  <Input
                    value={otp}
                    onChangeText={(t) => setOtp(t.replace(/[^0-9]/g, "").slice(0, 6))}
                    keyboardType="number-pad"
                    maxLength={6}
                    placeholder="123456"
                  />
                </Field>
                <View style={styles.modalActions}>
                  <Button
                    title="Later"
                    variant="ghost"
                    onPress={async () => {
                      onClose();
                      toast(
                        "Email not verified yet — your current email stays active. You can finish this anytime from Edit Details.",
                        "info",
                      );
                    }}
                    style={styles.flex1}
                  />
                  <Button
                    title="Resend"
                    variant="ghost"
                    onPress={resendCode}
                    loading={resending}
                    loadingText="Sending…"
                    style={styles.flex1}
                  />
                  <Button
                    title="Verify & Finish"
                    onPress={verifyCode}
                    loading={verifying}
                    loadingText="Verifying…"
                    style={styles.flex1}
                  />
                </View>
                <Text style={[styles.hint, { marginTop: 12 }]}>
                  Your current email stays active until the new one is verified.
                </Text>
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.cream },
  inner: { padding: SPACING.gutter, paddingBottom: 40, gap: 14 },
  h1: {
    fontSize: SIZES.h1,
    fontFamily: FONTS.display,
    color: COLORS.ink,
    marginBottom: 4,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: SPACING.md,
    ...shadowCard,
  },
  flex1: { flex: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 22,
    fontFamily: FONTS.displayXBold,
    color: COLORS.black,
  },
  headerName: {
    fontSize: 17,
    fontFamily: FONTS.bodyBold,
    color: COLORS.ink,
  },
  headerSince: {
    fontSize: 13,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    marginTop: 2,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 10,
  },
  h3: {
    fontSize: SIZES.h3,
    fontFamily: FONTS.display,
    color: COLORS.ink,
  },
  pfRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  pfRowLabel: {
    fontSize: 14.5,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    flexShrink: 0,
  },
  pfRowValue: {
    fontSize: 14.5,
    fontFamily: FONTS.bodySemi,
    color: COLORS.ink,
    textAlign: "right",
    flexShrink: 1,
  },
  ordersLink: { flexDirection: "row", alignItems: "center", gap: 14 },
  ordersIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: COLORS.warnBg,
    alignItems: "center",
    justifyContent: "center",
  },
  ordersTitle: {
    fontSize: 15,
    fontFamily: FONTS.bodyBold,
    color: COLORS.ink,
  },
  ordersSub: {
    fontSize: 13,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    marginTop: 2,
  },
  chevron: { fontSize: 18, color: COLORS.inkSoft },
  helpText: {
    fontSize: 13.5,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    lineHeight: 20,
    marginTop: 4,
    marginBottom: 8,
  },
  contactLine: {
    fontSize: 14,
    fontFamily: FONTS.body,
    color: COLORS.ink,
    marginBottom: 4,
  },
  logoutBtn: {
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    marginTop: 4,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyIcon: { fontSize: 42, marginBottom: 12 },
  emptyTitle: {
    fontSize: SIZES.h3,
    fontFamily: FONTS.display,
    color: COLORS.ink,
    textAlign: "center",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13.5,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 320,
  },

  // modal
  overlay: {
    flex: 1,
    backgroundColor: "rgba(12, 11, 10, 0.5)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    maxHeight: "88%",
    padding: SPACING.lg,
  },
  modalTitle: {
    fontSize: SIZES.h3,
    fontFamily: FONTS.display,
    color: COLORS.ink,
    marginBottom: 12,
  },
  modalIntro: {
    fontSize: 14,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    lineHeight: 20,
    marginBottom: 12,
  },
  strong: { fontFamily: FONTS.bodyBold, color: COLORS.ink },
  hint: {
    fontSize: 12,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    marginTop: -6,
    marginBottom: 10,
  },
  addressRow: { flexDirection: "row", gap: 8, alignItems: "stretch" },
  addressInput: { flex: 1, backgroundColor: "#f8f5ee", color: COLORS.ink },
  backBtn: {
    alignSelf: "flex-start",
    marginBottom: 8,
    borderWidth: 0,
    paddingHorizontal: 0,
  },
  mapFallback: {
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.cream,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 16,
    alignItems: "center",
    marginVertical: 6,
  },
  mapFallbackText: {
    fontSize: 13,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    textAlign: "center",
  },
  locateBtn: { marginBottom: 6 },
  locStatus: {
    fontSize: 13,
    fontFamily: FONTS.bodyMed,
    color: COLORS.inkSoft,
    marginTop: 4,
    marginBottom: 12,
    lineHeight: 19,
  },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
});
