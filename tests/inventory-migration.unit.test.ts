import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260419120000_atomic_listing_inventory_reservations.sql"
  ),
  "utf8"
);

describe("atomic inventory migration", () => {
  it("uses one conditional update for stock reservation", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.reserve_listing_inventory");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.inventory_reservations");
    expect(migration).toContain("SET search_path = public, pg_temp");
    expect(migration).toContain("WITH updated AS");
    expect(migration).toContain("inserted AS");
    expect(migration).toContain("SET inventory_quantity = l.inventory_quantity - p_requested_quantity");
    expect(migration).toContain("AND l.inventory_quantity >= p_requested_quantity");
    expect(migration).toContain("INSERT INTO public.inventory_reservations");
  });

  it("enforces quantity and non-negative constraints", () => {
    expect(migration).toContain("listings_inventory_quantity_nonnegative");
    expect(migration).toContain("cart_items_quantity_order_limit");
    expect(migration).toContain("VALIDATE CONSTRAINT cart_items_quantity_order_limit");
    expect(migration).toContain("order_items_quantity_order_limit");
    expect(migration).toContain("p_requested_quantity > 5");
  });

  it("restores through reservation-linked idempotent functions only", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.restore_inventory_reservation");
    expect(migration).toContain("WHERE r.id = p_reservation_id");
    expect(migration).toContain("AND r.restored_at IS NULL");
    expect(migration).toContain("p_allow_unlinked");
    expect(migration).toContain("reservation_not_restorable");
    expect(migration).toContain("DROP FUNCTION IF EXISTS public.restore_listing_inventory");
    expect(migration).not.toContain("CREATE OR REPLACE FUNCTION public.restore_listing_inventory");
  });

  it("provides stale unlinked reservation cleanup", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.restore_stale_inventory_reservations");
    expect(migration).toContain("order_item_id IS NULL");
    expect(migration).toContain("reserved_at < now() - p_older_than");
    expect(migration).toContain("restore_inventory_reservation(v_reservation.id, true)");
  });

  it("does not preserve sellable-looking status at zero quantity", () => {
    expect(migration).toContain("IF p_inventory_quantity IS NULL OR p_inventory_quantity <= 0 THEN");
    expect(migration).toContain("RETURN 'out_of_stock';");
  });
});
