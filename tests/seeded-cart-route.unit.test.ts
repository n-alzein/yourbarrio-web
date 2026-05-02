import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSupabaseServerClientMock,
  getServiceSupabaseServerClientMock,
  getUserCachedMock,
  getCurrentAccountContextMock,
  upsertCartItemReservationMock,
  releaseCartItemReservationMock,
} = vi.hoisted(() => ({
  getSupabaseServerClientMock: vi.fn(),
  getServiceSupabaseServerClientMock: vi.fn(),
  getUserCachedMock: vi.fn(),
  getCurrentAccountContextMock: vi.fn(),
  upsertCartItemReservationMock: vi.fn(),
  releaseCartItemReservationMock: vi.fn(),
}));

vi.mock("@/lib/supabaseServer", () => ({
  getSupabaseServerClient: getSupabaseServerClientMock,
  getUserCached: getUserCachedMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: getServiceSupabaseServerClientMock,
}));

vi.mock("@/lib/auth/getCurrentAccountContext", () => ({
  getCurrentAccountContext: getCurrentAccountContextMock,
}));

vi.mock("@/lib/fulfillment", () => ({
  BUSINESS_FULFILLMENT_SELECT: "pickup_enabled_default",
  DELIVERY_FULFILLMENT_TYPE: "delivery",
  LISTING_FULFILLMENT_SELECT: "pickup_enabled,local_delivery_enabled",
  PICKUP_FULFILLMENT_TYPE: "pickup",
  deriveFulfillmentSummary: vi.fn(() => ({
    selectedFulfillmentType: "pickup",
    availableMethods: ["pickup"],
    deliveryFeeCents: 0,
    deliveryNotes: null,
    deliveryMinOrderCents: 0,
    deliveryRadiusMiles: null,
    deliveryUnavailableReason: null,
  })),
}));

vi.mock("@/lib/listingOptions", () => ({
  getVariantInventoryListing: vi.fn((listing) => listing),
}));

vi.mock("@/lib/cart/reservations", () => ({
  buildOnlyLeftAvailableMessage: vi.fn((quantity: number) => `Only ${quantity} left available.`),
  getInventoryAvailabilitySnapshot: vi.fn(async () => ({
    stockQuantity: 5,
    activeCartReservations: 0,
    committedOrderQuantity: 0,
    availableQuantity: 5,
  })),
  releaseCartItemReservation: releaseCartItemReservationMock,
  upsertCartItemReservation: upsertCartItemReservationMock,
}));

import { PATCH, POST } from "@/app/api/cart/route";

function createSupabaseMock() {
  return {
    from: vi.fn((table: string) => {
      if (table === "listings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: "listing-1",
                  business_id: "business-1",
                  title: "Preview item",
                  price: 12,
                  inventory_status: "in_stock",
                  inventory_quantity: 5,
                  low_stock_threshold: 1,
                  is_seeded: true,
                  pickup_enabled: true,
                  local_delivery_enabled: false,
                },
                error: null,
              })),
            })),
            in: vi.fn(async () => ({
              data: [],
              error: null,
            })),
          })),
        };
      }

      if (table === "listing_variants") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: null,
                    error: null,
                  })),
                })),
              })),
            })),
          })),
        };
      }

      if (table === "businesses") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({
              data: [{ owner_user_id: "business-1", pickup_enabled_default: true }],
              error: null,
            })),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

function createGuestCapableSupabaseMock({
  guestId = "guest-1",
  userId = null,
  listingId = "listing-1",
  cartId = "cart-1",
  cartItemId = "cart-item-1",
}: {
  guestId?: string;
  userId?: string | null;
  listingId?: string;
  cartId?: string;
  cartItemId?: string;
} = {}) {
  const vendor = {
    id: "business-1",
    business_name: "Barrio Kitchen",
    full_name: "Barrio Kitchen",
    profile_photo_url: null,
    city: "Long Beach",
    address: "123 Main St",
  };
  const listing = {
    id: listingId,
    business_id: vendor.id,
    title: "Fresh salsa",
    price: 12,
    photo_url: null,
    photo_variants: null,
    cover_image_id: null,
    inventory_status: "in_stock",
    inventory_quantity: 5,
    low_stock_threshold: 1,
    is_seeded: false,
    pickup_enabled: true,
    local_delivery_enabled: false,
  };
  const business = {
    owner_user_id: vendor.id,
    pickup_enabled_default: true,
  };
  const state = {
    carts: [] as any[],
    cartItems: [] as any[],
  };

  function createCart(ownerUserId = userId, ownerGuestId = guestId) {
    const cart = {
      id: cartId,
      vendor_id: vendor.id,
      user_id: ownerUserId,
      guest_id: ownerUserId ? null : ownerGuestId,
      status: "active",
      fulfillment_type: "pickup",
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    state.carts = [cart];
    return cart;
  }

  function createCartItem(quantity = 1, ownerCartId = cartId) {
    const item = {
      id: cartItemId,
      cart_id: ownerCartId,
      listing_id: listing.id,
      variant_id: null,
      variant_label: null,
      selected_options: {},
      quantity,
      reserved_quantity: quantity,
      reservation_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      title: listing.title,
      unit_price: listing.price,
      image_url: null,
      vendor_id: vendor.id,
      stock_error: null,
      max_order_quantity: 5,
    };
    state.cartItems = [item];
    return item;
  }

  const createBuilder = (rowsFactory: () => any[]) => {
    const filters: Record<string, any> = {};
    const nullFilters = new Set<string>();
    let single = false;
    const buildRows = () =>
      rowsFactory().filter((row) => {
        if (
          Object.entries(filters).some(([key, value]) => row[key] !== value)
        ) {
          return false;
        }
        if ([...nullFilters].some((key) => row[key] !== null && row[key] !== undefined)) {
          return false;
        }
        return true;
      });
    const builder: any = {
      eq(column: string, value: any) {
        filters[column] = value;
        return builder;
      },
      is(column: string, value: any) {
        if (value === null) nullFilters.add(column);
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      in(column: string, values: any[]) {
        const rows = rowsFactory().filter((row) => values.includes(row[column]));
        return Promise.resolve({ data: rows, error: null });
      },
      maybeSingle() {
        single = true;
        return builder;
      },
      then(resolve: any, reject: any) {
        const rows = buildRows();
        return Promise.resolve({
          data: single ? rows[0] || null : rows,
          error: null,
        }).then(resolve, reject);
      },
    };
    return builder;
  };

  const supabase = {
    state,
    createCart,
    createCartItem,
    from: vi.fn((table: string) => {
      if (table === "listings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: listing, error: null })),
            })),
            in: vi.fn(async () => ({ data: [listing], error: null })),
          })),
        };
      }

      if (table === "listing_variants") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
            in: vi.fn(async () => ({ data: [], error: null })),
          })),
        };
      }

      if (table === "businesses") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({ data: [business], error: null })),
          })),
        };
      }

      if (table === "users") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({ data: [vendor], error: null })),
          })),
        };
      }

      if (table === "carts") {
        return {
          select: vi.fn(() => createBuilder(() =>
            state.carts.map((cart) => ({
              ...cart,
              cart_items: state.cartItems.filter((item) => item.cart_id === cart.id),
            }))
          )),
          insert: vi.fn((payload: any) => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                const cart = {
                  id: cartId,
                  ...payload,
                  updated_at: new Date().toISOString(),
                  created_at: new Date().toISOString(),
                };
                state.carts = [cart];
                return { data: cart, error: null };
              }),
            })),
          })),
          update: vi.fn((values: any) => ({
            in: vi.fn(async (_column: string, ids: string[]) => {
              state.carts = state.carts.map((cart) =>
                ids.includes(cart.id) ? { ...cart, ...values } : cart
              );
              return { error: null };
            }),
            eq: vi.fn(async (_column: string, id: string) => {
              state.carts = state.carts.map((cart) =>
                cart.id === id ? { ...cart, ...values } : cart
              );
              return { error: null };
            }),
          })),
        };
      }

      if (table === "cart_items") {
        return {
          select: vi.fn(() => createBuilder(() => state.cartItems)),
          update: vi.fn((values: any) => ({
            eq: vi.fn(async (_column: string, id: string) => {
              state.cartItems = state.cartItems.map((item) =>
                item.id === id ? { ...item, ...values } : item
              );
              return { error: null };
            }),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return { supabase, listing, vendor, state };
}

describe("cart api seeded listing guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSupabaseServerClientMock.mockResolvedValue(createSupabaseMock());
    getServiceSupabaseServerClientMock.mockReturnValue(null);
    getUserCachedMock.mockResolvedValue({
      user: { id: "customer-1" },
      error: null,
    });
    getCurrentAccountContextMock.mockResolvedValue({
      canPurchase: true,
      isRoleResolved: true,
    });
    upsertCartItemReservationMock.mockReset();
    releaseCartItemReservationMock.mockReset();
  });

  it("rejects seeded listings before cart write", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listing_id: "listing-1", quantity: 1 }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "This preview item is not available for purchase yet.",
      code: "SEEDED_LISTING_NOT_PURCHASABLE",
    });
  });
});

describe("cart api guest auth handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServiceSupabaseServerClientMock.mockReturnValue(null);
    getCurrentAccountContextMock.mockResolvedValue({
      canPurchase: true,
      isRoleResolved: true,
    });
  });

  it("allows guest add to cart without an auth session when guest_id is valid", async () => {
    const { supabase, state, vendor } = createGuestCapableSupabaseMock();
    getSupabaseServerClientMock.mockResolvedValue(supabase);
    getUserCachedMock.mockResolvedValue({
      user: null,
      error: { name: "AuthSessionMissingError", message: "Auth session missing!" },
    });
    upsertCartItemReservationMock.mockImplementation(async ({ cartId, guestId, listingId, quantity }) => {
      const cart = state.carts[0] || supabase.createCart(null, guestId);
      const item = {
        id: "cart-item-1",
        cart_id: cartId || cart.id,
        listing_id: listingId,
        variant_id: null,
        variant_label: null,
        selected_options: {},
        quantity,
        reserved_quantity: quantity,
        reservation_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        title: "Fresh salsa",
        unit_price: 12,
        image_url: null,
        vendor_id: vendor.id,
      };
      state.cartItems = [item];
      if (!state.carts.length) state.carts = [cart];
      return {
        success: true,
        cartItemId: item.id,
        reservationExpiresAt: item.reservation_expires_at,
        availableQuantity: 5,
      };
    });

    const response = await POST(
      new Request("http://localhost:3000/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guest_id: "guest-1", listing_id: "listing-1", quantity: 1 }),
      })
    );

    const body = await response.json();
    expect({ status: response.status, body }).toMatchObject({
      status: 200,
      body: {
        guest_id: "guest-1",
        cart: {
          vendor_id: "business-1",
          cart_items: [{ id: "cart-item-1", quantity: 1 }],
        },
      },
    });
  });

  it("allows guest quantity updates without an auth session", async () => {
    const { supabase, state } = createGuestCapableSupabaseMock();
    const cart = supabase.createCart(null, "guest-1");
    supabase.createCartItem(1, cart.id);
    getSupabaseServerClientMock.mockResolvedValue(supabase);
    getUserCachedMock.mockResolvedValue({
      user: null,
      error: { name: "AuthSessionMissingError", message: "Auth session missing!" },
    });
    upsertCartItemReservationMock.mockImplementation(async ({ quantity, cartItemId }) => {
      state.cartItems = state.cartItems.map((item) =>
        item.id === cartItemId ? { ...item, quantity, reserved_quantity: quantity } : item
      );
      return {
        success: true,
        cartItemId,
        reservationExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        availableQuantity: 5,
      };
    });

    const response = await PATCH(
      new Request("http://localhost:3000/api/cart", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guest_id: "guest-1", item_id: "cart-item-1", quantity: 3 }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      guest_id: "guest-1",
      cart: {
        cart_items: [{ id: "cart-item-1", quantity: 3 }],
      },
    });
  });

  it("allows guest removal without an auth session", async () => {
    const { supabase, state } = createGuestCapableSupabaseMock();
    const cart = supabase.createCart(null, "guest-1");
    supabase.createCartItem(1, cart.id);
    getSupabaseServerClientMock.mockResolvedValue(supabase);
    getUserCachedMock.mockResolvedValue({
      user: null,
      error: { name: "AuthSessionMissingError", message: "Auth session missing!" },
    });
    releaseCartItemReservationMock.mockImplementation(async ({ cartItemId }) => {
      state.cartItems = state.cartItems.filter((item) => item.id !== cartItemId);
      return { success: true, cart_item_id: cartItemId };
    });

    const response = await PATCH(
      new Request("http://localhost:3000/api/cart", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guest_id: "guest-1", item_id: "cart-item-1", quantity: 0 }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      guest_id: "guest-1",
      cart: {
        cart_items: [],
      },
    });
  });

  it("rejects missing guest_id without an auth session", async () => {
    getSupabaseServerClientMock.mockResolvedValue(createGuestCapableSupabaseMock().supabase);
    getUserCachedMock.mockResolvedValue({
      user: null,
      error: { name: "AuthSessionMissingError", message: "Auth session missing!" },
    });

    const response = await POST(
      new Request("http://localhost:3000/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listing_id: "listing-1", quantity: 1 }),
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "Unauthorized" });
  });

  it("keeps server-side inventory blocking for over-limit guest adds", async () => {
    const { supabase } = createGuestCapableSupabaseMock();
    getSupabaseServerClientMock.mockResolvedValue(supabase);
    getUserCachedMock.mockResolvedValue({
      user: null,
      error: { name: "AuthSessionMissingError", message: "Auth session missing!" },
    });
    upsertCartItemReservationMock.mockResolvedValue({
      success: false,
      errorCode: "insufficient_inventory",
      message: "Only 2 left available.",
      availableQuantity: 2,
      cartItemId: null,
      reservationExpiresAt: null,
    });

    const response = await POST(
      new Request("http://localhost:3000/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guest_id: "guest-1", listing_id: "listing-1", quantity: 3 }),
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "Only 2 left available.",
      code: "insufficient_inventory",
      maxQuantity: 2,
    });
  });

  it("merges a guest cart into the authenticated cart after reservation changes", async () => {
    const { supabase, state, vendor } = createGuestCapableSupabaseMock({
      userId: "customer-1",
      cartId: "user-cart",
      cartItemId: "user-item",
    });
    state.carts = [
      {
        id: "guest-cart",
        vendor_id: vendor.id,
        user_id: null,
        guest_id: "guest-1",
        status: "active",
        fulfillment_type: "pickup",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "user-cart",
        vendor_id: vendor.id,
        user_id: "customer-1",
        guest_id: null,
        status: "active",
        fulfillment_type: "pickup",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
    state.cartItems = [
      {
        id: "guest-item",
        cart_id: "guest-cart",
        vendor_id: vendor.id,
        listing_id: "listing-1",
        variant_id: null,
        variant_label: null,
        selected_options: {},
        quantity: 1,
        reserved_quantity: 1,
        reservation_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        title: "Fresh salsa",
        unit_price: 12,
        image_url: null,
      },
      {
        id: "user-item",
        cart_id: "user-cart",
        vendor_id: vendor.id,
        listing_id: "listing-1",
        variant_id: null,
        variant_label: null,
        selected_options: {},
        quantity: 2,
        reserved_quantity: 2,
        reservation_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        title: "Fresh salsa",
        unit_price: 12,
        image_url: null,
      },
    ];

    getSupabaseServerClientMock.mockResolvedValue(supabase);
    getUserCachedMock.mockResolvedValue({
      user: { id: "customer-1" },
      error: null,
    });
    upsertCartItemReservationMock.mockImplementation(async ({ cartItemId, quantity }) => {
      state.cartItems = state.cartItems.map((item) =>
        item.id === cartItemId ? { ...item, quantity, reserved_quantity: quantity } : item
      );
      return {
        success: true,
        cartItemId,
        reservationExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        availableQuantity: 5,
      };
    });
    releaseCartItemReservationMock.mockImplementation(async ({ cartItemId }) => {
      state.cartItems = state.cartItems.filter((item) => item.id !== cartItemId);
      return { success: true, cart_item_id: cartItemId };
    });

    const response = await POST(
      new Request("http://localhost:3000/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guest_id: "guest-1",
          guest_item_id: "guest-item",
          listing_id: "listing-1",
          quantity: 1,
        }),
      })
    );

    const body = await response.json();
    expect({ status: response.status, body }).toMatchObject({
      status: 200,
      body: {
        cart: {
          id: "user-cart",
          cart_items: [{ id: "user-item", quantity: 3 }],
        },
      },
    });
    expect(state.cartItems).toHaveLength(1);
    expect(state.cartItems[0].id).toBe("user-item");
  });

  it("skips a missing guest cart item during authenticated cart merge", async () => {
    const { supabase, state, vendor } = createGuestCapableSupabaseMock({
      userId: "customer-1",
      cartId: "user-cart",
      cartItemId: "user-item",
    });
    state.carts = [
      {
        id: "user-cart",
        vendor_id: vendor.id,
        user_id: "customer-1",
        guest_id: null,
        status: "active",
        fulfillment_type: "pickup",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
    state.cartItems = [
      {
        id: "user-item",
        cart_id: "user-cart",
        vendor_id: vendor.id,
        listing_id: "listing-1",
        variant_id: null,
        variant_label: null,
        selected_options: {},
        quantity: 2,
        reserved_quantity: 2,
        reservation_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        title: "Fresh salsa",
        unit_price: 12,
        image_url: null,
      },
    ];
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    getSupabaseServerClientMock.mockResolvedValue(supabase);
    getUserCachedMock.mockResolvedValue({
      user: { id: "customer-1" },
      error: null,
    });

    const response = await POST(
      new Request("http://localhost:3000/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guest_id: "guest-1",
          guest_cart_id: "guest-cart",
          guest_item_id: "missing-guest-item",
          listing_id: "listing-1",
          quantity: 1,
        }),
      })
    );

    const body = await response.json();
    expect({ status: response.status, body }).toMatchObject({
      status: 200,
      body: {
        cart: {
          id: "user-cart",
          cart_items: [{ id: "user-item", quantity: 2 }],
        },
      },
    });
    expect(JSON.stringify(body)).not.toContain("guest_cart_item_not_found");
    expect(upsertCartItemReservationMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      "[cart] skipped guest cart item during merge",
      expect.objectContaining({
        reason: "guest_cart_item_not_found",
        guest_cart_id: "guest-cart",
        guest_item_id: "missing-guest-item",
      })
    );
    warnSpy.mockRestore();
  });

  it("keeps authenticated cart writes working", async () => {
    const { supabase, state, vendor } = createGuestCapableSupabaseMock({
      userId: "customer-1",
      guestId: "guest-unused",
    });
    getSupabaseServerClientMock.mockResolvedValue(supabase);
    getUserCachedMock.mockResolvedValue({
      user: { id: "customer-1" },
      error: null,
    });
    upsertCartItemReservationMock.mockImplementation(async ({ guestId, userId, listingId, quantity }) => {
      const cart = supabase.createCart(userId, guestId);
      const item = {
        id: "auth-item",
        cart_id: cart.id,
        listing_id: listingId,
        variant_id: null,
        variant_label: null,
        selected_options: {},
        quantity,
        reserved_quantity: quantity,
        reservation_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        title: "Fresh salsa",
        unit_price: 12,
        image_url: null,
        vendor_id: vendor.id,
      };
      state.cartItems = [item];
      return {
        success: true,
        cartItemId: item.id,
        reservationExpiresAt: item.reservation_expires_at,
        availableQuantity: 5,
      };
    });

    const response = await POST(
      new Request("http://localhost:3000/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listing_id: "listing-1", quantity: 1 }),
      })
    );

    const body = await response.json();
    expect({ status: response.status, body }).toMatchObject({
      status: 200,
      body: {
        cart: {
          user_id: "customer-1",
          cart_items: [{ id: "auth-item", quantity: 1 }],
        },
      },
    });
  });
});
