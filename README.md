# Little Chef Pizza — Ordering Website & Admin Portal

A complete, production-style restaurant ordering website for **Little Chef Pizza**
(Machli Chowk, Opp. Imam Bargah, East Circular Road, Gujrat), built with plain
HTML, CSS and vanilla JavaScript — no frameworks, no build step.

## Running it — this is now wired to real Supabase

This is the production version: `js/db.js` talks to a real Supabase
project (Postgres + Auth) via `supabase-js`, loaded from a CDN — there is
no build step. Before anything will work you must:

1. Run `supabase/schema.sql` → `supabase/seed.sql` → `supabase/policies.sql`
   → `supabase/auth_and_admin.sql`, in that exact order, in your Supabase
   project's SQL Editor.
2. In **Authentication → Providers → Email**, turn **OFF** "Confirm email".
   This app logs customers in with a username, mapped internally to a
   fake address like `alibaba@users.littlechefpizza.local` — no real inbox
   exists to click a confirmation link in, so confirmation must stay off.
3. Fill in `js/config.js` with your project's URL and **anon/public** key
   (Project Settings → API). This key is safe to commit — see the comment
   in that file for why.
4. Create the admin account exactly as described at the top of
   `supabase/auth_and_admin.sql`.

Then just open `index.html` (or deploy — see below). No `localStorage`
demo mode is left in this version; every signup, order, and admin action
hits the real database.

## What's inside

```
index.html            → Welcome/auth modal: Login as Customer, Login as Admin, Continue as Guest
customer/              → Customer portal (home, menu, deals, bucket, checkout, orders, profile)
admin/                 → Admin portal (dashboard, orders, products & prices, deals, order history)
css/                   → global design system, auth, customer, admin, responsive
js/
  seed-data.js         → extracted menu data (see "Menu extraction notes" below)
  db.js                → trusted data-access layer (see "Architecture" below)
  utils.js, validation.js, nav.js, cart.js, menu.js, checkout.js, admin.js, auth.js
assets/images/…        → image folders with placeholder comments (see below)
supabase/
  schema.sql           → full production Postgres schema for Supabase
  seed.sql             → same menu data as SQL inserts
  policies.sql         → Row Level Security + the trusted create_order() function
```

## Architecture

The whole app is written against one internal API, `LCP_DB` (in `js/db.js`).
Every function in it — `auth.signUp`, `auth.signIn`, `catalog.listProducts`,
`orders.create`, `orders.markDelivered`, etc. — is `async` and returns
`{ data }` or `{ error }`. No page talks to Supabase directly; they all go
through this one file, so the rest of the codebase never changes even if
the backend does.

**Order totals are never trusted from the browser.** `orders.create()` is a
thin wrapper around Postgres RPC `create_order()` (see
`supabase/policies.sql`), which re-derives every price and validates
availability from the current catalog *inside the database* before writing
anything. That function — running with elevated `SECURITY DEFINER`
privileges — is the *only* way a row is ever written to `orders`; there is
no public INSERT policy on that table at all, by design.

**Sessions are async.** Supabase's `getSession()` is a Promise, so every
page calls `await LCP_NAV.mountCustomer(...)` / `await LCP_NAV.mountAdmin(...)`
before reading `currentUser()`. If you add a new page, follow that same
pattern (see any file in `customer/` or `admin/` for the exact wrapper).

**Username-only login** is implemented by deterministically mapping every
username to an internal address, `<username>@users.littlechefpizza.local`,
which Supabase Auth uses for real underneath. The browser never shows this
address. A Postgres trigger (`handle_new_user` in
`supabase/auth_and_admin.sql`) automatically creates the matching
`public.profiles` row — with `role` read from signup metadata — every time
someone signs up, so the client never inserts into `profiles` directly.

## Menu extraction notes

The full menu (special pizzas, regular pizzas, six deals, fried corner,
rolls, wings, pasta, platters, drinks, etc.) was transcribed from the
physical menu photos you provided. Every item carries a `verified: true`
flag. Roughly a dozen items in the Fried Corner, Sandwich, Pasta and Drinks
sections were **not** fully legible in the photos (columns didn't line up
cleanly), so they're marked `verified: false` with a
`// TODO: VERIFY THIS MENU ITEM/PRICE AGAINST ORIGINAL MENU IMAGE` comment
in `js/seed-data.js` and `supabase/seed.sql`. In the **admin → Products &
Prices** and **admin → Deals** pages, these show a small "Verify" badge so
staff know exactly which entries to double-check against the real menu
before going live. Nothing was invented — where the photo was unclear, the
most reasonable reading was used and flagged.

## Image placeholders

No food photography is included, by design — you're generating that
separately. Every place an image belongs has a `// IMAGE PROMPT:` comment
(see `js/menu.js` inside `productCard()`, and the hero section in
`customer/home.html`) describing exactly what to generate, plus the
intended file path convention: `assets/images/menu/<slug>.webp`. Once you
have real images, add an `image_url` to the matching product/deal in
`seed-data.js` (or the `products`/`deals` table) and swap the placeholder
`<span>` in `productCard()` for an `<img>`.

## Changing the admin username / password

See `supabase/auth_and_admin.sql` — it has ready-to-run queries for:
- changing the admin's username (updates both `profiles` and the matching
  internal auth email, since login derives one from the other),
- changing the admin's password (a direct, safe SQL statement using
  `pgcrypto`, or the Dashboard UI as an alternative),
- changing the admin's full name / phone.

## Setting the real delivery charge

Currently `TBD` everywhere (per the brief). Once finalized, update it without
touching any code:

```sql
update public.site_settings set value = '150' where key = 'delivery_charge';
```

## What's deliberately NOT included

Per the brief: no inventory/ingredients/suppliers, no table management, no
ratings/reviews, no email field anywhere, no working online payment (shown
as "Coming Soon" and disabled), and the admin portal only has Dashboard,
Orders, Products & Prices, Deals, Order History and Settings — no
kitchen/staff/attendance modules.

## QA pass performed

- All JS files pass `node --check` (no syntax errors).
- Every `<script src>` / `<link href>` and every internal page link across
  all 13 HTML files was verified to resolve to a real file — no dead links.
- Manually traced: signup → login → guest mode → menu search/filter →
  add to bucket (products with sizes + deals) → quantity changes → checkout
  (all 3 order types) → cancellation acknowledgement gating → order
  creation → success screen → My Orders (customer) vs. guest-blocked →
  admin login → dashboard KPIs → mark order delivered → edit product
  price/availability → create/deactivate a deal → order history search.
- Delivery area dropdown is a true `<select>` (no free typing possible);
  choosing "no matching area" is impossible by construction since only the
  ten verified Gujrat-city chowks are listed.
- Double-submit guard on Place Order (`submitting` flag + disabled button
  during the request).
- Old order line items store `product_name_snapshot` / `unit_price_snapshot`
  at creation time — changing a product's price afterward does not alter
  historical orders (verified in `orders.create()`).
