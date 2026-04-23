import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CustomerLoginForm from "@/components/auth/CustomerLoginForm";

const replaceMock = vi.fn();
const pushMock = vi.fn();
const locationReplaceMock = vi.fn();
const openModalMock = vi.fn();
const beginAuthAttemptMock = vi.fn(() => 1);
const endAuthAttemptMock = vi.fn();
const consumeAuthIntentMock = vi.fn();

let mockAuth = {
  supabase: null,
  loadingUser: false,
  beginAuthAttempt: beginAuthAttemptMock,
  endAuthAttempt: endAuthAttemptMock,
  authAttemptId: 0,
};

function createSupabaseClient({ role = "customer" } = {}) {
  return {
    auth: {
      signInWithPassword: vi.fn(async () => ({
        data: {
          session: {
            user: { id: "user-123" },
            access_token: "access-token",
            refresh_token: "refresh-token",
          },
        },
        error: null,
      })),
      getSession: vi.fn(async () => ({
        data: {
          session: {
            user: { id: "user-123" },
          },
        },
        error: null,
      })),
      signInWithOAuth: vi.fn(),
    },
    from: vi.fn((table) => {
      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { role, is_internal: false, account_status: null },
                error: null,
                status: 200,
              }),
            }),
          }),
        };
      }

      if (table === "admin_role_members") {
        return {
          select: () => ({
            eq: () => ({
              limit: async () => ({
                data: [],
                error: null,
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: pushMock,
  }),
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => mockAuth,
}));

vi.mock("@/components/modals/ModalProvider", () => ({
  useModal: () => ({
    openModal: openModalMock,
  }),
}));

vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: () => mockAuth.supabase,
}));

vi.mock("@/lib/fetchWithTimeout", () => ({
  fetchWithTimeout: vi.fn(async () => ({
    ok: true,
    status: 200,
    headers: {
      get: (name) => (name === "x-auth-refresh-user" ? "1" : null),
    },
  })),
}));

vi.mock("@/lib/withTimeout", () => ({
  withTimeout: (promise) => promise,
}));

vi.mock("@/lib/auth/authIntent", async () => {
  const actual = await vi.importActual("@/lib/auth/authIntent");
  return {
    ...actual,
    consumeAuthIntent: (...args) => consumeAuthIntentMock(...args),
  };
});

describe("CustomerLoginForm next priority", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    pushMock.mockReset();
    locationReplaceMock.mockReset();
    openModalMock.mockReset();
    beginAuthAttemptMock.mockClear();
    endAuthAttemptMock.mockClear();
    consumeAuthIntentMock.mockReset();
    mockAuth = {
      supabase: createSupabaseClient(),
      loadingUser: false,
      beginAuthAttempt: beginAuthAttemptMock,
      endAuthAttempt: endAuthAttemptMock,
      authAttemptId: 0,
    };
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...window.location,
        replace: locationReplaceMock,
      },
    });
  });

  it("redirects to the explicit next path after password login even when stale intent exists", async () => {
    consumeAuthIntentMock.mockReturnValue("/customer/home");

    render(<CustomerLoginForm next="/b/test-shop?ref=hero" />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => {
      expect(locationReplaceMock).toHaveBeenCalledWith("/b/test-shop?ref=hero");
    });
    expect(replaceMock).not.toHaveBeenCalled();
    expect(consumeAuthIntentMock).not.toHaveBeenCalled();
  });

  it("falls back to the customer home route only when next is absent", async () => {
    consumeAuthIntentMock.mockReturnValue(null);

    render(<CustomerLoginForm />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => {
      expect(locationReplaceMock).toHaveBeenCalledWith("/customer/home");
    });
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
