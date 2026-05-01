import { describe, expect, it } from "vitest";

import {
  getInventoryAvailabilitySnapshot,
  releaseCartItemReservation,
  revalidateCartReservationsForCheckout,
  upsertCartItemReservation,
} from "@/lib/cart/reservations";

class CartReservationClient {
  private itemSeq = 0;
  private readonly carts: any[];
  private readonly cartItems: any[];
  private readonly listings: Record<string, any>;
  private readonly orders: any[];
  private readonly orderItems: any[];

  constructor({
    carts,
    listings,
    orders = [],
    orderItems = [],
  }: {
    carts: any[];
    listings: Record<string, any>;
    orders?: any[];
    orderItems?: any[];
  }) {
    this.carts = carts.map((row) => ({ ...row }));
    this.cartItems = [];
    this.listings = Object.fromEntries(
      Object.entries(listings).map(([id, row]) => [id, { id, ...row }])
    );
    this.orders = orders.map((row) => ({ ...row }));
    this.orderItems = orderItems.map((row) => ({ ...row }));
  }

  getCartItem(id: string) {
    return this.cartItems.find((row) => row.id === id) || null;
  }

  getListingQuantity(id: string) {
    return this.listings[id]?.inventory_quantity ?? null;
  }

  async rpc(name: string, params: Record<string, any>) {
    if (name === "get_inventory_availability") {
      const result = this.getAvailability(params);
      return {
        data: {
          stock_quantity: result.stockQuantity,
          active_cart_reservations: result.activeCartReservations,
          committed_order_quantity: result.committedOrderQuantity,
          available_quantity: result.availableQuantity,
        },
        error: null,
      };
    }

    if (name === "upsert_cart_item_reservation") {
      const cart = this.carts.find(
        (row) =>
          row.id === params.p_cart_id &&
          row.status === "active" &&
          ((params.p_user_id && row.user_id === params.p_user_id) ||
            (params.p_guest_id && row.guest_id === params.p_guest_id))
      );
      if (!cart) {
        return { data: { success: false, error_code: "cart_not_found", message: "Cart not found." }, error: null };
      }

      let item =
        this.cartItems.find(
          (row) =>
            row.id === params.p_cart_item_id && row.cart_id === params.p_cart_id
        ) ||
        this.cartItems.find(
          (row) =>
            row.cart_id === params.p_cart_id &&
            row.listing_id === params.p_listing_id &&
            (row.variant_id || null) === (params.p_variant_id || null)
        ) ||
        null;

      const excludeIds = new Set<string>(params.p_exclude_cart_item_ids || []);
      if (item?.id) excludeIds.add(item.id);

      const availability = this.getAvailability({
        p_listing_id: params.p_listing_id,
        p_variant_id: params.p_variant_id || null,
        p_exclude_cart_item_ids: [...excludeIds],
      });

      if (Number(params.p_quantity || 0) > availability.availableQuantity) {
        return {
          data: {
            success: false,
            cart_item_id: item?.id || null,
            available_quantity: availability.availableQuantity,
            error_code: "insufficient_inventory",
            message: `Only ${availability.availableQuantity} left available.`,
          },
          error: null,
        };
      }

      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      if (!item) {
        item = {
          id: `cart-item-${++this.itemSeq}`,
          cart_id: params.p_cart_id,
          vendor_id: cart.vendor_id,
          listing_id: params.p_listing_id,
          variant_id: params.p_variant_id || null,
          variant_label: params.p_variant_label || null,
          selected_options: params.p_selected_options || {},
          quantity: Number(params.p_quantity || 0),
          reserved_quantity: Number(params.p_quantity || 0),
          reservation_expires_at: expiresAt,
          title: params.p_title || "Marketplace item",
          unit_price: params.p_unit_price || 0,
          image_url: params.p_image_url || null,
        };
        this.cartItems.push(item);
      } else {
        item.quantity = Number(params.p_quantity || 0);
        item.reserved_quantity = Number(params.p_quantity || 0);
        item.reservation_expires_at = expiresAt;
      }

      return {
        data: {
          success: true,
          cart_item_id: item.id,
          reservation_expires_at: expiresAt,
          available_quantity: availability.availableQuantity,
        },
        error: null,
      };
    }

    if (name === "release_cart_item_reservation") {
      const index = this.cartItems.findIndex((row) => row.id === params.p_cart_item_id);
      if (index < 0) {
        return { data: { success: false, message: "Cart item not found." }, error: null };
      }
      this.cartItems.splice(index, 1);
      return { data: { success: true, cart_item_id: params.p_cart_item_id }, error: null };
    }

    return { data: null, error: { message: `Unexpected RPC ${name}` } };
  }

  private getAvailability(params: Record<string, any>) {
    const listing = this.listings[String(params.p_listing_id)];
    const stockQuantity = Number(listing?.inventory_quantity || 0);
    const excludeIds = new Set<string>(params.p_exclude_cart_item_ids || []);
    const now = Date.now();

    const activeCartReservations = this.cartItems.reduce((sum, row) => {
      if (excludeIds.has(row.id)) return sum;
      if (row.listing_id !== params.p_listing_id) return sum;
      if ((row.variant_id || null) !== (params.p_variant_id || null)) return sum;
      if (Date.parse(row.reservation_expires_at) <= now) return sum;
      return sum + Number(row.reserved_quantity || 0);
    }, 0);

    const committedOrderQuantity = this.orderItems.reduce((sum, row) => {
      if (row.listing_id !== params.p_listing_id) return sum;
      if ((row.variant_id || null) !== (params.p_variant_id || null)) return sum;
      const order = this.orders.find((entry) => entry.id === row.order_id);
      if (!order) return sum;
      if (!["requested", "confirmed", "ready", "out_for_delivery", "fulfilled", "completed"].includes(order.status)) {
        return sum;
      }
      return sum + Number(row.quantity || 0);
    }, 0);

    return {
      stockQuantity,
      activeCartReservations,
      committedOrderQuantity,
      availableQuantity: Math.max(0, stockQuantity - activeCartReservations),
    };
  }
}

describe("cart reservations", () => {
  it("guest cart reserves 1 of stock 3 and another user can only add 2", async () => {
    const client = new CartReservationClient({
      carts: [
        { id: "guest-cart", guest_id: "guest-1", user_id: null, vendor_id: "vendor-1", status: "active" },
        { id: "user-cart", guest_id: null, user_id: "user-1", vendor_id: "vendor-1", status: "active" },
      ],
      listings: {
        "listing-1": { inventory_quantity: 3 },
      },
    });

    await upsertCartItemReservation({
      client,
      cartId: "guest-cart",
      guestId: "guest-1",
      listingId: "listing-1",
      quantity: 1,
    });

    const secondAdd = await upsertCartItemReservation({
      client,
      cartId: "user-cart",
      userId: "user-1",
      listingId: "listing-1",
      quantity: 2,
    });

    expect(secondAdd.success).toBe(true);

    const tooMuch = await upsertCartItemReservation({
      client,
      cartId: "user-cart",
      userId: "user-1",
      listingId: "listing-1",
      quantity: 3,
    });

    expect(tooMuch.success).toBe(false);
    expect(tooMuch.message).toBe("Only 2 left available.");
  });

  it("expired reservation no longer counts", async () => {
    const client = new CartReservationClient({
      carts: [{ id: "guest-cart", guest_id: "guest-1", user_id: null, vendor_id: "vendor-1", status: "active" }],
      listings: {
        "listing-1": { inventory_quantity: 3 },
      },
    });

    const reserved = await upsertCartItemReservation({
      client,
      cartId: "guest-cart",
      guestId: "guest-1",
      listingId: "listing-1",
      quantity: 1,
    });
    client.getCartItem(String(reserved.cartItemId))!.reservation_expires_at = new Date(
      Date.now() - 60_000
    ).toISOString();

    const snapshot = await getInventoryAvailabilitySnapshot({
      client,
      listingId: "listing-1",
    });

    expect(snapshot.availableQuantity).toBe(3);
  });

  it("successful orders do not reduce availability twice", async () => {
    const client = new CartReservationClient({
      carts: [],
      listings: {
        "listing-1": { inventory_quantity: 2 },
      },
      orders: [{ id: "order-1", status: "requested" }],
      orderItems: [{ id: "order-item-1", order_id: "order-1", listing_id: "listing-1", quantity: 1 }],
    });

    const snapshot = await getInventoryAvailabilitySnapshot({
      client,
      listingId: "listing-1",
    });

    expect(snapshot.committedOrderQuantity).toBe(1);
    expect(snapshot.availableQuantity).toBe(2);
  });

  it("updating the same cart line does not double-count itself", async () => {
    const client = new CartReservationClient({
      carts: [{ id: "user-cart", guest_id: null, user_id: "user-1", vendor_id: "vendor-1", status: "active" }],
      listings: {
        "listing-1": { inventory_quantity: 3 },
      },
    });

    const first = await upsertCartItemReservation({
      client,
      cartId: "user-cart",
      userId: "user-1",
      listingId: "listing-1",
      quantity: 1,
    });

    const updated = await upsertCartItemReservation({
      client,
      cartId: "user-cart",
      userId: "user-1",
      listingId: "listing-1",
      quantity: 3,
      cartItemId: first.cartItemId,
    });

    expect(updated.success).toBe(true);
    expect(client.getCartItem(String(first.cartItemId))?.quantity).toBe(3);
  });

  it("removing a cart item releases the reservation", async () => {
    const client = new CartReservationClient({
      carts: [{ id: "user-cart", guest_id: null, user_id: "user-1", vendor_id: "vendor-1", status: "active" }],
      listings: {
        "listing-1": { inventory_quantity: 3 },
      },
    });

    const reserved = await upsertCartItemReservation({
      client,
      cartId: "user-cart",
      userId: "user-1",
      listingId: "listing-1",
      quantity: 2,
    });

    await releaseCartItemReservation({
      client,
      cartItemId: String(reserved.cartItemId),
      userId: "user-1",
    });

    const snapshot = await getInventoryAvailabilitySnapshot({
      client,
      listingId: "listing-1",
    });

    expect(snapshot.availableQuantity).toBe(3);
  });

  it("checkout revalidates reservations before order creation", async () => {
    const client = new CartReservationClient({
      carts: [{ id: "user-cart", guest_id: null, user_id: "user-1", vendor_id: "vendor-1", status: "active" }],
      listings: {
        "listing-1": { inventory_quantity: 3 },
      },
    });

    const reserved = await upsertCartItemReservation({
      client,
      cartId: "user-cart",
      userId: "user-1",
      listingId: "listing-1",
      quantity: 1,
    });

    const item = client.getCartItem(String(reserved.cartItemId));
    item!.reservation_expires_at = new Date(Date.now() - 60_000).toISOString();

    const result = await revalidateCartReservationsForCheckout({
      client,
      cartItems: [item],
      userId: "user-1",
    });

    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({
      code: "RESERVATION_EXPIRED",
      reason: "Reservation expired.",
    });
    expect(client.getCartItem(String(reserved.cartItemId))?.id).toBe(String(reserved.cartItemId));
  });

  it("guest-to-auth cart merge does not over-reserve", async () => {
    const client = new CartReservationClient({
      carts: [
        { id: "guest-cart", guest_id: "guest-1", user_id: null, vendor_id: "vendor-1", status: "active" },
        { id: "user-cart", guest_id: null, user_id: "user-1", vendor_id: "vendor-1", status: "active" },
      ],
      listings: {
        "listing-1": { inventory_quantity: 2 },
      },
    });

    const guestLine = await upsertCartItemReservation({
      client,
      cartId: "guest-cart",
      guestId: "guest-1",
      listingId: "listing-1",
      quantity: 1,
    });
    const userLine = await upsertCartItemReservation({
      client,
      cartId: "user-cart",
      userId: "user-1",
      listingId: "listing-1",
      quantity: 1,
    });

    const merged = await upsertCartItemReservation({
      client,
      cartId: "user-cart",
      userId: "user-1",
      listingId: "listing-1",
      quantity: 2,
      cartItemId: userLine.cartItemId,
      excludeCartItemIds: [String(guestLine.cartItemId)],
    });

    expect(merged.success).toBe(true);
    expect(client.getCartItem(String(userLine.cartItemId))?.quantity).toBe(2);
  });
});
