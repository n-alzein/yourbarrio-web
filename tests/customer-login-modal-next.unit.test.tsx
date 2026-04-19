import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const customerLoginFormMock = vi.fn(() => null);
const openModalMock = vi.fn();

vi.mock("@/components/modals/BaseModal", () => ({
  __esModule: true,
  default: ({ children }) => <div>{children}</div>,
}));

vi.mock("@/components/modals/ModalProvider", () => ({
  useModal: () => ({
    openModal: openModalMock,
  }),
}));

vi.mock("@/components/auth/CustomerLoginForm", () => ({
  __esModule: true,
  default: (props) => {
    customerLoginFormMock(props);
    return null;
  },
}));

import CustomerLoginModal from "@/components/modals/CustomerLoginModal";

describe("CustomerLoginModal next forwarding", () => {
  it("passes next through to CustomerLoginForm", () => {
    render(<CustomerLoginModal next="/b/test-shop?ref=hero" onClose={() => {}} />);

    expect(customerLoginFormMock).toHaveBeenCalledWith(
      expect.objectContaining({
        next: "/b/test-shop?ref=hero",
        onSuccess: expect.any(Function),
        onSwitchToSignup: expect.any(Function),
      })
    );
  });

  it("runs success callbacks without treating the modal close as a cancellation", () => {
    const onClose = vi.fn();
    const onCancel = vi.fn();
    const onSuccess = vi.fn();

    render(
      <CustomerLoginModal
        next="/listings/test-listing"
        onClose={onClose}
        onCancel={onCancel}
        onSuccess={onSuccess}
      />
    );

    const formProps = customerLoginFormMock.mock.calls.at(-1)?.[0];
    formProps.onSuccess("/listings/test-listing", { isAdmin: false });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith("/listings/test-listing", { isAdmin: false });
  });
});
