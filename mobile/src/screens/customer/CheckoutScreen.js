// src/screens/customer/CheckoutScreen.js
//
// Port of customer/checkout.html + js/checkout.js — the 3-step checkout:
// 1) order type  2) details + payment (COD / EasyPaisa screenshot)
// 3) confirmation. Delivery charge bands are computed here for the on-screen
// review only — the server recomputes authoritative pricing in create_order().

import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../../state/auth";
import {
  clear,
  getState as getCartState,
  toOrderPayload,
  useCart,
} from "../../state/cart";
import { getCatalog, loadCatalog } from "../../state/catalog";
import { deliveryCheck, getStoredLocation } from "../../state/location";
import { createOrder, settingsGet, uploadPaymentScreenshot } from "../../lib/db";
import {
  pkr,
  validateEmail,
  validateFullName,
  validatePhone,
} from "../../lib/format";
import { Button, Card, Field, Input, Screen } from "../../ui/components";
import { toast } from "../../ui/toast";
import { COLORS, FONTS, RADIUS, SIZES, SPACING } from "../../theme";

const STEPS = ["1. Order Type", "2. Details & Payment", "3. Confirmation"];

// Session-scoped confirmation state (the web keeps this in sessionStorage
// as "lcp_last_order"): lets a return to this screen with an empty bucket
// re-show the order number instead of bouncing back to the bucket page.
let lastOrder = null;

export default function CheckoutScreen() {
  const navigation = useNavigation();
  const { profile, isAdmin } = useAuth();
  const cart = useCart();

  const [gated, setGated] = useState(true);
  const [step, setStep] = useState(1);
  const [orderType, setOrderType] = useState(null);
  const [deliveryChargeSetting, setDeliveryChargeSetting] = useState(250);
  const [storedLocation, setStoredLocation] = useState(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [altPhone, setAltPhone] = useState("");
  const [address, setAddress] = useState("");
  const [instructions, setInstructions] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const [paymentMethod, setPaymentMethod] = useState("cod");
  const [epAccountNumber, setEpAccountNumber] = useState("—");
  const [epAccountName, setEpAccountName] = useState("—");
  const [screenshot, setScreenshot] = useState(null);
  const [screenshotPath, setScreenshotPath] = useState(null);
  const [screenshotState, setScreenshotState] = useState("idle"); // idle|uploading|done

  const [ack, setAck] = useState(false);
  const [placing, setPlacing] = useState(false);

  const locCheck = useMemo(
    () => (storedLocation ? deliveryCheck(storedLocation.lat, storedLocation.lng) : null),
    [storedLocation],
  );
  const deliveryIsFree = !!(locCheck && locCheck.band === "free");
  const deliveryCharge =
    orderType === "delivery" ? (deliveryIsFree ? 0 : deliveryChargeSetting) : 0;

  useEffect(() => {
    (async () => {
      // Admin accounts can't place customer orders — blocks "Restaurant
      // Admin" test orders from ever appearing in the admin panel again.
      if (isAdmin) {
        toast(
          "You are logged in as Restaurant Admin — customer checkout is disabled for admin accounts. Please log out to order as a customer.",
          "error",
        );
        navigation.replace("Tabs");
        return;
      }

      // Refresh-restore: the order was just placed (bucket now empty) —
      // show the confirmation again instead of losing the order number.
      const cur = getCartState();
      if (
        lastOrder &&
        cur.itemCount === 0 &&
        Date.now() - lastOrder._savedAt < 10 * 60 * 1000
      ) {
        setStep(3);
        setGated(false);
        return;
      }
      lastOrder = null;

      // Must happen BEFORE resolving cart items against the catalog, or
      // everything looks "missing" while the catalog is still loading.
      await loadCatalog();
      if (getCatalog().lastError) {
        toast(
          "Unable to verify availability due to a connection issue. Please check your connection or contact the restaurant.",
          "error",
        );
        navigation.replace("Bucket");
        return;
      }
      if (cur.items.length === 0 && cur.deals.length === 0) {
        toast("Your bucket is empty. Add something tasty first!", "error");
        navigation.replace("Bucket");
        return;
      }
      if (cur.hasIssue) {
        toast(
          "Please remove unavailable items from your bucket before checking out.",
          "error",
        );
        navigation.replace("Bucket");
        return;
      }

      const [charge, loc] = await Promise.all([
        settingsGet("delivery_charge"),
        getStoredLocation(),
      ]);
      if (charge != null) setDeliveryChargeSetting(Number(charge) || 250);
      setStoredLocation(loc);
      setGated(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function prefillDetails() {
    setName(profile?.full_name || "");
    setPhone(profile?.phone || "");
    setEmail(profile?.email || "");
    if (orderType === "delivery") {
      setAddress(
        storedLocation ? storedLocation.address : profile?.address || "",
      );
    } else {
      setAddress(profile?.address || (storedLocation ? storedLocation.address : ""));
    }
    setFieldErrors({});
  }

  function continueStep1() {
    if (!orderType) return;
    if (orderType === "delivery" && !storedLocation) {
      toast("Please select your delivery location again first.", "error");
      setTimeout(() => navigation.navigate("Tabs"), 1200);
      return;
    }
    prefillDetails();
    setStep(2);
  }

  async function selectPayment(method) {
    setPaymentMethod(method);
    if (method === "easypaisa" && epAccountNumber === "—") {
      const [num, nm] = await Promise.all([
        settingsGet("easypaisa_account_number"),
        settingsGet("easypaisa_account_name"),
      ]);
      setEpAccountNumber(num || "Not configured");
      setEpAccountName(nm || "Not configured");
    }
  }

  async function pickScreenshot() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast("Allow photo access to upload your payment screenshot.", "error");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
    });
    if (result.canceled) return;
    const asset = result.assets[0];

    setScreenshot(null);
    setScreenshotPath(null);
    setScreenshotState("idle");
    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
      toast("Screenshot must be 5MB or smaller.", "error");
      return;
    }
    setScreenshot(asset);
    setScreenshotState("uploading");
    const { data, error } = await uploadPaymentScreenshot(asset);
    if (error) {
      toast(error, "error");
      setScreenshot(null);
      setScreenshotState("idle");
      return;
    }
    setScreenshotPath(data.path);
    setScreenshotState("done");
  }

  function validate() {
    const errs = [];
    const fe = {};

    const eName = validateFullName(name);
    if (eName) {
      errs.push(eName);
      fe.name = eName;
    }
    const eEmail = !email.trim()
      ? "Please enter your email address."
      : validateEmail(email);
    if (eEmail) {
      errs.push(eEmail);
      fe.email = eEmail;
    }
    const ePhone = validatePhone(phone);
    if (ePhone) {
      errs.push(ePhone);
      fe.phone = ePhone;
    }
    const eAlt = altPhone ? validatePhone(altPhone) : null;
    if (eAlt) {
      const msg = "Alternative " + eAlt.charAt(0).toLowerCase() + eAlt.slice(1);
      errs.push(msg);
      fe.altPhone = msg;
    }
    const eAddress = !address.trim()
      ? orderType === "delivery"
        ? "Please enter your full delivery address."
        : "Please enter your address."
      : orderType === "delivery" && address.trim().length < 5
        ? "Please enter your full delivery address."
        : null;
    if (eAddress) {
      errs.push(eAddress);
      fe.address = eAddress;
    }
    if (orderType === "delivery" && !storedLocation)
      errs.push("Please select your delivery location again from the home page.");
    if (!ack) errs.push("Please confirm you understand the cancellation policy.");
    if (paymentMethod === "easypaisa" && !screenshotPath)
      errs.push("Please upload your EasyPaisa payment screenshot.");

    setFieldErrors(fe);
    return errs;
  }

  async function placeOrder() {
    if (placing) return;
    const errs = validate();
    const anyEmpty =
      !name.trim() || !email.trim() || !phone.trim() || !address.trim();
    if (errs.length) {
      toast(
        anyEmpty
          ? "Please fill in all the fields — only the alternative number and special instructions are optional."
          : errs[0],
        "error",
      );
      return;
    }

    setPlacing(true);
    const payload = {
      ...toOrderPayload(),
      customer_name: name.trim(),
      customer_email: email.trim() || null,
      customer_phone: phone.trim(),
      alt_contact_phone: altPhone.trim() || null,
      order_type: orderType,
      delivery_address: orderType === "delivery" ? address.trim() : null,
      delivery_lat:
        orderType === "delivery" && storedLocation ? storedLocation.lat : null,
      delivery_lng:
        orderType === "delivery" && storedLocation ? storedLocation.lng : null,
      special_instructions: instructions.trim() || null,
      payment_method: paymentMethod,
      payment_screenshot_path:
        paymentMethod === "easypaisa" ? screenshotPath : null,
      cancellation_acknowledged: ack,
    };
    const { data, error } = await createOrder(payload);
    setPlacing(false);
    if (error) {
      toast(error, "error");
      return;
    }
    clear();
    lastOrder = { ...data, _savedAt: Date.now() };
    setStep(3);
  }

  if (gated) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.gate}>
          <ActivityIndicator color={COLORS.red} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const restored = step === 3 ? lastOrder : null;
  const etaText =
    restored?.order_type === "delivery"
      ? "Estimated delivery: up to 40 minutes."
      : restored?.order_type === "takeaway"
        ? "Estimated preparation: up to 20 minutes."
        : "Please proceed to your table — our staff will assist you.";

  return (
    <SafeAreaView style={styles.safe}>
      <Screen>
        {restored ? (
          <SuccessPanel
            order={restored}
            etaText={etaText}
            signedIn={!!profile}
            onViewOrders={() => navigation.navigate("Tabs", { screen: "Orders" })}
            onContinue={() => navigation.navigate("Tabs")}
          />
        ) : (
          <>
            <Text style={styles.h1}>Checkout</Text>

            <View style={styles.stepsRow}>
              {STEPS.map((label, i) => (
                <Text
                  key={label}
                  style={[
                    styles.step,
                    i === step - 1 && styles.stepActive,
                    i < step - 1 && styles.stepDone,
                  ]}
                >
                  {label}
                </Text>
              ))}
            </View>

            {step === 1 ? (
              <>
                {ORDER_TYPE_CARDS(deliveryChargeSetting).map((t) => (
                  <OrderTypeCard
                    key={t.id}
                    item={t}
                    selected={orderType === t.id}
                    onPress={() => setOrderType(t.id)}
                  />
                ))}
                <Button
                  title="Continue"
                  onPress={continueStep1}
                  disabled={!orderType}
                  style={{ marginTop: SPACING.xl }}
                />
              </>
            ) : (
              <>
                <Card>
                  <Text style={styles.h3}>Your Details</Text>
                  <Field label="Name" error={fieldErrors.name}>
                    <Input
                      value={name}
                      onChangeText={setName}
                      autoCapitalize="words"
                    />
                  </Field>
                  <Field label="Email" error={fieldErrors.email}>
                    <Input
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </Field>
                  <Field label="Contact Number" error={fieldErrors.phone}>
                    <Input
                      value={phone}
                      onChangeText={setPhone}
                      keyboardType="phone-pad"
                    />
                  </Field>
                  <Field
                    label="Alternative Contact Number (optional)"
                    error={fieldErrors.altPhone}
                  >
                    <Input
                      value={altPhone}
                      onChangeText={setAltPhone}
                      keyboardType="phone-pad"
                    />
                  </Field>

                  {orderType === "delivery" ? (
                    <Field label="Delivery Address" error={fieldErrors.address}>
                      <Input
                        value={address}
                        onChangeText={setAddress}
                        multiline
                        maxLength={400}
                        placeholder="House / street / mohalla / landmark"
                        style={styles.textarea}
                      />
                      <Text style={styles.hint}>
                        Pre-filled from the location you selected earlier — edit
                        if needed.
                      </Text>
                    </Field>
                  ) : (
                    <Field label="Address" error={fieldErrors.address}>
                      <Input
                        value={address}
                        onChangeText={setAddress}
                        maxLength={400}
                      />
                    </Field>
                  )}

                  <Field label="Special Instructions (optional)">
                    <Input
                      value={instructions}
                      onChangeText={setInstructions}
                      multiline
                      maxLength={300}
                      placeholder="e.g. less spicy, ring the bell twice…"
                      style={styles.textarea}
                    />
                  </Field>

                  <View style={styles.hr} />
                  <Text style={styles.h3}>Payment Method</Text>
                  <View style={styles.paymentGrid}>
                    <PaymentCard
                      icon={<Text style={styles.payIcon}>💵</Text>}
                      label="Cash on Delivery"
                      selected={paymentMethod === "cod"}
                      onPress={() => selectPayment("cod")}
                    />
                    <PaymentCard
                      icon={
                        <View style={styles.epBadge}>
                          <Text style={styles.epBadgeText}>e</Text>
                        </View>
                      }
                      label="EasyPaisa"
                      selected={paymentMethod === "easypaisa"}
                      onPress={() => selectPayment("easypaisa")}
                    />
                  </View>

                  {paymentMethod === "easypaisa" ? (
                    <View style={styles.epBox}>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Account Number</Text>
                        <Text style={styles.summaryValue}>
                          {epAccountNumber}
                        </Text>
                      </View>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Account Name</Text>
                        <Text style={styles.summaryValue}>{epAccountName}</Text>
                      </View>
                      <Text style={styles.epCopy}>
                        Send payment first, then take a screenshot and upload
                        your payment screenshot here.
                      </Text>
                      <Field label="Payment Screenshot">
                        <Button
                          title={
                            screenshotState === "done"
                              ? "Choose Another Screenshot"
                              : "Choose Screenshot"
                          }
                          variant="ghost"
                          small
                          onPress={pickScreenshot}
                        />
                        {screenshotState === "idle" ? null : (
                          <Text
                            style={
                              screenshotState === "done"
                                ? styles.upOk
                                : styles.upBusy
                            }
                          >
                            {screenshotState === "uploading"
                              ? "Uploading screenshot…"
                              : "✓ Screenshot uploaded"}
                          </Text>
                        )}
                      </Field>
                      <Text style={styles.hint}>
                        Image files only, max 5MB.
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.hr} />
                  <Text style={styles.h3}>Review Your Order</Text>
                  {[...cart.items, ...cart.deals].map((l) => (
                    <View
                      key={
                        l.product_id
                          ? l.product_id +
                            "::" +
                            (l.size || "") +
                            "::" +
                            (l.option || "")
                          : "deal-" + l.deal_id
                      }
                      style={styles.summaryRow}
                    >
                      <Text style={styles.summaryLine}>
                        {l.name} × {l.qty}
                      </Text>
                      <Text style={styles.summaryValue}>
                        {pkr(l.line_total)}
                      </Text>
                    </View>
                  ))}
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Subtotal</Text>
                    <Text style={styles.summaryValue}>
                      {pkr(cart.subtotal)}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Delivery Charges</Text>
                    <Text style={styles.summaryValue}>
                      {orderType !== "delivery"
                        ? "—"
                        : deliveryIsFree
                          ? "Free ✓ (within 3km)"
                          : `Rs. ${deliveryCharge}`}
                    </Text>
                  </View>
                  <View style={[styles.summaryRow, styles.totalRow]}>
                    <Text style={styles.totalLabel}>Total</Text>
                    <Text style={styles.totalValue}>
                      {pkr(cart.subtotal + deliveryCharge)}
                    </Text>
                  </View>

                  <View style={styles.notice}>
                    <Text style={styles.noticeText}>
                      {orderType === "delivery"
                        ? "Important: Orders cannot be cancelled after they are placed. Estimated delivery time is up to 40 minutes for delivery orders."
                        : orderType === "takeaway"
                          ? "Important: Orders cannot be cancelled after they are placed. Estimated preparation time is up to 20 minutes."
                          : "Important: Orders cannot be cancelled after they are placed."}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => setAck(!ack)}
                    style={styles.ackRow}
                  >
                    <View
                      style={[styles.checkbox, ack && styles.checkboxOn]}
                    >
                      {ack ? (
                        <Text style={styles.checkMark}>✓</Text>
                      ) : null}
                    </View>
                    <Text style={styles.ackText}>
                      I understand that this order cannot be cancelled after
                      placement.
                    </Text>
                  </Pressable>

                  <View style={styles.buttonRow}>
                    <Button
                      title="Back"
                      variant="ghost"
                      onPress={() => setStep(1)}
                    />
                    <Button
                      title="Place Order"
                      onPress={placeOrder}
                      loading={placing}
                      loadingText="Placing order…"
                      disabled={!(ack && (paymentMethod === "cod" || screenshotPath))}
                      style={{ flex: 1 }}
                    />
                  </View>
                </Card>
              </>
            )}
          </>
        )}
      </Screen>
    </SafeAreaView>
  );
}

function ORDER_TYPE_CARDS(deliveryCharge) {
  return [
    {
      id: "delivery",
      icon: "🚚",
      name: "Delivery",
      desc: `Up to 40 minutes · Free delivery within 3km · Rs. ${deliveryCharge} beyond 3km (within 5km)`,
    },
    { id: "takeaway", icon: "🥡", name: "Takeaway", desc: "Ready in up to 20 minutes" },
    { id: "dine-in", icon: "🍽️", name: "Dine-In", desc: "No table booking needed" },
  ];
}

// Web draws the selection halo as a 3px rgba ring around the card — RN
// gets the same look with a tinted wrapper behind a slightly smaller card.
function OrderTypeCard({ item, selected, onPress }) {
  return (
    <Pressable onPress={onPress} style={{ marginBottom: SPACING.md }}>
      <View
        style={[
          styles.otRing,
          selected && { backgroundColor: "rgba(226, 34, 42, 0.12)" },
        ]}
      >
        <View
          style={[
            styles.otCard,
            selected && { borderColor: COLORS.red },
          ]}
        >
          <Text style={styles.otIcon}>{item.icon}</Text>
          <Text style={styles.otName}>{item.name}</Text>
          <Text style={styles.otDesc}>{item.desc}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function PaymentCard({ icon, label, selected, onPress }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      <View
        style={[
          styles.otRing,
          selected && { backgroundColor: "rgba(226, 34, 42, 0.12)" },
        ]}
      >
        <View
          style={[styles.payCard, selected && { borderColor: COLORS.red }]}
        >
          {icon}
          <Text style={styles.payLabel}>{label}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function SuccessPanel({ order, etaText, signedIn, onViewOrders, onContinue }) {
  const verifying = order.status === "payment_verification";
  return (
    <View style={styles.successWrap}>
      <View
        style={[
          styles.successCheck,
          verifying && { backgroundColor: COLORS.warnBg },
        ]}
      >
        <Text
          style={[
            styles.successCheckText,
            verifying && { color: COLORS.warn },
          ]}
        >
          {verifying ? "⏳" : "✓"}
        </Text>
      </View>
      <Text style={styles.successTitle}>
        {verifying ? "Payment Submitted" : "Order Placed Successfully!"}
      </Text>
      <Text style={styles.successP}>Order Number</Text>
      <Text style={styles.successNum}>{order.order_number}</Text>
      <Text style={styles.successMeta}>
        {verifying
          ? `Your payment is being verified. ${order.order_type.toUpperCase()} · Rs. ${order.total}`
          : `${order.order_type.toUpperCase()} · Rs. ${order.total} · ${etaText}`}
      </Text>
      <Text style={styles.successNote}>
        {verifying
          ? "Please wait for payment verification. Verification usually takes about 2 minutes. Your order cannot be cancelled after placement."
          : "Your order cannot be cancelled after placement."}
      </Text>
      <View style={styles.successButtons}>
        {signedIn ? (
          <Button title="View My Orders" onPress={onViewOrders} />
        ) : (
          <Button title="Continue Browsing" variant="ghost" onPress={onContinue} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.cream },
  gate: { flex: 1, alignItems: "center", justifyContent: "center" },

  h1: {
    fontSize: SIZES.h1,
    fontFamily: FONTS.display,
    color: COLORS.ink,
    marginBottom: 14,
  },
  h3: {
    fontSize: SIZES.h3,
    fontFamily: FONTS.display,
    color: COLORS.ink,
    marginBottom: SPACING.md,
  },

  stepsRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginBottom: 18,
  },
  step: {
    flex: 1,
    textAlign: "center",
    fontSize: 10.5,
    fontFamily: FONTS.bodyBold,
    color: COLORS.inkSoft,
    paddingBottom: 8,
    borderBottomWidth: 3,
    borderBottomColor: COLORS.line,
  },
  stepActive: { color: COLORS.red, borderBottomColor: COLORS.red },
  stepDone: { color: COLORS.success, borderBottomColor: COLORS.success },

  // otRing / otCard (order-type + payment cards)
  otRing: {
    borderRadius: RADIUS.md + 3,
    padding: 3,
  },
  otCard: {
    borderWidth: 1.5,
    borderColor: COLORS.line,
    borderRadius: RADIUS.md,
    padding: 14,
    alignItems: "center",
    backgroundColor: COLORS.white,
  },
  otIcon: { fontSize: 22, marginBottom: 4 },
  otName: {
    fontSize: SIZES.body,
    fontFamily: FONTS.bodyBold,
    color: COLORS.ink,
  },
  otDesc: {
    fontSize: SIZES.small,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    marginTop: 4,
    textAlign: "center",
    lineHeight: 17,
  },

  paymentGrid: {
    flexDirection: "row",
    gap: 12,
    marginVertical: 14,
  },
  payCard: {
    borderWidth: 1.5,
    borderColor: COLORS.line,
    borderRadius: RADIUS.md,
    padding: 12,
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.white,
  },
  payIcon: { fontSize: 22 },
  payLabel: {
    fontSize: 13,
    fontFamily: FONTS.bodySemi,
    color: COLORS.ink,
    textAlign: "center",
  },
  epBadge: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: "#00a651",
    alignItems: "center",
    justifyContent: "center",
  },
  epBadgeText: {
    color: COLORS.white,
    fontSize: 17,
    fontFamily: FONTS.bodyBold,
    marginTop: -2,
  },

  epBox: {
    backgroundColor: "#faf7f0",
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.md,
    padding: 14,
    marginVertical: 14,
  },
  epCopy: {
    fontSize: SIZES.small,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    marginTop: 10,
    marginBottom: SPACING.md,
    lineHeight: 17,
  },
  upOk: {
    fontSize: SIZES.small,
    fontFamily: FONTS.bodySemi,
    color: COLORS.success,
    marginTop: 8,
  },
  upBusy: {
    fontSize: SIZES.small,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    marginTop: 8,
  },
  hint: {
    fontSize: SIZES.tiny,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    marginTop: -6,
  },

  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: SPACING.md,
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14.5,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
  },
  summaryLine: {
    fontSize: 14.5,
    fontFamily: FONTS.body,
    color: COLORS.ink,
    flexShrink: 1,
  },
  summaryValue: {
    fontSize: 14.5,
    fontFamily: FONTS.bodyBold,
    color: COLORS.ink,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    paddingTop: 8,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 19,
    fontFamily: FONTS.bodyBold,
    color: COLORS.ink,
  },
  totalValue: {
    fontSize: 19,
    fontFamily: FONTS.bodyBold,
    color: COLORS.ink,
  },

  notice: {
    backgroundColor: COLORS.warnBg,
    borderWidth: 1,
    borderColor: "#f0dcae",
    borderRadius: RADIUS.md,
    padding: 14,
    marginVertical: 14,
  },
  noticeText: {
    fontSize: 12.5,
    fontFamily: FONTS.body,
    color: "#8a5c0c",
    lineHeight: 18,
  },

  ackRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: SPACING.lg,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  checkMark: { color: COLORS.white, fontSize: 13, fontWeight: "700" },
  ackText: {
    flex: 1,
    fontSize: SIZES.body,
    fontFamily: FONTS.body,
    color: COLORS.ink,
    lineHeight: 20,
  },

  buttonRow: {
    flexDirection: "row",
    gap: SPACING.md,
  },

  hr: {
    height: 1,
    backgroundColor: COLORS.line,
    marginVertical: SPACING.lg,
  },

  textarea: {
    minHeight: 90,
    textAlignVertical: "top",
    paddingTop: 12,
  },

  successWrap: { alignItems: "center", paddingTop: 30 },
  successCheck: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.successBg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  successCheckText: { fontSize: 28, color: COLORS.success },
  successTitle: {
    fontSize: SIZES.h2,
    fontFamily: FONTS.display,
    color: COLORS.ink,
    marginBottom: 6,
    textAlign: "center",
  },
  successP: {
    fontSize: SIZES.body,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    marginTop: 6,
  },
  successNum: {
    fontSize: 24,
    fontFamily: FONTS.displayXBold,
    color: COLORS.red,
    marginVertical: 8,
  },
  successMeta: {
    fontSize: SIZES.body,
    fontFamily: FONTS.bodyMed,
    color: COLORS.ink,
    textAlign: "center",
    lineHeight: 20,
  },
  successNote: {
    fontSize: 12.5,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 18,
  },
  successButtons: {
    flexDirection: "row",
    gap: SPACING.md,
    justifyContent: "center",
    marginTop: 20,
  },
});
