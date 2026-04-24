SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;

CREATE TABLE IF NOT EXISTS public.admin_account_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  deleted_at timestamptz DEFAULT now(),
  source text
);

ALTER TABLE public.admin_account_deletions
  ADD COLUMN IF NOT EXISTS id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS source text;

UPDATE public.admin_account_deletions
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE public.admin_account_deletions
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN deleted_at SET DEFAULT now(),
  ALTER COLUMN id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'admin_account_deletions'
      AND c.contype = 'p'
  ) THEN
    ALTER TABLE public.admin_account_deletions
      ADD CONSTRAINT admin_account_deletions_pkey PRIMARY KEY (id);
  END IF;
END $$;

GRANT ALL ON TABLE public.admin_account_deletions TO service_role;

COMMENT ON TABLE public.admin_account_deletions IS
  'Internal account deletion audit/workflow table. Restored to repo-managed schema parity from live production shape.';
