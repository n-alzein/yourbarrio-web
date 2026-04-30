function normalizeOptionValue(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeSelectedOptions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value)
    .map(([key, optionValue]) => [
      String(key || "").trim(),
      String(optionValue || "").trim(),
    ])
    .filter(([key, optionValue]) => key && optionValue);

  if (!entries.length) return null;

  return Object.fromEntries(entries);
}

export function buildReorderSignature(item = {}) {
  const listingId = String(item?.listing_id || "").trim();
  const variantId = String(item?.variant_id || "").trim();
  const selectedOptions = normalizeSelectedOptions(item?.selected_options);
  const optionsSignature = selectedOptions
    ? Object.entries(selectedOptions)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, value]) => `${key}:${normalizeOptionValue(value)}`)
        .join("|")
    : "";

  return [listingId, variantId || "no-variant", optionsSignature || "no-options"].join("::");
}

export function collectReorderCandidates(orders = []) {
  const diagnostics = {
    totalPreviousOrderLines: 0,
    totalCandidateReorderItems: 0,
    excluded: [],
  };
  const candidates = [];

  for (const order of Array.isArray(orders) ? orders : []) {
    for (const item of Array.isArray(order?.order_items) ? order.order_items : []) {
      diagnostics.totalPreviousOrderLines += 1;
      const listingId = String(item?.listing_id || "").trim();
      if (!listingId) {
        diagnostics.excluded.push({
          listingId: null,
          reason: "missing listing_id",
        });
        continue;
      }

      diagnostics.totalCandidateReorderItems += 1;
      candidates.push({
        orderId: order.id,
        orderNumber: order.order_number,
        paidAt: order.paid_at || order.created_at || null,
        item,
        listingId,
        signature: buildReorderSignature(item),
      });
    }
  }

  return { candidates, diagnostics };
}

export function selectRenderableReorderCandidates(candidates = [], listingById = new Map(), limit = 4) {
  const diagnostics = {
    renderedCount: 0,
    excluded: [],
  };
  const seenSignatures = new Set();
  const rendered = [];

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const listing = listingById.get(candidate.listingId);
    if (!listing) {
      diagnostics.excluded.push({
        listingId: candidate.listingId,
        reason: "listing unpublished",
      });
      continue;
    }

    const inventoryStatus = String(listing?.inventory_status || "").trim().toLowerCase();
    if (inventoryStatus === "out" || inventoryStatus === "out_of_stock") {
      diagnostics.excluded.push({
        listingId: candidate.listingId,
        reason: "listing unavailable",
      });
      continue;
    }

    if (seenSignatures.has(candidate.signature)) {
      diagnostics.excluded.push({
        listingId: candidate.listingId,
        reason: "duplicate exact item",
      });
      continue;
    }

    if (rendered.length >= limit) {
      diagnostics.excluded.push({
        listingId: candidate.listingId,
        reason: "limit reached",
      });
      continue;
    }

    seenSignatures.add(candidate.signature);
    rendered.push({
      ...candidate,
      listing,
    });
  }

  diagnostics.renderedCount = rendered.length;
  return { rendered, diagnostics };
}
