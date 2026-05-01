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

ALTER TABLE public.carts
  ADD COLUMN IF NOT EXISTS guest_id text;

ALTER TABLE public.carts
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.cart_items
  ADD COLUMN IF NOT EXISTS reserved_quantity integer,
  ADD COLUMN IF NOT EXISTS reservation_expires_at timestamptz;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS cart_item_id uuid;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS inventory_committed_at timestamptz;

UPDATE public.cart_items
SET reserved_quantity = quantity
WHERE reserved_quantity IS NULL;

UPDATE public.cart_items
SET reservation_expires_at = COALESCE(updated_at, created_at, now()) + interval '30 minutes'
WHERE reservation_expires_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'carts_owner_or_guest_check'
      AND conrelid = 'public.carts'::regclass
  ) THEN
    -- Existing carts were historically authenticated-only, but add this as
    -- NOT VALID so the migration cannot fail if any unexpected legacy rows
    -- exist. New writes are still checked immediately.
    ALTER TABLE public.carts
      ADD CONSTRAINT carts_owner_or_guest_check
      CHECK (
        (user_id IS NOT NULL AND guest_id IS NULL)
        OR (user_id IS NULL AND guest_id IS NOT NULL)
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cart_items_reserved_quantity_check'
      AND conrelid = 'public.cart_items'::regclass
  ) THEN
    -- Mirrors the existing hard DB order cap of 5 units per line.
    ALTER TABLE public.cart_items
      ADD CONSTRAINT cart_items_reserved_quantity_check
      CHECK (
        reserved_quantity IS NOT NULL
        AND reserved_quantity >= 1
        AND reserved_quantity <= 5
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'order_items_cart_item_id_fkey'
      AND conrelid = 'public.order_items'::regclass
  ) THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_cart_item_id_fkey
      FOREIGN KEY (cart_item_id)
      REFERENCES public.cart_items(id)
      ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.cart_items
  ALTER COLUMN reserved_quantity SET NOT NULL,
  ALTER COLUMN reservation_expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS carts_guest_id_status_idx
  ON public.carts (guest_id, status)
  WHERE guest_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cart_items_listing_variant_reservation_idx
  ON public.cart_items (listing_id, variant_id, reservation_expires_at);

CREATE INDEX IF NOT EXISTS order_items_cart_item_id_idx
  ON public.order_items (cart_item_id)
  WHERE cart_item_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.order_status_counts_against_inventory(p_status public.order_status)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(p_status, 'cancelled'::public.order_status) = ANY (
    ARRAY[
      'requested'::public.order_status,
      'confirmed'::public.order_status,
      'ready'::public.order_status,
      'out_for_delivery'::public.order_status,
      'fulfilled'::public.order_status,
      'completed'::public.order_status
    ]
  );
$$;

CREATE OR REPLACE FUNCTION public.get_inventory_availability(
  p_listing_id uuid,
  p_variant_id uuid DEFAULT NULL,
  p_exclude_cart_item_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS TABLE (
  stock_quantity integer,
  active_cart_reservations integer,
  committed_order_quantity integer,
  available_quantity integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_stock integer;
BEGIN
  IF p_variant_id IS NULL THEN
    SELECT l.inventory_quantity
    INTO v_stock
    FROM public.listings AS l
    WHERE l.id = p_listing_id;
  ELSE
    SELECT v.quantity
    INTO v_stock
    FROM public.listing_variants AS v
    WHERE v.id = p_variant_id
      AND v.listing_id = p_listing_id
      AND v.is_active = true;
  END IF;

  stock_quantity := COALESCE(v_stock, 0);

  SELECT COALESCE(SUM(ci.reserved_quantity), 0)
  INTO active_cart_reservations
  FROM public.cart_items AS ci
  JOIN public.carts AS c
    ON c.id = ci.cart_id
  WHERE c.status = 'active'
    AND ci.listing_id = p_listing_id
    AND (
      (p_variant_id IS NULL AND ci.variant_id IS NULL)
      OR ci.variant_id = p_variant_id
    )
    AND ci.reservation_expires_at > v_now
    AND NOT (ci.id = ANY (COALESCE(p_exclude_cart_item_ids, ARRAY[]::uuid[])));

  SELECT COALESCE(SUM(oi.quantity), 0)
  INTO committed_order_quantity
  FROM public.order_items AS oi
  JOIN public.orders AS o
    ON o.id = oi.order_id
  WHERE oi.listing_id = p_listing_id
    AND (
      (p_variant_id IS NULL AND oi.variant_id IS NULL)
      OR oi.variant_id = p_variant_id
    )
    AND public.order_status_counts_against_inventory(o.status);

  -- listings.inventory_quantity / listing_variants.quantity are decremented
  -- when an order is committed, so committed orders are already reflected in
  -- current stock_quantity. Only active cart holds should be subtracted here.
  available_quantity := GREATEST(
    COALESCE(stock_quantity, 0) - COALESCE(active_cart_reservations, 0),
    0
  );

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_cart_item_reservation(
  p_cart_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_guest_id text DEFAULT NULL,
  p_listing_id uuid DEFAULT NULL,
  p_variant_id uuid DEFAULT NULL,
  p_variant_label text DEFAULT NULL,
  p_selected_options jsonb DEFAULT '{}'::jsonb,
  p_title text DEFAULT NULL,
  p_unit_price numeric DEFAULT NULL,
  p_image_url text DEFAULT NULL,
  p_quantity integer DEFAULT NULL,
  p_cart_item_id uuid DEFAULT NULL,
  p_exclude_cart_item_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS TABLE (
  success boolean,
  cart_item_id uuid,
  reservation_expires_at timestamptz,
  available_quantity integer,
  error_code text,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cart public.carts%ROWTYPE;
  v_item public.cart_items%ROWTYPE;
  v_now timestamptz := now();
  v_expiry timestamptz := now() + interval '30 minutes';
  v_inventory record;
  v_excluded uuid[] := COALESCE(p_exclude_cart_item_ids, ARRAY[]::uuid[]);
BEGIN
  IF p_cart_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::timestamptz, 0, 'missing_cart_id', 'Cart is required.';
    RETURN;
  END IF;

  IF p_listing_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::timestamptz, 0, 'missing_listing_id', 'Listing is required.';
    RETURN;
  END IF;

  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::timestamptz, 0, 'invalid_quantity', 'Choose at least 1 item.';
    RETURN;
  END IF;

  IF p_quantity > 5 THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::timestamptz, 0, 'max_quantity_exceeded', 'You can order up to 5 of this item at a time.';
    RETURN;
  END IF;

  SELECT *
  INTO v_cart
  FROM public.carts
  WHERE id = p_cart_id
    AND status = 'active'
    AND (
      (p_user_id IS NOT NULL AND user_id = p_user_id)
      OR (p_guest_id IS NOT NULL AND guest_id = p_guest_id)
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::timestamptz, 0, 'cart_not_found', 'Cart not found.';
    RETURN;
  END IF;

  IF p_variant_id IS NULL THEN
    PERFORM 1
    FROM public.listings
    WHERE id = p_listing_id
    FOR UPDATE;
  ELSE
    PERFORM 1
    FROM public.listing_variants
    WHERE id = p_variant_id
      AND listing_id = p_listing_id
      AND is_active = true
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN QUERY SELECT false, NULL::uuid, NULL::timestamptz, 0, 'variant_not_found', 'Selected option is no longer available.';
      RETURN;
    END IF;
  END IF;

  IF p_cart_item_id IS NOT NULL THEN
    SELECT *
    INTO v_item
    FROM public.cart_items
    WHERE id = p_cart_item_id
      AND cart_id = p_cart_id
    FOR UPDATE;
  ELSE
    SELECT *
    INTO v_item
    FROM public.cart_items
    WHERE cart_id = p_cart_id
      AND listing_id = p_listing_id
      AND (
        (p_variant_id IS NULL AND variant_id IS NULL)
        OR variant_id = p_variant_id
      )
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_item.id IS NOT NULL THEN
    v_excluded := array_append(v_excluded, v_item.id);
  END IF;

  SELECT *
  INTO v_inventory
  FROM public.get_inventory_availability(
    p_listing_id,
    p_variant_id,
    v_excluded
  );

  IF p_quantity > COALESCE(v_inventory.available_quantity, 0) THEN
    RETURN QUERY
    SELECT
      false,
      COALESCE(v_item.id, NULL::uuid),
      COALESCE(v_item.reservation_expires_at, NULL::timestamptz),
      COALESCE(v_inventory.available_quantity, 0),
      'insufficient_inventory',
      CASE
        WHEN COALESCE(v_inventory.available_quantity, 0) <= 0
          THEN 'Only 0 left available.'
        ELSE format('Only %s left available.', v_inventory.available_quantity)
      END;
    RETURN;
  END IF;

  IF v_item.id IS NULL THEN
    INSERT INTO public.cart_items (
      cart_id,
      vendor_id,
      listing_id,
      variant_id,
      variant_label,
      selected_options,
      quantity,
      reserved_quantity,
      reservation_expires_at,
      title,
      unit_price,
      image_url,
      updated_at
    )
    VALUES (
      p_cart_id,
      v_cart.vendor_id,
      p_listing_id,
      p_variant_id,
      p_variant_label,
      COALESCE(p_selected_options, '{}'::jsonb),
      p_quantity,
      p_quantity,
      v_expiry,
      COALESCE(p_title, 'Marketplace item'),
      p_unit_price,
      p_image_url,
      v_now
    )
    RETURNING *
    INTO v_item;
  ELSE
    UPDATE public.cart_items
    SET quantity = p_quantity,
        reserved_quantity = p_quantity,
        reservation_expires_at = v_expiry,
        variant_label = COALESCE(p_variant_label, variant_label),
        selected_options = COALESCE(p_selected_options, '{}'::jsonb),
        title = COALESCE(p_title, title),
        unit_price = COALESCE(p_unit_price, unit_price),
        image_url = COALESCE(p_image_url, image_url),
        updated_at = v_now
    WHERE id = v_item.id
    RETURNING *
    INTO v_item;
  END IF;

  RETURN QUERY
  SELECT true, v_item.id, v_item.reservation_expires_at, COALESCE(v_inventory.available_quantity, 0), NULL::text, NULL::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_cart_item_reservation(
  p_cart_item_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_guest_id text DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  cart_item_id uuid,
  error_code text,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item_id uuid;
BEGIN
  DELETE FROM public.cart_items AS ci
  USING public.carts AS c
  WHERE ci.id = p_cart_item_id
    AND c.id = ci.cart_id
    AND c.status = 'active'
    AND (
      (p_user_id IS NOT NULL AND c.user_id = p_user_id)
      OR (p_guest_id IS NOT NULL AND c.guest_id = p_guest_id)
    )
  RETURNING ci.id
  INTO v_item_id;

  IF v_item_id IS NULL THEN
    RETURN QUERY SELECT false, p_cart_item_id, 'cart_item_not_found', 'Cart item not found.';
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_item_id, NULL::text, NULL::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_cart_reservations()
RETURNS TABLE (
  expired_cart_item_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Expired reservations must stop affecting availability immediately, but the
  -- cart line should remain visible so the UI can show an expired state instead
  -- of making items disappear unexpectedly.
  RETURN QUERY
  SELECT ci.id
  FROM public.cart_items AS ci
  JOIN public.carts AS c
    ON c.id = ci.cart_id
  WHERE c.id = ci.cart_id
    AND c.status = 'active'
    AND ci.reservation_expires_at <= now();
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_order_inventory_from_cart_reservations(
  p_order_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  already_committed boolean,
  error_code text,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item record;
BEGIN
  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND (p_user_id IS NULL OR user_id = p_user_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, 'order_not_found', 'Order not found.';
    RETURN;
  END IF;

  IF v_order.inventory_committed_at IS NOT NULL THEN
    RETURN QUERY SELECT true, true, NULL::text, NULL::text;
    RETURN;
  END IF;

  FOR v_item IN
    SELECT
      oi.id AS order_item_id,
      oi.quantity,
      oi.cart_item_id,
      oi.listing_id,
      oi.variant_id,
      ci.reserved_quantity,
      ci.reservation_expires_at
    FROM public.order_items AS oi
    LEFT JOIN public.cart_items AS ci
      ON ci.id = oi.cart_item_id
    WHERE oi.order_id = p_order_id
    ORDER BY oi.created_at ASC, oi.id ASC
  LOOP
    IF v_item.cart_item_id IS NULL THEN
      RETURN QUERY SELECT false, false, 'missing_cart_item_link', 'Order item is missing its cart reservation link.';
      RETURN;
    END IF;

    IF v_item.reservation_expires_at IS NULL OR v_item.reservation_expires_at <= now() THEN
      RETURN QUERY SELECT false, false, 'reservation_expired', 'A cart reservation expired before checkout completed.';
      RETURN;
    END IF;

    IF COALESCE(v_item.reserved_quantity, 0) < COALESCE(v_item.quantity, 0) THEN
      RETURN QUERY SELECT false, false, 'reservation_quantity_mismatch', 'A cart reservation changed before checkout completed.';
      RETURN;
    END IF;

    IF v_item.variant_id IS NULL THEN
      UPDATE public.listings AS l
      SET inventory_quantity = l.inventory_quantity - v_item.quantity,
          inventory_status = public.resolve_listing_inventory_status(
            l.inventory_quantity - v_item.quantity,
            l.inventory_status,
            l.low_stock_threshold
          ),
          inventory_last_updated_at = now()
      WHERE l.id = v_item.listing_id
        AND l.inventory_quantity IS NOT NULL
        AND l.inventory_quantity >= v_item.quantity;

      IF NOT FOUND THEN
        RETURN QUERY SELECT false, false, 'insufficient_inventory', 'Inventory is no longer available for this order.';
        RETURN;
      END IF;
    ELSE
      UPDATE public.listing_variants AS v
      SET quantity = v.quantity - v_item.quantity,
          updated_at = now()
      WHERE v.id = v_item.variant_id
        AND v.listing_id = v_item.listing_id
        AND v.quantity >= v_item.quantity
        AND v.is_active = true;

      IF NOT FOUND THEN
        RETURN QUERY SELECT false, false, 'insufficient_inventory', 'Inventory is no longer available for this order.';
        RETURN;
      END IF;

      UPDATE public.listings AS l
      SET inventory_last_updated_at = now()
      WHERE l.id = v_item.listing_id;
    END IF;

    DELETE FROM public.cart_items
    WHERE id = v_item.cart_item_id;
  END LOOP;

  UPDATE public.orders
  SET inventory_committed_at = now(),
      updated_at = now()
  WHERE id = p_order_id;

  RETURN QUERY SELECT true, false, NULL::text, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.get_inventory_availability(uuid, uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_inventory_availability(uuid, uuid, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.get_inventory_availability(uuid, uuid, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_inventory_availability(uuid, uuid, uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.upsert_cart_item_reservation(uuid, uuid, text, uuid, uuid, text, jsonb, text, numeric, text, integer, uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_cart_item_reservation(uuid, uuid, text, uuid, uuid, text, jsonb, text, numeric, text, integer, uuid, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.upsert_cart_item_reservation(uuid, uuid, text, uuid, uuid, text, jsonb, text, numeric, text, integer, uuid, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_cart_item_reservation(uuid, uuid, text, uuid, uuid, text, jsonb, text, numeric, text, integer, uuid, uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.release_cart_item_reservation(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_cart_item_reservation(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.release_cart_item_reservation(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.release_cart_item_reservation(uuid, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.cleanup_expired_cart_reservations() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_expired_cart_reservations() FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_expired_cart_reservations() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_cart_reservations() TO service_role;

REVOKE ALL ON FUNCTION public.commit_order_inventory_from_cart_reservations(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_order_inventory_from_cart_reservations(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.commit_order_inventory_from_cart_reservations(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.commit_order_inventory_from_cart_reservations(uuid, uuid) TO service_role;
