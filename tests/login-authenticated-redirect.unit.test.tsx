import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn((destination: string) => {
  throw new Error(`NEXT_REDIRECT:${destination}`);
}));
const getCurrentAccountContextMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/auth/getCurrentAccountContext", () => ({
  getCurrentAccountContext: getCurrentAccountContextMock,
}));

vi.mock("@/components/auth/CustomerLoginForm", () => ({
  default: ({ next }: { next?: string | null }) => <div data-next={next || ""}>login form</div>,
}));

function findDataNext(node: any): string | null {
  if (!node || typeof node !== "object") return null;
  if (typeof node.props?.["data-next"] === "string") return node.props["data-next"];
  if (typeof node.props?.next === "string") return node.props.next;
  const children = node.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findDataNext(child);
      if (found !== null) return found;
    }
    return null;
  }
  return findDataNext(children);
}

describe("login page authenticated redirect", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    getCurrentAccountContextMock.mockReset();
  });

  it("redirects an already authenticated customer to the requested customer page", async () => {
    getCurrentAccountContextMock.mockResolvedValue({
      user: { id: "user-1", app_metadata: {}, user_metadata: {} },
      profile: { id: "user-1", role: "customer" },
      role: "customer",
    });
    const { default: LoginPage } = await import("@/app/login/page");

    await expect(
      LoginPage({
        searchParams: Promise.resolve({ next: "/customer/home" }),
      })
    ).rejects.toThrow("NEXT_REDIRECT:/customer/home");
    expect(getCurrentAccountContextMock).toHaveBeenCalledWith({ source: "login-page" });
  });

  it("does not redirect authenticated users back to login when next is stale", async () => {
    getCurrentAccountContextMock.mockResolvedValue({
      user: { id: "user-1", app_metadata: {}, user_metadata: {} },
      profile: { id: "user-1", role: "customer" },
      role: "customer",
    });
    const { default: LoginPage } = await import("@/app/login/page");

    await expect(
      LoginPage({
        searchParams: Promise.resolve({ next: "/login" }),
      })
    ).rejects.toThrow("NEXT_REDIRECT:/customer/home");
  });

  it("treats a server auth user without a resolved profile as authenticated", async () => {
    getCurrentAccountContextMock.mockResolvedValue({
      user: { id: "user-1", app_metadata: {}, user_metadata: { role: "customer" } },
      profile: null,
      role: null,
    });
    const { default: LoginPage } = await import("@/app/login/page");

    await expect(
      LoginPage({
        searchParams: Promise.resolve({ next: "/customer/home" }),
      })
    ).rejects.toThrow("NEXT_REDIRECT:/customer/home");
  });

  it("renders the login form when no server auth session exists", async () => {
    getCurrentAccountContextMock.mockResolvedValue({
      user: null,
      profile: null,
      role: null,
    });
    const { default: LoginPage } = await import("@/app/login/page");

    const result = await LoginPage({
      searchParams: Promise.resolve({ next: "/customer/settings" }),
    });

    expect(redirectMock).not.toHaveBeenCalled();
    expect(findDataNext(result)).toBe("/customer/settings");
  });
});
