import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationSource = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260428103000_add_admin_hidden_listing_moderation.sql"
  ),
  "utf8"
);

describe("admin listing moderation visibility migration", () => {
  it("adds the admin_hidden moderation field", () => {
    expect(migrationSource).toContain("ADD COLUMN IF NOT EXISTS admin_hidden boolean NOT NULL DEFAULT false");
  });

  it("adds listings.is_test explicitly for admin and public visibility checks", () => {
    expect(migrationSource).toContain("ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false");
  });

  it("uses a business-first moderation index for admin listings tab queries", () => {
    expect(migrationSource).toContain("CREATE INDEX IF NOT EXISTS listings_business_admin_visibility_idx");
    expect(migrationSource).toContain("ON public.listings (business_id, admin_hidden, created_at DESC)");
  });

  it("keeps public_listings_v replacement compatible with existing environments", () => {
    expect(migrationSource).toContain("table_name = 'public_listings_v'");
    expect(migrationSource).toContain("current_view_has_is_test");
    expect(migrationSource).not.toContain("DROP VIEW CASCADE");
  });

  it("excludes admin_hidden and internal/test listings from public_listings_v", () => {
    expect(migrationSource).toContain("COALESCE(l.admin_hidden, false) = false");
    expect(migrationSource).toContain("COALESCE(l.is_internal, false) = false");
    expect(migrationSource).toContain("COALESCE(l.is_test, false) = false");
  });
});
