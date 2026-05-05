import { getBusinessType } from "@/lib/taxonomy/businessTypes";
import { getListingCategory } from "@/lib/taxonomy/listingCategories";

function normalizeString(value) {
  return String(value || "").trim();
}

async function fetchActiveTaxonomyRow(client, table, slug) {
  const normalizedSlug = normalizeString(slug);
  if (!client || !normalizedSlug) return null;

  try {
    const { data, error } = await client
      .from(table)
      .select("id,slug,name")
      .eq("slug", normalizedSlug)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[taxonomy] ${table} lookup failed`, error);
      }
      return null;
    }

    return data || null;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[taxonomy] ${table} lookup errored`, error);
    }
    return null;
  }
}

export async function fetchBusinessTypeBySlug(client, value) {
  const businessType = getBusinessType(value);
  const slug = businessType?.slug || normalizeString(value);
  return fetchActiveTaxonomyRow(client, "business_types", slug);
}

export async function fetchListingCategoryBySlug(client, value) {
  const listingCategory = getListingCategory(value);
  const slug = listingCategory?.slug || normalizeString(value);
  return fetchActiveTaxonomyRow(client, "listing_categories", slug);
}
