import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationSource = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260430110000_add_cart_reservations.sql"),
  "utf8"
);

describe("cart reservation migration", () => {
  it("does not subtract committed orders twice from availability", () => {
    expect(migrationSource).toContain("committed orders are already reflected");
    expect(migrationSource).toContain(
      "COALESCE(stock_quantity, 0) - COALESCE(active_cart_reservations, 0)"
    );
    expect(migrationSource).not.toContain(
      "- COALESCE(active_cart_reservations, 0)\n      - COALESCE(committed_order_quantity, 0)"
    );
  });

  it("keeps owner or guest enforcement safe for existing carts", () => {
    expect(migrationSource).toContain("ADD CONSTRAINT carts_owner_or_guest_check");
    expect(migrationSource).toContain(") NOT VALID;");
  });

  it("keeps expired cart items visible instead of deleting them", () => {
    const cleanupSection = migrationSource.slice(
      migrationSource.indexOf("CREATE OR REPLACE FUNCTION public.cleanup_expired_cart_reservations()"),
      migrationSource.indexOf("CREATE OR REPLACE FUNCTION public.commit_order_inventory_from_cart_reservations(")
    );

    expect(migrationSource).toContain("cart line should remain visible");
    expect(cleanupSection).not.toContain("DELETE FROM public.cart_items AS ci");
    expect(migrationSource).not.toContain("cron.schedule(");
  });
});
