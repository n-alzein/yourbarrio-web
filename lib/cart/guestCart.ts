import { DELIVERY_FULFILLMENT_TYPE, PICKUP_FULFILLMENT_TYPE } from "@/lib/fulfillment";
import { primaryPhotoUrl } from "@/lib/listingPhotos";

export const GUEST_CART_STORAGE_KEY = "yb:guestCart:v1";
export const GUEST_CART_UPDATED_EVENT = "yb:guest-cart-updated";

export type GuestCartItem = {
  id: string;
  listing_id: string;
  vendor_id: string;
  quantity: number;
  title: string;
  unit_price: number | null;
  image_url: string | null;
  business_name?: string | null;
  available_fulfillment_methods?: string[];
};

export type GuestCartVendor = {
  id: string;
  business_name?: string | null;
};

export type GuestCartCart = {
  id: string;
  vendor_id: string;
  fulfillment_type: string;
  available_fulfillment_methods: string[];
  cart_items: GuestCartItem[];
};

export type GuestCart = {
  version: 1;
  carts: GuestCartCart[];
  vendors: Record<string, GuestCartVendor>;
  updatedAt: number;
};

type AddGuestCartInput = {
  listingId: string;
  quantity?: number;
  fulfillmentType?: string | null;
  listing?: Record<string, any> | null;
  business?: Record<string, any> | null;
};

const EMPTY_GUEST_CART: GuestCart = {
  version: 1,
  carts: [],
  vendors: {},
  updatedAt: 0,
};

function getStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function emitGuestCartUpdated(cart: GuestCart) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(GUEST_CART_UPDATED_EVENT, { detail: cart }));
}

function normalizeQuantity(value: unknown) {
  const parsed = Number(value || 1);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.round(parsed));
}

function normalizePrice(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeMethods(methods: unknown) {
  const values = Array.isArray(methods) ? methods : [PICKUP_FULFILLMENT_TYPE];
  const normalized = values
    .map((method) => String(method || "").trim())
    .filter((method) => method === PICKUP_FULFILLMENT_TYPE || method === DELIVERY_FULFILLMENT_TYPE);
  return normalized.length ? [...new Set(normalized)] : [PICKUP_FULFILLMENT_TYPE];
}

function normalizeCart(input: unknown): GuestCart {
  if (!input || typeof input !== "object") return { ...EMPTY_GUEST_CART };
  const raw = input as Partial<GuestCart>;
  const vendors = raw.vendors && typeof raw.vendors === "object" ? raw.vendors : {};
  const carts = Array.isArray(raw.carts)
    ? raw.carts
        .map((cart) => {
          const vendorId = String(cart?.vendor_id || "").trim();
          if (!vendorId) return null;
          const methods = normalizeMethods(cart?.available_fulfillment_methods);
          const fulfillmentType = methods.includes(String(cart?.fulfillment_type || ""))
            ? String(cart?.fulfillment_type)
            : methods[0];
          const items = Array.isArray(cart?.cart_items)
            ? cart.cart_items
                .map((item) => {
                  const listingId = String(item?.listing_id || item?.id || "").trim();
                  const quantity = Number(item?.quantity || 0);
                  if (!listingId || !Number.isFinite(quantity) || quantity <= 0) return null;
                  return {
                    id: listingId,
                    listing_id: listingId,
                    vendor_id: vendorId,
                    quantity: Math.round(quantity),
                    title: String(item?.title || "Untitled listing"),
                    unit_price: normalizePrice(item?.unit_price),
                    image_url: item?.image_url ? String(item.image_url) : null,
                    business_name: item?.business_name ? String(item.business_name) : null,
                    available_fulfillment_methods: normalizeMethods(item?.available_fulfillment_methods),
                  };
                })
                .filter(Boolean)
            : [];
          return {
            id: `guest:${vendorId}`,
            vendor_id: vendorId,
            fulfillment_type: fulfillmentType,
            available_fulfillment_methods: methods,
            cart_items: items,
          };
        })
        .filter(Boolean)
    : [];

  return {
    version: 1,
    carts: carts as GuestCartCart[],
    vendors: vendors as Record<string, GuestCartVendor>,
    updatedAt: Number(raw.updatedAt || 0),
  };
}

export function getGuestCart(): GuestCart {
  const storage = getStorage();
  if (!storage) return { ...EMPTY_GUEST_CART };
  try {
    return normalizeCart(JSON.parse(storage.getItem(GUEST_CART_STORAGE_KEY) || "null"));
  } catch {
    storage.removeItem(GUEST_CART_STORAGE_KEY);
    return { ...EMPTY_GUEST_CART };
  }
}

export function setGuestCart(cart: GuestCart) {
  const storage = getStorage();
  const normalized = normalizeCart({ ...cart, version: 1, updatedAt: Date.now() });
  if (storage) {
    storage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify(normalized));
  }
  emitGuestCartUpdated(normalized);
  return normalized;
}

export function clearGuestCart() {
  const storage = getStorage();
  storage?.removeItem(GUEST_CART_STORAGE_KEY);
  emitGuestCartUpdated({ ...EMPTY_GUEST_CART });
}

export function addToGuestCart({
  listingId,
  quantity = 1,
  fulfillmentType = null,
  listing = null,
  business = null,
}: AddGuestCartInput) {
  const resolvedListingId = String(listingId || listing?.id || "").trim();
  const vendorId = String(listing?.business_id || business?.id || "").trim();
  if (!resolvedListingId || !vendorId) {
    return { error: "This listing is not available for guest cart." };
  }

  const cart = getGuestCart();
  const methods = normalizeMethods(listing?.available_fulfillment_methods);
  const selectedFulfillment = methods.includes(String(fulfillmentType || ""))
    ? String(fulfillmentType)
    : methods[0];
  const businessName =
    String(business?.business_name || business?.full_name || listing?.business_name || "").trim() ||
    "Local vendor";
  const existingCart =
    cart.carts.find((cartRow) => cartRow.vendor_id === vendorId) ||
    {
      id: `guest:${vendorId}`,
      vendor_id: vendorId,
      fulfillment_type: selectedFulfillment,
      available_fulfillment_methods: methods,
      cart_items: [],
    };
  const existingItem = existingCart.cart_items.find((item) => item.listing_id === resolvedListingId);
  const nextQuantity = normalizeQuantity(quantity);
  if (existingItem) {
    existingItem.quantity += nextQuantity;
    existingItem.title = String(listing?.title || existingItem.title || "Untitled listing");
    existingItem.unit_price = normalizePrice(listing?.price ?? existingItem.unit_price);
    existingItem.image_url = primaryPhotoUrl(listing?.photo_url) || existingItem.image_url || null;
    existingItem.business_name = businessName;
    existingItem.available_fulfillment_methods = methods;
  } else {
    existingCart.cart_items.push({
      id: resolvedListingId,
      listing_id: resolvedListingId,
      vendor_id: vendorId,
      quantity: nextQuantity,
      title: String(listing?.title || "Untitled listing"),
      unit_price: normalizePrice(listing?.price),
      image_url: primaryPhotoUrl(listing?.photo_url) || null,
      business_name: businessName,
      available_fulfillment_methods: methods,
    });
  }
  existingCart.available_fulfillment_methods = [
    ...new Set([...existingCart.available_fulfillment_methods, ...methods]),
  ];
  existingCart.fulfillment_type = selectedFulfillment;
  cart.carts = [
    ...cart.carts.filter((cartRow) => cartRow.vendor_id !== vendorId),
    existingCart,
  ];
  cart.vendors[vendorId] = { id: vendorId, business_name: businessName };
  return { cart: setGuestCart(cart), item: existingItem || existingCart.cart_items.at(-1) };
}

export function updateGuestCartItem(itemId: string, quantity: number) {
  const cart = getGuestCart();
  const nextQuantity = Math.round(Number(quantity || 0));
  cart.carts = cart.carts
    .map((cartRow) => ({
      ...cartRow,
      cart_items: cartRow.cart_items
        .map((item) =>
          item.id === itemId || item.listing_id === itemId
            ? { ...item, quantity: nextQuantity }
            : item
        )
        .filter((item) => item.quantity > 0),
    }))
    .filter((cartRow) => cartRow.cart_items.length > 0);
  return setGuestCart(cart);
}

export function removeFromGuestCart(itemId: string) {
  return updateGuestCartItem(itemId, 0);
}

export function setGuestCartFulfillment(vendorId: string | null, fulfillmentType: string) {
  if (!vendorId) return getGuestCart();
  const cart = getGuestCart();
  cart.carts = cart.carts.map((cartRow) => {
    if (cartRow.vendor_id !== vendorId) return cartRow;
    const methods = normalizeMethods(cartRow.available_fulfillment_methods);
    return {
      ...cartRow,
      fulfillment_type: methods.includes(fulfillmentType) ? fulfillmentType : methods[0],
    };
  });
  return setGuestCart(cart);
}

export function getGuestCartCount(cart = getGuestCart()) {
  return cart.carts.reduce(
    (sum, cartRow) =>
      sum +
      cartRow.cart_items.reduce((itemSum, item) => itemSum + Number(item.quantity || 0), 0),
    0
  );
}
