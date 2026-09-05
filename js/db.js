/**
 * db.js
 * -----------------------------------------------------------------------
 * Data-access layer for Little Chef Pizza.
 *
 * WHY THIS EXISTS
 * This build ships as a standalone HTML/CSS/JS site with NO server, so it
 * uses the browser's localStorage as its "database" to remain fully
 * functional out of the box. Every function below is written to mirror
 * the shape of a real Supabase call (same inputs/outputs, same async
 * style, same validation-before-write discipline) so that swapping the
 * body of each function for a real `supabase.from(...)` / Edge Function
 * call is a mechanical, low-risk change. See /supabase/*.sql for the
 * production schema, seed data and Row Level Security policies this
 * layer is designed to sit in front of.
 *
 * NEVER trust client-side totals — LCP_DB.orders.create() recalculates
 * every price server-side-equivalent (here: inside this trusted module)
 * from the current product/deal catalogue, exactly like an Edge Function
 * would, rather than accepting whatever the cart UI computed.
 * -----------------------------------------------------------------------
 */

const LCP_DB = (() => {

  const KEYS = {
    products: "lcp_products",
    categories: "lcp_categories",
    deals: "lcp_deals",
    orders: "lcp_orders",
    profiles: "lcp_profiles",
    session: "lcp_session",
    orderSeq: "lcp_order_seq",
  };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.error("DB read error", key, e);
      return fallback;
    }
  }
  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
  function delay(ms = 120) {
    // Simulates network latency so loading states are exercised/visible.
    return new Promise((res) => setTimeout(res, ms));
  }
  function uid(prefix) {
    return prefix + "-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function seedIfEmpty() {
    if (!localStorage.getItem(KEYS.products)) {
      write(KEYS.products, LCP_SEED.products);
      write(KEYS.categories, LCP_SEED.categories);
      write(KEYS.deals, LCP_SEED.deals);
      write(KEYS.orders, []);
      write(KEYS.orderSeq, 10000);

      // Demo admin account. In production this row/user is created once,
      // securely, outside of any public signup flow (see supabase/seed.sql).
      write(KEYS.profiles, [
        {
          id: uid("usr"),
          username: "admin",
          password_hash: LCP_UTIL.hash("admin123"), // demo only — change immediately in production
          full_name: "Restaurant Admin",
          phone: "0300-0000000",
          role: "admin",
          area: null,
          address: null,
          created_at: new Date().toISOString(),
        },
      ]);
    }
  }

  // ---------------------------------------------------------------- AUTH
  const auth = {
    async signUp({ username, password, full_name, phone, area, address }) {
      await delay();
      const profiles = read(KEYS.profiles, []);
      if (profiles.some((p) => p.username.toLowerCase() === username.toLowerCase())) {
        return { error: "Username already exists." };
      }
      const profile = {
        id: uid("usr"),
        username,
        password_hash: LCP_UTIL.hash(password),
        full_name,
        phone,
        role: "customer",
        area,
        address,
        created_at: new Date().toISOString(),
      };
      profiles.push(profile);
      write(KEYS.profiles, profiles);
      const { password_hash, ...safe } = profile;
      write(KEYS.session, safe);
      return { data: safe };
    },

    async signIn({ username, password, expectRole }) {
      await delay();
      const profiles = read(KEYS.profiles, []);
      const found = profiles.find((p) => p.username.toLowerCase() === username.toLowerCase());
      if (!found || found.password_hash !== LCP_UTIL.hash(password)) {
        return { error: "Incorrect username or password." };
      }
      if (expectRole && found.role !== expectRole) {
        return { error: "Incorrect username or password." }; // never leak "wrong portal" info
      }
      const { password_hash, ...safe } = found;
      write(KEYS.session, safe);
      return { data: safe };
    },

    signOut() {
      localStorage.removeItem(KEYS.session);
    },

    currentUser() {
      return read(KEYS.session, null);
    },

    async updateProfile(userId, patch) {
      await delay();
      const profiles = read(KEYS.profiles, []);
      const idx = profiles.findIndex((p) => p.id === userId);
      if (idx === -1) return { error: "Profile not found." };
      if (patch.username) {
        const dupe = profiles.some(
          (p) => p.id !== userId && p.username.toLowerCase() === patch.username.toLowerCase()
        );
        if (dupe) return { error: "Username already exists." };
      }
      // role can never be changed through this path — enforced server-side in prod via RLS.
      delete patch.role;
      profiles[idx] = { ...profiles[idx], ...patch };
      write(KEYS.profiles, profiles);
      const { password_hash, ...safe } = profiles[idx];
      write(KEYS.session, safe);
      return { data: safe };
    },
  };

  // ------------------------------------------------------------ CATALOG
  const catalog = {
    async listCategories() {
      await delay();
      return { data: read(KEYS.categories, []).sort((a, b) => a.sort_order - b.sort_order) };
    },
    async listProducts() {
      await delay();
      return { data: read(KEYS.products, []) };
    },
    async listDeals() {
      await delay();
      return { data: read(KEYS.deals, []) };
    },
    async updateProduct(id, patch) {
      await delay();
      const products = read(KEYS.products, []);
      const idx = products.findIndex((p) => p.id === id);
      if (idx === -1) return { error: "Product not found." };
      products[idx] = { ...products[idx], ...patch };
      write(KEYS.products, products);
      return { data: products[idx] };
    },
    async createDeal(deal) {
      await delay();
      const deals = read(KEYS.deals, []);
      const record = { id: uid("deal"), available: true, featured: false, verified: true, ...deal };
      deals.push(record);
      write(KEYS.deals, deals);
      return { data: record };
    },
    async updateDeal(id, patch) {
      await delay();
      const deals = read(KEYS.deals, []);
      const idx = deals.findIndex((d) => d.id === id);
      if (idx === -1) return { error: "Deal not found." };
      deals[idx] = { ...deals[idx], ...patch };
      write(KEYS.deals, deals);
      return { data: deals[idx] };
    },
    async deactivateDeal(id) {
      // Deals are never hard-deleted — historical orders may still reference them.
      return catalog.updateDeal(id, { available: false });
    },
  };

  // -------------------------------------------------------------- ORDERS
  function nextOrderNumber() {
    const seq = read(KEYS.orderSeq, 10000) + 1;
    write(KEYS.orderSeq, seq);
    return "LCP-" + seq;
  }

  const orders = {
    /**
     * Recomputes and validates the whole order from trusted server-side
     * (here: this module's) data. Nothing about price/availability is
     * taken from the client except product ids + quantities.
     */
    async create(payload) {
      await delay(300);
      const products = read(KEYS.products, []);
      const deals = read(KEYS.deals, []);

      const lineItems = [];
      let subtotal = 0;

      for (const line of payload.items || []) {
        const product = products.find((p) => p.id === line.product_id);
        if (!product) return { error: "One of the items in your bucket no longer exists." };
        if (!product.available) return { error: `"${product.name}" is currently unavailable.` };
        const unitPrice = product.sizes ? product.sizes[line.size] : product.price;
        if (unitPrice == null) return { error: `Invalid size selected for "${product.name}".` };
        const qty = Math.max(1, Math.min(50, parseInt(line.qty, 10) || 1));
        const lineTotal = unitPrice * qty;
        subtotal += lineTotal;
        lineItems.push({
          product_id: product.id,
          product_name_snapshot: product.name + (line.size ? ` (${line.size})` : ""),
          unit_price_snapshot: unitPrice,
          quantity: qty,
          line_total: lineTotal,
        });
      }

      const dealItems = [];
      for (const line of payload.deals || []) {
        const deal = deals.find((d) => d.id === line.deal_id);
        if (!deal) return { error: "One of the deals in your bucket no longer exists." };
        if (!deal.available) return { error: `"${deal.name}" is currently unavailable.` };
        const qty = Math.max(1, Math.min(20, parseInt(line.qty, 10) || 1));
        const lineTotal = deal.price * qty;
        subtotal += lineTotal;
        dealItems.push({
          deal_id: deal.id,
          deal_name_snapshot: deal.name,
          deal_price_snapshot: deal.price,
          quantity: qty,
          line_total: lineTotal,
        });
      }

      if (lineItems.length === 0 && dealItems.length === 0) {
        return { error: "Your bucket is empty." };
      }

      // ---- order-type specific validation ----
      const type = payload.order_type;
      if (!["delivery", "takeaway", "dine-in"].includes(type)) {
        return { error: "Please choose an order type." };
      }
      if (!payload.customer_name || payload.customer_name.trim().length < 2) {
        return { error: "Please enter your name." };
      }
      if (!/^[0-9+\-\s]{7,15}$/.test(payload.customer_phone || "")) {
        return { error: "Please enter a valid phone number." };
      }
      if (!payload.cancellation_acknowledged) {
        return { error: "Please confirm you understand the cancellation policy." };
      }

      let delivery_charge = null;
      let delivery_area = null;
      let delivery_address = null;

      if (type === "delivery") {
        if (!LCP_SEED.delivery_areas.includes(payload.delivery_area)) {
          return { error: "Sorry, delivery is currently unavailable at your selected location." };
        }
        if (!payload.delivery_address || payload.delivery_address.trim().length < 5) {
          return { error: "Please enter your full delivery address." };
        }
        delivery_area = payload.delivery_area;
        delivery_address = payload.delivery_address;
        delivery_charge = null; // TBD — see spec section 26; configurable later via site_settings
      }

      const discount = 0; // no discount engine yet — reserved for future use
      const total = subtotal + (delivery_charge || 0) - discount;

      const record = {
        id: uid("ord"),
        order_number: nextOrderNumber(),
        user_id: payload.user_id || null,
        customer_type: payload.user_id ? "customer" : "guest",
        customer_name: payload.customer_name.trim(),
        customer_phone: payload.customer_phone.trim(),
        order_type: type,
        delivery_area,
        delivery_address,
        items: lineItems,
        deals: dealItems,
        subtotal,
        delivery_charge,
        discount,
        total,
        status: "pending",
        cancellation_acknowledged: true,
        created_at: new Date().toISOString(),
        delivered_at: null,
      };

      const all = read(KEYS.orders, []);
      all.unshift(record);
      write(KEYS.orders, all);
      return { data: record };
    },

    async listAll() {
      await delay();
      return { data: read(KEYS.orders, []) };
    },

    async listForUser(userId) {
      await delay();
      return { data: read(KEYS.orders, []).filter((o) => o.user_id === userId) };
    },

    async markDelivered(orderId) {
      await delay();
      const all = read(KEYS.orders, []);
      const idx = all.findIndex((o) => o.id === orderId);
      if (idx === -1) return { error: "Order not found." };
      all[idx].status = "delivered";
      all[idx].delivered_at = new Date().toISOString();
      write(KEYS.orders, all);
      return { data: all[idx] };
    },
  };

  return { seedIfEmpty, auth, catalog, orders };
})();

LCP_DB.seedIfEmpty();
