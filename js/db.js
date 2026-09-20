/**
 * db.js — PRODUCTION version, backed by real Supabase (Postgres + Auth).
 *
 * Same public shape as the old localStorage version (LCP_DB.auth,
 * LCP_DB.catalog, LCP_DB.orders), so menu.js/cart.js/checkout.js/admin.js
 * did not need to change. Two real differences from before:
 *
 *  1. Sessions are asynchronous now. Call `await LCP_DB.auth.init()` once
 *     at the top of every page (nav.js does this for you inside
 *     mountCustomer()/mountAdmin()) before using currentUser().
 *  2. Order totals/prices/availability are recalculated INSIDE Postgres by
 *     the create_order() function (supabase/policies.sql) — this file just
 *     forwards the cart contents via RPC. The browser can never forge a
 *     total, a price, or an admin action; Row Level Security + that
 *     function are the real security boundary, not this file.
 *
 * USERNAME/PASSWORD AUTH: the customer-facing UI never asks for email, but
 * Supabase Auth is email-based under the hood. We deterministically map
 * every username to an internal address like
 * "alibaba@users.littlechefpizza.local" — the browser never shows this,
 * it's purely an implementation detail Supabase requires.
 */
const LCP_DB = (() => {
  console.log(
    "%c[LCP] db.js build: HARDCODED-MENU-v4 (products+deals hybrid, caching, defensive fetch)",
    "color:#d4af37; font-weight:bold; font-size:13px; background:#111; padding:4px 8px; border-radius:4px;",
  );

  if (!window.supabase) {
    console.error(
      "Supabase JS library did not load — check the <script> tag order in this page.",
    );
  }
  const CONFIGURED = !!(
    LCP_CONFIG &&
    LCP_CONFIG.SUPABASE_URL &&
    LCP_CONFIG.SUPABASE_ANON_KEY
  );
  if (!CONFIGURED) {
    console.error(
      "js/config.js is missing your Supabase URL/anon key — fill it in before using this site.",
    );
  }
  // A dummy URL/key lets createClient() succeed (so the page doesn't hard-crash
  // on load) even before config.js is filled in; every real call below still
  // fails safely with a friendly error via NOT_CONFIGURED_MSG.
  const sb = window.supabase.createClient(
    LCP_CONFIG.SUPABASE_URL || "https://placeholder.supabase.co",
    LCP_CONFIG.SUPABASE_ANON_KEY || "placeholder-key",
  );
  const NOT_CONFIGURED_MSG =
    "The site isn't connected to a database yet. Please fill in js/config.js.";

  const EMAIL_DOMAIN = "users.littlechefpizza.local";
  const usernameToEmail = (u) => u.trim().toLowerCase() + "@" + EMAIL_DOMAIN;

  function friendlyDbError(error) {
    console.error("Supabase error:", error);
    if (error?.code === "23505") return "That value is already in use.";
    return "Something went wrong. Please try again.";
  }

  // ------------------------------------------------------------- session
  let _profile = null; // cached row from public.profiles for the signed-in user, or null

  async function loadProfile() {
    if (!CONFIGURED) {
      _profile = null;
      return null;
    }
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (!session) {
      _profile = null;
      return null;
    }
    const { data, error } = await sb
      .from("profiles")
      .select("*")
      .eq("auth_user_id", session.user.id)
      .single();
    _profile = error ? null : data;
    return _profile;
  }

  // ---------------------------------------------------------------- auth
  const auth = {
    /** Must be awaited once per page load, before mountCustomer/mountAdmin/currentUser(). */
    async init() {
      return loadProfile();
    },

    currentUser() {
      return _profile;
    },

    async signUp({
      username,
      password,
      full_name,
      phone,
      email,
      area,
      address,
    }) {
      if (!CONFIGURED) return { error: NOT_CONFIGURED_MSG };
      username = username.trim().toLowerCase();

      const { data: taken, error: checkErr } = await sb.rpc(
        "is_username_taken",
        { p_username: username },
      );
      if (checkErr) return { error: friendlyDbError(checkErr) };
      if (taken) return { error: "Username already exists." };

      const { error } = await sb.auth.signUp({
        email: usernameToEmail(username),
        password,
        options: {
          data: {
            username,
            full_name,
            phone,
            email,
            area,
            address,
            role: "customer",
          },
        },
      });
      if (error) {
        if (/registered|exists/i.test(error.message))
          return { error: "Username already exists." };
        return { error: "Something went wrong. Please try again." };
      }
      // The on_auth_user_created trigger (see supabase/auth_and_admin.sql)
      // creates the matching public.profiles row automatically.
      await loadProfile();
      return { data: _profile };
    },

    async signIn({ username, password, expectRole }) {
      if (!CONFIGURED) return { error: NOT_CONFIGURED_MSG };
      const email = usernameToEmail(username.trim());
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return { error: "Incorrect username or password." };

      await loadProfile();
      if (expectRole && (!_profile || _profile.role !== expectRole)) {
        await sb.auth.signOut();
        _profile = null;
        return { error: "Incorrect username or password." };
      }
      return { data: _profile };
    },

    async signOut() {
      await sb.auth.signOut();
      _profile = null;
    },

    async updateProfile(userId, patch) {
      delete patch.role; // role can never be changed through this path — also blocked server-side by RLS
      const { data, error } = await sb
        .from("profiles")
        .update(patch)
        .eq("id", userId)
        .select()
        .single();
      if (error) return { error: friendlyDbError(error) };
      _profile = data;
      return { data };
    },
  };

  // ------------------------------------------------------------ catalog
  // Product/category/deal data (name, price, sizes, description) is
  // HARDCODED in js/seed-data.js — always available, never depends on
  // Supabase being configured/reachable, and NEVER throws. On top of that
  // hardcoded base, admins can add extra products/deals that live in the
  // database (full CRUD, real server-side price protection) — the two
  // lists are combined (OR'd together), never duplicated, matched only
  // by their own separate ids.
  //
  // CACHING: everything that comes from the database (images, and any
  // admin-added products/deals) is cached in localStorage for
  // CACHE_TTL_MS. The very first page load of a visit fetches fresh and
  // caches it; every load after that within the window reads instantly
  // from the cache with zero network wait. The hardcoded menu itself
  // never needed this — it was already instant — this is purely for the
  // database-backed extras.
  const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
  function cacheGet(key) {
    try {
      const raw = localStorage.getItem("lcp_cache_" + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
      return parsed.data;
    } catch {
      return null;
    }
  }
  function cacheSet(key, data) {
    try {
      localStorage.setItem(
        "lcp_cache_" + key,
        JSON.stringify({ data, ts: Date.now() }),
      );
    } catch {
      /* storage full/unavailable — fine, just skips caching */
    }
  }
  function cacheClear(key) {
    try {
      localStorage.removeItem("lcp_cache_" + key);
    } catch {
      /* nothing to do */
    }
  }

  /** Wraps any Supabase call so a network failure, a missing table, OR a
   * slow/hanging connection can NEVER block the page — it always
   * resolves within DB_TIMEOUT_MS at the latest, returning
   * { ok: true, data } on genuine success or { ok: false, data: fallback }
   * otherwise. Callers only cache the `ok: true` case — a failure is
   * never cached, so the next page load tries fresh again instead of
   * being stuck showing an empty result for the whole cache window. */
  const DB_TIMEOUT_MS = 4000;
  function timeout(ms) {
    return new Promise((resolve) =>
      setTimeout(() => resolve({ __timedOut: true }), ms),
    );
  }
  async function safeFetch(fn, fallback) {
    try {
      const result = await Promise.race([fn(), timeout(DB_TIMEOUT_MS)]);
      if (result && result.__timedOut) {
        console.error(
          "Database call took too long (>%dms) — showing hardcoded content without it.",
          DB_TIMEOUT_MS,
        );
        return { ok: false, data: fallback };
      }
      const { data, error } = result;
      if (error) {
        console.error("Database call failed (using fallback):", error);
        return { ok: false, data: fallback };
      }
      return { ok: true, data: data || fallback };
    } catch (err) {
      console.error("Database call threw (using fallback):", err);
      return { ok: false, data: fallback };
    }
  }

  async function imageMap() {
    if (!CONFIGURED) return {};
    const cached = cacheGet("images_v2");
    if (cached) return cached;
    const { ok, data: rows } = await safeFetch(
      () => sb.from("menu_item_images").select("item_id, image_url"),
      [],
    );
    const map = Object.fromEntries(rows.map((r) => [r.item_id, r.image_url]));
    if (ok) cacheSet("images_v2", map);
    return map;
  }

  async function adminProducts() {
    if (!CONFIGURED) return [];
    const cached = cacheGet("admin_products_v2");
    if (cached) return cached;
    const { ok, data: rows } = await safeFetch(
      () =>
        sb
          .from("products")
          .select("*")
          .order("created_at", { ascending: false }),
      [],
    );
    const tagged = rows.map((p) => ({ ...p, source: "admin" }));
    if (ok) cacheSet("admin_products_v2", tagged);
    return tagged;
  }

  async function adminDeals() {
    if (!CONFIGURED) return [];
    const cached = cacheGet("admin_deals_v2");
    if (cached) return cached;
    const { ok, data: rows } = await safeFetch(
      () =>
        sb.from("deals").select("*").order("created_at", { ascending: false }),
      [],
    );
    const tagged = rows.map((d) => ({ ...d, source: "admin" }));
    if (ok) cacheSet("admin_deals_v2", tagged);
    return tagged;
  }

  const catalog = {
    async listCategories() {
      return { data: LCP_SEED.categories };
    },
    async listProducts() {
      const [images, admin] = await Promise.all([imageMap(), adminProducts()]);
      const hardcoded = LCP_SEED.products.map((p) => ({
        ...p,
        image_url: images[p.id] || null,
        source: "hardcoded",
      }));
      return { data: [...hardcoded, ...admin] };
    },
    async getProduct(id) {
      const hardcoded = LCP_SEED.products.find((p) => p.id === id);
      const images = await imageMap();
      if (hardcoded) {
        const category = LCP_SEED.categories.find(
          (c) => c.id === hardcoded.category_id,
        );
        return {
          data: {
            ...hardcoded,
            image_url: images[id] || null,
            source: "hardcoded",
            categories: { name: category?.name },
          },
        };
      }
      const admin = (await adminProducts()).find((p) => p.id === id);
      if (admin) {
        const category = LCP_SEED.categories.find(
          (c) => c.id === admin.category_id,
        );
        return { data: { ...admin, categories: { name: category?.name } } };
      }
      return { error: "Product not found." };
    },
    /** Admin-only: create a brand-new product (stored in the database, fully editable — unlike the hardcoded menu). Pick category_id from LCP_SEED.categories. */
    async createProduct(product) {
      if (!CONFIGURED) return { error: NOT_CONFIGURED_MSG };
      const { data, error } = await sb
        .from("products")
        .insert(product)
        .select()
        .single();
      if (error) return { error: friendlyDbError(error) };
      cacheClear("admin_products_v2");
      return { data: { ...data, source: "admin" } };
    },
    async updateProduct(id, patch) {
      if (!CONFIGURED) return { error: NOT_CONFIGURED_MSG };
      const { data, error } = await sb
        .from("products")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) return { error: friendlyDbError(error) };
      cacheClear("admin_products_v2");
      return { data: { ...data, source: "admin" } };
    },
    async deleteProduct(id) {
      if (!CONFIGURED) return { error: NOT_CONFIGURED_MSG };
      const { error } = await sb.from("products").delete().eq("id", id);
      if (error) return { error: friendlyDbError(error) };
      cacheClear("admin_products_v2");
      return { data: true };
    },
    async listDeals() {
      const [images, admin] = await Promise.all([imageMap(), adminDeals()]);
      const hardcoded = LCP_SEED.deals.map((d) => ({
        ...d,
        image_url: images[d.id] || null,
        source: "hardcoded",
      }));
      return { data: [...hardcoded, ...admin] };
    },
    /** Admin-only: create a brand-new deal (stored in the database, fully editable — unlike the hardcoded menu deals). */
    async createDeal(deal) {
      if (!CONFIGURED) return { error: NOT_CONFIGURED_MSG };
      const { data, error } = await sb
        .from("deals")
        .insert(deal)
        .select()
        .single();
      if (error) return { error: friendlyDbError(error) };
      cacheClear("admin_deals_v2");
      return { data: { ...data, source: "admin" } };
    },
    /** Admin-only: edit an admin-created deal. Hardcoded deals (source: "hardcoded") can't be edited this way — only their image, via setMenuImage. */
    async updateDeal(id, patch) {
      if (!CONFIGURED) return { error: NOT_CONFIGURED_MSG };
      const { data, error } = await sb
        .from("deals")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) return { error: friendlyDbError(error) };
      cacheClear("admin_deals_v2");
      return { data: { ...data, source: "admin" } };
    },
    async deleteDeal(id) {
      if (!CONFIGURED) return { error: NOT_CONFIGURED_MSG };
      const { error } = await sb.from("deals").delete().eq("id", id);
      if (error) return { error: friendlyDbError(error) };
      cacheClear("admin_deals_v2");
      return { data: true };
    },
    /** Admin-only: attach/replace the image for ANY product or deal — hardcoded (matched by its seed-data.js id) or admin-created (matched by its database id). */
    async setMenuImage(itemId, imageUrl) {
      if (!CONFIGURED) return { error: NOT_CONFIGURED_MSG };
      const { data, error } = await sb
        .from("menu_item_images")
        .upsert({
          item_id: itemId,
          image_url: imageUrl,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) return { error: friendlyDbError(error) };
      cacheClear("images_v2");
      return { data };
    },
    async removeMenuImage(itemId) {
      if (!CONFIGURED) return { error: NOT_CONFIGURED_MSG };
      const { error } = await sb
        .from("menu_item_images")
        .delete()
        .eq("item_id", itemId);
      if (error) return { error: friendlyDbError(error) };
      cacheClear("images_v2");
      return { data: true };
    },
  };

  // ---------------------------------------------------------- settings
  const settings = {
    async get(key) {
      if (!CONFIGURED) return { data: null };
      const { data, error } = await sb
        .from("site_settings")
        .select("value")
        .eq("key", key)
        .single();
      return error ? { data: null } : { data: data.value };
    },
  };

  // ------------------------------------------------------------- storage
  const BUCKET = "menu-images";
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

  function pathFromPublicUrl(url) {
    const marker = `/${BUCKET}/`;
    const idx = url ? url.indexOf(marker) : -1;
    return idx === -1 ? null : url.slice(idx + marker.length);
  }

  const storage = {
    /** folder: "products" | "deals" — just keeps the bucket tidy. */
    async uploadImage(file, folder) {
      if (!CONFIGURED) return { error: NOT_CONFIGURED_MSG };
      if (!file.type.startsWith("image/"))
        return { error: "Please choose an image file." };
      if (file.size > MAX_IMAGE_BYTES)
        return { error: "Image must be 5MB or smaller." };

      const ext =
        (file.name.split(".").pop() || "jpg")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${folder}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await sb.storage
        .from(BUCKET)
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) return { error: friendlyDbError(upErr) };

      const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
      return { data: { url: data.publicUrl, path } };
    },

    /** Accepts either a storage path or a full public URL. */
    async removeImage(pathOrUrl) {
      if (!CONFIGURED) return { error: NOT_CONFIGURED_MSG };
      const path =
        pathOrUrl && pathOrUrl.startsWith("http")
          ? pathFromPublicUrl(pathOrUrl)
          : pathOrUrl;
      if (!path) return { data: true }; // nothing to remove
      const { error } = await sb.storage.from(BUCKET).remove([path]);
      return error ? { error: friendlyDbError(error) } : { data: true };
    },

    /**
     * EasyPaisa payment screenshots go to a SEPARATE, private bucket
     * (financial proof — never publicly readable). Only image files,
     * max 5MB. Returns the storage path (not a public URL, since the
     * bucket isn't public) — admin views it later via a signed URL.
     */
    async uploadPaymentScreenshot(file) {
      if (!CONFIGURED) return { error: NOT_CONFIGURED_MSG };
      if (!file.type.startsWith("image/"))
        return { error: "Please upload an image (screenshot) file." };
      if (file.size > MAX_IMAGE_BYTES)
        return { error: "Screenshot must be 5MB or smaller." };

      const ext =
        (file.name.split(".").pop() || "jpg")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await sb.storage
        .from("payment-screenshots")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (error) return { error: friendlyDbError(error) };
      return { data: { path } };
    },
  };

  function normalize(rows) {
    // order_items/order_deals (Postgres foreign-table names) -> items/deals,
    // matching what the UI (orders.html, admin.js) already expects.
    return (rows || []).map((r) => ({
      ...r,
      items: r.order_items || [],
      deals: r.order_deals || [],
    }));
  }

  const orders = {
    async create(payload) {
      if (!CONFIGURED) return { error: NOT_CONFIGURED_MSG };
      const { data, error } = await sb.rpc("create_order", {
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
            error.message?.replace(/^.*ERROR:\s*/i, "") ||
            friendlyDbError(error),
        };
      return { data };
    },
    async listAll() {
      if (!CONFIGURED) return { data: [] };
      const { data, error } = await sb
        .from("orders")
        .select("*, order_items(*), order_deals(*)")
        .order("created_at", { ascending: false });
      return error
        ? { error: friendlyDbError(error), data: [] }
        : { data: normalize(data) };
    },
    async listForUser(userId) {
      if (!CONFIGURED) return { data: [] };
      const { data, error } = await sb
        .from("orders")
        .select("*, order_items(*), order_deals(*)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      return error
        ? { error: friendlyDbError(error), data: [] }
        : { data: normalize(data) };
    },
    // Admin-only transitions — each is enforced server-side by its own
    // SECURITY DEFINER function (see supabase/location_and_payments.sql),
    // which independently checks public.is_admin() and the current status
    // before allowing the move. The frontend buttons are just UI.
    async approvePayment(orderId) {
      const { data, error } = await sb.rpc("approve_payment", {
        p_order_id: orderId,
      });
      return error ? { error: friendlyDbError(error) } : { data };
    },
    async rejectPayment(orderId) {
      const { data, error } = await sb.rpc("reject_payment", {
        p_order_id: orderId,
      });
      return error ? { error: friendlyDbError(error) } : { data };
    },
    async markOutForDelivery(orderId) {
      const { data, error } = await sb.rpc("mark_out_for_delivery", {
        p_order_id: orderId,
      });
      return error ? { error: friendlyDbError(error) } : { data };
    },
    async markDelivered(orderId) {
      const { data, error } = await sb.rpc("mark_delivered", {
        p_order_id: orderId,
      });
      return error ? { error: friendlyDbError(error) } : { data };
    },
    async cancelOrder(orderId) {
      const { data, error } = await sb.rpc("cancel_order", {
        p_order_id: orderId,
      });
      return error ? { error: friendlyDbError(error) } : { data };
    },
    async markFailedDelivery(orderId) {
      const { data, error } = await sb.rpc("mark_failed_delivery", {
        p_order_id: orderId,
      });
      return error ? { error: friendlyDbError(error) } : { data };
    },
    /** Admin-only: generates a short-lived signed URL to view a payment screenshot (bucket is private). */
    async getScreenshotUrl(path) {
      if (!CONFIGURED || !path) return { data: null };
      const { data, error } = await sb.storage
        .from("payment-screenshots")
        .createSignedUrl(path, 600);
      return error
        ? { error: friendlyDbError(error) }
        : { data: data.signedUrl };
    },
  };

  return { auth, catalog, orders, storage, settings, isConfigured: CONFIGURED };
})();
