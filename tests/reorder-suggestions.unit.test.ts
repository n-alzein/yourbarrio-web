import { describe, expect, it } from "vitest";
import {
  buildReorderSignature,
  collectReorderCandidates,
  selectRenderableReorderCandidates,
} from "@/lib/cart/reorderSuggestions";

describe("reorder suggestions helpers", () => {
  it("collects multiple purchase history order lines and ignores missing listing ids", () => {
    const { candidates, diagnostics } = collectReorderCandidates([
      {
        id: "order-1",
        order_number: "YB-1",
        paid_at: "2026-04-01T10:00:00.000Z",
        order_items: [
          { id: "item-1", listing_id: "listing-coat", quantity: 1 },
          { id: "item-2", listing_id: null, quantity: 1 },
          { id: "item-3", listing_id: "listing-samsung", quantity: 1 },
        ],
      },
    ]);

    expect(candidates).toHaveLength(2);
    expect(diagnostics.totalPreviousOrderLines).toBe(3);
    expect(diagnostics.totalCandidateReorderItems).toBe(2);
    expect(diagnostics.excluded).toEqual([{ listingId: null, reason: "missing listing_id" }]);
  });

  it("dedupes duplicate exact items but keeps different variants on the same listing", () => {
    const candidates = [
      {
        listingId: "listing-coat",
        signature: buildReorderSignature({
          listing_id: "listing-coat",
          variant_id: "variant-black-s",
          selected_options: { Color: "Black", Size: "S" },
        }),
      },
      {
        listingId: "listing-coat",
        signature: buildReorderSignature({
          listing_id: "listing-coat",
          variant_id: "variant-black-s",
          selected_options: { Color: "Black", Size: "S" },
        }),
      },
      {
        listingId: "listing-coat",
        signature: buildReorderSignature({
          listing_id: "listing-coat",
          variant_id: "variant-black-m",
          selected_options: { Color: "Black", Size: "M" },
        }),
      },
    ];
    const listingById = new Map([["listing-coat", { id: "listing-coat", inventory_status: "in_stock" }]]);

    const { rendered, diagnostics } = selectRenderableReorderCandidates(candidates, listingById, 4);

    expect(rendered).toHaveLength(2);
    expect(diagnostics.excluded).toEqual([
      { listingId: "listing-coat", reason: "duplicate exact item" },
    ]);
  });

  it("excludes unavailable listings and applies the display limit after dedupe", () => {
    const candidates = [
      { listingId: "listing-1", signature: "listing-1::no-variant::no-options" },
      { listingId: "listing-2", signature: "listing-2::no-variant::no-options" },
      { listingId: "listing-3", signature: "listing-3::no-variant::no-options" },
    ];
    const listingById = new Map([
      ["listing-1", { id: "listing-1", inventory_status: "in_stock" }],
      ["listing-2", { id: "listing-2", inventory_status: "out_of_stock" }],
      ["listing-3", { id: "listing-3", inventory_status: "in_stock" }],
    ]);

    const { rendered, diagnostics } = selectRenderableReorderCandidates(candidates, listingById, 1);

    expect(rendered).toHaveLength(1);
    expect(rendered[0].listingId).toBe("listing-1");
    expect(diagnostics.excluded).toEqual([
      { listingId: "listing-2", reason: "listing unavailable" },
      { listingId: "listing-3", reason: "limit reached" },
    ]);
  });
});
