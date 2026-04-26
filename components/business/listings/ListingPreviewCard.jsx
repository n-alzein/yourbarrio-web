"use client";

import { useMemo, useState } from "react";
import { normalizeInventory } from "@/lib/inventory";
import { buildVariantLabel } from "@/lib/listingOptions";

function formatPrice(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(parsed);
}

export default function ListingPreviewCard({
  title,
  price,
  category,
  imageUrl,
  inventoryStatus,
  inventoryQuantity,
  lowStockThreshold,
  variants = [],
}) {
  const previewVariants = useMemo(
    () =>
      (Array.isArray(variants) ? variants : []).filter((variant) => variant?.is_active !== false),
    [variants]
  );
  const [selectedVariantId, setSelectedVariantId] = useState(previewVariants[0]?.id || null);

  const selectedVariant =
    previewVariants.find((variant) => variant.id === selectedVariantId) || previewVariants[0] || null;
  const effectivePrice =
    selectedVariant?.price !== null && selectedVariant?.price !== undefined && selectedVariant?.price !== ""
      ? selectedVariant.price
      : price;
  const selectedQuantity = selectedVariant ? Number(selectedVariant.quantity || 0) : inventoryQuantity;
  const threshold = Number(lowStockThreshold || 0);
  const effectiveStatus = selectedVariant
    ? selectedQuantity > 0
      ? selectedQuantity <= threshold
        ? "low_stock"
        : "in_stock"
      : "out_of_stock"
    : inventoryStatus;
  const inventory = normalizeInventory({
    inventory_status: effectiveStatus,
    inventory_quantity: selectedQuantity,
    low_stock_threshold: lowStockThreshold,
  });
  const priceLabel = formatPrice(effectivePrice) || "Add a price";
  const titleLabel = title?.trim() || "Your listing title";
  const categoryLabel = category?.trim() || "Choose a category";

  return (
    <section>
      <div className="overflow-hidden rounded-[18px] bg-white ring-1 ring-slate-200/50">
        <div
          className="aspect-[16/11] p-3"
          style={{ backgroundColor: "#F9FAFB", borderBottom: "1px solid #F1F5F9" }}
        >
          <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-white">
          {imageUrl ? (
            <img src={imageUrl} alt={titleLabel} className="h-full w-full bg-white object-contain" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              Cover photo preview
            </div>
          )}
          </div>
        </div>

        <div className="space-y-3 p-5">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              {categoryLabel}
            </p>
            <h3 className="text-lg font-semibold leading-6 text-slate-900">{titleLabel}</h3>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-lg font-semibold text-slate-900">{priceLabel}</p>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                inventory.availability === "available"
                  ? "bg-emerald-50 text-emerald-700"
                  : inventory.availability === "low"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-rose-50 text-rose-700"
              }`}
            >
              {inventory.label}
            </span>
          </div>

          {previewVariants.length ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {previewVariants.slice(0, 6).map((variant) => {
                  const label = buildVariantLabel(variant.options) || "Variant";
                  const isSelected = variant.id === selectedVariant?.id;
                  return (
                    <button
                      key={variant.id || label}
                      type="button"
                      onClick={() => setSelectedVariantId(variant.id || null)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                        isSelected
                          ? "bg-violet-100 text-violet-800 shadow-sm"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <p className="text-sm text-slate-600">
            {selectedQuantity === null || selectedQuantity === undefined
              ? "Inventory will show once quantity is added."
              : `${selectedQuantity} available right now.`}
          </p>
        </div>
      </div>
    </section>
  );
}
