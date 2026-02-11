function cleanRef(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function encodeRef(value: string) {
  return encodeURIComponent(value);
}

export function getUserPublicRef(user: { public_id?: unknown; id?: unknown }) {
  return cleanRef(user?.public_id) || cleanRef(user?.id);
}

export function getListingPublicRef(listing: { public_id?: unknown; id?: unknown }) {
  return cleanRef(listing?.public_id) || cleanRef(listing?.id);
}

export function getAdminUserUrl(user: { public_id?: unknown; id?: unknown }) {
  const ref = getUserPublicRef(user);
  return ref ? `/admin/users/${encodeRef(ref)}` : "/admin/users";
}

export function getListingUrl(listing: { public_id?: unknown; id?: unknown }) {
  const ref = getListingPublicRef(listing);
  return ref ? `/listings/${encodeRef(ref)}` : "/listings";
}

export function getCustomerListingUrl(listing: { public_id?: unknown; id?: unknown }) {
  const ref = getListingPublicRef(listing);
  return ref ? `/customer/listings/${encodeRef(ref)}` : "/customer/listings";
}

export function getBusinessPublicRef(business: { public_id?: unknown; id?: unknown }) {
  return cleanRef(business?.public_id) || cleanRef(business?.id);
}

export function getCustomerBusinessUrl(business: { public_id?: unknown; id?: unknown }) {
  const ref = getBusinessPublicRef(business);
  return ref ? `/customer/b/${encodeRef(ref)}` : "/customer/home";
}
