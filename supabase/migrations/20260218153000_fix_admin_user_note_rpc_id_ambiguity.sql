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

CREATE OR REPLACE FUNCTION public.admin_update_user_note(
  p_note_id uuid,
  p_note text
)
RETURNS TABLE (
  id uuid,
  target_user_id uuid,
  actor_user_id uuid,
  note text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_note text;
  v_row public.admin_user_notes%ROWTYPE;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_admin_any_role(v_actor_id, ARRAY['admin_support','admin_ops','admin_super']::text[]) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  IF p_note_id IS NULL THEN
    RAISE EXCEPTION 'p_note_id is required';
  END IF;

  v_note := NULLIF(trim(COALESCE(p_note, '')), '');
  IF v_note IS NULL THEN
    RAISE EXCEPTION 'p_note is required';
  END IF;

  SELECT n.* INTO v_row
  FROM public.admin_user_notes AS n
  WHERE n.id = p_note_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Note not found';
  END IF;

  IF v_row.actor_user_id <> v_actor_id THEN
    RAISE EXCEPTION 'Only the author can edit this note';
  END IF;

  UPDATE public.admin_user_notes AS n
  SET note = v_note
  WHERE n.id = p_note_id
  RETURNING n.* INTO v_row;

  PERFORM public.log_admin_action(
    'user_internal_note_updated',
    'user',
    v_row.target_user_id::text,
    jsonb_build_object(
      'admin_user_note_id', v_row.id
    ),
    v_actor_id
  );

  RETURN QUERY
  SELECT v_row.id, v_row.target_user_id, v_row.actor_user_id, v_row.note, v_row.created_at, v_row.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_user_note(
  p_note_id uuid
)
RETURNS TABLE (
  id uuid,
  target_user_id uuid,
  actor_user_id uuid,
  note text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_is_super boolean;
  v_row public.admin_user_notes%ROWTYPE;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_admin_any_role(v_actor_id, ARRAY['admin_support','admin_ops','admin_super']::text[]) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  IF p_note_id IS NULL THEN
    RAISE EXCEPTION 'p_note_id is required';
  END IF;

  v_is_super := public.is_admin_any_role(v_actor_id, ARRAY['admin_super']::text[]);

  SELECT n.* INTO v_row
  FROM public.admin_user_notes AS n
  WHERE n.id = p_note_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Note not found';
  END IF;

  IF (v_row.actor_user_id <> v_actor_id) AND (NOT v_is_super) THEN
    RAISE EXCEPTION 'Only the author or super admin can delete this note';
  END IF;

  DELETE FROM public.admin_user_notes AS n
  WHERE n.id = p_note_id;

  PERFORM public.log_admin_action(
    'user_internal_note_deleted',
    'user',
    v_row.target_user_id::text,
    jsonb_build_object(
      'admin_user_note_id', v_row.id,
      'deleted_by_super', v_is_super AND (v_row.actor_user_id <> v_actor_id)
    ),
    v_actor_id
  );

  RETURN QUERY
  SELECT v_row.id, v_row.target_user_id, v_row.actor_user_id, v_row.note, v_row.created_at, v_row.updated_at;
END;
$$;
