// src/state/catalog.js
//
// Port of the website's catalog system (js/db.js catalog + seed-data.js):
// hardcoded menu from seed-data.js + database overrides (menu_item_images:
// photo/price/availability) + admin-created products/deals from the
// products/deals tables. Kept in a module-level cache so the cart can
// compute totals synchronously — exactly like LCP_CATALOG_CACHE.

import { supabase } from "../lib/supabase";
import seed from "../data/seed-data.js";

const DB_TIMEOUT_MS = 4000;

function timeout(ms) {
  return new Promise((resolve) => setTimeout(() => resolve({ __timedOut: true }), ms));
}

async function safeFetch(fn, fallback) {
  try {
    const result = await Promise.race([fn(), timeout(DB_TIMEOUT_MS)]);
    if (result && result.__timedOut) return { ok: false, data: fallback };
    const { data, error } = result;
    if (error) return { ok: false, data: fallback };
    return { ok: true, data: data || fallback };
  } catch (err) {
    return { ok: false, data: fallback };
  }
}

function applyOverride(item, override) {
  const merged = {
    ...item,
    image_url: override?.image_url || null,
    source: "hardcoded",
  };
  if (override?.price_override != null) {
    if (item.sizes && typeof override.price_override === "object")
      merged.sizes = override.price_override;
    else if (!item.sizes) merged.price = override.price_override;
  }
  if (override?.available_override != null)
    merged.available = override.available_override;
  return merged;
}

const cache = {
  products: [],
  deals: [],
  categories: seed.categories || [],
  loaded: false,
  lastError: null,
};

export function getCatalog() {
  return cache;
}

export async function loadCatalog(force = false) {
  if (cache.loaded && !force) return cache.lastError;

  const [overridesRes, productsRes, dealsRes] = await Promise.all([
    safeFetch(
      () =>
        supabase
          .from("menu_item_images")
          .select("item_id, image_url, price_override, available_override"),
      [],
    ),
    safeFetch(
      () => supabase.from("products").select("*").order("created_at", { ascending: false }),
      [],
    ),
    safeFetch(
      () => supabase.from("deals").select("*").order("created_at", { ascending: false }),
      [],
    ),
  ]);

  const overrides = Object.fromEntries(
    (overridesRes.data || []).map((r) => [r.item_id, r]),
  );

  const hardcodedProducts = (seed.products || []).map((p) =>
    applyOverride(p, overrides[p.id]),
  );
  const hardcodedDeals = (seed.deals || []).map((d) =>
    applyOverride(d, overrides[d.id]),
  );

  cache.products = [...hardcodedProducts, ...(productsRes.data || []).map((p) => ({ ...p, source: "admin" }))];
  cache.deals = [...hardcodedDeals, ...(dealsRes.data || []).map((d) => ({ ...d, source: "admin" }))];
  cache.categories = seed.categories || [];
  cache.lastError =
    overridesRes.ok && productsRes.ok && dealsRes.ok
      ? null
      : "Catalog load failed";
  cache.loaded = true;
  return cache.lastError;
}

export function categoryById(id) {
  return (cache.categories || []).find((c) => c.id === id) || null;
}
