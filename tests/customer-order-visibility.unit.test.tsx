import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireRoleMock,
  getSupportAwareClientMock,
  notFoundMock,
  orderRows,
  detailOrder,
} = vi.hoisted(() => ({
  requireRoleMock: vi.fn(),
  getSupportAwareClientMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  orderRows: { current: [] as any[] },
  detailOrder: { current: null as any },
}));

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

vi.mock("@/lib/auth/server", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/support/supportAwareData", () => ({
  getSupportAwareClient: getSupportAwareClientMock,
}));

vi.mock("@/lib/orders/persistence", () => ({
  reconcilePendingStripeOrders: vi.fn(async () => ({ action: "skipped" })),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: vi.fn(() => null),
}));

vi.mock("@/app/account/orders/OrderItemThumbnails", () => ({
  __esModule: true,
  default: () => <div data-testid="order-thumbnails" />,
}));

vi.mock("@/app/orders/[order_number]/OrderReceiptClient", () => ({
  __esModule: true,
  default: ({ order }: any) => <div>Receipt for {order.order_number}</div>,
}));

import AccountOrdersPage from "@/app/account/orders/page";
import OrderPage from "@/app/orders/[order_number]/page";
import { fetchPurchaseHistoryOrders } from "@/lib/orders/purchaseHistory";

function getComparableTime(row: any, field: string) {
  const value = row?.[field];
  return value ? new Date(value).getTime() : Number.NaN;
}

class QueryBuilder {
  private rows: any[];
  private limitRange: [number, number] | null = null;

  constructor(rows: any[]) {
    this.rows = [...rows];
  }

  select() {
    return this;
  }

  eq(field: string, value: any) {
    this.rows = this.rows.filter((row) => row?.[field] === value);
    return this;
  }

  in(field: string, values: any[]) {
    this.rows = this.rows.filter((row) => values.includes(row?.[field]));
    return this;
  }

  not(field: string, operator: string, value: any) {
    if (operator === "is" && value === null) {
      this.rows = this.rows.filter((row) => row?.[field] !== null && row?.[field] !== undefined);
    }
    return this;
  }

  order(field: string, options: { ascending?: boolean } = {}) {
    const direction = options.ascending === false ? -1 : 1;
    this.rows.sort((a, b) => {
      const aTime = getComparableTime(a, field);
      const bTime = getComparableTime(b, field);
      if (Number.isFinite(aTime) || Number.isFinite(bTime)) {
        return ((aTime || 0) - (bTime || 0)) * direction;
      }
      const aValue = a?.[field];
      const bValue = b?.[field];
      return aValue > bValue ? direction : aValue < bValue ? -direction : 0;
    });
    return this;
  }

  range(from: number, to: number) {
    this.limitRange = [from, to];
    return this;
  }

  then(resolve: (value: { data: any[]; error: null; count: number }) => unknown) {
    const count = this.rows.length;
    const data = this.limitRange
      ? this.rows.slice(this.limitRange[0], this.limitRange[1] + 1)
      : this.rows;
    return Promise.resolve(resolve({ data, error: null, count }));
  }
}

function createListClient(rows: any[]) {
  return {
    from: vi.fn(() => new QueryBuilder(rows)),
  };
}

function createDetailClient(order: any) {
  return {
    from: vi.fn((table: string) => {
      if (table === "users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { id: "vendor-1", business_name: "Paid Vendor" },
                error: null,
              })),
            })),
          })),
        };
      }

      return {
        select: vi.fn(() => ({
          or: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: order, error: null })),
            })),
          })),
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: order, error: null })),
            })),
          })),
        })),
      };
    }),
  };
}

function order(status: string, overrides: Record<string, any> = {}) {
  const suffix = status.replace(/[^a-z0-9]+/gi, "-").toUpperCase();
  return {
    id: `order-${suffix}`,
    order_number: `YB-${suffix}`,
    user_id: "customer-1",
    vendor_id: "vendor-1",
    created_at: "2026-05-01T12:00:00.000Z",
    updated_at: "2026-05-01T12:00:00.000Z",
    paid_at: null,
    status,
    fulfillment_type: "pickup",
    pickup_time: "ASAP",
    total: 24,
    subtotal: 22,
    fees: 2,
    vendor: { business_name: `${suffix} Vendor` },
    order_items: [{ id: `item-${suffix}`, title: "Candle", quantity: 1, unit_price: 22 }],
    ...overrides,
  };
}

describe("customer order visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orderRows.current = [];
    detailOrder.current = null;
    requireRoleMock.mockResolvedValue({
      user: { id: "customer-1" },
      supabase: createDetailClient(detailOrder.current),
    });
    getSupportAwareClientMock.mockImplementation(async () => ({
      client: createListClient(orderRows.current),
      effectiveUserId: "customer-1",
    }));
  });

  it("renders paid active orders and hides unpaid checkout attempts on the customer Orders page", async () => {
    orderRows.current = [
      order("pending_payment", {
        order_number: "YB-PENDING",
        vendor: { business_name: "Pending Vendor" },
      }),
      order("payment_failed", {
        order_number: "YB-FAILED",
        vendor: { business_name: "Failed Vendor" },
      }),
      order("requested", {
        order_number: "YB-UNPAID-REQUESTED",
        vendor: { business_name: "Unpaid Requested Vendor" },
      }),
      order("requested", {
        order_number: "YB-PAID-ACTIVE",
        paid_at: "2026-05-01T12:01:00.000Z",
        vendor: { business_name: "Paid Active Vendor" },
      }),
    ];

    render(await AccountOrdersPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Paid Active Vendor")).toBeInTheDocument();
    expect(screen.getByText(/Order YB-ORD-PAID-ACTIVE/)).toBeInTheDocument();
    expect(screen.queryByText("Pending Vendor")).not.toBeInTheDocument();
    expect(screen.queryByText("Failed Vendor")).not.toBeInTheDocument();
    expect(screen.queryByText("Unpaid Requested Vendor")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Active" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.queryByRole("link", { name: "Pending" })).not.toBeInTheDocument();
  });

  it("shows the paid-order empty state without pending-payment language", async () => {
    orderRows.current = [order("pending_payment", { order_number: "YB-PENDING" })];

    render(await AccountOrdersPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("No active orders yet.")).toBeInTheDocument();
    expect(
      screen.getByText("Orders you place will appear here after payment is confirmed.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/pending orders/i)).not.toBeInTheDocument();
  });

  it("returns paid completed orders from History and excludes unpaid closed rows", async () => {
    const result = await fetchPurchaseHistoryOrders({
      client: createListClient([
        order("completed", {
          order_number: "YB-PAID-COMPLETED",
          paid_at: "2026-05-01T12:01:00.000Z",
        }),
        order("fulfilled", {
          order_number: "YB-UNPAID-FULFILLED",
          paid_at: null,
        }),
        order("requested", {
          order_number: "YB-PAID-ACTIVE",
          paid_at: "2026-05-01T12:02:00.000Z",
        }),
      ]),
      userId: "customer-1",
      page: 1,
      limit: 10,
    });

    expect(result.error).toBeNull();
    expect(result.orders.map((row) => row.order_number)).toEqual([
      "YB-PAID-COMPLETED",
    ]);
  });

  it("404s direct access to an unpaid order detail URL", async () => {
    detailOrder.current = order("pending_payment", {
      id: "pending-detail",
      order_number: "YB-PENDING-DETAIL",
    });
    requireRoleMock.mockResolvedValue({
      user: { id: "customer-1" },
      supabase: createDetailClient(detailOrder.current),
    });

    await expect(
      OrderPage({
        params: Promise.resolve({ order_number: "YB-PENDING-DETAIL" }),
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFoundMock).toHaveBeenCalled();
  });
});
