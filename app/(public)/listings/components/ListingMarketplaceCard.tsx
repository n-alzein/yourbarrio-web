"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Heart, ShoppingCart } from "lucide-react";
import SafeImage from "@/components/SafeImage";
import { useCart } from "@/components/cart/CartProvider";
import {
  getCartItemIdsForListingSelection,
  getQuantityInCartForListingSelection,
  resolveListingQuantityState,
} from "@/lib/cart/listingAvailability";
import { resolveListingCoverImageUrl } from "@/lib/listingPhotos";
import { getListingUrl } from "@/lib/ids/publicRefs";
import { normalizeInventory } from "@/lib/inventory";
import { calculateListingPricing } from "@/lib/pricing";
import { getSeededListingBadgeLabel, isSeededListing } from "@/lib/seededListings";
import { getListingCategoryLabel } from "@/lib/taxonomy/compat";
import type { ListingItem } from "../types";

export const LISTING_MARKETPLACE_GRID_CLASS =
  "grid grid-cols-2 gap-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5";
export const LISTING_MARKETPLACE_CARD_CLASS =
  "group flex h-full min-w-0 flex-col rounded-xl border border-slate-100 bg-white transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(15,23,42,0.08)]";
export const LISTING_MARKETPLACE_IMAGE_FRAME_CLASS =
  "relative flex h-[140px] items-center justify-center overflow-hidden md:h-[180px]";
export const LISTING_MARKETPLACE_IMAGE_CLASS =
  "h-full w-full object-contain object-center px-[8%] py-[7%] transition duration-300 ease-out group-hover:scale-[1.02]";
export const LISTING_MARKETPLACE_CONTENT_CLASS = "px-3 pb-3 pt-2.5";
export const LISTING_MARKETPLACE_CTA_WRAPPER_CLASS =
  "px-3 pb-3 pt-0.5 transition-all duration-200 md:translate-y-1 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100 md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100";

function getAvailabilityText(label: string) {
  const normalized = String(label || "").trim().toLowerCase();
  if (!normalized) return "Availability varies";
  if (normalized.includes("out")) return "Sold out";
  if (normalized.includes("low")) return "Low stock";
  if (normalized.includes("pre")) return "Preorder";
  if (normalized.includes("available")) return "Available";
  return label;
}

function formatPrice(value: ListingItem["price"]) {
  if (value === null || value === undefined || value === "") return "Price TBD";
  const number = Number(value);
  if (Number.isNaN(number)) return String(value);
  return number.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getDisplayPriceCents(listing: ListingItem) {
  const finalPriceCents = Number(listing?.finalPriceCents);
  if (Number.isFinite(finalPriceCents) && finalPriceCents > 0) return finalPriceCents;
  return calculateListingPricing(listing?.price).finalPriceCents;
}

function formatPriceCents(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "Price TBD";
  return formatPrice(value / 100);
}

function listingNeedsDetailsBeforeCart(listing: ListingItem & Record<string, unknown>) {
  return Boolean(
    listing?.hasOptions ||
      listing?.has_options ||
      listing?.options_enabled ||
      listing?.requires_options ||
      listing?.requiresOptions
  );
}

export default function ListingMarketplaceCard({
  listing,
  fallbackLocationLabel,
  variant = "default",
  actionVisibility = "hover",
  routeToDetailsForOptionedListings = false,
  isSaved = false,
  saveLoading = false,
  onToggleSave,
}: {
  listing: ListingItem;
  fallbackLocationLabel: string;
  variant?: "default" | "saved";
  actionVisibility?: "hover" | "always";
  routeToDetailsForOptionedListings?: boolean;
  isSaved?: boolean;
  saveLoading?: boolean;
  onToggleSave?: ((listing: ListingItem) => void) | null;
}) {
  const router = useRouter();
  const { addItem, items } = useCart();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [serverAvailableQuantity, setServerAvailableQuantity] = useState<number | null>(null);
  const inventory = normalizeInventory(listing);
  const seeded = isSeededListing(listing);
  const businessName = String(listing?.business_name || "").trim();
  const listingHref = getListingUrl(listing);
  const displayPriceCents = getDisplayPriceCents(listing);
  const isSavedVariant = variant === "saved";
  const needsDetailsBeforeCart = listingNeedsDetailsBeforeCart(listing as ListingItem & Record<string, unknown>);
  const shouldRouteToDetailsBeforeCart = needsDetailsBeforeCart && (isSavedVariant || routeToDetailsForOptionedListings);
  const includeAllVariants = needsDetailsBeforeCart;
  const quantityInCart = useMemo(
    () =>
      getQuantityInCartForListingSelection({
        cartItems: items,
        listingId: listing?.id,
        includeAllVariants,
      }),
    [includeAllVariants, items, listing?.id]
  );
  const excludedCartItemIds = useMemo(
    () =>
      getCartItemIdsForListingSelection({
        cartItems: items,
        listingId: listing?.id,
        includeAllVariants,
      }),
    [includeAllVariants, items, listing?.id]
  );
  const availabilityState = useMemo(
    () =>
      resolveListingQuantityState({
        inventoryMaxQuantity: Number(listing?.inventory_quantity || 0),
        selectedQuantity: 1,
        serverAvailableQuantity,
        quantityInCart,
      }),
    [listing?.inventory_quantity, quantityInCart, serverAvailableQuantity]
  );
  const isOutOfStock = inventory.availability === "out" || availabilityState.isCurrentlyUnavailable;
  void fallbackLocationLabel;
  const addToCartLabel = seeded
    ? "Coming soon"
    : availabilityState.isCurrentlyUnavailable
      ? quantityInCart > 0
        ? "In your cart"
        : "Unavailable"
    : shouldRouteToDetailsBeforeCart
      ? "Select options"
      : adding
        ? "Adding..."
        : added
          ? "Added"
          : "Add to cart";

  useEffect(() => {
    if (!listing?.id || seeded) return undefined;

    const controller = new AbortController();
    const query = new URLSearchParams({ listing_id: String(listing.id) });
    for (const cartItemId of excludedCartItemIds) {
      query.append("exclude_cart_item_id", cartItemId);
    }

    (async () => {
      try {
        const response = await fetch(`/api/cart/availability?${query.toString()}`, {
          method: "GET",
          credentials: "same-origin",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to load availability.");
        }

        setServerAvailableQuantity(
          Math.max(0, Number(payload?.available_quantity ?? payload?.availableQuantity ?? 0))
        );
      } catch (error) {
        if (error?.name === "AbortError") return;
        setServerAvailableQuantity(null);
      }
    })();

    return () => controller.abort();
  }, [excludedCartItemIds, listing?.id, seeded]);

  const handleAddToCart = async () => {
    if (!listing?.id || isOutOfStock || seeded || adding) return;
    if (shouldRouteToDetailsBeforeCart) {
      router.push(listingHref);
      return;
    }
    setAdding(true);
    setAdded(false);
    const result = await addItem({
      listingId: String(listing.id),
      quantity: 1,
      listing,
      business: {
        id: listing.business_id,
        business_name: businessName,
      },
    });
    setAdding(false);
    if (!result?.error) {
      setAdded(true);
      window.setTimeout(() => setAdded(false), 1600);
    }
  };

  const handleToggleSave = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onToggleSave?.(listing);
  };

  return (
    <div
      className={
        isSavedVariant
          ? "group relative flex h-full min-w-0 flex-col rounded-xl border border-slate-100 bg-white transition duration-200 ease-out hover:shadow-sm"
          : LISTING_MARKETPLACE_CARD_CLASS
      }
    >
      {isSavedVariant && onToggleSave ? (
        <button
          type="button"
          onClick={handleToggleSave}
          disabled={saveLoading}
          className={`absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/70 bg-white/80 text-slate-600 shadow-sm backdrop-blur-sm transition hover:border-rose-200 hover:text-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 disabled:cursor-wait disabled:opacity-70 ${
            isSaved ? "opacity-100" : "opacity-80"
          }`}
          aria-pressed={isSaved}
          aria-label={isSaved ? "Unsave listing" : "Save listing"}
          title={isSaved ? "Unsave listing" : "Save listing"}
        >
          <Heart
            className={`h-[18px] w-[18px] ${isSaved ? "text-rose-500" : ""}`}
            fill={isSaved ? "currentColor" : "none"}
            aria-hidden="true"
          />
        </button>
      ) : null}
      <Link
        href={listingHref}
        className="flex min-h-0 flex-1 cursor-pointer flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8c73bb59] focus-visible:ring-offset-2 focus-visible:ring-offset-[#faf6f0]"
        prefetch={false}
      >
        <div
          className={
            isSavedVariant
              ? "relative flex h-[140px] items-center justify-center overflow-hidden bg-white md:h-[180px]"
              : LISTING_MARKETPLACE_IMAGE_FRAME_CLASS
          }
        >
          <SafeImage
            src={resolveListingCoverImageUrl(listing)}
            alt={listing.title || "Listing photo"}
            className={
              isSavedVariant
                ? "h-full w-full object-contain object-center transition duration-300 ease-out group-hover:scale-[1.02]"
                : LISTING_MARKETPLACE_IMAGE_CLASS
            }
            sizes="(max-width: 767px) 50vw, (max-width: 1023px) 25vw, (max-width: 1439px) 20vw, 19vw"
            onError={() => {}}
            onLoad={() => {}}
          />
          {seeded && !isSavedVariant ? (
            <span className="absolute left-2.5 top-2.5 inline-flex items-center rounded-full border border-slate-300 bg-white/92 px-2.5 py-1 text-[11px] font-medium text-slate-600">
              {getSeededListingBadgeLabel(listing)}
            </span>
          ) : null}
        </div>

        <div className={isSavedVariant ? "px-3 pb-3 pt-2.5" : LISTING_MARKETPLACE_CONTENT_CLASS}>
          <div className="space-y-0">
            <p className="whitespace-nowrap text-[15px] font-semibold tracking-[-0.02em] text-slate-950 md:text-base">
              {displayPriceCents > 0 ? formatPriceCents(displayPriceCents) : formatPrice(listing.price)}
            </p>
            <h3 className="line-clamp-2 pt-px text-sm font-medium leading-tight tracking-[-0.01em] text-slate-800">
              {listing.title || "Untitled listing"}
            </h3>
            {businessName ? (
              <p className="mt-0.5 line-clamp-1 text-xs text-slate-400">
                {businessName}
              </p>
            ) : null}
            {isSavedVariant ? (
              <>
                <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                  {getListingCategoryLabel(listing, "Listing")}
                </p>
                <p className="mt-2 text-xs font-medium text-slate-500">
                  {getAvailabilityText(inventory.label)}
                </p>
              </>
            ) : null}
          </div>
        </div>
      </Link>

      <div
        className={
          isSavedVariant || actionVisibility === "always"
            ? "px-3 pb-3 pt-0.5"
            : LISTING_MARKETPLACE_CTA_WRAPPER_CLASS
        }
      >
        <button
          type="button"
          onClick={handleAddToCart}
          disabled={seeded || isOutOfStock || adding}
          className="inline-flex h-9 w-fit items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8c73bb59] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
        >
          <ShoppingCart className="h-4 w-4 text-current" />
          {addToCartLabel}
        </button>
      </div>
    </div>
  );
}
