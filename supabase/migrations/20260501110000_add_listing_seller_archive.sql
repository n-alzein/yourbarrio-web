SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.listings.deleted_at IS
  'Seller-initiated soft delete timestamp. Preserves order and inventory reservation history while hiding the listing from owner and public listing surfaces.';

CREATE INDEX IF NOT EXISTS listings_business_not_deleted_idx
  ON public.listings (business_id, created_at DESC)
  WHERE deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
