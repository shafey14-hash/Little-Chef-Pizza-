-- =========================================================================
-- Little Chef Pizza — reset_customers.sql
-- ONE-OFF admin script: deletes EVERY customer account. Admins and past
-- order history are kept. Run in the Supabase SQL Editor STEP BY STEP
-- (preview first, then delete).
--
-- WHAT GETS DELETED (all via existing ON DELETE cascades):
--   auth.users (customers) → profiles → push_subscriptions,
--   app_push_tokens, vouchers. Step 4 then pulls campaigns.granted_count
--   back to 0 so the "First 100 Customers" campaign starts fresh.
--
-- WHAT SURVIVES:
--   * admin accounts (role = 'admin' is excluded),
--   * past orders — orders.user_id is ON DELETE SET NULL, so history and
--     revenue reports stay intact; they just lose the customer link.
--     (If you also want the old orders gone, say so — that is a separate,
--     deliberately destructive statement.)
-- =========================================================================

-- STEP 1 — PREVIEW: how many customer accounts will be deleted?
select count(*) as customers_to_delete
  from public.profiles
 where role = 'customer';

-- STEP 2 — DELETE every customer auth account (profiles, push tokens,
-- push subscriptions and vouchers all cascade automatically).
delete from auth.users
 where id in (select auth_user_id from public.profiles where role = 'customer');

-- STEP 3 — clear leftover one-time-password rows (no FK; transient data).
delete from public.email_verification_codes;

-- STEP 4 — reset campaign counters to the vouchers that actually exist
-- (after the cascade above this is 0, so First-100 restarts from scratch).
update public.campaigns c
   set granted_count = (
     select count(*) from public.vouchers v where v.campaign_id = c.id
   );

-- STEP 5 — VERIFY: expect profiles_left = admins_left, vouchers 0, counter 0.
select
  (select count(*) from public.profiles)                              as profiles_left,
  (select count(*) from public.profiles where role = 'admin')         as admins_left,
  (select count(*) from public.vouchers)                              as vouchers_left,
  (select granted_count from public.campaigns where key = 'first100') as first100_counter;
