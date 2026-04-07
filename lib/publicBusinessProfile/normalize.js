function asTrimmedString(value) {
  const normalized = typeof value === "string" ? value.trim() : String(value || "").trim();
  return normalized || null;
}

function asRecord(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return {};
}

function asList(value) {
  return Array.isArray(value) ? value : [];
}

export function sanitizePublicProfile(profile) {
  if (!profile || typeof profile !== "object") return null;

  return {
    ...profile,
    id: asTrimmedString(profile.id) || null,
    owner_user_id: asTrimmedString(profile.owner_user_id) || null,
    public_id: asTrimmedString(profile.public_id) || null,
    business_name: asTrimmedString(profile.business_name),
    full_name: asTrimmedString(profile.full_name),
    business_type: asTrimmedString(profile.business_type),
    category: asTrimmedString(profile.category),
    description: asTrimmedString(profile.description),
    website: asTrimmedString(profile.website),
    phone: asTrimmedString(profile.phone),
    profile_photo_url: asTrimmedString(profile.profile_photo_url),
    cover_photo_url: asTrimmedString(profile.cover_photo_url),
    address: asTrimmedString(profile.address),
    address_2: asTrimmedString(profile.address_2),
    city: asTrimmedString(profile.city),
    state: asTrimmedString(profile.state),
    postal_code: asTrimmedString(profile.postal_code),
    verification_status: asTrimmedString(profile.verification_status) || "pending",
    hours_json: asRecord(profile.hours_json),
    social_links_json: asRecord(profile.social_links_json),
  };
}

export function sanitizeAnnouncements(items) {
  return asList(items)
    .filter((item) => item && typeof item === "object")
    .map((item, index) => ({
      ...item,
      id: item.id ?? `announcement-${index}`,
      title: asTrimmedString(item.title),
      body: asTrimmedString(item.body),
      created_at: item.created_at || null,
      starts_at: item.starts_at || null,
      ends_at: item.ends_at || null,
    }));
}

export function sanitizeGalleryPhotos(items) {
  return asList(items)
    .filter((item) => item && typeof item === "object")
    .map((item, index) => ({
      ...item,
      id: item.id ?? `photo-${index}`,
      photo_url: asTrimmedString(item.photo_url),
      caption: asTrimmedString(item.caption),
    }));
}

export function sanitizeListings(items) {
  return asList(items)
    .filter((item) => item && typeof item === "object")
    .map((item, index) => ({
      ...item,
      id: item.id ?? item.public_id ?? `listing-${index}`,
      title: asTrimmedString(item.title),
      category: asTrimmedString(item.category),
      city: asTrimmedString(item.city),
      photo_url: asTrimmedString(item.photo_url),
      category_info:
        item.category_info && typeof item.category_info === "object"
          ? {
              ...item.category_info,
              name: asTrimmedString(item.category_info.name),
              slug: asTrimmedString(item.category_info.slug),
            }
          : null,
    }));
}

export function sanitizeReviews(items) {
  return asList(items)
    .filter((item) => item && typeof item === "object")
    .map((item, index) => ({
      ...item,
      id: item.id ?? `review-${index}`,
      title: asTrimmedString(item.title),
      body: asTrimmedString(item.body),
      business_reply: asTrimmedString(item.business_reply),
      created_at: item.created_at || null,
      updated_at: item.updated_at || null,
      business_reply_at: item.business_reply_at || null,
    }));
}

export function hasHoursData(hoursValue) {
  return Object.keys(asRecord(hoursValue)).length > 0;
}
