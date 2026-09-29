# Little Chef Pizza — Ordering Website & Admin Portal

A complete, production-style restaurant ordering website for **Little Chef Pizza**
(Machli Chowk, Opp. Imam Bargah, East Circular Road, Gujrat), built with plain
HTML, CSS and vanilla JavaScript — no frameworks, no build step.

## Running it — this is now wired to real Supabase

This is the production version: `js/db.js` talks to a real Supabase
project (Postgres + Auth) via `supabase-js`, loaded from a CDN — there is
no build step. Before anything will work you must:

1. Run these SQL files **in this exact order** in your Supabase project's
   SQL Editor:
   `supabase/schema.sql` → `supabase/seed.sql` → `supabase/policies.sql`
   → `supabase/auth_and_admin.sql` → `supabase/location_and_payments.sql`
   → `supabase/audit_fixes.sql` → `supabase/email_verification_codes.sql`.
2. Create a **Storage** bucket named exactly `menu-images` (Storage → New
   bucket → toggle "Public bucket" ON), then run `supabase/storage_policies.sql`.
   This powers the admin panel's direct image upload (max 5MB per image).
3. Set the Vercel environment variables listed in `.env.example`
   (`SUPABASE_SERVICE_ROLE_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`,
   `EMAIL_WEBHOOK_SECRET`, optional `SITE_URL`) — they are read only by
   the serverless functions in `api/*` and must never touch browser code.
4. In `supabase/order_email_notifications_trigger.sql`, replace the two
   placeholders (`https://YOUR-SITE.vercel.app` and `YOUR_WEBHOOK_SECRET`)
   with your real deployment URL and the same `EMAIL_WEBHOOK_SECRET` from
   step 3, then run it. This wires order-status emails (see "Emails" below).
5. Fill in `js/config.js` with your project's URL and **anon/public** key
   (Project Settings → API). This key is safe to commit — see the comment
   in that file for why.
6. Create the admin account exactly as described at the top of
   `supabase/auth_and_admin.sql`.

Then just open `index.html` (or deploy — see below). No `localStorage`
demo mode is left in this version; every signup, order, and admin action
hits the real database.

## What's inside

```
index.html            → Location gate + welcome/auth modal (login, signup, guest)
customer/              → Customer portal (home, menu, deals, bucket, checkout, orders, profile)
admin/                 → Admin portal (dashboard, orders, products & prices, deals, order history)
css/                   → global design system, auth, customer, admin, responsive
js/
  seed-data.js         → extracted menu data (see "Menu extraction notes" below)
  db.js                → trusted data-access layer (see "Architecture" below)
  utils.js, validation.js, nav.js, cart.js, menu.js, checkout.js, admin.js, auth.js
api/                   → Vercel serverless functions (see "Emails" below)
  _lib/email-template.js    → branded HTML email engine (layout + components)
  _lib/supabase-admin.js    → service-role helpers (GoTrue admin REST + PostgREST)
  auth-signup.js            → creates user unconfirmed, emails a 6-digit OTP
  auth-verify-otp.js        → checks the OTP, confirms the user server-side
  auth-resend-otp.js        → throttled OTP resend
  send-order-email.js       → order status emails (called by the DB trigger)
assets/images/…        → image folders with placeholder comments (see below)
supabase/
  schema.sql           → full production Postgres schema for Supabase
  seed.sql             → same menu data as SQL inserts
  policies.sql         → Row Level Security + the trusted create_order() function
  auth_and_admin.sql   → profiles trigger + is_admin() + admin account setup
  location_and_payments.sql → delivery charge, EasyPaisa settings, order status fns
  audit_fixes.sql      → audit-log trigger fixes
  email_verification_codes.sql → our own OTP store (service-role only)
  order_email_notifications_trigger.sql → pg_net webhook → /api/send-order-email
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
availability from the current catalog _inside the database_ before writing
anything. That function — running with elevated `SECURITY DEFINER`
privileges — is the _only_ way a row is ever written to `orders`; there is
no public INSERT policy on that table at all, by design.

**Sessions are async.** Supabase's `getSession()` is a Promise, so every
page calls `await LCP_NAV.mountCustomer(...)` / `await LCP_NAV.mountAdmin(...)`
before reading `currentUser()`. If you add a new page, follow that same
pattern (see any file in `customer/` or `admin/` for the exact wrapper).

**Email/phone login + custom OTP.** Customers sign up with a real email
address and phone number. The browser calls `POST /api/auth-signup`, which
creates the Supabase auth user **unconfirmed** (via the service-role admin
API — Supabase's own confirmation email is never sent) and emails the
customer a 6-digit code through our own branded template. `verify-otp`
checks the code against the `email_verification_codes` table and confirms
the user server-side; `auth.js` then signs them in with the password they
just chose. Logging in accepts either the email or the phone number
(`lookup_email_by_phone` resolves a phone to its email server-side). Admin
accounts still use the internal username→synthetic-email mapping and are
completely separate. A Postgres trigger (`handle_new_user` in
`supabase/auth_and_admin.sql`) automatically creates the matching
`public.profiles` row — with `role` read from signup metadata — every time
someone signs up, so the client never inserts into `profiles` directly.

## Mobile app (Android APK)

`app/` is a **Capacitor 6 wrapper** that loads the live website (`server.url`
in `app/capacitor.config.json`). The app is literally the same website, so it
shares the same Supabase database, auth, APIs and realtime subscriptions —
and **almost every website change applies to the app instantly with no new
APK**, because the app renders the live site. Only changes to `app/` itself
(icons, native config, plugins) need a rebuild.

- **Build & release** — `.github/workflows/android-apk.yml` builds the APK in
  the cloud (GitHub Actions: npm ci → cap sync → gradle → sign with
  apksigner) and publishes it as a Release tagged `latest`. The asset is
  always named `app.apk`, so the download link and the QR code
  (`assets/images/app-download-qr.png`) never change:
  `https://github.com/shafey14-hash/Little-Chef-Pizza-/releases/latest/download/app.apk`
- **Signing** — the release APK is signed with a PKCS#12 keystore
  (`littlechef-keystore.p12`, gitignored). The matching values live in 4 repo
  secrets: `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`.
  Until those secrets exist, the workflow builds a **debug APK** so the
  pipeline works end-to-end from day one. Never lose the keystore — Android
  refuses to install a new APK over an old one if the signing key differs.
- **Website download section** — `customer/download.html` + a home-page
  banner offer the direct APK link and QR code. Inside the app these are
  hidden automatically (`window.Capacitor.isNativePlatform()` adds an `is-app`
  class to `<html>` and CSS hides the download section + footer link), so
  customers only see the download prompt on the website.

## Emails

All emails are built **in code** and sent through Nodemailer + Gmail SMTP
(`api/_lib/email-template.js`) — Supabase's built-in email sending is not
used at all (it has rate limits and no branding control). The shared
template engine renders table-based, inline-styled HTML in the site's own
black/gold design: dark gradient header with the 🍕 wordmark, a coloured
status banner, an order summary box (items, quantities, totals in Rs.), a
support footer with phone/WhatsApp, and a plain-text fallback for every
message.

- **OTP verification emails** — `api/auth-signup.js` sends the code when an
  account is created (or refreshed, if an unconfirmed account signs up
  again); `api/auth-resend-otp.js` handles resends (60-second throttle);
  `api/auth-verify-otp.js` validates it (5 attempts max, 10-minute expiry).
- **Order status emails** — a Postgres trigger
  (`trg_order_email` in `supabase/order_email_notifications_trigger.sql`)
  fires on order insert and on every status change, and uses `pg_net` to
  POST the order to `/api/send-order-email` with a shared-secret header.
  The function builds a branded email per event: order received (payment
  being verified for EasyPaisa, confirmed for COD), payment approved,
  out for delivery, delivered, and rejected/cancelled/failed-delivery
  variants — each with the matching banner colour and a full order summary.

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
ratings/reviews, no online card payment (EasyPaisa transfer + cash on
delivery instead), and the admin portal only has Dashboard,
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
