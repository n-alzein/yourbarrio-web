import { describe, expect, it } from "vitest";

import {
  reserveInventoryForOrderItems,
  restoreInventoryForOrder,
  restoreInventoryReservations,
} from "@/lib/orders/inventoryReservations";
import { expireStripeCheckoutSession } from "@/lib/orders/persistence";

class MockQuery {
  private readonly client: InventoryClient;
  private readonly table: string;
  private readonly filters: Array<(row: any) => boolean> = [];
  private updateValues: Record<string, any> | null = null;

  constructor(client: InventoryClient, table: string) {
    this.client = client;
    this.table = table;
  }

  select() {
    return this;
  }

  update(values: Record<string, any>) {
    this.updateValues = values;
    return this;
  }

  eq(field: string, value: any) {
    this.filters.push((row) => row?.[field] === value);
    return this;
  }

  is(field: string, value: any) {
    this.filters.push((row) => row?.[field] === value);
    return this;
  }

  maybeSingle() {
    if (this.updateValues) {
      const rows = this.getRows();
      for (const row of rows) Object.assign(row, this.updateValues);
      return Promise.resolve({ data: rows[0] ? { ...rows[0] } : null, error: null });
    }
    const row = this.getRows()[0] || null;
    return Promise.resolve({ data: row ? { ...row } : null, error: null });
  }

  then(resolve: (value: any) => any, reject?: (reason: any) => any) {
    if (this.updateValues) {
      const rows = this.getRows();
      for (const row of rows) Object.assign(row, this.updateValues);
      return Promise.resolve({ data: rows.map((row) => ({ ...row })), error: null }).then(
        resolve,
        reject
      );
    }
    return Promise.resolve({
      data: this.getRows().map((row) => ({ ...row })),
      error: null,
    }).then(resolve, reject);
  }

  private getRows() {
    return this.client.getTable(this.table).filter((row) => this.filters.every((fn) => fn(row)));
  }
}

class InventoryClient {
  private reservationSeq = 0;
  private readonly inventory = new Map<string, number | null>();
  private readonly tables: Record<string, any[]>;

  constructor({
    inventory,
    orders = [],
    orderItems = [],
  }: {
    inventory: Record<string, number | null>;
    orders?: any[];
    orderItems?: any[];
  }) {
    for (const [listingId, quantity] of Object.entries(inventory)) {
      this.inventory.set(listingId, quantity);
    }
    this.tables = {
      orders: orders.map((row) => ({ ...row })),
      order_items: orderItems.map((row) => ({ ...row })),
      inventory_reservations: [],
    };
  }

  from(table: string) {
    return new MockQuery(this, table);
  }

  getTable(table: string) {
    if (!this.tables[table]) this.tables[table] = [];
    return this.tables[table];
  }

  async rpc(name: string, params: Record<string, unknown>) {
    if (name === "reserve_listing_inventory") {
      const listingId = String(params.p_listing_id || "");
      const quantity = Number(params.p_requested_quantity);
      const current = this.inventory.get(listingId);

      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 5) {
        return { data: { success: false, error_code: "invalid_quantity" }, error: null };
      }
      if (current === null || current === undefined) {
        return {
          data: {
            success: false,
            error_code: "inventory_not_tracked",
            message: "This item is not available for checkout right now.",
          },
          error: null,
        };
      }
      if (current < quantity) {
        return {
          data: {
            success: false,
            remaining_inventory: Math.max(current, 0),
            error_code: "insufficient_inventory",
            message: "Not enough stock is available for this item.",
          },
          error: null,
        };
      }

      const reservationId = `res-${++this.reservationSeq}`;
      this.inventory.set(listingId, current - quantity);
      this.getTable("inventory_reservations").push({
        id: reservationId,
        listing_id: listingId,
        reserved_quantity: quantity,
        restored_quantity: 0,
        reserved_at: new Date().toISOString(),
        restored_at: null,
      });

      return {
        data: {
          success: true,
          listing_id: listingId,
          reservation_id: reservationId,
          remaining_inventory: current - quantity,
        },
        error: null,
      };
    }

    if (name === "attach_inventory_reservation_to_order_item") {
      const reservation = this.getTable("inventory_reservations").find(
        (row) => row.id === params.p_reservation_id
      );
      const item = this.getTable("order_items").find(
        (row) => row.id === params.p_order_item_id && row.order_id === params.p_order_id
      );
      if (
        !reservation ||
        !item ||
        item.listing_id !== reservation.listing_id ||
        reservation.restored_at ||
        reservation.order_id ||
        reservation.order_item_id
      ) {
        return { data: { success: false, message: "Reservation could not be linked." }, error: null };
      }
      reservation.order_id = params.p_order_id;
      reservation.order_item_id = params.p_order_item_id;
      item.inventory_reservation_id = reservation.id;
      return { data: { success: true, reservation_id: reservation.id }, error: null };
    }

    if (name === "restore_inventory_reservation") {
      const reservation = this.getTable("inventory_reservations").find(
        (row) => row.id === params.p_reservation_id
      );
      if (!reservation) {
        return {
          data: { success: false, error_code: "reservation_not_found", message: "Reservation not found." },
          error: null,
        };
      }
      if (reservation.restored_at) {
        return {
          data: {
            success: true,
            reservation_id: reservation.id,
            listing_id: reservation.listing_id,
            restored_quantity: reservation.restored_quantity,
            already_restored: true,
          },
          error: null,
        };
      }
      if (!reservation.order_id && !reservation.order_item_id && !params.p_allow_unlinked) {
        return {
          data: {
            success: false,
            error_code: "reservation_not_restorable",
            message: "Reservation is not linked to an order item yet.",
          },
          error: null,
        };
      }

      const current = this.inventory.get(reservation.listing_id) || 0;
      const next = current + reservation.reserved_quantity;
      this.inventory.set(reservation.listing_id, next);
      reservation.restored_quantity = reservation.reserved_quantity;
      reservation.restored_at = new Date().toISOString();
      const item = this.getTable("order_items").find(
        (row) => row.inventory_reservation_id === reservation.id
      );
      if (item) {
        item.restored_quantity = reservation.reserved_quantity;
        item.inventory_restored_at = reservation.restored_at;
      }

      return {
        data: {
          success: true,
          reservation_id: reservation.id,
          listing_id: reservation.listing_id,
          restored_quantity: reservation.reserved_quantity,
          remaining_inventory: next,
          already_restored: false,
        },
        error: null,
      };
    }

    if (name === "restore_stale_inventory_reservations") {
      const olderThanMs = 15 * 60 * 1000;
      const cutoff = Date.now() - olderThanMs;
      const restored = [];
      for (const reservation of this.getTable("inventory_reservations")) {
        const reservedAt = reservation.reserved_at ? Date.parse(reservation.reserved_at) : 0;
        if (
          !reservation.order_id &&
          !reservation.order_item_id &&
          !reservation.restored_at &&
          reservedAt < cutoff
        ) {
          const result = await this.rpc("restore_inventory_reservation", {
            p_reservation_id: reservation.id,
            p_allow_unlinked: true,
          });
          if (result.data?.success && !result.data?.already_restored) {
            restored.push(result.data);
          }
        }
      }
      return { data: restored, error: null };
    }

    return { data: null, error: { message: `Unexpected RPC ${name}` } };
  }

  getQuantity(listingId: string) {
    return this.inventory.get(listingId);
  }
}

describe("inventory reservations", () => {
  it("atomically reserves stock through the listing RPC", async () => {
    const client = new InventoryClient({ inventory: { "listing-1": 5 } });

    const result = await reserveInventoryForOrderItems({
      client,
      items: [{ listing_id: "listing-1", quantity: 5 }],
    });

    expect(result).toEqual([
      {
        inventory_reservation_id: "res-1",
        listing_id: "listing-1",
        quantity: 5,
        remaining_inventory: 0,
      },
    ]);
    expect(client.getQuantity("listing-1")).toBe(0);
  });

  it("fails without decrementing when requested stock is unavailable", async () => {
    const client = new InventoryClient({ inventory: { "listing-1": 1 } });

    await expect(
      reserveInventoryForOrderItems({
        client,
        items: [{ listing_id: "listing-1", quantity: 2 }],
      })
    ).rejects.toThrow("Not enough stock");

    expect(client.getQuantity("listing-1")).toBe(1);
  });

  it("only lets one reservation win when stock is one", async () => {
    const client = new InventoryClient({ inventory: { "listing-1": 1 } });

    const first = reserveInventoryForOrderItems({
      client,
      items: [{ listing_id: "listing-1", quantity: 1 }],
    });
    const second = reserveInventoryForOrderItems({
      client,
      items: [{ listing_id: "listing-1", quantity: 1 }],
    });

    const results = await Promise.allSettled([first, second]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(client.getQuantity("listing-1")).toBe(0);
  });

  it("restores a reservation only once", async () => {
    const client = new InventoryClient({ inventory: { "listing-1": 1 } });
    const reservations = await reserveInventoryForOrderItems({
      client,
      items: [{ listing_id: "listing-1", quantity: 1 }],
    });

    await restoreInventoryReservations({ client, reservations, allowUnlinked: true });
    await restoreInventoryReservations({ client, reservations, allowUnlinked: true });

    expect(client.getQuantity("listing-1")).toBe(1);
  });

  it("fails restore without a valid reservation link", async () => {
    const client = new InventoryClient({ inventory: { "listing-1": 1 } });

    await expect(
      restoreInventoryReservations({
        client,
        reservations: [{ inventory_reservation_id: "missing" }],
      })
    ).rejects.toThrow("Reservation not found");
  });

  it("blocks restore before attach unless explicitly allowed", async () => {
    const client = new InventoryClient({ inventory: { "listing-1": 1 } });
    const reservations = await reserveInventoryForOrderItems({
      client,
      items: [{ listing_id: "listing-1", quantity: 1 }],
    });

    await expect(restoreInventoryReservations({ client, reservations })).rejects.toThrow(
      "not linked"
    );
    expect(client.getQuantity("listing-1")).toBe(0);
  });

  it("allows same-request rollback before attach with explicit opt-in", async () => {
    const client = new InventoryClient({ inventory: { "listing-1": 1 } });
    const reservations = await reserveInventoryForOrderItems({
      client,
      items: [{ listing_id: "listing-1", quantity: 1 }],
    });

    await restoreInventoryReservations({ client, reservations, allowUnlinked: true });

    expect(client.getQuantity("listing-1")).toBe(1);
  });

  it("does not sell null inventory as tracked stock", async () => {
    const client = new InventoryClient({ inventory: { "listing-1": null } });

    await expect(
      reserveInventoryForOrderItems({
        client,
        items: [{ listing_id: "listing-1", quantity: 1 }],
      })
    ).rejects.toThrow("not available for checkout");
  });

  it("duplicate business cancellation restore does not double-restock", async () => {
    const client = new InventoryClient({
      inventory: { "listing-1": 2 },
      orderItems: [{ id: "item-1", order_id: "order-1", listing_id: "listing-1", quantity: 1 }],
    });
    const [reservation] = await reserveInventoryForOrderItems({
      client,
      items: [{ listing_id: "listing-1", quantity: 1 }],
    });
    await client.rpc("attach_inventory_reservation_to_order_item", {
      p_reservation_id: reservation.inventory_reservation_id,
      p_order_id: "order-1",
      p_order_item_id: "item-1",
    });

    await restoreInventoryForOrder({ client, orderId: "order-1" });
    await restoreInventoryForOrder({ client, orderId: "order-1" });

    expect(client.getQuantity("listing-1")).toBe(2);
  });

  it("double attach attempt fails after the first link", async () => {
    const client = new InventoryClient({
      inventory: { "listing-1": 2 },
      orderItems: [{ id: "item-1", order_id: "order-1", listing_id: "listing-1", quantity: 1 }],
    });
    const [reservation] = await reserveInventoryForOrderItems({
      client,
      items: [{ listing_id: "listing-1", quantity: 1 }],
    });

    const first = await client.rpc("attach_inventory_reservation_to_order_item", {
      p_reservation_id: reservation.inventory_reservation_id,
      p_order_id: "order-1",
      p_order_item_id: "item-1",
    });
    const second = await client.rpc("attach_inventory_reservation_to_order_item", {
      p_reservation_id: reservation.inventory_reservation_id,
      p_order_id: "order-1",
      p_order_item_id: "item-1",
    });

    expect(first.data?.success).toBe(true);
    expect(second.data?.success).toBe(false);
  });

  it("stale cleanup restores unlinked reservations", async () => {
    const client = new InventoryClient({ inventory: { "listing-1": 1 } });
    const [reservation] = await reserveInventoryForOrderItems({
      client,
      items: [{ listing_id: "listing-1", quantity: 1 }],
    });
    const row = client
      .getTable("inventory_reservations")
      .find((entry) => entry.id === reservation.inventory_reservation_id);
    row.reserved_at = new Date(Date.now() - 20 * 60 * 1000).toISOString();

    const result = await client.rpc("restore_stale_inventory_reservations", {});

    expect(result.data).toHaveLength(1);
    expect(client.getQuantity("listing-1")).toBe(1);
  });

  it("non-stale unlinked reservations are not cleaned up", async () => {
    const client = new InventoryClient({ inventory: { "listing-1": 1 } });
    await reserveInventoryForOrderItems({
      client,
      items: [{ listing_id: "listing-1", quantity: 1 }],
    });

    const result = await client.rpc("restore_stale_inventory_reservations", {});

    expect(result.data).toHaveLength(0);
    expect(client.getQuantity("listing-1")).toBe(0);
  });

  it("duplicate Stripe expiration restore does not double-restock", async () => {
    const client = new InventoryClient({
      inventory: { "listing-1": 2 },
      orders: [
        {
          id: "order-1",
          order_number: "YB-TEST01",
          status: "pending_payment",
          inventory_reserved_at: "2026-04-19T12:00:00.000Z",
          inventory_restored_at: null,
          stripe_checkout_session_id: "cs_test",
        },
      ],
      orderItems: [{ id: "item-1", order_id: "order-1", listing_id: "listing-1", quantity: 1 }],
    });
    const [reservation] = await reserveInventoryForOrderItems({
      client,
      items: [{ listing_id: "listing-1", quantity: 1 }],
    });
    await client.rpc("attach_inventory_reservation_to_order_item", {
      p_reservation_id: reservation.inventory_reservation_id,
      p_order_id: "order-1",
      p_order_item_id: "item-1",
    });

    await expireStripeCheckoutSession({
      client,
      session: { id: "cs_test", metadata: { order_id: "order-1" } },
    });
    await expireStripeCheckoutSession({
      client,
      session: { id: "cs_test", metadata: { order_id: "order-1" } },
    });

    expect(client.getQuantity("listing-1")).toBe(2);
    expect(client.getTable("orders")[0]?.status).toBe("payment_failed");
  });

  it("Stripe expiration still releases stock after an earlier payment failure status", async () => {
    const client = new InventoryClient({
      inventory: { "listing-1": 2 },
      orders: [
        {
          id: "order-1",
          order_number: "YB-TEST01",
          status: "payment_failed",
          inventory_reserved_at: "2026-04-19T12:00:00.000Z",
          inventory_restored_at: null,
          stripe_checkout_session_id: "cs_test",
        },
      ],
      orderItems: [{ id: "item-1", order_id: "order-1", listing_id: "listing-1", quantity: 1 }],
    });
    const [reservation] = await reserveInventoryForOrderItems({
      client,
      items: [{ listing_id: "listing-1", quantity: 1 }],
    });
    await client.rpc("attach_inventory_reservation_to_order_item", {
      p_reservation_id: reservation.inventory_reservation_id,
      p_order_id: "order-1",
      p_order_item_id: "item-1",
    });

    await expireStripeCheckoutSession({
      client,
      session: { id: "cs_test", metadata: { order_id: "order-1" } },
    });

    expect(client.getQuantity("listing-1")).toBe(2);
  });
});
