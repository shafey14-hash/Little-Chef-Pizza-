// src/lib/db.js
//
// Port of the js/db.js pieces the customer flow needs: site settings,
// create_order RPC (identical 14-param contract), the EasyPaisa
// payment-screenshot upload to the private "payment-screenshots" bucket,
// order listing/track + realtime subscription, profile updates and the
// verified email-change endpoints.

import { supabase } from "./supabase";
import { apiPostAuthed } from "./api";

function friendlyDbError(error) {
  if (error?.code === "23505") return "That value is already in use.";
  if (error?.code === "42501") return "You don't have permission to do that.";
  // P0001 = a deliberate RAISE EXCEPTION from one of our own functions —
  // always human-readable, show it directly.
  if (error?.code === "P0001" && error?.message) return error.message;
  return "Something went wrong. Please try again.";
}

export async function settingsGet(key) {
  const { data, error } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", key)
    .single();
  return error ? null : data.value;
}

export async function createOrder(payload) {
  const { data, error } = await supabase.rpc("create_order", {
    p_items: payload.items || [],
    p_deals: payload.deals || [],
    p_customer_name: payload.customer_name,
    p_customer_phone: payload.customer_phone,
    p_alt_contact_phone: payload.alt_contact_phone || null,
    p_customer_email: payload.customer_email || null,
    p_order_type: payload.order_type,
    p_delivery_address: payload.delivery_address,
    p_delivery_lat: payload.delivery_lat ?? null,
    p_delivery_lng: payload.delivery_lng ?? null,
    p_special_instructions: payload.special_instructions || null,
    p_payment_method: payload.payment_method,
    p_payment_screenshot_path: payload.payment_screenshot_path || null,
    p_cancellation_acknowledged: payload.cancellation_acknowledged,
  });
  if (error)
    return {
      error:
        error.message?.replace(/^.*ERROR:\s*/i, "") || friendlyDbError(error),
    };
  return { data };
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * EasyPaisa payment screenshots go to a SEPARATE, private bucket —
 * the returned path is stored on the order; admin views it later via a
 * signed URL. asset: { uri, mimeType, fileName, fileSize } from
 * expo-image-picker.
 */
export async function uploadPaymentScreenshot(asset) {
  if (!asset.mimeType?.startsWith("image/"))
    return { error: "Please upload an image (screenshot) file." };
  if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES)
    return { error: "Screenshot must be 5MB or smaller." };

  const ext =
    (asset.fileName?.split(".").pop() || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") ||
    asset.mimeType.split("/")[1] ||
    "jpg";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

  const arraybuffer = await fetch(asset.uri).then((res) => res.arrayBuffer());
  const { error } = await supabase.storage
    .from("payment-screenshots")
    .upload(path, arraybuffer, {
      contentType: asset.mimeType,
      cacheControl: "3600",
      upsert: false,
    });
  if (error) return { error: friendlyDbError(error) };
  return { data: { path } };
}

// -------------------------------------------------------------- orders

function normalize(rows) {
  // Postgres foreign-table names -> what the UI expects (matches web db.js).
  return (rows || []).map((r) => ({
    ...r,
    items: r.order_items || [],
    deals: r.order_deals || [],
  }));
}

export async function listForUser(userId) {
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*), order_deals(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return error
    ? { error: friendlyDbError(error), data: [] }
    : { data: normalize(data) };
}

export async function trackOrder(orderNumber) {
  const { data, error } = await supabase.rpc("track_order", {
    p_order_number: String(orderNumber).trim(),
  });
  if (error) return { error: friendlyDbError(error) };
  return { data };
}

/**
 * Live updates — calls onChange() whenever an order is created or its
 * status changes. Pass { userId: profile.id } for one customer's own
 * orders (My Orders); omit it to hear about every order RLS exposes
 * (admin screens). Returns an unsubscribe function — call it on unmount.
 */
export function subscribeToOrders(onChange, opts = {}) {
  const channelName = opts.userId
    ? `orders-user-${opts.userId}`
    : "orders-admin-" + Date.now();
  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "orders",
        ...(opts.userId ? { filter: `user_id=eq.${opts.userId}` } : {}),
      },
      () => onChange(),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// ------------------------------------------------------- admin: orders
// Port of LCP_DB.orders' admin surface (js/db.js). Every transition is a
// SECURITY DEFINER RPC enforced server-side (supabase/location_and_payments.sql)
// — it checks public.is_admin() and the current status itself; the buttons
// here are just UI.

export async function listAllOrders() {
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*), order_deals(*)")
    .order("created_at", { ascending: false });
  return error
    ? { error: friendlyDbError(error), data: [] }
    : { data: normalize(data) };
}

async function adminOrderRpc(fn, orderId) {
  const { data, error } = await supabase.rpc(fn, { p_order_id: orderId });
  return error ? { error: friendlyDbError(error) } : { data };
}

export const approvePayment = (orderId) => adminOrderRpc("approve_payment", orderId);
export const rejectPayment = (orderId) => adminOrderRpc("reject_payment", orderId);
export const confirmOrder = (orderId) => adminOrderRpc("confirm_order", orderId);
export const rejectOrder = (orderId) => adminOrderRpc("reject_order", orderId);
export const markOutForDelivery = (orderId) => adminOrderRpc("mark_out_for_delivery", orderId);
export const markDelivered = (orderId) => adminOrderRpc("mark_delivered", orderId);
export const cancelOrder = (orderId) => adminOrderRpc("cancel_order", orderId);
export const markFailedDelivery = (orderId) => adminOrderRpc("mark_failed_delivery", orderId);

/** Admin-only: short-lived signed URL for a payment screenshot (bucket is private). */
export async function getScreenshotUrl(path) {
  if (!path) return { data: null };
  const { data, error } = await supabase.storage
    .from("payment-screenshots")
    .createSignedUrl(path, 600);
  return error
    ? { error: friendlyDbError(error) }
    : { data: data.signedUrl };
}

// ------------------------------------------------------ admin: catalog
// Port of LCP_DB.catalog's admin surface. Products/deals created here land
// in the products/deals tables; hardcoded menu items are changed via
// overrides in menu_item_images. Callers refresh the shared cache with
// loadCatalog(true) afterwards.

export async function createProduct(product) {
  const { data, error } = await supabase
    .from("products")
    .insert(product)
    .select()
    .single();
  if (error) return { error: friendlyDbError(error) };
  return { data: { ...data, source: "admin" } };
}

export async function updateProduct(id, patch) {
  const { data, error } = await supabase
    .from("products")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) return { error: friendlyDbError(error) };
  return { data: { ...data, source: "admin" } };
}

export async function deleteProduct(id) {
  const { error } = await supabase.from("products").delete().eq("id", id);
  return error ? { error: friendlyDbError(error) } : { data: true };
}

export async function setPriceOverride(itemId, priceOrSizes) {
  const { data, error } = await supabase
    .from("menu_item_images")
    .upsert({
      item_id: itemId,
      price_override: priceOrSizes,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  return error ? { error: friendlyDbError(error) } : { data };
}

export async function setAvailabilityOverride(itemId, available) {
  const { data, error } = await supabase
    .from("menu_item_images")
    .upsert({
      item_id: itemId,
      available_override: available,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  return error ? { error: friendlyDbError(error) } : { data };
}

export async function createDeal(deal) {
  const { data, error } = await supabase
    .from("deals")
    .insert(deal)
    .select()
    .single();
  if (error) return { error: friendlyDbError(error) };
  return { data: { ...data, source: "admin" } };
}

export async function updateDeal(id, patch) {
  const { data, error } = await supabase
    .from("deals")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) return { error: friendlyDbError(error) };
  return { data: { ...data, source: "admin" } };
}

export async function deleteDeal(id) {
  const { error } = await supabase.from("deals").delete().eq("id", id);
  return error ? { error: friendlyDbError(error) } : { data: true };
}

export async function setMenuImage(itemId, imageUrl) {
  const { data, error } = await supabase
    .from("menu_item_images")
    .upsert({
      item_id: itemId,
      image_url: imageUrl,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  return error ? { error: friendlyDbError(error) } : { data };
}

export async function removeMenuImage(itemId) {
  const { error } = await supabase
    .from("menu_item_images")
    .delete()
    .eq("item_id", itemId);
  return error ? { error: friendlyDbError(error) } : { data: true };
}

// ------------------------------------------------------ admin: storage
// Menu photos go to the PUBLIC "menu-images" bucket (unlike payment
// screenshots). asset: { uri, mimeType, fileName, fileSize } from
// expo-image-picker. folder: "products" | "deals".

export async function uploadMenuImage(asset, folder) {
  if (!asset.mimeType?.startsWith("image/"))
    return { error: "Please choose an image file." };
  if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES)
    return { error: "Image must be 5MB or smaller." };

  const ext =
    (asset.fileName?.split(".").pop() || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") ||
    asset.mimeType.split("/")[1] ||
    "jpg";
  const path = `${folder}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}.${ext}`;

  const arraybuffer = await fetch(asset.uri).then((res) => res.arrayBuffer());
  const { error } = await supabase.storage
    .from("menu-images")
    .upload(path, arraybuffer, {
      contentType: asset.mimeType,
      cacheControl: "3600",
      upsert: false,
    });
  if (error) return { error: friendlyDbError(error) };
  const { data } = supabase.storage.from("menu-images").getPublicUrl(path);
  return { data: { url: data.publicUrl, path } };
}

function pathFromPublicUrl(url) {
  const marker = "/menu-images/";
  const idx = url ? url.indexOf(marker) : -1;
  return idx === -1 ? null : url.slice(idx + marker.length);
}

/** Accepts either a storage path or a full public URL. */
export async function removeMenuImageFile(pathOrUrl) {
  const path =
    pathOrUrl && pathOrUrl.startsWith("http")
      ? pathFromPublicUrl(pathOrUrl)
      : pathOrUrl;
  if (!path) return { data: true };
  const { error } = await supabase.storage.from("menu-images").remove([path]);
  return error ? { error: friendlyDbError(error) } : { data: true };
}

// -------------------------------------------------------------- profile

export async function updateProfile(userId, patch) {
  delete patch.role; // role can never be changed through this path — also blocked server-side by RLS
  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select()
    .single();
  if (error) return { error: friendlyDbError(error) };
  return { data };
}

async function accessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session ? session.access_token : null;
}

/** Verified email change — step 1: emails a 6-digit code to the NEW
 * address. Nothing changes in the account yet. */
export async function requestEmailChange(newEmail) {
  try {
    const token = await accessToken();
    const data = await apiPostAuthed(
      "/api/auth-change-email",
      { new_email: newEmail },
      token,
    );
    return { data: { email: data.email || newEmail } };
  } catch (e) {
    return { error: e.message || "Something went wrong. Please try again." };
  }
}

/** Verified email change — step 2: the code from the new address. On
 * success the login email becomes the new one immediately. */
export async function verifyEmailChange({ email, token: code }) {
  try {
    const token = await accessToken();
    const data = await apiPostAuthed(
      "/api/auth-verify-email-change",
      { email, token: code },
      token,
    );
    return { data: { email: data.email || email } };
  } catch (e) {
    return {
      error:
        e.message ||
        "That code is incorrect or has expired. Please try again.",
    };
  }
}
