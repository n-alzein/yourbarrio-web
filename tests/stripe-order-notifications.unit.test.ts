import { describe, expect, it } from "vitest";

import { finalizePaidOrderFromPaymentIntent } from "@/lib/orders/persistence";

class MockQuery {
  private readonly client: MockSupabaseClient;
  private readonly table: string;
  private readonly filters: Array<(row: any) => boolean> = [];
  private updateValues: Record<string, any> | null = null;

  constructor(client: MockSupabaseClient, table: string) {
    this.client = client;
    this.table = table;
  }

  select() {
    return this;
  }

  insert(payload: any) {
    const rows = Array.isArray(payload) ? payload : [payload];
    const tableRows = this.client.getTable(this.table);

    if (this.table === "vendor_members") {
      for (const row of rows) {
        const duplicate = tableRows.some(
          (existing) =>
            existing.vendor_id === row.vendor_id && existing.user_id === row.user_id
        );
        if (duplicate) {
          return Promise.resolve({
            data: null,
            error: { code: "23505", message: "duplicate key value violates unique constraint" },
          });
        }
      }
    }

    if (this.table === "notifications") {
      for (const row of rows) {
        const duplicate = tableRows.some((existing) => existing.id === row.id);
        if (duplicate) {
          return Promise.resolve({
            data: null,
            error: { code: "23505", message: "duplicate key value violates unique constraint" },
          });
        }
      }
    }

    for (const row of rows) {
      tableRows.push({ ...row });
    }

    return Promise.resolve({ data: rows, error: null });
  }

  update(values: Record<string, any>) {
    this.updateValues = values;
    return this;
  }

  eq(field: string, value: any) {
    this.filters.push((row) => row?.[field] === value);
    if (this.updateValues) {
      return Promise.resolve(this.runUpdate());
    }
    return this;
  }

  in(field: string, values: any[]) {
    this.filters.push((row) => values.includes(row?.[field]));
    return this;
  }

  maybeSingle() {
    const rows = this.getFilteredRows();
    return Promise.resolve({
      data: rows[0] ? { ...rows[0] } : null,
      error: null,
    });
  }

  then(resolve: (value: any) => any, reject?: (reason: any) => any) {
    return Promise.resolve({
      data: this.getFilteredRows().map((row) => ({ ...row })),
      error: null,
    }).then(resolve, reject);
  }

  private getFilteredRows() {
    return this.client
      .getTable(this.table)
      .filter((row) => this.filters.every((filter) => filter(row)));
  }

  private runUpdate() {
    const rows = this.getFilteredRows();
    for (const row of rows) {
      Object.assign(row, this.updateValues);
    }
    return { data: rows.map((row) => ({ ...row })), error: null };
  }
}

class MockSupabaseClient {
  private readonly tables: Record<string, any[]>;

  constructor(tables: Record<string, any[]>) {
    this.tables = Object.fromEntries(
      Object.entries(tables).map(([table, rows]) => [table, rows.map((row) => ({ ...row }))])
    );
  }

  from(table: string) {
    if (!this.tables[table]) {
      this.tables[table] = [];
    }
    return new MockQuery(this, table);
  }

  getTable(table: string) {
    if (!this.tables[table]) {
      this.tables[table] = [];
    }
    return this.tables[table];
  }
}

describe("Stripe paid order notifications", () => {
  it("creates vendor notifications when a Stripe order becomes requested", async () => {
    const client = new MockSupabaseClient({
      orders: [
        {
          id: "order-1",
          order_number: "YB-TEST01",
          status: "pending_payment",
          paid_at: null,
          vendor_id: "vendor-1",
          user_id: "customer-1",
        },
      ],
      vendor_members: [{ vendor_id: "vendor-1", user_id: "staff-1", role: "staff" }],
      notifications: [],
    });

    const result = await finalizePaidOrderFromPaymentIntent({
      client,
      paymentIntent: {
        id: "pi_123",
        status: "succeeded",
        latest_charge: "ch_123",
        amount_received: 2499,
        application_fee_amount: 250,
        currency: "usd",
        metadata: {
          order_id: "order-1",
          vendor_user_id: "vendor-1",
          customer_user_id: "customer-1",
        },
      },
    });

    expect(result.nextStatus).toBe("requested");
    expect(client.getTable("orders")[0]?.status).toBe("requested");

    expect(client.getTable("notifications")).toEqual([
      {
        id: expect.any(String),
        recipient_user_id: "staff-1",
        vendor_id: "vendor-1",
        order_id: "order-1",
        type: "order_requested",
        title: "New order request: YB-TEST01",
        body: null,
      },
      {
        id: expect.any(String),
        recipient_user_id: "vendor-1",
        vendor_id: "vendor-1",
        order_id: "order-1",
        type: "order_requested",
        title: "New order request: YB-TEST01",
        body: null,
      },
    ]);
  });

  it("does not duplicate vendor notifications when the order is already requested", async () => {
    const client = new MockSupabaseClient({
      orders: [
        {
          id: "order-1",
          order_number: "YB-TEST01",
          status: "requested",
          paid_at: "2026-04-05T20:00:00.000Z",
          vendor_id: "vendor-1",
          user_id: "customer-1",
          stripe_payment_intent_id: "pi_existing",
        },
      ],
      vendor_members: [{ vendor_id: "vendor-1", user_id: "vendor-1", role: "owner" }],
      notifications: [
        {
          id: "fixed-id",
          recipient_user_id: "vendor-1",
          vendor_id: "vendor-1",
          order_id: "order-1",
          type: "order_requested",
          title: "New order request: YB-TEST01",
          body: null,
        },
      ],
    });

    const result = await finalizePaidOrderFromPaymentIntent({
      client,
      paymentIntent: {
        id: "pi_existing",
        status: "succeeded",
        latest_charge: "ch_123",
        amount_received: 2499,
        application_fee_amount: 250,
        currency: "usd",
        metadata: {
          order_id: "order-1",
          vendor_user_id: "vendor-1",
          customer_user_id: "customer-1",
        },
      },
    });

    expect(result.nextStatus).toBe("requested");
    expect(client.getTable("notifications")).toHaveLength(1);
  });

  it("treats duplicate notification inserts as harmless during Stripe races", async () => {
    const client = new MockSupabaseClient({
      orders: [
        {
          id: "order-1",
          order_number: "YB-TEST01",
          status: "pending_payment",
          paid_at: null,
          vendor_id: "vendor-1",
          user_id: "customer-1",
        },
      ],
      vendor_members: [{ vendor_id: "vendor-1", user_id: "vendor-1", role: "owner" }],
      notifications: [],
    });

    await finalizePaidOrderFromPaymentIntent({
      client,
      paymentIntent: {
        id: "pi_race_1",
        status: "succeeded",
        latest_charge: "ch_123",
        amount_received: 2499,
        application_fee_amount: 250,
        currency: "usd",
        metadata: {
          order_id: "order-1",
          vendor_user_id: "vendor-1",
          customer_user_id: "customer-1",
        },
      },
    });

    client.getTable("orders")[0].status = "pending_payment";
    client.getTable("orders")[0].paid_at = null;

    const result = await finalizePaidOrderFromPaymentIntent({
      client,
      paymentIntent: {
        id: "pi_race_2",
        status: "succeeded",
        latest_charge: "ch_456",
        amount_received: 2499,
        application_fee_amount: 250,
        currency: "usd",
        metadata: {
          order_id: "order-1",
          vendor_user_id: "vendor-1",
          customer_user_id: "customer-1",
        },
      },
    });

    expect(result.nextStatus).toBe("requested");
    expect(client.getTable("notifications")).toHaveLength(1);
  });
});
