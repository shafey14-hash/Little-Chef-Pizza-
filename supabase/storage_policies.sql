-- =========================================================================
-- Little Chef Pizza — storage_policies.sql
-- Run this AFTER creating the "menu-images" bucket in the Dashboard
-- (Storage → New bucket → name: menu-images → Public bucket: ON).
--
-- "Public bucket" only makes files readable via their public URL without
-- policies. Uploading/replacing/deleting still requires explicit RLS
-- policies on storage.objects — these restrict that to admins only.
-- =========================================================================

drop policy if exists "menu_images_public_read" on storage.objects;
create policy "menu_images_public_read"
  on storage.objects for select
  using (bucket_id = 'menu-images');

drop policy if exists "menu_images_admin_insert" on storage.objects;
create policy "menu_images_admin_insert"
  on storage.objects for insert
  with check (bucket_id = 'menu-images' and public.is_admin());

drop policy if exists "menu_images_admin_update" on storage.objects;
create policy "menu_images_admin_update"
  on storage.objects for update
  using (bucket_id = 'menu-images' and public.is_admin())
  with check (bucket_id = 'menu-images' and public.is_admin());

drop policy if exists "menu_images_admin_delete" on storage.objects;
create policy "menu_images_admin_delete"
  on storage.objects for delete
  using (bucket_id = 'menu-images' and public.is_admin());

-- =========================================================================
-- SETUP CHECKLIST
-- 1. Storage → New bucket → name exactly: menu-images → toggle "Public bucket" ON → Create.
-- 2. Run this whole file in the SQL Editor.
-- 3. In the admin panel (Products & Prices / Deals), each row/card now has
--    an Upload / Change / Remove image widget — no bucket configuration
--    needed after this one-time setup.
-- =========================================================================