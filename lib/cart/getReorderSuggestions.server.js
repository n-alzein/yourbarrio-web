import "server-only";

import {
  collectReorderCandidates,
  normalizeSelectedOptions,
  selectRenderableReorderCandidates,
} from "@/lib/cart/reorderSuggestions";
import { getListingVariants } from "@/lib/listingOptions";
import { withListingPricing } from "@/lib/pricing";

const REORDER_ORDER_STATUSES = ["fulfilled", "completed"];
const ORDER_FETCH_LIMIT = 6;
const REORDER_ITEM_LIMIT = 4;
const LISTING_SELECT =
  "id,public_id,title,price,category,category_id,city,photo_url,photo_variants,cover_image_id,business_id,created_at,inventory_status,inventory_quantity,low_stock_threshold,inventory_last_updated_at,is_seeded,business_is_seeded";

function normalizeOptionValue(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function optionsMatchVariant(selectedOptions, variantOptions) {
  const normalizedSelected = normalizeSelectedOptions(selectedOptions);
  if (!normalizedSelected) return false;
  const variantEntries = Object.entries(
    variantOptions && typeof variantOptions === "object" ? variantOptions : {}
  ).filter(([key, value]) => String(key || "").trim() && String(value || "").trim());

  if (!variantEntries.length || variantEntries.length !== Object.keys(normalizedSelected).length) {
    return false;
  }

  return variantEntries.every(([key, value]) => {
    const selectedValue = normalizedSelected[key];
    return normalizeOptionValue(selectedValue) === normalizeOptionValue(value);
  });
}

function classifyReorderCandidate({ entry, listingOptions }) {
  const priorVariantId = String(entry.item?.variant_id || "").trim() || null;
  const priorVariantLabel = String(entry.item?.variant_label || "").trim() || null;
  const priorSelectedOptions = normalizeSelectedOptions(entry.item?.selected_options);
  const hasOptions = Boolean(listingOptions?.hasOptions);

  if (!hasOptions) {
    return {
      mode: "directAdd",
      reason: "listing has no options",
      variantId: null,
      variantLabel: null,
      selectedOptions: null,
    };
  }

  const activeVariants = Array.isArray(listingOptions?.variants)
    ? listingOptions.variants.filter((variant) => variant?.is_active !== false)
    : [];

  if (!activeVariants.length) {
    return {
      mode: "selectOptionsFallback",
      reason: "variant unavailable",
      variantId: null,
      variantLabel: null,
      selectedOptions: null,
    };
  }

  if (priorVariantId) {
    const matchingVariant =
      activeVariants.find((variant) => String(variant?.id || "") === priorVariantId) || null;

    if (matchingVariant?.id) {
      return {
        mode: "directAdd",
        reason: "matched stored variant_id",
        variantId: matchingVariant.id,
        variantLabel: priorVariantLabel,
        selectedOptions: priorSelectedOptions || matchingVariant.options || null,
      };
    }
  }

  if (priorSelectedOptions) {
    const matchingVariant =
      activeVariants.find((variant) =>
        optionsMatchVariant(priorSelectedOptions, variant?.options || null)
      ) || null;

    if (matchingVariant?.id) {
      return {
        mode: "directAdd",
        reason: priorVariantId
          ? "stored variant unavailable, matched selected options"
          : "matched selected options",
        variantId: matchingVariant.id,
        variantLabel: priorVariantLabel || null,
        selectedOptions: priorSelectedOptions,
      };
    }

    return {
      mode: "selectOptionsFallback",
      reason: "option values no longer exist",
      variantId: null,
      variantLabel: null,
      selectedOptions: null,
    };
  }

  return {
    mode: "selectOptionsFallback",
    reason: priorVariantId ? "variant unavailable" : "missing variant_id",
    variantId: null,
    variantLabel: null,
    selectedOptions: null,
  };
}

async function attachBusinessNames(client, listings) {
  if (!client || !Array.isArray(listings) || listings.length === 0) return [];

  const businessIds = Array.from(
    new Set(listings.map((listing) => String(listing?.business_id || "").trim()).filter(Boolean))
  );

  if (businessIds.length === 0) return listings;

  const { data, error } = await client
    .from("users")
    .select("id,business_name,full_name")
    .in("id", businessIds);

  if (error || !Array.isArray(data)) return listings;

  const businessNameById = new Map(
    data.map((row) => [
      String(row?.id || "").trim(),
      String(row?.business_name || row?.full_name || "").trim() || null,
    ])
  );

  return listings.map((listing) => ({
    ...listing,
    business_name: businessNameById.get(String(listing?.business_id || "").trim()) || null,
  }));
}

export async function getCartReorderSuggestions({
  supabase,
  userId,
  isCustomer = false,
  logDiagnostics = process.env.NODE_ENV !== "production",
}) {
  const startedAt = Date.now();

  if (!supabase || !userId || !isCustomer) {
    return [];
  }

  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select(
      "id,order_number,paid_at,created_at,status,order_items(id,listing_id,variant_id,variant_label,selected_options,title,image_url,unit_price,quantity,created_at)"
    )
    .eq("user_id", userId)
    .in("status", REORDER_ORDER_STATUSES)
    .order("paid_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(ORDER_FETCH_LIMIT);

  if (ordersError || !Array.isArray(orders) || orders.length === 0) {
    if (logDiagnostics) {
      console.info("[cart reorder timing]", {
        durationMs: Date.now() - startedAt,
        totalPreviousOrderLines: 0,
        totalRenderedReorderItems: 0,
      });
    }
    return [];
  }

  const { candidates: orderedCandidates, diagnostics: candidateDiagnostics } =
    collectReorderCandidates(orders);
  const uniqueListingIds = Array.from(new Set(orderedCandidates.map((candidate) => candidate.listingId)));

  if (uniqueListingIds.length === 0) {
    if (logDiagnostics) {
      console.info("[cart reorder diagnostics]", {
        totalPreviousOrderLines: candidateDiagnostics.totalPreviousOrderLines,
        totalCandidateReorderItems: candidateDiagnostics.totalCandidateReorderItems,
        totalRenderedReorderItems: 0,
        excluded: candidateDiagnostics.excluded,
      });
      console.info("[cart reorder timing]", {
        durationMs: Date.now() - startedAt,
        totalPreviousOrderLines: candidateDiagnostics.totalPreviousOrderLines,
        totalRenderedReorderItems: 0,
      });
    }
    return [];
  }

  const { data: listings, error: listingsError } = await supabase
    .from("public_listings_v")
    .select(LISTING_SELECT)
    .in("id", uniqueListingIds);

  if (listingsError || !Array.isArray(listings) || listings.length === 0) {
    if (logDiagnostics) {
      console.info("[cart reorder timing]", {
        durationMs: Date.now() - startedAt,
        totalPreviousOrderLines: candidateDiagnostics.totalPreviousOrderLines,
        totalRenderedReorderItems: 0,
      });
    }
    return [];
  }

  const listingById = new Map(listings.map((listing) => [String(listing.id), listing]));
  const {
    rendered: reorderable,
    diagnostics: renderDiagnostics,
  } = selectRenderableReorderCandidates(orderedCandidates, listingById, REORDER_ITEM_LIMIT);

  if (reorderable.length === 0) {
    if (logDiagnostics) {
      console.info("[cart reorder diagnostics]", {
        totalPreviousOrderLines: candidateDiagnostics.totalPreviousOrderLines,
        totalCandidateReorderItems: candidateDiagnostics.totalCandidateReorderItems,
        totalRenderedReorderItems: 0,
        excluded: [...candidateDiagnostics.excluded, ...renderDiagnostics.excluded],
      });
      console.info("[cart reorder timing]", {
        durationMs: Date.now() - startedAt,
        totalPreviousOrderLines: candidateDiagnostics.totalPreviousOrderLines,
        totalRenderedReorderItems: 0,
      });
    }
    return [];
  }

  const listingsWithBusinessNames = await attachBusinessNames(
    supabase,
    reorderable.map((entry) => entry.listing)
  );
  const namedListingById = new Map(
    listingsWithBusinessNames.map((listing) => [String(listing.id), listing])
  );

  const items = await Promise.all(
    reorderable.map(async (entry) => {
      const listing = namedListingById.get(String(entry.listing.id)) || entry.listing;
      let hasOptions = false;
      let reorderVariantId = null;
      let reorderVariantLabel = null;
      let reorderSelectedOptions = null;
      let reorderMode = "directAdd";
      let reorderReason = "listing has no options";
      try {
        const listingOptions = await getListingVariants(supabase, listing.id);
        hasOptions = Boolean(listingOptions?.hasOptions);
        const classification = classifyReorderCandidate({ entry, listingOptions });
        reorderMode = classification.mode;
        reorderReason = classification.reason;
        reorderVariantId = classification.variantId;
        reorderVariantLabel = classification.variantLabel;
        reorderSelectedOptions = classification.selectedOptions;
      } catch {
        hasOptions = Boolean(
          entry.item?.variant_id || normalizeSelectedOptions(entry.item?.selected_options)
        );
        reorderMode = "selectOptionsFallback";
        reorderReason = "missing option values";
      }

      if (logDiagnostics) {
        console.info("[cart reorder]", {
          listingId: listing.id,
          orderNumber: entry.orderNumber,
          classification: reorderMode,
          reason: reorderReason,
        });
      }

      return {
        order_number: entry.orderNumber,
        ordered_at: entry.paidAt,
        last_ordered_quantity: Number(entry.item?.quantity || 1),
        reorder_mode: reorderMode,
        reorder_reason: reorderReason,
        reorder_variant_id: reorderVariantId,
        reorder_variant_label: reorderVariantLabel,
        reorder_selected_options: reorderSelectedOptions,
        listing: withListingPricing({
          ...listing,
          hasOptions,
        }),
      };
    })
  );

  if (logDiagnostics) {
    console.info("[cart reorder diagnostics]", {
      totalPreviousOrderLines: candidateDiagnostics.totalPreviousOrderLines,
      totalCandidateReorderItems: candidateDiagnostics.totalCandidateReorderItems,
      totalRenderedReorderItems: items.length,
      excluded: [...candidateDiagnostics.excluded, ...renderDiagnostics.excluded],
    });
    console.info("[cart reorder timing]", {
      durationMs: Date.now() - startedAt,
      totalPreviousOrderLines: candidateDiagnostics.totalPreviousOrderLines,
      totalRenderedReorderItems: items.length,
    });
  }

  return items;
}
