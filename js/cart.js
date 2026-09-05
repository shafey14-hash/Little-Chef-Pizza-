/**
 * cart.js — "Your Bucket". Session-persistent cart with ONE centralized
 * calculation function. Every page (menu, bucket, checkout) reads totals
 * from LCP_CART.getState() — never recomputed ad hoc elsewhere.
 */
const LCP_CART = (() => {
  const KEY = "lcp_bucket";
  const listeners = [];

  function readRaw() {
    try { return JSON.parse(localStorage.getItem(KEY)) || { items: [], deals: [] }; }
    catch { return { items: [], deals: [] }; }
  }
  function writeRaw(raw) {
    localStorage.setItem(KEY, JSON.stringify(raw));
    listeners.forEach((fn) => fn());
  }
  function onChange(fn) { listeners.push(fn); }

  function lineKey(productId, size) { return productId + "::" + (size || "default"); }

  function addProduct(product, size, qty = 1) {
    const raw = readRaw();
    const key = lineKey(product.id, size);
    const existing = raw.items.find((i) => lineKey(i.product_id, i.size) === key);
    if (existing) existing.qty = Math.min(50, existing.qty + qty);
    else raw.items.push({ product_id: product.id, size: size || null, qty: Math.min(50, qty) });
    writeRaw(raw);
  }
  function addDeal(deal, qty = 1) {
    const raw = readRaw();
    const existing = raw.deals.find((d) => d.deal_id === deal.id);
    if (existing) existing.qty = Math.min(20, existing.qty + qty);
    else raw.deals.push({ deal_id: deal.id, qty: Math.min(20, qty) });
    writeRaw(raw);
  }
  function setProductQty(productId, size, qty) {
    const raw = readRaw();
    const key = lineKey(productId, size);
    raw.items = raw.items
      .map((i) => (lineKey(i.product_id, i.size) === key ? { ...i, qty } : i))
      .filter((i) => i.qty > 0);
    writeRaw(raw);
  }
  function setDealQty(dealId, qty) {
    const raw = readRaw();
    raw.deals = raw.deals.map((d) => (d.deal_id === dealId ? { ...d, qty } : d)).filter((d) => d.qty > 0);
    writeRaw(raw);
  }
  function removeProduct(productId, size) { setProductQty(productId, size, 0); }
  function removeDeal(dealId) { setDealQty(dealId, 0); }
  function clear() { writeRaw({ items: [], deals: [] }); }

  /**
   * Centralized calculation. Resolves current catalog prices for display
   * purposes (the final authoritative recalculation still happens in
   * db.js orders.create()). If a product became unavailable or a price
   * changed since it was added, that's surfaced here so the UI can warn
   * the customer before checkout — this handles the "product becomes
   * unavailable while in bucket" edge case.
   */
  function getState() {
    const raw = readRaw();
    const products = LCP_CATALOG_CACHE.products;
    const deals = LCP_CATALOG_CACHE.deals;

    const items = raw.items.map((line) => {
      const product = (products || []).find((p) => p.id === line.product_id);
      if (!product) return { ...line, missing: true, name: "Unavailable item", unit_price: 0, line_total: 0 };
      const unit_price = product.sizes ? product.sizes[line.size] : product.price;
      return {
        ...line,
        name: product.name + (line.size ? ` (${line.size})` : ""),
        unavailable: !product.available,
        unit_price,
        line_total: unit_price * line.qty,
      };
    });

    const dealLines = raw.deals.map((line) => {
      const deal = (deals || []).find((d) => d.id === line.deal_id);
      if (!deal) return { ...line, missing: true, name: "Unavailable deal", unit_price: 0, line_total: 0 };
      return { ...line, name: deal.name, unavailable: !deal.available, unit_price: deal.price, line_total: deal.price * line.qty };
    });

    const subtotal = [...items, ...dealLines].reduce((s, l) => s + (l.line_total || 0), 0);
    const itemCount = [...raw.items, ...raw.deals].reduce((s, l) => s + l.qty, 0);
    const hasIssue = [...items, ...dealLines].some((l) => l.missing || l.unavailable);

    return { items, deals: dealLines, subtotal, itemCount, hasIssue, raw };
  }

  function toOrderPayload() {
    const raw = readRaw();
    return {
      items: raw.items.map((i) => ({ product_id: i.product_id, size: i.size, qty: i.qty })),
      deals: raw.deals.map((d) => ({ deal_id: d.deal_id, qty: d.qty })),
    };
  }

  return { addProduct, addDeal, setProductQty, setDealQty, removeProduct, removeDeal, clear, getState, onChange, toOrderPayload };
})();

// Lightweight in-memory cache of the catalog so LCP_CART can compute totals
// synchronously (localStorage reads are sync; this mirrors what a real
// client-side Supabase cache would look like after the initial fetch).
const LCP_CATALOG_CACHE = { products: [], deals: [], categories: [] };
async function LCP_loadCatalogCache() {
  const [p, d, c] = await Promise.all([
    LCP_DB.catalog.listProducts(), LCP_DB.catalog.listDeals(), LCP_DB.catalog.listCategories(),
  ]);
  LCP_CATALOG_CACHE.products = p.data;
  LCP_CATALOG_CACHE.deals = d.data;
  LCP_CATALOG_CACHE.categories = c.data;
}
