import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CartPageClient from "@/app/cart/CartPageClient";
import {
  clearCheckoutIntentPending,
  readCheckoutIntentPending,
  setAuthIntent,
} from "@/lib/auth/authIntent";

const longBusinessName =
  "Fashion Corner With An Extra Long Neighborhood Boutique Name";

const mockOpenModal = vi.fn();
const mockUpdateItem = vi.fn();
const mockRefreshCart = vi.fn();
const mockRemoveItem = vi.fn();
const mockSetFulfillmentType = vi.fn();
const mockMergeGuestCartForCheckout = vi.fn();
const routerReplaceMock = vi.fn();

let mockUser: { id: string } | null = { id: "customer-1" };
let mockCartState: Record<string, unknown>;

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, prefetch, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: routerReplaceMock,
  }),
}));

vi.mock("@/components/SafeImage", () => ({
  __esModule: true,
  default: ({ alt, useNextImage, ...rest }) => <img alt={alt} {...rest} />,
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ user: mockUser }),
}));

vi.mock("@/components/modals/ModalProvider", () => ({
  useModal: () => ({ openModal: mockOpenModal }),
}));

vi.mock("@/lib/auth/useCurrentAccountContext", () => ({
  useCurrentAccountContext: () => ({
    purchaseRestricted: false,
    rolePending: false,
  }),
}));

vi.mock("@/components/cart/CartProvider", () => ({
  useCart: () => ({
    items: [
      {
        id: "cart-item-1",
        listing_id: "listing-1",
        title: "Linen jacket",
        quantity: 1,
        unit_price: 23,
        image_url: null,
        max_order_quantity: 10,
      },
    ],
    vendorGroups: [
      {
        business_id: "vendor-1",
        business_name: longBusinessName,
        cart_id: "cart-1",
        item_count: 1,
        subtotal: 23,
        fulfillment_type: "pickup",
        available_fulfillment_methods: ["pickup"],
        items: [
          {
            id: "cart-item-1",
            listing_id: "listing-1",
            title: "Linen jacket",
            quantity: 1,
            unit_price: 23,
            image_url: null,
            max_order_quantity: 10,
          },
        ],
      },
    ],
    loading: false,
    cartStatus: "ready",
    error: null,
    updateItem: mockUpdateItem,
    refreshCart: mockRefreshCart,
    removeItem: mockRemoveItem,
    setFulfillmentType: mockSetFulfillmentType,
    mergeGuestCartForCheckout: mockMergeGuestCartForCheckout,
    ...mockCartState,
  }),
}));

describe("CartPageClient mobile checkout area", () => {
  beforeEach(() => {
    mockUser = { id: "customer-1" };
    mockCartState = {};
    window.sessionStorage.clear();
    clearCheckoutIntentPending();
    mockOpenModal.mockClear();
    mockUpdateItem.mockClear();
    mockUpdateItem.mockResolvedValue({});
    mockRefreshCart.mockClear();
    mockRefreshCart.mockResolvedValue({});
    mockRemoveItem.mockClear();
    mockSetFulfillmentType.mockClear();
    mockMergeGuestCartForCheckout.mockReset();
    mockMergeGuestCartForCheckout.mockResolvedValue({ itemCount: 1 });
    routerReplaceMock.mockClear();
  });

  it("stacks vendor subtotal above a full-width wrapping checkout CTA for long business names", () => {
    render(<CartPageClient />);

    const checkoutArea = screen.getByTestId("cart-vendor-checkout-area-vendor-1");
    const subtotalRow = screen.getByTestId("cart-vendor-subtotal-row-vendor-1");
    const checkoutButton = screen.getByTestId("cart-vendor-checkout-button-vendor-1");

    expect(screen.getByText(longBusinessName)).toHaveClass("break-words");
    expect(subtotalRow).toHaveTextContent("Vendor subtotal");
    expect(subtotalRow).toHaveTextContent("$23.00");

    expect(checkoutArea).toHaveClass("flex-col", "md:flex-row", "min-w-0");
    expect(subtotalRow).toHaveClass("w-full", "justify-between", "min-w-0");
    expect(checkoutButton).toHaveClass(
      "mt-3",
      "w-full",
      "min-w-0",
      "whitespace-normal",
      "leading-tight",
      "md:mt-0",
      "md:w-auto"
    );
    expect(checkoutButton).toHaveTextContent(`Checkout with ${longBusinessName}`);
  });

  it("shows expired reservation recovery inside the cart item and keeps checkout disabled", async () => {
    mockCartState = {
      vendorGroups: [
        {
          business_id: "vendor-1",
          business_name: longBusinessName,
          cart_id: "cart-1",
          item_count: 1,
          subtotal: 23,
          fulfillment_type: "pickup",
          available_fulfillment_methods: ["pickup"],
          items: [
            {
              id: "cart-item-1",
              listing_id: "listing-1",
              title: "Linen jacket",
              quantity: 1,
              unit_price: 23,
              image_url: null,
              max_order_quantity: 10,
              reservation_expires_at: new Date(Date.now() - 60_000).toISOString(),
              stock_error: "Your cart reservation expired.",
            },
          ],
        },
      ],
    };

    render(<CartPageClient />);

    expect(screen.getByText(/This item is no longer reserved\./)).toBeInTheDocument();
    expect(screen.getByText("Availability may have changed.")).toBeInTheDocument();
    expect(screen.queryByText("Your cart reservation expired.")).not.toBeInTheDocument();

    const checkoutButton = screen.getByTestId("cart-vendor-checkout-button-vendor-1");
    expect(checkoutButton).toHaveAttribute("aria-disabled", "true");
    expect(checkoutButton).toHaveAttribute("href", "#");

    fireEvent.click(screen.getByRole("button", { name: "Update cart" }));

    await waitFor(() => {
      expect(mockUpdateItem).toHaveBeenCalledWith({
        itemId: "cart-item-1",
        quantity: 1,
      });
      expect(mockRefreshCart).toHaveBeenCalledWith({
        reason: "checkout-reservation-refresh",
      });
    });
    expect(routerReplaceMock).not.toHaveBeenCalled();
  });

  it("leaves non-expired cart items on the normal reservation display", () => {
    render(<CartPageClient />);

    expect(screen.queryByText("This item is no longer reserved.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Update cart" })).not.toBeInTheDocument();
    expect(screen.getByTestId("cart-vendor-checkout-button-vendor-1")).not.toHaveAttribute(
      "aria-disabled",
      "true"
    );
  });

  it("opens the login modal for guest checkout and freezes the cart behind it", async () => {
    mockUser = null;
    render(<CartPageClient />);

    const checkoutButton = await screen.findByTestId("cart-vendor-checkout-button-vendor-1");
    fireEvent.click(checkoutButton);

    expect(mockOpenModal).toHaveBeenCalledWith(
      "customer-login",
      expect.objectContaining({
        next: "/checkout?business_id=vendor-1",
        onSuccess: expect.any(Function),
      })
    );
    expect(readCheckoutIntentPending()).toMatchObject({
      redirectTo: "/checkout?business_id=vendor-1",
    });
    await waitFor(() => {
      expect(screen.queryByText("Your cart is empty")).not.toBeInTheDocument();
      expect(screen.queryByText(`Checkout with ${longBusinessName}`)).not.toBeInTheDocument();
    });
  });

  it("waits for guest cart merge before redirecting to checkout after login success", async () => {
    mockUser = null;
    let resolveMerge;
    mockMergeGuestCartForCheckout.mockReturnValue(
      new Promise((resolve) => {
        resolveMerge = resolve;
      })
    );
    render(<CartPageClient />);

    fireEvent.click(await screen.findByTestId("cart-vendor-checkout-button-vendor-1"));
    const modalProps = mockOpenModal.mock.calls.at(-1)?.[1];

    let successPromise;
    await act(async () => {
      successPromise = modalProps.onSuccess("/checkout?business_id=vendor-1");
    });

    expect(screen.getByText("Preparing checkout...")).toBeInTheDocument();
    expect(routerReplaceMock).not.toHaveBeenCalled();

    await act(async () => {
      resolveMerge({ itemCount: 1 });
      await successPromise;
    });

    expect(mockMergeGuestCartForCheckout).toHaveBeenCalledTimes(1);
    expect(routerReplaceMock).toHaveBeenCalledWith("/checkout?business_id=vendor-1");
  });

  it("shows the purple empty state on a direct empty cart visit", async () => {
    mockCartState = {
      items: [],
      vendorGroups: [],
    };

    render(<CartPageClient />);

    expect(await screen.findByText("Your cart is empty")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse local listings" })).toHaveClass(
      "yb-cart-empty-cta"
    );
  });

  it("restores normal empty cart behavior when checkout login is canceled", async () => {
    mockCartState = {
      items: [],
      vendorGroups: [],
    };
    setAuthIntent({ redirectTo: "/checkout?business_id=vendor-1", role: "customer" });

    render(<CartPageClient />);

    expect(screen.queryByText("Your cart is empty")).not.toBeInTheDocument();

    act(() => {
      clearCheckoutIntentPending();
    });

    expect(await screen.findByText("Your cart is empty")).toBeInTheDocument();
  });
});
