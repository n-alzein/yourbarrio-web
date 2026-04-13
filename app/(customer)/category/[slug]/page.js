import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { primaryPhotoUrl } from "@/lib/listingPhotos";
import { getCustomerListingUrl } from "@/lib/ids/publicRefs";
import {
  getListingCategory,
  getListingCategoryDbNames,
  getListingCategoryDbSlugs,
  normalizeListingCategory,
} from "@/lib/taxonomy/listingCategories";
import { getListingCategoryLabel } from "@/lib/taxonomy/compat";
import { getLocationFromCookies } from "@/lib/location/getLocationFromCookies";
import { findBusinessOwnerIdsForLocation } from "@/lib/location/businessLocationSearch";
import { hasUsableLocationFilter } from "@/lib/location/filter";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CategoryListingsPage({ params }) {
  const slug = normalizeListingCategory(params?.slug);
  if (!slug) notFound();
  const location = await getLocationFromCookies();
  const homeHref = "/customer/home";
  const categoryDescription = "All listings in this category";

  const category = getListingCategory(slug);
  if (!category) notFound();

  const supabase = getSupabaseServerClient();
  let listings = [];
  if (supabase) {
    const categoryNames = getListingCategoryDbNames(slug);
    const categorySlugs = getListingCategoryDbSlugs(slug);

    const businessIds = hasUsableLocationFilter(location)
      ? await findBusinessOwnerIdsForLocation(supabase, location, { limit: 1000 })
      : [];

    const buildBaseQuery = () =>
      supabase
        .from("public_listings_v")
        .select(
          "id,public_id,title,description,price,category,category_id,city,photo_url,created_at,inventory_status,inventory_quantity,low_stock_threshold,inventory_last_updated_at"
        )
        .order("created_at", { ascending: false })
        .limit(80)
        .in("business_id", businessIds);

    let data = [];
    let error = null;

    if (!businessIds.length) {
      listings = [];
    } else {
      const results = await Promise.all([
        categoryNames.length
          ? buildBaseQuery().in("category", categoryNames)
          : Promise.resolve({ data: [], error: null }),
        categorySlugs.length ? buildBaseQuery().in("category", categorySlugs) : Promise.resolve({ data: [], error: null }),
      ]);
      error = results.find((result) => result?.error)?.error || null;
      const deduped = new Map();
      for (const result of results) {
        for (const row of result?.data || []) {
          if (row?.id) deduped.set(row.id, row);
        }
      }
      data = Array.from(deduped.values());

      if (error) {
        listings = [];
      } else {
        listings = Array.isArray(data) ? data : [];
      }
    }
  }

  return (
    <section className="w-full px-5 sm:px-6 md:px-8 lg:px-12 py-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <Link
            href={homeHref}
            className="text-sm text-slate-500 hover:text-slate-900 transition"
          >
            ← Back to home
          </Link>
          <h1 className="mt-3 text-2xl font-semibold text-slate-900">
            {category.name}
          </h1>
          <p className="mt-2 text-sm text-slate-600">{categoryDescription}</p>
        </div>

        {!hasUsableLocationFilter(location) ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            Select a location to see listings in this category.
          </div>
        ) : listings.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            No listings available for this category yet.
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((item) => {
              const cover = primaryPhotoUrl(item.photo_url);
              return (
                <Link
                  key={item.id}
                  href={getCustomerListingUrl(item)}
                  className="group rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition overflow-hidden"
                >
                  <div className="relative h-40 bg-slate-100 flex items-center justify-center">
                    {cover ? (
                      <img
                        src={cover}
                        alt={item.title || "Listing"}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-slate-600">No image</span>
                    )}
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="text-xs uppercase tracking-wide text-slate-600">
                      {getListingCategoryLabel(item, "Listing")}
                      {item.city ? ` · ${item.city}` : ""}
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 line-clamp-2">
                      {item.title}
                    </h3>
                    <div className="text-sm font-semibold text-slate-900">
                      {item.price ? `$${item.price}` : "Price TBD"}
                    </div>
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
