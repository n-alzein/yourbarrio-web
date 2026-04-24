import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BusinessOrdersClient from "@/app/(business)/business/orders/BusinessOrdersClient";

const replaceMock = vi.fn();

let searchParamsValue = "tab=progress&order=YB-M5F8YS&search=tacos&page=2";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
  usePathname: () => "/business/orders",
  useSearchParams: () => new URLSearchParams(searchParamsValue),
}));

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/orders/OrderStatusBadge", () => ({
  __esModule: true,
  default: ({ status }) => <span>{status}</span>,
}));

const seededOrders = [
  {
    id: "order-1",
    order_number: "YB-M5F8YS",
    status: "confirmed",
    acknowledged_at: "2026-04-22T12:00:00.000Z",
    fulfillment_type: "pickup",
    contact_name: "Customer One",
    contact_phone: "(555) 111-2222",
    contact_email: "customer.one@example.com",
    pickup_time: "ASAP",
    subtotal: 25,
    total: 25,
    created_at: "2026-04-22T10:00:00.000Z",
    order_items: [
      {
        id: "item-1",
        title: "Tacos",
        quantity: 2,
        unit_price: 12.5,
      },
    ],
  },
];

describe("BusinessOrdersClient modal query behavior", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    searchParamsValue = "tab=progress&order=YB-M5F8YS&search=tacos&page=2";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ orders: seededOrders }),
      }))
    );
  });

  it("opens from the order query param and removes only that param when closed via the X button", async () => {
    render(<BusinessOrdersClient />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Order YB-ORD-M5F8YS" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /close order details/i }));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Order YB-ORD-M5F8YS" })).not.toBeInTheDocument();
    });

    expect(replaceMock).toHaveBeenCalledWith(
      "/business/orders?tab=progress&search=tacos&page=2",
      { scroll: false }
    );
  });

  it("opens order details from the row click and keyboard activation using the shared URL behavior", async () => {
    searchParamsValue = "tab=completed&search=tacos&page=2";

    render(<BusinessOrdersClient />);

    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: "Open order YB-ORD-M5F8YS" }).length
      ).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Open order YB-ORD-M5F8YS" })[0]);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Order YB-ORD-M5F8YS" })).toBeInTheDocument();
    });

    expect(replaceMock).toHaveBeenCalledWith(
      "/business/orders?tab=completed&search=tacos&page=2&order=YB-M5F8YS",
      { scroll: false }
    );

    cleanup();
    replaceMock.mockReset();
    searchParamsValue = "tab=completed";

    render(<BusinessOrdersClient />);

    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: "Open order YB-ORD-M5F8YS" }).length
      ).toBeGreaterThan(0);
    });

    fireEvent.keyDown(
      screen.getAllByRole("button", { name: "Open order YB-ORD-M5F8YS" })[0],
      {
        key: "Enter",
      }
    );

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(
        "/business/orders?tab=completed&order=YB-M5F8YS",
        { scroll: false }
      );
    });
  });

  it("uses the same query cleanup when closed by backdrop click or Escape", async () => {
    render(<BusinessOrdersClient />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Order YB-ORD-M5F8YS" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("dialog"));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(
        "/business/orders?tab=progress&search=tacos&page=2",
        { scroll: false }
      );
    });

    cleanup();
    replaceMock.mockReset();
    searchParamsValue = "tab=progress&order=YB-M5F8YS";
    render(<BusinessOrdersClient />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Order YB-ORD-M5F8YS" })).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/business/orders?tab=progress", {
        scroll: false,
      });
    });
  });

  it("opens the same order when the query param uses the canonical YB-ORD format", async () => {
    searchParamsValue = "tab=progress&order=YB-ORD-M5F8YS";

    render(<BusinessOrdersClient />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Order YB-ORD-M5F8YS" })).toBeInTheDocument();
    });
  });
});
