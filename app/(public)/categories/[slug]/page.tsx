import Link from "next/link";
import { notFound } from "next/navigation";
import { primaryPhotoUrl } from "@/lib/listingPhotos";
import SafeImage from "@/components/SafeImage";
import {
  LISTING_CATEGORY_BY_SLUG,
  normalizeListingCategory,
} from "@/lib/taxonomy/listingCategories";
import CategoryPerfMark from "./CategoryPerfMark";
import {
  getCategoryListingsCached,
  getCategoryRowCached,
  type SupabaseListing,
} from "@/lib/categoryListingsCached";
import { getListingUrl } from "@/lib/ids/publicRefs";
import { getLocationFromCookies } from "@/lib/location/getLocationFromCookies";
import { hasUsableLocationFilter } from "@/lib/location";
import { calculateListingPricing } from "@/lib/pricing";

export const revalidate = 60;

const LISTINGS_LIMIT = 40;

function formatPriceWithCents(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return "Price TBD";
  const number = Number(value);
  if (Number.isNaN(number)) return "Price TBD";
  return `$${number.toFixed(2)}`;
}

function splitPriceWithCents(value?: number | string | null) {
  const formatted = formatPriceWithCents(value);
  if (formatted === "Price TBD") {
    return { formatted, dollars: null, cents: null };
  }
  const normalized = formatted.replace("$", "");
  const [dollars, cents = "00"] = normalized.split(".");
  return { formatted, dollars, cents };
}

function splitListingDisplayPrice(item: SupabaseListing) {
  const finalPriceCents = Number(item?.finalPriceCents);
  if (Number.isFinite(finalPriceCents) && finalPriceCents > 0) {
    return splitPriceWithCents(finalPriceCents / 100);
  }
  if (item?.price === null || item?.price === undefined || item?.price === "") {
    return splitPriceWithCents(item?.price);
  }
  return splitPriceWithCents(calculateListingPricing(item.price).finalPriceCents / 100);
}

function humanizeSlug(slug: string) {
  return slug
    .split("-")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function CategoryListingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const categorySlug = normalizeListingCategory(slug?.trim());
  if (!categorySlug) notFound();
  const location = await getLocationFromCookies();
  const listingsHref = "/listings";

  let listings: SupabaseListing[] = [];
  const normalizedSlug = categorySlug.toLowerCase();
  let categoryName =
    LISTING_CATEGORY_BY_SLUG.get(normalizedSlug)?.label || humanizeSlug(categorySlug);
  let listingsError: Error | null = null;
  const totalStart = Date.now();
  try {
    const categoryRow = await getCategoryRowCached(categorySlug);
    const fallbackCategory = LISTING_CATEGORY_BY_SLUG.get(normalizedSlug);
    if (!categoryRow && !fallbackCategory) {
      notFound();
    }
    categoryName = categoryRow?.name || fallbackCategory?.name || categoryName;
    if (!hasUsableLocationFilter(location)) {
      listings = [];
      listingsError = null;
    } else {
      const listingResult = await getCategoryListingsCached({
        categoryId: categoryRow?.id ?? null,
        categoryName,
        categorySlug,
        location,
        limit: LISTINGS_LIMIT,
      });
      if (listingResult.error) {
        listingsError = listingResult.error;
        listings = [];
      } else {
        listingsError = null;
        listings = listingResult.listings || [];
      }
      console.log("[categories:branch]", {
        slug: categorySlug,
        branch: listingResult.branch,
        fallbacks: listingResult.fallbacks,
      });
    }
  } catch (error) {
    const digest = (error as { digest?: string } | null)?.digest || "";
    const message = (error as Error | null)?.message || "";
    if (digest === "NEXT_NOT_FOUND" || message.includes("NEXT_HTTP_ERROR_FALLBACK")) {
      throw error;
    }
    listingsError = error as Error;
    console.error("Failed to load category listings", {
      slug: categorySlug,
      error,
    });
  }
  console.log("[categories]", {
    slug: categorySlug,
    city: location?.city || null,
    limit: LISTINGS_LIMIT,
    rows: listings.length,
    error: listingsError?.message,
    totalMs: Date.now() - totalStart,
  });
  const title = categoryName;

  return (
    <section className="w-full px-5 sm:px-6 md:px-8 lg:px-12 py-6">
      <CategoryPerfMark />
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <Link
            href={listingsHref}
            className="text-sm text-slate-500 hover:text-slate-900 transition"
          >
            ← Back to listings
          </Link>
          <h1 className="mt-3 text-2xl sm:text-3xl font-semibold text-slate-900">
            {title}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            All listings in this category
          </p>
        </div>

        {!hasUsableLocationFilter(location) ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-500">
            Select a location to see listings in this category.
          </div>
        ) : listingsError ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-700">
            <div className="text-base font-semibold">Listings unavailable</div>
            <p className="mt-2 text-sm">
              We couldn’t load listings for this category. Please try again soon.
            </p>
          </div>
        ) : listings.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            No listings available for this category yet.
          </div>
        ) : (
          <div className="grid gap-4 sm:gap-5 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {listings.map((item) => {
              const cover = primaryPhotoUrl(item.photo_url);
              return (
                <Link
                  key={item.id}
                  href={getListingUrl(item)}
                  className="group rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition overflow-hidden"
                >
                  <div className="relative w-full h-[200px] sm:h-[220px] lg:h-[240px] overflow-hidden bg-gray-50 p-2">
                    <SafeImage
                      src={cover}
                      alt={item.title || "Listing"}
                      className="h-full w-full object-contain transition duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="text-slate-900 tabular-nums leading-none">
                      {(() => {
                        const price = splitListingDisplayPrice(item);
                        if (!price.dollars) {
                          return (
                            <span className="text-2xl font-bold leading-none">
                              {price.formatted}
                            </span>
                          );
                        }
                        return (
                          <span className="inline-flex items-start gap-0">
                            <span className="text-2xl font-bold leading-none">
                              ${price.dollars}
                            </span>
                            <span className="relative top-[0.1em] text-[0.65em] font-semibold uppercase leading-none align-top">
                              {price.cents}
                            </span>
                          </span>
                        );
                      })()}
                    </div>
                    <h3 className="text-sm sm:text-base font-semibold text-slate-900 line-clamp-2">
                      {item.title || "Untitled listing"}
                    </h3>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
