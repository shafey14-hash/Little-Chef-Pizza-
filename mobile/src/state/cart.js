// src/state/cart.js
//
// Port of js/cart.js — "Your Bucket". Single source of truth for cart
// lines and totals; screens never recompute. In-memory state hydrated
// from AsyncStorage at startup, write-through on every change. Line
// identity is product + size + option (a 500ml Coke and a 500ml Sprite
// are separate lines), same lineKey format as the website.

import React, { useSyncExternalStore } from "react";

import { KEYS, storageGet, storageSet } from "./storage";
import { getCatalog } from "./catalog";

export const MAX_PRODUCT_QTY = 50;
export const MAX_DEAL_QTY = 20;

let raw = { items: [], deals: [] };
let hydrated = false;
let snapshot = null;
const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  snapshot = null;
  listeners.forEach((fn) => fn());
}

/**
 * React hook over the cart. getState() is memoized (invalidated on every
 * write) because useSyncExternalStore requires a stable snapshot between
 * notifications.
 */
export function useCart() {
  return useSyncExternalStore(subscribe, getState);
}

export async function hydrateCart() {
  const stored = await storageGet(KEYS.bucket, { items: [], deals: [] });
  raw = {
    items: Array.isArray(stored.items) ? stored.items : [],
    deals: Array.isArray(stored.deals) ? stored.deals : [],
  };
  hydrated = true;
  snapshot = null;
  notify();
}

function writeRaw(next) {
  raw = next;
  storageSet(KEYS.bucket, raw);
  notify();
}

export function lineKey(productId, size, option) {
  return (
    productId + "::" + (size || "default") + "::" + (option || "default")
  );
}

export function addProduct(product, size, qty = 1, option = null) {
  const next = { items: [...raw.items], deals: [...raw.deals] };
  const key = lineKey(product.id, size, option);
  const unit_price = product.sizes ? product.sizes[size] : product.price;
  const existing = next.items.find(
    (i) => lineKey(i.product_id, i.size, i.option) === key,
  );
  if (existing) {
    next.items = next.items.map((i) =>
      i === existing
        ? {
            ...i,
            qty: Math.min(MAX_PRODUCT_QTY, i.qty + qty),
            unit_price: unit_price ?? null,
          }
        : i,
    );
  } else {
    next.items.push({
      product_id: product.id,
      size: size || null,
      option: option || null,
      qty: Math.min(MAX_PRODUCT_QTY, qty),
      unit_price: unit_price ?? null,
    });
  }
  writeRaw(next);
}

export function addDeal(deal, qty = 1) {
  const next = { items: [...raw.items], deals: [...raw.deals] };
  const existing = next.deals.find((d) => d.deal_id === deal.id);
  if (existing) {
    next.deals = next.deals.map((d) =>
      d.deal_id === deal.id
        ? {
            ...d,
            qty: Math.min(MAX_DEAL_QTY, d.qty + qty),
            unit_price: deal.price ?? null,
          }
        : d,
    );
  } else {
    next.deals.push({
      deal_id: deal.id,
      qty: Math.min(MAX_DEAL_QTY, qty),
      unit_price: deal.price ?? null,
    });
  }
  writeRaw(next);
}

function clampQty(qty, max) {
  const n = Math.floor(Number(qty));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(max, n);
}

export function setProductQty(productId, size, qty, option) {
  const key = lineKey(productId, size, option);
  writeRaw({
    items: raw.items
      .map((i) =>
        lineKey(i.product_id, i.size, i.option) === key
          ? { ...i, qty: clampQty(qty, MAX_PRODUCT_QTY) }
          : i,
      )
      .filter((i) => i.qty > 0),
    deals: raw.deals,
  });
}

export function setDealQty(dealId, qty) {
  writeRaw({
    items: raw.items,
    deals: raw.deals
      .map((d) =>
        d.deal_id === dealId ? { ...d, qty: clampQty(qty, MAX_DEAL_QTY) } : d,
      )
      .filter((d) => d.qty > 0),
  });
}

export const removeProduct = (productId, size, option) =>
  setProductQty(productId, size, 0, option);
export const removeDeal = (dealId) => setDealQty(dealId, 0);
export function clear() {
  writeRaw({ items: [], deals: [] });
}

/**
 * Centralized calculation against the current catalog. Missing items,
 * availability and price changes are surfaced here so screens can warn
 * before checkout. The server recomputes authoritative pricing in
 * create_order().
 */
export function getState() {
  if (snapshot) return snapshot;
  const catalog = getCatalog();
  const products = catalog.products || [];
  const deals = catalog.deals || [];

  const items = raw.items.map((line) => {
    const product = products.find((p) => p.id === line.product_id);
    if (!product)
      return {
        ...line,
        missing: true,
        name: "Unavailable item",
        base_name: "Unavailable item",
        variant: "",
        unit_price: 0,
        line_total: 0,
      };
    const unit_price = product.sizes
      ? product.sizes[line.size]
      : product.price;
    return {
      ...line,
      base_name: product.name,
      variant: [line.size, line.option].filter(Boolean).join(" · "),
      image_url: product.image_url || null,
      name:
        product.name +
        (line.size ? ` (${line.size})` : "") +
        (line.option ? ` (${line.option})` : ""),
      unavailable: !product.available,
      priceChanged:
        line.unit_price != null && line.unit_price !== unit_price,
      unit_price,
      line_total: unit_price * line.qty,
    };
  });

  const dealLines = raw.deals.map((line) => {
    const deal = deals.find((d) => d.id === line.deal_id);
    if (!deal)
      return {
        ...line,
        missing: true,
        name: "Unavailable deal",
        base_name: "Unavailable deal",
        variant: "",
        unit_price: 0,
        line_total: 0,
      };
    return {
      ...line,
      base_name: deal.name,
      variant: "",
      image_url: deal.image_url || null,
      name: deal.name,
      unavailable: !deal.available,
      priceChanged: line.unit_price != null && line.unit_price !== deal.price,
      unit_price: deal.price,
      line_total: deal.price * line.qty,
    };
  });

  const subtotal = [...items, ...dealLines].reduce(
    (s, l) => s + (l.line_total || 0),
    0,
  );
  const itemCount = [...raw.items, ...raw.deals].reduce(
    (s, l) => s + l.qty,
    0,
  );
  const hasIssue = [...items, ...dealLines].some(
    (l) => l.missing || l.unavailable,
  );

  return (snapshot = {
    items,
    deals: dealLines,
    subtotal,
    itemCount,
    hasIssue,
    raw,
  });
}

/**
 * Payload for the create_order RPC. Options are deliberately NOT sent —
 * the server contract has no option field (name carries the variant).
 */
export function toOrderPayload() {
  const state = getState();
  return {
    items: state.items
      .filter((i) => !i.missing)
      .map((i) => ({
        product_id: i.product_id,
        name: i.name,
        size: i.size,
        unit_price: i.unit_price,
        qty: i.qty,
      })),
    deals: state.deals
      .filter((d) => !d.missing)
      .map((d) => ({
        deal_id: d.deal_id,
        name: d.name,
        unit_price: d.unit_price,
        qty: d.qty,
      })),
  };
}

export function isHydrated() {
  return hydrated;
}
