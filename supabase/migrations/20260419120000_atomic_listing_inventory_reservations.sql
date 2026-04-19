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

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS inventory_reserved_at timestamptz,
  ADD COLUMN IF NOT EXISTS inventory_restored_at timestamptz;

-- Order-level timestamps are coarse lifecycle markers for existing app flows.
-- The inventory_reservations row linked to order_items is the source of truth
-- for reserved/restored quantities.

-- Source-of-truth ledger for stock reservations. Every successful reserve RPC
-- creates one row here; restore decisions are made from this row, not from raw
-- listing id + quantity inputs.
CREATE TABLE IF NOT EXISTS public.inventory_reservations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  listing_id uuid NOT NULL,
  order_id uuid,
  order_item_id uuid,
  reserved_quantity integer NOT NULL,
  restored_quantity integer DEFAULT 0 NOT NULL,
  reserved_at timestamptz DEFAULT now() NOT NULL,
  restored_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.inventory_reservations OWNER TO postgres;
ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventory_reservations FROM anon;
REVOKE ALL ON public.inventory_reservations FROM authenticated;
GRANT ALL ON public.inventory_reservations TO service_role;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS inventory_reservation_id uuid,
  ADD COLUMN IF NOT EXISTS inventory_reserved_at timestamptz,
  ADD COLUMN IF NOT EXISTS inventory_restored_at timestamptz,
  ADD COLUMN IF NOT EXISTS reserved_quantity integer,
  ADD COLUMN IF NOT EXISTS restored_quantity integer DEFAULT 0 NOT NULL;

UPDATE public.listings
  SET inventory_quantity = 0
  WHERE inventory_quantity IS NOT NULL
    AND inventory_quantity < 0;

DELETE FROM public.cart_items
  WHERE quantity IS NULL
     OR quantity < 1;

UPDATE public.cart_items
  SET quantity = 5,
      updated_at = now()
  WHERE quantity > 5;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'listings_inventory_quantity_nonnegative'
  ) THEN
    ALTER TABLE public.listings
      ADD CONSTRAINT listings_inventory_quantity_nonnegative
      CHECK (inventory_quantity IS NULL OR inventory_quantity >= 0);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_reservations_pkey'
  ) THEN
    ALTER TABLE public.inventory_reservations
      ADD CONSTRAINT inventory_reservations_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_reservations_listing_id_fkey'
  ) THEN
    ALTER TABLE public.inventory_reservations
      ADD CONSTRAINT inventory_reservations_listing_id_fkey
      FOREIGN KEY (listing_id)
      REFERENCES public.listings(id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_reservations_order_id_fkey'
  ) THEN
    ALTER TABLE public.inventory_reservations
      ADD CONSTRAINT inventory_reservations_order_id_fkey
      FOREIGN KEY (order_id)
      REFERENCES public.orders(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_reservations_order_item_id_fkey'
  ) THEN
    ALTER TABLE public.inventory_reservations
      ADD CONSTRAINT inventory_reservations_order_item_id_fkey
      FOREIGN KEY (order_item_id)
      REFERENCES public.order_items(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_reservations_quantity_check'
  ) THEN
    ALTER TABLE public.inventory_reservations
      ADD CONSTRAINT inventory_reservations_quantity_check
      CHECK (
        reserved_quantity >= 1
        AND reserved_quantity <= 5
        AND restored_quantity >= 0
        AND restored_quantity <= reserved_quantity
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_inventory_reservation_id_fkey'
  ) THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_inventory_reservation_id_fkey
      FOREIGN KEY (inventory_reservation_id)
      REFERENCES public.inventory_reservations(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_reserved_quantity_check'
  ) THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_reserved_quantity_check
      CHECK (
        reserved_quantity IS NULL
        OR (
          reserved_quantity >= 1
          AND reserved_quantity <= 5
          AND restored_quantity >= 0
          AND restored_quantity <= reserved_quantity
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cart_items_quantity_order_limit'
  ) THEN
    ALTER TABLE public.cart_items
      ADD CONSTRAINT cart_items_quantity_order_limit
      CHECK (quantity >= 1 AND quantity <= 5) NOT VALID;
  END IF;
END$$;

ALTER TABLE public.cart_items VALIDATE CONSTRAINT cart_items_quantity_order_limit;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_quantity_order_limit'
  ) THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_quantity_order_limit
      CHECK (quantity >= 1 AND quantity <= 5) NOT VALID;
  END IF;
END$$;

-- Intentionally not validating order_items_quantity_order_limit here:
-- order_items is historical accounting data, and mutating old paid/submitted
-- orders to fit the new 1..5 rule would be unsafe. NOT VALID still enforces
-- the cap for new rows while preserving legacy order history.

CREATE INDEX IF NOT EXISTS inventory_reservations_order_id_idx
  ON public.inventory_reservations (order_id);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_reservations_order_item_id_key
  ON public.inventory_reservations (order_item_id)
  WHERE order_item_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS order_items_inventory_reservation_id_key
  ON public.order_items (inventory_reservation_id)
  WHERE inventory_reservation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.resolve_listing_inventory_status(
  p_inventory_quantity integer,
  p_current_status text,
  p_low_stock_threshold integer
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_threshold integer := COALESCE(p_low_stock_threshold, 5);
BEGIN
  IF p_inventory_quantity IS NULL OR p_inventory_quantity <= 0 THEN
    RETURN 'out_of_stock';
  END IF;

  IF p_current_status IN ('always_available', 'seasonal') THEN
    RETURN 'in_stock';
  END IF;

  IF p_inventory_quantity <= v_threshold THEN
    RETURN 'low_stock';
  END IF;

  RETURN 'in_stock';
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_listing_inventory(
  p_listing_id uuid,
  p_requested_quantity integer
)
RETURNS TABLE (
  success boolean,
  listing_id uuid,
  reservation_id uuid,
  requested_quantity integer,
  remaining_inventory integer,
  error_code text,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reserved record;
  v_existing record;
BEGIN
  IF p_listing_id IS NULL THEN
    RETURN QUERY SELECT false, p_listing_id, NULL::uuid, p_requested_quantity, NULL::integer, 'missing_listing_id', 'Listing is required.';
    RETURN;
  END IF;

  IF p_requested_quantity IS NULL OR p_requested_quantity < 1 THEN
    RETURN QUERY SELECT false, p_listing_id, NULL::uuid, p_requested_quantity, NULL::integer, 'invalid_quantity', 'Choose at least 1 item.';
    RETURN;
  END IF;

  IF p_requested_quantity > 5 THEN
    RETURN QUERY SELECT false, p_listing_id, NULL::uuid, p_requested_quantity, NULL::integer, 'max_quantity_exceeded', 'You can order up to 5 of this item at a time.';
    RETURN;
  END IF;

  -- Stock is reduced and the reservation ledger row is created in one SQL
  -- statement. If either step fails, the statement fails and no inventory is
  -- left decremented without a reservation id.
  WITH updated AS (
    UPDATE public.listings AS l
      SET inventory_quantity = l.inventory_quantity - p_requested_quantity,
          inventory_status = public.resolve_listing_inventory_status(
            l.inventory_quantity - p_requested_quantity,
            l.inventory_status,
            l.low_stock_threshold
          ),
          inventory_last_updated_at = now()
      WHERE l.id = p_listing_id
        AND l.inventory_quantity IS NOT NULL
        AND l.inventory_quantity >= p_requested_quantity
        AND COALESCE(l.inventory_status, 'in_stock') <> 'out_of_stock'
      RETURNING l.id, l.inventory_quantity
  ),
  inserted AS (
    INSERT INTO public.inventory_reservations AS ir (
      listing_id,
      reserved_quantity,
      restored_quantity,
      reserved_at
    )
    SELECT
      updated.id,
      p_requested_quantity,
      0,
      now()
    FROM updated
    RETURNING ir.id, ir.listing_id
  )
  SELECT
    updated.id AS listing_id,
    inserted.id AS reservation_id,
    updated.inventory_quantity AS remaining_inventory
    INTO v_reserved
    FROM updated
    JOIN inserted ON inserted.listing_id = updated.id;

  IF FOUND THEN
    RETURN QUERY SELECT true, v_reserved.listing_id, v_reserved.reservation_id, p_requested_quantity, v_reserved.remaining_inventory, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT l.id, l.inventory_quantity, l.inventory_status
    INTO v_existing
    FROM public.listings AS l
    WHERE l.id = p_listing_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, p_listing_id, NULL::uuid, p_requested_quantity, NULL::integer, 'listing_not_found', 'Listing not found.';
    RETURN;
  END IF;

  IF v_existing.inventory_quantity IS NULL THEN
    RETURN QUERY SELECT false, p_listing_id, NULL::uuid, p_requested_quantity, NULL::integer, 'inventory_not_tracked', 'This item is not available for checkout right now.';
    RETURN;
  END IF;

  RETURN QUERY SELECT
    false,
    p_listing_id,
    NULL::uuid,
    p_requested_quantity,
    GREATEST(COALESCE(v_existing.inventory_quantity, 0), 0),
    'insufficient_inventory',
    'Not enough stock is available for this item.';
END;
$$;

CREATE OR REPLACE FUNCTION public.attach_inventory_reservation_to_order_item(
  p_reservation_id uuid,
  p_order_id uuid,
  p_order_item_id uuid
)
RETURNS TABLE (
  success boolean,
  reservation_id uuid,
  listing_id uuid,
  error_code text,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attached record;
BEGIN
  IF p_reservation_id IS NULL OR p_order_id IS NULL OR p_order_item_id IS NULL THEN
    RETURN QUERY SELECT false, p_reservation_id, NULL::uuid, 'invalid_reservation_link', 'Reservation, order, and order item are required.';
    RETURN;
  END IF;

  -- A reservation can be linked to exactly one matching order item. The WHERE
  -- clause prevents attaching restored reservations or relinking to a different
  -- order/listing/quantity.
  UPDATE public.inventory_reservations AS r
    SET order_id = p_order_id,
        order_item_id = p_order_item_id
    WHERE r.id = p_reservation_id
      AND r.restored_at IS NULL
      AND r.order_id IS NULL
      AND r.order_item_id IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.order_items AS oi
        WHERE oi.id = p_order_item_id
          AND oi.order_id = p_order_id
          AND oi.listing_id = r.listing_id
          AND oi.quantity = r.reserved_quantity
          AND (oi.inventory_reservation_id IS NULL OR oi.inventory_reservation_id = p_reservation_id)
      )
    RETURNING r.id, r.listing_id
    INTO v_attached;

  IF FOUND THEN
    UPDATE public.order_items AS oi
      SET inventory_reservation_id = p_reservation_id
      WHERE oi.id = p_order_item_id
        AND oi.order_id = p_order_id
        AND (oi.inventory_reservation_id IS NULL OR oi.inventory_reservation_id = p_reservation_id);

    RETURN QUERY SELECT true, v_attached.id, v_attached.listing_id, NULL::text, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT false, p_reservation_id, NULL::uuid, 'reservation_not_attachable', 'Reservation could not be linked to this order item.';
END;
$$;

DROP FUNCTION IF EXISTS public.restore_inventory_reservation(uuid);

CREATE OR REPLACE FUNCTION public.restore_inventory_reservation(
  p_reservation_id uuid,
  p_allow_unlinked boolean DEFAULT false
)
RETURNS TABLE (
  success boolean,
  reservation_id uuid,
  listing_id uuid,
  restored_quantity integer,
  remaining_inventory integer,
  already_restored boolean,
  error_code text,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reservation record;
  v_listing record;
BEGIN
  IF p_reservation_id IS NULL THEN
    RETURN QUERY SELECT false, p_reservation_id, NULL::uuid, 0, NULL::integer, false, 'missing_reservation_id', 'Reservation is required.';
    RETURN;
  END IF;

  -- Restore is idempotent: only the first caller can flip restored_at from NULL
  -- and add stock back. Duplicate webhook/cancel/retry paths return success with
  -- already_restored=true and do not increment inventory again. Unlinked restore
  -- is only for immediate same-request rollback or stale cleanup.
  UPDATE public.inventory_reservations AS r
    SET restored_quantity = r.reserved_quantity,
        restored_at = now()
    WHERE r.id = p_reservation_id
      AND r.restored_at IS NULL
      AND r.restored_quantity = 0
      AND (
        (r.order_id IS NOT NULL AND r.order_item_id IS NOT NULL)
        OR p_allow_unlinked
      )
    RETURNING r.id, r.listing_id, r.reserved_quantity
    INTO v_reservation;

  IF FOUND THEN
    UPDATE public.listings AS l
      SET inventory_quantity = COALESCE(l.inventory_quantity, 0) + v_reservation.reserved_quantity,
          inventory_status = public.resolve_listing_inventory_status(
            COALESCE(l.inventory_quantity, 0) + v_reservation.reserved_quantity,
            l.inventory_status,
            l.low_stock_threshold
          ),
          inventory_last_updated_at = now()
      WHERE l.id = v_reservation.listing_id
      RETURNING l.inventory_quantity
      INTO v_listing;

    UPDATE public.order_items AS oi
      SET inventory_restored_at = now(),
          restored_quantity = v_reservation.reserved_quantity
      WHERE oi.inventory_reservation_id = v_reservation.id
        AND oi.inventory_restored_at IS NULL;

    RETURN QUERY SELECT true, v_reservation.id, v_reservation.listing_id, v_reservation.reserved_quantity, v_listing.inventory_quantity, false, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT r.id, r.listing_id, r.restored_quantity, r.restored_at
    INTO v_reservation
    FROM public.inventory_reservations AS r
    WHERE r.id = p_reservation_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, p_reservation_id, NULL::uuid, 0, NULL::integer, false, 'reservation_not_found', 'Reservation not found.';
    RETURN;
  END IF;

  IF v_reservation.restored_at IS NULL THEN
    RETURN QUERY SELECT false, v_reservation.id, v_reservation.listing_id, 0, NULL::integer, false, 'reservation_not_restorable', 'Reservation is not linked to an order item yet.';
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_reservation.id, v_reservation.listing_id, COALESCE(v_reservation.restored_quantity, 0), NULL::integer, true, NULL::text, NULL::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_stale_inventory_reservations(
  p_older_than interval DEFAULT interval '15 minutes'
)
RETURNS TABLE (
  reservation_id uuid,
  listing_id uuid,
  restored_quantity integer,
  remaining_inventory integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reservation record;
  v_result record;
BEGIN
  -- Cleanup is intentionally narrow: it only releases reservations that never
  -- reached an order item and have aged beyond the request lifecycle.
  FOR v_reservation IN
    SELECT r.id
    FROM public.inventory_reservations AS r
    WHERE r.order_item_id IS NULL
      AND r.order_id IS NULL
      AND r.restored_at IS NULL
      AND r.reserved_at < now() - p_older_than
    ORDER BY r.reserved_at ASC
  LOOP
    SELECT *
      INTO v_result
      FROM public.restore_inventory_reservation(v_reservation.id, true)
      LIMIT 1;

    IF v_result.success AND NOT v_result.already_restored THEN
      reservation_id := v_result.reservation_id;
      listing_id := v_result.listing_id;
      restored_quantity := v_result.restored_quantity;
      remaining_inventory := v_result.remaining_inventory;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_listing_inventory(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_listing_inventory(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.reserve_listing_inventory(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_listing_inventory(uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.attach_inventory_reservation_to_order_item(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attach_inventory_reservation_to_order_item(uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.attach_inventory_reservation_to_order_item(uuid, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.attach_inventory_reservation_to_order_item(uuid, uuid, uuid) TO service_role;

DROP FUNCTION IF EXISTS public.restore_listing_inventory(uuid, integer);

REVOKE ALL ON FUNCTION public.restore_inventory_reservation(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_inventory_reservation(uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.restore_inventory_reservation(uuid, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restore_inventory_reservation(uuid, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.restore_stale_inventory_reservations(interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_stale_inventory_reservations(interval) FROM anon;
REVOKE ALL ON FUNCTION public.restore_stale_inventory_reservations(interval) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restore_stale_inventory_reservations(interval) TO service_role;
