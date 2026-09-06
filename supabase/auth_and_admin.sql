-- =========================================================================
-- Little Chef Pizza — auth_and_admin.sql
-- Run this AFTER schema.sql + seed.sql + policies.sql.
-- Adds: (1) auto-create a profiles row whenever someone signs up through
-- the website, (2) a safe way to check "is this username taken" without
-- exposing other users' data, (3) ready-to-run queries for changing the
-- admin's username and password.
-- =========================================================================

-- -------------------------------------------------------- is_username_taken
-- Lets the signup form check availability without granting broad SELECT
-- access to the profiles table (which stays locked down to "own row only").
create or replace function public.is_username_taken(p_username text) returns boolean
language sql security definer as $$
  select exists (select 1 from public.profiles where lower(username) = lower(p_username))
$$;
grant execute on function public.is_username_taken to anon, authenticated;

-- -------------------------------------------------------- handle_new_user
-- Fires automatically whenever a new row appears in Supabase's internal
-- auth.users table (i.e. every signUp() call from the website, AND every
-- user you create by hand in the Dashboard). It reads the metadata that
-- was passed in at signup time and creates the matching public.profiles
-- row — this is what makes username/full_name/phone/role available
-- without the client ever inserting into profiles directly.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer as $$
begin
  insert into public.profiles (auth_user_id, username, full_name, phone, role, area, address)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', 'New User'),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'role', 'customer'),
    new.raw_user_meta_data->>'area',
    new.raw_user_meta_data->>'address'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================================
-- CREATING THE ADMIN ACCOUNT (do this once)
-- =========================================================================
-- Dashboard → Authentication → Users → "Add user" → "Create new user":
--   Email:    admin@users.littlechefpizza.local
--   Password: choose a strong password
--   ✅ Auto Confirm User
--   User Metadata (there is a JSON field in the same form) — paste:
--     {"username":"admin","full_name":"Restaurant Admin","phone":"0300-0000000","role":"admin"}
--
-- The trigger above creates the matching public.profiles row for you
-- automatically, with role='admin' — no manual INSERT needed.
--
-- (If you already created the admin manually via SQL insert per earlier
-- instructions, before this trigger existed — that row is untouched and
-- still works fine. This trigger only affects NEW signups going forward.)


-- =========================================================================
-- CHANGING THE ADMIN USERNAME
-- Because login maps "username" -> "username@users.littlechefpizza.local"
-- deterministically, you must update BOTH the profiles row and the
-- matching auth.users email together, or login will break.
-- Run both statements together, replacing 'admin' / 'newadminname':
-- =========================================================================
update public.profiles
  set username = 'newadminname'
  where username = 'admin';

update auth.users
  set email = 'newadminname@users.littlechefpizza.local',
      raw_user_meta_data = jsonb_set(coalesce(raw_user_meta_data, '{}'::jsonb), '{username}', '"newadminname"')
  where email = 'admin@users.littlechefpizza.local';


-- =========================================================================
-- CHANGING THE ADMIN PASSWORD
-- Two options — either works:
--
-- OPTION A (recommended, no SQL): Dashboard → Authentication → Users →
-- click the admin's row → use the password reset / "Send magic link" flow,
-- or (on current Supabase dashboard versions) the user detail panel lets
-- you set a new password directly.
--
-- OPTION B (direct SQL — requires the pgcrypto extension, already enabled
-- in schema.sql via `create extension pgcrypto`). This writes a bcrypt
-- hash straight into Supabase Auth's internal password column:
-- =========================================================================
update auth.users
  set encrypted_password = crypt('YourNewStrongPassword123', gen_salt('bf'))
  where email = 'admin@users.littlechefpizza.local';   -- use the CURRENT admin email if you already renamed it above

-- After either option, log in on the website with the new password —
-- the username stays whatever you set it to above.


-- =========================================================================
-- CHANGING OTHER ADMIN DETAILS (full name / phone)
-- These live only in public.profiles and have no auth impact:
-- =========================================================================
update public.profiles
  set full_name = 'New Admin Name', phone = '0300-1234567'
  where role = 'admin';
