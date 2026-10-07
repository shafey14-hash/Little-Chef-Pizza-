// src/state/storage.js
//
// AsyncStorage equivalents of the website's localStorage keys
// (lcp_delivery_location, lcp_guest, lcp_bucket, …). Values are JSON.

import AsyncStorage from "@react-native-async-storage/async-storage";

export async function storageGet(key, fallback = null) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

export async function storageSet(key, value) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* storage full/unavailable — non-fatal */
  }
}

export async function storageRemove(key) {
  try {
    await AsyncStorage.removeItem(key);
  } catch (e) {
    /* nothing to remove */
  }
}

export const KEYS = {
  location: "lcp_delivery_location",
  guest: "lcp_guest",
  bucket: "lcp_bucket",
  seenPrefix: "lcp_notify_",
};
