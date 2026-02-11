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

ALTER TABLE public.moderation_flags
  ADD COLUMN IF NOT EXISTS target_listing_id uuid,
  ADD COLUMN IF NOT EXISTS target_review_id uuid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'moderation_flags_status_valid'
      AND conrelid = 'public.moderation_flags'::regclass
  ) THEN
    ALTER TABLE public.moderation_flags
      DROP CONSTRAINT moderation_flags_status_valid;
  END IF;
END $$;

UPDATE public.moderation_flags
SET status = 'in_review'
WHERE status = 'triaged';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'moderation_flags_status_valid'
      AND conrelid = 'public.moderation_flags'::regclass
  ) THEN
    ALTER TABLE public.moderation_flags
      ADD CONSTRAINT moderation_flags_status_valid
      CHECK (status IN ('open', 'in_review', 'resolved', 'dismissed'));
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'moderation_flags_exactly_one_target'
      AND conrelid = 'public.moderation_flags'::regclass
  ) THEN
    ALTER TABLE public.moderation_flags
      DROP CONSTRAINT moderation_flags_exactly_one_target;
  END IF;

  ALTER TABLE public.moderation_flags
    ADD CONSTRAINT moderation_flags_exactly_one_target
    CHECK (
      num_nonnulls(
        target_user_id,
        target_business_id,
        target_listing_id,
        target_review_id
      ) = 1
    ) NOT VALID;
END $$;

CREATE INDEX IF NOT EXISTS idx_moderation_flags_status_created_at
  ON public.moderation_flags(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_moderation_flags_target_user_id
  ON public.moderation_flags(target_user_id);

CREATE INDEX IF NOT EXISTS idx_moderation_flags_target_business_id
  ON public.moderation_flags(target_business_id);

CREATE INDEX IF NOT EXISTS idx_moderation_flags_target_listing_id
  ON public.moderation_flags(target_listing_id);

CREATE INDEX IF NOT EXISTS idx_moderation_flags_target_review_id
  ON public.moderation_flags(target_review_id);

CREATE INDEX IF NOT EXISTS idx_moderation_flags_created_by_user_id
  ON public.moderation_flags(created_by_user_id);

CREATE OR REPLACE FUNCTION public.set_row_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS moderation_flags_set_updated_at ON public.moderation_flags;
CREATE TRIGGER moderation_flags_set_updated_at
BEFORE UPDATE ON public.moderation_flags
FOR EACH ROW
EXECUTE FUNCTION public.set_row_updated_at();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'moderation_flags'
      AND policyname = 'Users can read own moderation flags'
  ) THEN
    DROP POLICY "Users can read own moderation flags" ON public.moderation_flags;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'moderation_flags'
      AND policyname = 'Users can read own moderation flags'
  ) THEN
    CREATE POLICY "Users can read own moderation flags"
      ON public.moderation_flags
      FOR SELECT
      TO authenticated
      USING (created_by_user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'moderation_flags'
      AND policyname = 'Admins can read moderation flags'
  ) THEN
    DROP POLICY "Admins can read moderation flags" ON public.moderation_flags;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'moderation_flags'
      AND policyname = 'Admins can read moderation flags'
  ) THEN
    CREATE POLICY "Admins can read moderation flags"
      ON public.moderation_flags
      FOR SELECT
      TO authenticated
      USING (public.has_admin_role('admin_readonly'));
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'moderation_flags'
      AND policyname = 'Users can create own moderation flags'
  ) THEN
    DROP POLICY "Users can create own moderation flags" ON public.moderation_flags;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'moderation_flags'
      AND policyname = 'Users can create own moderation flags'
  ) THEN
    CREATE POLICY "Users can create own moderation flags"
      ON public.moderation_flags
      FOR INSERT
      TO authenticated
      WITH CHECK (
        auth.uid() IS NOT NULL
        AND created_by_user_id = auth.uid()
        AND status = 'open'
        AND reviewed_by_user_id IS NULL
        AND reviewed_at IS NULL
        AND num_nonnulls(
          target_user_id,
          target_business_id,
          target_listing_id,
          target_review_id
        ) = 1
      );
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'moderation_flags'
      AND policyname = 'Ops and super can update moderation flags'
  ) THEN
    DROP POLICY "Ops and super can update moderation flags" ON public.moderation_flags;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'moderation_flags'
      AND policyname = 'Admins can update moderation flags'
  ) THEN
    DROP POLICY "Admins can update moderation flags" ON public.moderation_flags;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'moderation_flags'
      AND policyname = 'Ops and super can update moderation flags'
  ) THEN
    CREATE POLICY "Ops and super can update moderation flags"
      ON public.moderation_flags
      FOR UPDATE
      TO authenticated
      USING (public.has_admin_role('admin_ops'))
      WITH CHECK (public.has_admin_role('admin_ops'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.create_moderation_flag(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_details text DEFAULT NULL,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_target_type text;
  v_reason text;
  v_allowed_reasons text[];
  v_existing_id uuid;
  v_inserted_id uuid;
  v_target_user_id uuid;
  v_target_business_id uuid;
  v_target_listing_id uuid;
  v_target_review_id uuid;
  v_listing_owner_id uuid;
  v_review_customer_id uuid;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_target_type := lower(trim(COALESCE(p_target_type, '')));
  v_reason := lower(trim(COALESCE(p_reason, '')));

  IF v_target_type NOT IN ('user', 'business', 'listing', 'review') THEN
    RAISE EXCEPTION 'Invalid target type';
  END IF;

  IF p_target_id IS NULL THEN
    RAISE EXCEPTION 'Target id is required';
  END IF;

  IF length(COALESCE(p_details, '')) > 1000 THEN
    RAISE EXCEPTION 'Details too long';
  END IF;

  IF v_target_type = 'listing' THEN
    v_allowed_reasons := ARRAY['scam_or_fraud', 'prohibited_item', 'misleading_or_inaccurate', 'spam', 'other'];
  ELSIF v_target_type = 'review' THEN
    v_allowed_reasons := ARRAY['spam', 'offensive_or_hate', 'harassment', 'fake_or_manipulated', 'other'];
  ELSE
    v_allowed_reasons := ARRAY['harassment', 'scam_or_fraud', 'impersonation', 'spam', 'other'];
  END IF;

  IF NOT (v_reason = ANY(v_allowed_reasons)) THEN
    RAISE EXCEPTION 'Invalid reason for target type';
  END IF;

  IF v_target_type = 'user' THEN
    SELECT u.id INTO v_target_user_id
    FROM public.users u
    WHERE u.id = p_target_id;

    IF v_target_user_id IS NULL THEN
      RAISE EXCEPTION 'Target user not found';
    END IF;

    IF v_target_user_id = v_actor_id THEN
      RAISE EXCEPTION 'Cannot report yourself';
    END IF;
  ELSIF v_target_type = 'business' THEN
    SELECT u.id INTO v_target_business_id
    FROM public.users u
    WHERE u.id = p_target_id
      AND lower(COALESCE(u.role, '')) = 'business';

    IF v_target_business_id IS NULL THEN
      RAISE EXCEPTION 'Target business not found';
    END IF;

    IF v_target_business_id = v_actor_id THEN
      RAISE EXCEPTION 'Cannot report your own business account';
    END IF;
  ELSIF v_target_type = 'listing' THEN
    SELECT l.id, l.business_id
    INTO v_target_listing_id, v_listing_owner_id
    FROM public.listings l
    WHERE l.id = p_target_id;

    IF v_target_listing_id IS NULL THEN
      RAISE EXCEPTION 'Target listing not found';
    END IF;

    IF v_listing_owner_id = v_actor_id THEN
      RAISE EXCEPTION 'Cannot report your own listing';
    END IF;
  ELSE
    IF to_regclass('public.business_reviews') IS NULL THEN
      RAISE EXCEPTION 'Review reporting is unavailable';
    END IF;

    EXECUTE
      'SELECT id, customer_id FROM public.business_reviews WHERE id = $1'
      INTO v_target_review_id, v_review_customer_id
      USING p_target_id;

    IF v_target_review_id IS NULL THEN
      RAISE EXCEPTION 'Target review not found';
    END IF;

    IF v_review_customer_id = v_actor_id THEN
      RAISE EXCEPTION 'Cannot report your own review';
    END IF;
  END IF;

  SELECT mf.id
  INTO v_existing_id
  FROM public.moderation_flags mf
  WHERE mf.created_by_user_id = v_actor_id
    AND mf.reason = v_reason
    AND mf.status IN ('open', 'in_review')
    AND mf.created_at >= (now() - interval '24 hours')
    AND (
      (v_target_type = 'user' AND mf.target_user_id = v_target_user_id)
      OR (v_target_type = 'business' AND mf.target_business_id = v_target_business_id)
      OR (v_target_type = 'listing' AND mf.target_listing_id = v_target_listing_id)
      OR (v_target_type = 'review' AND mf.target_review_id = v_target_review_id)
    )
  ORDER BY mf.created_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  INSERT INTO public.moderation_flags (
    created_by_user_id,
    target_user_id,
    target_business_id,
    target_listing_id,
    target_review_id,
    reason,
    details,
    status,
    admin_notes,
    reviewed_by_user_id,
    reviewed_at,
    meta
  ) VALUES (
    v_actor_id,
    v_target_user_id,
    v_target_business_id,
    v_target_listing_id,
    v_target_review_id,
    v_reason,
    NULLIF(trim(COALESCE(p_details, '')), ''),
    'open',
    NULL,
    NULL,
    NULL,
    COALESCE(p_meta, '{}'::jsonb)
      || jsonb_build_object(
        'target_type', v_target_type,
        'target_id', p_target_id,
        'reason_code', v_reason
      )
  )
  RETURNING id INTO v_inserted_id;

  RETURN v_inserted_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_business_review_field(
  p_review_id uuid,
  p_field text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_value text;
BEGIN
  IF p_review_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF to_regclass('public.business_reviews') IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_field NOT IN ('title', 'body', 'business_id', 'customer_id') THEN
    RETURN NULL;
  END IF;

  EXECUTE format(
    'SELECT %I::text FROM public.business_reviews WHERE id = $1 LIMIT 1',
    p_field
  )
  INTO v_value
  USING p_review_id;

  RETURN v_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_moderation_flags(
  p_type text DEFAULT 'all',
  p_status text DEFAULT NULL,
  p_q text DEFAULT NULL,
  p_from integer DEFAULT 0,
  p_to integer DEFAULT 19
)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  status text,
  reason text,
  details text,
  admin_notes text,
  reviewed_at timestamptz,
  reviewed_by_user_id uuid,
  target_type text,
  target_id uuid,
  reporter_user_id uuid,
  reporter_name text,
  reporter_email text,
  target_label text,
  target_subtext text,
  meta jsonb,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text := lower(trim(COALESCE(p_type, 'all')));
  v_status text := lower(trim(COALESCE(p_status, '')));
  v_q text := NULLIF(trim(COALESCE(p_q, '')), '');
  v_from integer := GREATEST(COALESCE(p_from, 0), 0);
  v_to integer := GREATEST(COALESCE(p_to, 19), 0);
  v_limit integer := GREATEST(v_to - v_from + 1, 0);
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR (auth.uid() IS NOT NULL AND public.has_admin_role('admin_ops'))
  ) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  IF v_type NOT IN ('all', 'user', 'business', 'listing', 'review') THEN
    v_type := 'all';
  END IF;

  IF v_status = '' THEN
    v_status := NULL;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      mf.id,
      mf.created_at,
      mf.updated_at,
      mf.status,
      mf.reason,
      mf.details,
      mf.admin_notes,
      mf.reviewed_at,
      mf.reviewed_by_user_id,
      mf.target_user_id,
      mf.target_business_id,
      mf.target_listing_id,
      mf.target_review_id,
      mf.meta,
      mf.created_by_user_id,
      CASE
        WHEN mf.target_listing_id IS NOT NULL THEN 'listing'
        WHEN mf.target_review_id IS NOT NULL THEN 'review'
        WHEN mf.target_business_id IS NOT NULL THEN 'business'
        ELSE 'user'
      END AS target_type,
      COALESCE(mf.target_listing_id, mf.target_review_id, mf.target_business_id, mf.target_user_id) AS target_id,
      reporter.full_name AS reporter_full_name,
      reporter.business_name AS reporter_business_name,
      reporter.email AS reporter_email,
      target_user.full_name AS target_user_full_name,
      target_user.business_name AS target_user_business_name,
      target_user.email AS target_user_email,
      target_business.full_name AS target_business_full_name,
      target_business.business_name AS target_business_business_name,
      target_business.email AS target_business_email,
      listings.title AS listing_title,
      listings.business_id AS listing_business_id
    FROM public.moderation_flags mf
    LEFT JOIN public.users reporter
      ON reporter.id = mf.created_by_user_id
    LEFT JOIN public.users target_user
      ON target_user.id = mf.target_user_id
    LEFT JOIN public.users target_business
      ON target_business.id = mf.target_business_id
    LEFT JOIN public.listings listings
      ON listings.id = mf.target_listing_id
  ),
  enriched AS (
    SELECT
      b.*,
      listing_owner.full_name AS listing_owner_full_name,
      listing_owner.business_name AS listing_owner_business_name,
      listing_owner.email AS listing_owner_email,
      (
        CASE
          WHEN b.target_type = 'listing' THEN COALESCE(NULLIF(trim(b.listing_title), ''), 'Listing')
          WHEN b.target_type = 'review' THEN (
            CASE
              WHEN to_regclass('public.business_reviews') IS NULL THEN 'Review'
              ELSE COALESCE(
                NULLIF(
                  left(public.get_business_review_field(b.target_review_id, 'body'), 120),
                  ''
                ),
                NULLIF(
                  left(public.get_business_review_field(b.target_review_id, 'title'), 120),
                  ''
                ),
                'Review'
              )
            END
          )
          WHEN b.target_type = 'business' THEN COALESCE(
            NULLIF(trim(b.target_business_business_name), ''),
            NULLIF(trim(b.target_business_full_name), ''),
            NULLIF(trim(b.target_business_email), ''),
            'Business'
          )
          ELSE COALESCE(
            NULLIF(trim(b.target_user_full_name), ''),
            NULLIF(trim(b.target_user_business_name), ''),
            NULLIF(trim(b.target_user_email), ''),
            'User'
          )
        END
      ) AS target_label,
      (
        CASE
          WHEN b.target_type = 'listing' THEN COALESCE(
            NULLIF(trim(listing_owner.business_name), ''),
            NULLIF(trim(listing_owner.full_name), ''),
            NULLIF(trim(listing_owner.email), ''),
            ''
          )
          WHEN b.target_type = 'review' THEN (
            CASE
              WHEN to_regclass('public.business_reviews') IS NULL THEN ''
              ELSE COALESCE(
                NULLIF(
                  (
                    SELECT COALESCE(NULLIF(trim(owner.business_name), ''), NULLIF(trim(owner.full_name), ''), NULLIF(trim(owner.email), ''), '')
                    FROM public.users owner
                    WHERE owner.id = public.get_business_review_field(b.target_review_id, 'business_id')::uuid
                  ),
                  ''
                ),
                ''
              )
            END
          )
          WHEN b.target_type = 'business' THEN COALESCE(NULLIF(trim(b.target_business_email), ''), '')
          ELSE COALESCE(NULLIF(trim(b.target_user_email), ''), '')
        END
      ) AS target_subtext,
      COALESCE(
        NULLIF(trim(b.reporter_full_name), ''),
        NULLIF(trim(b.reporter_business_name), ''),
        NULLIF(trim(b.reporter_email), ''),
        'User'
      ) AS reporter_name,
      COALESCE(b.reporter_email, '') AS reporter_email_resolved
    FROM base b
    LEFT JOIN public.users listing_owner
      ON listing_owner.id = b.listing_business_id
  ),
  filtered AS (
    SELECT *
    FROM enriched e
    WHERE
      (v_type = 'all' OR e.target_type = v_type)
      AND (v_status IS NULL OR lower(e.status) = v_status)
      AND (
        v_q IS NULL
        OR e.reason ILIKE '%' || v_q || '%'
        OR COALESCE(e.details, '') ILIKE '%' || v_q || '%'
        OR COALESCE(e.reporter_name, '') ILIKE '%' || v_q || '%'
        OR COALESCE(e.reporter_email_resolved, '') ILIKE '%' || v_q || '%'
        OR COALESCE(e.target_label, '') ILIKE '%' || v_q || '%'
        OR COALESCE(e.target_subtext, '') ILIKE '%' || v_q || '%'
      )
  ),
  counted AS (
    SELECT
      f.*,
      count(*) OVER () AS total_count
    FROM filtered f
  )
  SELECT
    c.id,
    c.created_at,
    c.updated_at,
    c.status,
    c.reason,
    c.details,
    c.admin_notes,
    c.reviewed_at,
    c.reviewed_by_user_id,
    c.target_type,
    c.target_id,
    c.created_by_user_id AS reporter_user_id,
    c.reporter_name,
    c.reporter_email_resolved AS reporter_email,
    c.target_label,
    c.target_subtext,
    c.meta,
    c.total_count
  FROM counted c
  ORDER BY c.created_at DESC
  OFFSET v_from
  LIMIT v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_moderation_flag(
  p_flag_id uuid,
  p_status text,
  p_admin_notes text DEFAULT NULL,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_status text;
  v_prev_status text;
  v_target_type text;
  v_target_id uuid;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_admin_role('admin_ops') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  v_status := lower(trim(COALESCE(p_status, '')));
  IF v_status NOT IN ('open', 'in_review', 'resolved', 'dismissed') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  SELECT
    mf.status,
    CASE
      WHEN mf.target_listing_id IS NOT NULL THEN 'listing'
      WHEN mf.target_review_id IS NOT NULL THEN 'review'
      WHEN mf.target_business_id IS NOT NULL THEN 'business'
      ELSE 'user'
    END,
    COALESCE(mf.target_listing_id, mf.target_review_id, mf.target_business_id, mf.target_user_id)
  INTO v_prev_status, v_target_type, v_target_id
  FROM public.moderation_flags mf
  WHERE mf.id = p_flag_id;

  IF v_prev_status IS NULL THEN
    RAISE EXCEPTION 'Moderation flag not found';
  END IF;

  UPDATE public.moderation_flags
  SET
    status = v_status,
    admin_notes = CASE
      WHEN p_admin_notes IS NULL THEN admin_notes
      ELSE NULLIF(trim(p_admin_notes), '')
    END,
    reviewed_by_user_id = v_actor_id,
    reviewed_at = now()
  WHERE id = p_flag_id;

  PERFORM public.log_admin_action(
    'moderation_flag_update',
    'moderation_flag',
    p_flag_id::text,
    jsonb_build_object(
      'flag_id', p_flag_id,
      'previous_status', v_prev_status,
      'new_status', v_status,
      'target_type', v_target_type,
      'target_id', v_target_id,
      'admin_notes', NULLIF(trim(COALESCE(p_admin_notes, '')), '')
    ) || COALESCE(p_meta, '{}'::jsonb),
    v_actor_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_hide_listing_and_resolve_flag(
  p_flag_id uuid,
  p_listing_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_has_column boolean;
  v_hidden boolean := false;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_admin_role('admin_ops') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  IF p_flag_id IS NULL OR p_listing_id IS NULL THEN
    RAISE EXCEPTION 'p_flag_id and p_listing_id are required';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'listings'
      AND column_name = 'is_published'
  ) INTO v_has_column;

  IF v_has_column THEN
    EXECUTE 'UPDATE public.listings SET is_published = false WHERE id = $1' USING p_listing_id;
    v_hidden := true;
  END IF;

  IF NOT v_hidden THEN
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'listings'
        AND column_name = 'is_active'
    ) INTO v_has_column;

    IF v_has_column THEN
      EXECUTE 'UPDATE public.listings SET is_active = false WHERE id = $1' USING p_listing_id;
      v_hidden := true;
    END IF;
  END IF;

  IF NOT v_hidden THEN
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'listings'
        AND column_name = 'deleted_at'
    ) INTO v_has_column;

    IF v_has_column THEN
      EXECUTE 'UPDATE public.listings SET deleted_at = now() WHERE id = $1' USING p_listing_id;
      v_hidden := true;
    END IF;
  END IF;

  PERFORM public.admin_update_moderation_flag(
    p_flag_id,
    'resolved',
    p_notes,
    jsonb_build_object(
      'action', 'hide_listing_and_resolve_flag',
      'listing_id', p_listing_id,
      'listing_hidden', v_hidden
    )
  );

  PERFORM public.log_admin_action(
    'moderation_hide_listing',
    'listing',
    p_listing_id::text,
    jsonb_build_object(
      'flag_id', p_flag_id,
      'listing_id', p_listing_id,
      'listing_hidden', v_hidden,
      'notes', NULLIF(trim(COALESCE(p_notes, '')), '')
    ),
    v_actor_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_hide_review_and_resolve_flag(
  p_flag_id uuid,
  p_review_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_has_column boolean;
  v_hidden boolean := false;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_admin_role('admin_ops') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  IF p_flag_id IS NULL OR p_review_id IS NULL THEN
    RAISE EXCEPTION 'p_flag_id and p_review_id are required';
  END IF;

  IF to_regclass('public.business_reviews') IS NULL THEN
    RAISE EXCEPTION 'business_reviews table not found';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'business_reviews'
      AND column_name = 'is_hidden'
  ) INTO v_has_column;

  IF v_has_column THEN
    EXECUTE 'UPDATE public.business_reviews SET is_hidden = true WHERE id = $1' USING p_review_id;
    v_hidden := true;
  END IF;

  IF NOT v_hidden THEN
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'business_reviews'
        AND column_name = 'is_published'
    ) INTO v_has_column;

    IF v_has_column THEN
      EXECUTE 'UPDATE public.business_reviews SET is_published = false WHERE id = $1' USING p_review_id;
      v_hidden := true;
    END IF;
  END IF;

  IF NOT v_hidden THEN
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'business_reviews'
        AND column_name = 'is_active'
    ) INTO v_has_column;

    IF v_has_column THEN
      EXECUTE 'UPDATE public.business_reviews SET is_active = false WHERE id = $1' USING p_review_id;
      v_hidden := true;
    END IF;
  END IF;

  IF NOT v_hidden THEN
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'business_reviews'
        AND column_name = 'deleted_at'
    ) INTO v_has_column;

    IF v_has_column THEN
      EXECUTE 'UPDATE public.business_reviews SET deleted_at = now() WHERE id = $1' USING p_review_id;
      v_hidden := true;
    END IF;
  END IF;

  PERFORM public.admin_update_moderation_flag(
    p_flag_id,
    'resolved',
    p_notes,
    jsonb_build_object(
      'action', 'hide_review_and_resolve_flag',
      'review_id', p_review_id,
      'review_hidden', v_hidden
    )
  );

  PERFORM public.log_admin_action(
    'moderation_hide_review',
    'review',
    p_review_id::text,
    jsonb_build_object(
      'flag_id', p_flag_id,
      'review_id', p_review_id,
      'review_hidden', v_hidden,
      'notes', NULLIF(trim(COALESCE(p_notes, '')), '')
    ),
    v_actor_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_moderation_flag(text, uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_moderation_flag(text, uuid, text, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.get_business_review_field(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_business_review_field(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_list_moderation_flags(text, text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_moderation_flags(text, text, text, integer, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_update_moderation_flag(uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_moderation_flag(uuid, text, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_hide_listing_and_resolve_flag(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_hide_listing_and_resolve_flag(uuid, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_hide_review_and_resolve_flag(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_hide_review_and_resolve_flag(uuid, uuid, text) TO authenticated;
