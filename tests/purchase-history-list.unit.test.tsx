import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import PurchaseHistoryList from "@/app/account/purchase-history/PurchaseHistoryList";

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("PurchaseHistoryList", () => {
  it("renders clickable rows with business-first hierarchy and subtle fulfilled state", () => {
    const paidAt = new Date(2026, 3, 19, 10, 9).toISOString();

    const { container } = render(
      <PurchaseHistoryList
        orders={[
          {
            id: "order-1",
            order_number: "YB-123456",
            created_at: new Date(2026, 3, 19, 10, 0).toISOString(),
            paid_at: paidAt,
            status: "fulfilled",
            total: 42.5,
            vendor: { business_name: "Barrio Bakery", full_name: "Nora Baker" },
            order_items: [
              {
                id: "item-1",
                image_url: "https://example.com/order-snapshot.jpg",
                listing: { main_photo_url: "https://example.com/main-listing.jpg" },
              },
            ],
          },
        ]}
      />
    );

    const link = screen.getByRole("link", {
      name: /View receipt for order YB-ORD-123456 from Barrio Bakery/i,
    });

    expect(link).toHaveAttribute("href", "/orders/YB-123456");
    expect(within(link).getByText("Barrio Bakery")).toHaveClass("text-base", "font-semibold");
    expect(within(link).getByText(/Order YB-ORD-123456 · 10:09 AM/)).toHaveClass("text-xs");
    expect(within(link).getByText("$42.50")).toHaveClass("text-base", "font-semibold");
    expect(within(link).queryByText("Fulfilled")).not.toBeInTheDocument();

    const image = container.querySelector("img");
    expect(image).toHaveAttribute("src", "https://example.com/main-listing.jpg");
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveClass("h-16", "w-16", "rounded-xl", "object-cover");
  });

  it("keeps attention statuses visible without a large fulfilled badge", () => {
    const { container } = render(
      <PurchaseHistoryList
        orders={[
          {
            id: "order-2",
            order_number: "YB-999999",
            created_at: new Date(2026, 3, 19, 9, 0).toISOString(),
            paid_at: null,
            status: "payment_failed",
            total: 18,
            vendor: { business_name: "Mercado Flores" },
            order_items: [
              {
                id: "item-2",
                image_url: null,
                listing: { photos: ["https://example.com/first-photo.jpg"] },
              },
            ],
          },
        ]}
      />
    );

    expect(screen.getByText("Payment failed")).toHaveClass("text-xs", "font-medium", "opacity-70");
    expect(container.querySelector("img")).toHaveAttribute("src", "https://example.com/first-photo.jpg");
  });

  it("renders a neutral thumbnail placeholder when no listing image exists", () => {
    const { container } = render(
      <PurchaseHistoryList
        orders={[
          {
            id: "order-3",
            order_number: "YB-111111",
            created_at: new Date(2026, 3, 19, 8, 0).toISOString(),
            paid_at: null,
            status: "fulfilled",
            total: 12,
            vendor: { business_name: "Corner Cafe" },
            order_items: [{ id: "item-3", image_url: null, listing: null }],
          },
        ]}
      />
    );

    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(container.querySelector(".h-16.w-16.rounded-xl")).toBeInTheDocument();
  });

  it("shows a compact multi-image preview with overflow count for multi-item orders", () => {
    const { container } = render(
      <PurchaseHistoryList
        orders={[
          {
            id: "order-4",
            order_number: "YB-222222",
            created_at: new Date(2026, 3, 19, 7, 0).toISOString(),
            paid_at: null,
            status: "fulfilled",
            total: 64,
            vendor: { business_name: "Neighborhood Goods" },
            order_items: [
              {
                id: "item-4a",
                image_url: "https://example.com/item-a.jpg",
                listing: null,
              },
              {
                id: "item-4b",
                image_url: "https://example.com/item-b.jpg",
                listing: null,
              },
              {
                id: "item-4c",
                image_url: "https://example.com/item-c.jpg",
                listing: null,
              },
              {
                id: "item-4d",
                image_url: "https://example.com/item-d.jpg",
                listing: null,
              },
            ],
          },
        ]}
      />
    );

    const images = container.querySelectorAll("img");

    expect(images).toHaveLength(3);
    expect(images[0]).toHaveClass("h-full", "w-full", "object-cover");
    expect(screen.getByText("+1")).toBeInTheDocument();
  });
});
