-- =========================================================================
-- Little Chef Pizza — audit_fixes.sql
-- Run this AFTER location_and_payments.sql (and storage_policies.sql).
--
-- FIX: file size/type limits on uploads were previously enforced ONLY in
-- browser JavaScript (js/db.js). A user could bypass the website entirely
-- and upload an oversized or non-image file straight to the Storage API
-- with a valid anon key. This adds the same limits at the bucket level,
-- so they're enforced by Supabase itself regardless of what calls it.
-- =========================================================================

update storage.buckets
  set file_size_limit = 5242880,  -- 5 MB, matches the client-side check
      allowed_mime_types = array['image/png','image/jpeg','image/jpg','image/webp','image/gif']
  where id = 'payment-screenshots';

update storage.buckets
  set file_size_limit = 5242880,
      allowed_mime_types = array['image/png','image/jpeg','image/jpg','image/webp','image/gif']
  where id = 'menu-images';