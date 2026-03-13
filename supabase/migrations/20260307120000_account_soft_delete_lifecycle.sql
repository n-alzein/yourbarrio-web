BEGIN;

SET LOCAL statement_timeout = 0;
SET LOCAL lock_timeout = 0;
SET LOCAL idle_in_transaction_session_timeout = 0;
SET LOCAL client_encoding = 'UTF8';
SET LOCAL standard_conforming_strings = on;
SET LOCAL check_function_bodies = false;
SET LOCAL xmloption = content;
SET LOCAL client_min_messages = warning;

-- =========================================================
-- 30-day soft-delete lifecycle fields
-- Production-ready migration for public.users + public.businesses
-- =========================================================

-- ---------------------------------------------------------
-- 1) Add lifecycle columns to public.users
-- ---------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS account_status text,
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_purge_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS restored_at timestamptz,
  ADD COLUMN IF NOT EXISTS restored_by_admin_user_id uuid,
  ADD COLUMN IF NOT EXISTS deleted_by_admin_user_id uuid,
  ADD COLUMN IF NOT EXISTS deletion_reason text;

-- Backfill existing rows before NOT NULL / validation
UPDATE public.users
SET account_status = 'active'
WHERE account_status IS NULL
   OR btrim(account_status) = '';

ALTER TABLE public.users
  ALTER COLUMN account_status SET DEFAULT 'active',
  ALTER COLUMN account_status SET NOT NULL;

-- Recreate status constraint in a safe, idempotent way
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_account_status_valid;

ALTER TABLE public.users
  ADD CONSTRAINT users_account_status_valid
  CHECK (
    account_status IN ('active', 'pending_deletion', 'disabled', 'deleted')
  ) NOT VALID;

ALTER TABLE public.users
  VALIDATE CONSTRAINT users_account_status_valid;

-- Optional lifecycle sanity checks
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_deletion_schedule_consistency;

ALTER TABLE public.users
  ADD CONSTRAINT users_deletion_schedule_consistency
  CHECK (
    scheduled_purge_at IS NULL
    OR deletion_requested_at IS NULL
    OR scheduled_purge_at >= deletion_requested_at
  ) NOT VALID;

ALTER TABLE public.users
  VALIDATE CONSTRAINT users_deletion_schedule_consistency;

-- ---------------------------------------------------------
-- 2) Add lifecycle columns to public.businesses
-- ---------------------------------------------------------
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS account_status text,
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_purge_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS restored_at timestamptz;

-- Backfill existing rows before NOT NULL / validation
UPDATE public.businesses
SET account_status = 'active'
WHERE account_status IS NULL
   OR btrim(account_status) = '';

ALTER TABLE public.businesses
  ALTER COLUMN account_status SET DEFAULT 'active',
  ALTER COLUMN account_status SET NOT NULL;

ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_account_status_valid;

ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_account_status_valid
  CHECK (
    account_status IN ('active', 'pending_deletion', 'disabled', 'deleted')
  ) NOT VALID;

ALTER TABLE public.businesses
  VALIDATE CONSTRAINT businesses_account_status_valid;

ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_deletion_schedule_consistency;

ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_deletion_schedule_consistency
  CHECK (
    scheduled_purge_at IS NULL
    OR deletion_requested_at IS NULL
    OR scheduled_purge_at >= deletion_requested_at
  ) NOT VALID;

ALTER TABLE public.businesses
  VALIDATE CONSTRAINT businesses_deletion_schedule_consistency;

-- ---------------------------------------------------------
-- 3) Indexes
-- ---------------------------------------------------------
CREATE INDEX IF NOT EXISTS users_account_status_idx
  ON public.users (account_status);

CREATE INDEX IF NOT EXISTS users_pending_deletion_scheduled_purge_idx
  ON public.users (scheduled_purge_at)
  WHERE account_status = 'pending_deletion';

CREATE INDEX IF NOT EXISTS businesses_account_status_idx
  ON public.businesses (account_status);

CREATE INDEX IF NOT EXISTS businesses_pending_deletion_scheduled_purge_idx
  ON public.businesses (scheduled_purge_at)
  WHERE account_status = 'pending_deletion';

-- ---------------------------------------------------------
-- 4) Admin actor foreign keys on public.users
-- Assumes admin identities also exist in public.users(id)
-- ---------------------------------------------------------
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_restored_by_admin_user_id_fkey;

ALTER TABLE public.users
  ADD CONSTRAINT users_restored_by_admin_user_id_fkey
  FOREIGN KEY (restored_by_admin_user_id)
  REFERENCES public.users(id)
  ON DELETE SET NULL
  NOT VALID;

ALTER TABLE public.users
  VALIDATE CONSTRAINT users_restored_by_admin_user_id_fkey;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_deleted_by_admin_user_id_fkey;

ALTER TABLE public.users
  ADD CONSTRAINT users_deleted_by_admin_user_id_fkey
  FOREIGN KEY (deleted_by_admin_user_id)
  REFERENCES public.users(id)
  ON DELETE SET NULL
  NOT VALID;

ALTER TABLE public.users
  VALIDATE CONSTRAINT users_deleted_by_admin_user_id_fkey;

COMMIT;