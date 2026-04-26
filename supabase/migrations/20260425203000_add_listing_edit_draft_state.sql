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
  ADD COLUMN IF NOT EXISTS draft_data jsonb;

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS has_unpublished_changes boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.listings.draft_data IS
  'Business-owner-only staged listing edits for published listings. Public reads must ignore this.';

COMMENT ON COLUMN public.listings.has_unpublished_changes IS
  'True when a published listing has saved draft edits that are not yet published.';

NOTIFY pgrst, 'reload schema';
