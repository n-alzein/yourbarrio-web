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

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password_set boolean;

UPDATE public.users
SET password_set = true
WHERE password_set IS NULL;

ALTER TABLE public.users
  ALTER COLUMN password_set SET DEFAULT false;

ALTER TABLE public.users
  ALTER COLUMN password_set SET NOT NULL;

COMMENT ON COLUMN public.users.password_set IS
  'Whether the account has completed app-level password setup.';
