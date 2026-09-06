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

    async signUp({ username, password, full_name, phone, area, address }) {
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
          data: { username, full_name, phone, area, address, role: "customer" },
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
  const catalog = {
    async listCategories() {
      if (!CONFIGURED) return { data: [] };
      const { data, error } = await sb
        .from("categories")
        .select("*")
        .order("sort_order");
      return error ? { error: friendlyDbError(error) } : { data };
    },
    async listProducts() {
      if (!CONFIGURED) return { data: [] };
      const { data, error } = await sb
        .from("products")
        .select("*")
        .order("sort_order");
      return error ? { error: friendlyDbError(error) } : { data };
    },
    async getProduct(id) {
      if (!CONFIGURED) return { error: NOT_CONFIGURED_MSG };
      const { data, error } = await sb
        .from("products")
        .select("*, categories(name)")
        .eq("id", id)
        .single();
      return error ? { error: "Product not found." } : { data };
    },
    async listDeals() {
      if (!CONFIGURED) return { data: [] };
      const { data, error } = await sb
        .from("deals")
        .select("*")
        .order("created_at");
      return error ? { error: friendlyDbError(error) } : { data };
    },
    async updateProduct(id, patch) {
      const { data, error } = await sb
        .from("products")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      return error ? { error: friendlyDbError(error) } : { data };
    },
    async createDeal(deal) {
      const { data, error } = await sb
        .from("deals")
        .insert(deal)
        .select()
        .single();
      return error ? { error: friendlyDbError(error) } : { data };
    },
    async updateDeal(id, patch) {
      const { data, error } = await sb
        .from("deals")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      return error ? { error: friendlyDbError(error) } : { data };
    },
    async deactivateDeal(id) {
      return catalog.updateDeal(id, { available: false });
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
        p_order_type: payload.order_type,
        p_delivery_area: payload.delivery_area,
        p_delivery_address: payload.delivery_address,
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
        ? { error: friendlyDbError(error) }
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
        ? { error: friendlyDbError(error) }
        : { data: normalize(data) };
    },
    async markDelivered(orderId) {
      const { data, error } = await sb.rpc("mark_order_delivered", {
        p_order_id: orderId,
      });
      return error ? { error: friendlyDbError(error) } : { data };
    },
  };

  return { auth, catalog, orders, storage };
})();
