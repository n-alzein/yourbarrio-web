import { DELIVERY_FULFILLMENT_TYPE, PICKUP_FULFILLMENT_TYPE } from "@/lib/fulfillment";
import { getMaxPurchasableQuantity, MAX_ORDER_QUANTITY } from "@/lib/inventory";
import { resolveListingCoverImageUrl } from "@/lib/listingPhotos";
import { assertListingPurchasable } from "@/lib/seededListings";

export const GUEST_CART_STORAGE_KEY = "yb:guestCart:v1";
export const GUEST_CART_UPDATED_EVENT = "yb:guest-cart-updated";

export type GuestCartItem = {
  id: string;
  listing_id: string;
  vendor_id: string;
  variant_id?: string | null;
  variant_label?: string | null;
  selected_options?: Record<string, string> | null;
  quantity: number;
  title: string;
  unit_price: number | null;
  image_url: string | null;
  business_name?: string | null;
  available_fulfillment_methods?: string[];
  max_order_quantity?: number;
  stock_error?: string | null;
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
  variantId?: string | null;
  variantLabel?: string | null;
  selectedOptions?: Record<string, string> | null;
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
  return Math.max(1, Math.min(MAX_ORDER_QUANTITY, Math.round(parsed)));
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

function buildGuestCartItemId(listingId: string, variantId?: string | null) {
  return variantId ? `${listingId}:${variantId}` : listingId;
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
                    id: buildGuestCartItemId(
                      listingId,
                      item?.variant_id ? String(item.variant_id) : null
                    ),
                    listing_id: listingId,
                    vendor_id: vendorId,
                    variant_id: item?.variant_id ? String(item.variant_id) : null,
                    variant_label: item?.variant_label ? String(item.variant_label) : null,
                    selected_options:
                      item?.selected_options && typeof item.selected_options === "object"
                        ? item.selected_options
                        : null,
                    quantity: Math.round(quantity),
                    title: String(item?.title || "Untitled listing"),
                    unit_price: normalizePrice(item?.unit_price),
                    image_url: item?.image_url ? String(item.image_url) : null,
                    business_name: item?.business_name ? String(item.business_name) : null,
                    available_fulfillment_methods: normalizeMethods(item?.available_fulfillment_methods),
                    max_order_quantity: Math.max(
                      0,
                      Math.min(MAX_ORDER_QUANTITY, Number(item?.max_order_quantity || MAX_ORDER_QUANTITY))
                    ),
                    stock_error: item?.stock_error ? String(item.stock_error) : null,
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
  variantId = null,
  variantLabel = null,
  selectedOptions = null,
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
  try {
    assertListingPurchasable(listing);
  } catch (error: any) {
    return {
      error: error?.message || "This preview item is not available for purchase yet.",
      code: error?.code || "SEEDED_LISTING_NOT_PURCHASABLE",
    };
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
  const guestItemId = buildGuestCartItemId(resolvedListingId, variantId);
  const existingItem = existingCart.cart_items.find((item) => item.id === guestItemId);
  const maxQuantity = getMaxPurchasableQuantity(listing);
  if (maxQuantity <= 0) {
    return { error: "This item is currently out of stock." };
  }
  const nextQuantity = Math.min(normalizeQuantity(quantity), maxQuantity);
  if (existingItem) {
    existingItem.quantity = Math.min(existingItem.quantity + nextQuantity, maxQuantity);
    existingItem.title = String(listing?.title || existingItem.title || "Untitled listing");
    existingItem.unit_price = normalizePrice(listing?.price ?? existingItem.unit_price);
    existingItem.image_url = resolveListingCoverImageUrl(listing) || existingItem.image_url || null;
    existingItem.variant_id = variantId;
    existingItem.variant_label = variantLabel || existingItem.variant_label || null;
    existingItem.selected_options = selectedOptions || existingItem.selected_options || null;
    existingItem.business_name = businessName;
    existingItem.available_fulfillment_methods = methods;
    existingItem.max_order_quantity = maxQuantity;
    existingItem.stock_error = existingItem.quantity > maxQuantity ? `Only ${maxQuantity} available right now.` : null;
  } else {
    existingCart.cart_items.push({
      id: guestItemId,
      listing_id: resolvedListingId,
      vendor_id: vendorId,
      variant_id: variantId,
      variant_label: variantLabel || null,
      selected_options: selectedOptions || null,
      quantity: nextQuantity,
      title: String(listing?.title || "Untitled listing"),
      unit_price: normalizePrice(listing?.price),
      image_url: resolveListingCoverImageUrl(listing) || null,
      business_name: businessName,
      available_fulfillment_methods: methods,
      max_order_quantity: maxQuantity,
      stock_error: null,
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
  const nextQuantity = Math.max(0, Math.min(MAX_ORDER_QUANTITY, Math.round(Number(quantity || 0))));
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
