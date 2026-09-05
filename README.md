# Little Chef Pizza — Ordering Website & Admin Portal

A complete, production-style restaurant ordering website for **Little Chef Pizza**
(Machli Chowk, Opp. Imam Bargah, East Circular Road, Gujrat), built with plain
HTML, CSS and vanilla JavaScript — no frameworks, no build step.

## Running it right now

No installation needed. Just open `index.html` in a browser (or serve the
folder with any static server, e.g. `npx serve .` / VS Code "Live Server").
Everything works immediately using the browser's `localStorage` as a stand-in
database, pre-seeded with the real Little Chef Pizza menu.

**Demo admin login:** username `admin`, password `admin123`
(shown on the admin login screen for convenience — change this before any
real deployment; see "Going to production" below).

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
`{ data }` or `{ error }`, exactly like a Supabase client call would. Today
those functions read/write `localStorage`; in production you point them at
Supabase instead. No page or component talks to `localStorage` directly, so
swapping the implementation is a change in one file.

**Order totals are never trusted from the browser.** `LCP_DB.orders.create()`
re-derives every price and validates availability from the current catalog
before writing an order — the exact same logic is mirrored server-side in
`supabase/policies.sql` as the `create_order()` Postgres function, which is
the *only* way a real Supabase deployment ever writes to the `orders` table.

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

## Going to production with Supabase

1. Create a Supabase project.
2. Run `supabase/schema.sql`, then `supabase/seed.sql`, then `supabase/policies.sql` in the SQL editor, in that order.
3. Create the admin account via **Dashboard → Authentication → Add user**
   (internal email like `admin@users.littlechefpizza.local`), then insert the
   matching `profiles` row as shown in the comment at the bottom of `seed.sql`.
   There is intentionally no admin signup anywhere in the app.
4. For username/password customer auth (no email field in the UI), map each
   username to an internal synthetic email (`username@users.littlechefpizza.local`)
   in a small Edge Function that wraps Supabase Auth's sign-up/sign-in calls —
   the browser never sees or stores that internal email.
5. Replace the bodies of the functions in `js/db.js` with calls to
   `supabase-js` (`supabase.from('products').select()`, `supabase.rpc('create_order', {...})`,
   etc.) using only the **anon/public** key in the browser — never the
   service role key.
6. Set the real delivery charge by updating the `delivery_charge` row in
   `site_settings` once the restaurant finalizes it (currently `TBD`
   everywhere, exactly as specified).

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
