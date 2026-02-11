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

CREATE OR REPLACE FUNCTION public.admin_take_moderation_case(
  p_flag_id uuid
)
RETURNS TABLE(ok boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_admin_role('admin_ops') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  IF p_flag_id IS NULL THEN
    RAISE EXCEPTION 'p_flag_id is required';
  END IF;

  PERFORM public.admin_update_moderation_flag(
    p_flag_id,
    'in_review',
    NULL,
    jsonb_build_object('action', 'take_case')
  );

  RETURN QUERY SELECT true, 'case_taken'::text;
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
  v_existing_notes text;
  v_action_note text;
  v_next_notes text;
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

  SELECT mf.admin_notes
  INTO v_existing_notes
  FROM public.moderation_flags mf
  WHERE mf.id = p_flag_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Moderation flag not found';
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

  v_action_note := '[' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') ||
    '] Listing moderation action: hidden and resolved.';
  IF NULLIF(trim(COALESCE(p_notes, '')), '') IS NOT NULL THEN
    v_action_note := v_action_note || E'\nNotes: ' || trim(COALESCE(p_notes, ''));
  END IF;

  v_next_notes := concat_ws(
    E'\n\n',
    NULLIF(trim(COALESCE(v_existing_notes, '')), ''),
    v_action_note
  );

  PERFORM public.admin_update_moderation_flag(
    p_flag_id,
    'resolved',
    v_next_notes,
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
  v_existing_notes text;
  v_action_note text;
  v_next_notes text;
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

  SELECT mf.admin_notes
  INTO v_existing_notes
  FROM public.moderation_flags mf
  WHERE mf.id = p_flag_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Moderation flag not found';
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

  v_action_note := '[' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') ||
    '] Review moderation action: hidden and resolved.';
  IF NULLIF(trim(COALESCE(p_notes, '')), '') IS NOT NULL THEN
    v_action_note := v_action_note || E'\nNotes: ' || trim(COALESCE(p_notes, ''));
  END IF;

  v_next_notes := concat_ws(
    E'\n\n',
    NULLIF(trim(COALESCE(v_existing_notes, '')), ''),
    v_action_note
  );

  PERFORM public.admin_update_moderation_flag(
    p_flag_id,
    'resolved',
    v_next_notes,
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

REVOKE ALL ON FUNCTION public.admin_take_moderation_case(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_take_moderation_case(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_hide_listing_and_resolve_flag(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_hide_listing_and_resolve_flag(uuid, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_hide_review_and_resolve_flag(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_hide_review_and_resolve_flag(uuid, uuid, text) TO authenticated;
