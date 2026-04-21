import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, __resetAuthStoreForTests, useAuth } from "@/components/AuthProvider";

let pathname = "/customer/home";
let searchParams = new URLSearchParams();
let authStateCallback: ((event: string, session: any) => void) | null = null;
let mockSupabase: any = null;

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => searchParams,
}));

vi.mock("@/lib/supabase/browser", () => ({
  acknowledgeAuthTokenInvalid: vi.fn(),
  clearSupabaseAuthStorage: vi.fn(),
  getAuthGuardState: () => ({
    cooldownMsRemaining: 0,
    cooldownUntil: 0,
    tokenInvalidAt: 0,
    refreshDisabledUntil: 0,
    refreshDisabledReason: null,
  }),
  getCookieName: () => "sb-test-auth-token",
  getSupabaseBrowserClient: () => mockSupabase,
  resetSupabaseClient: vi.fn(),
  subscribeAuthGuard: vi.fn(() => () => {}),
}));

vi.mock("@/components/debug/AuthStateDebug", () => ({
  default: () => null,
}));

function googleUser(id = "user-1") {
  return {
    id,
    email: `${id}@example.com`,
    user_metadata: {
      full_name: "Google User",
      avatar_url: "https://lh3.googleusercontent.com/google.jpg",
    },
    app_metadata: {
      role: "customer",
    },
  };
}

function makeSession(user = googleUser()) {
  return {
    access_token: "access-token",
    refresh_token: "refresh-token",
    user,
  };
}

function makeSupabase({ getSessionImpl }: { getSessionImpl?: any } = {}) {
  return {
    auth: {
      getSession:
        getSessionImpl ||
        vi.fn().mockResolvedValue({
          data: { session: null },
          error: null,
        }),
      onAuthStateChange: vi.fn((callback) => {
        authStateCallback = callback;
        return {
          data: {
            subscription: {
              unsubscribe: vi.fn(),
            },
          },
        };
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
    })),
  };
}

function AuthProbe() {
  const auth = useAuth();
  const avatar =
    auth.profile?.profile_photo_url ||
    auth.user?.user_metadata?.avatar_url ||
    auth.user?.user_metadata?.picture ||
    "";
  return (
    <div>
      <div data-testid="status">{auth.authStatus}</div>
      <div data-testid="initialized">{String(auth.authInitialized)}</div>
      <div data-testid="user-id">{auth.user?.id || ""}</div>
      <div data-testid="profile-id">{auth.profile?.id || ""}</div>
      <div data-testid="avatar">{avatar}</div>
      <button type="button" onClick={() => void auth.refreshProfile()}>
        refresh profile
      </button>
    </div>
  );
}

describe("auth state consistency", () => {
  beforeEach(() => {
    pathname = "/customer/home";
    searchParams = new URLSearchParams();
    authStateCallback = null;
    __resetAuthStoreForTests();
    mockSupabase = makeSupabase();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          profile: {
            id: "user-1",
            role: "customer",
            full_name: "Google User",
          },
        }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    __resetAuthStoreForTests();
  });

  it("keeps server-seeded authenticated state while profile data is delayed", () => {
    render(
      <AuthProvider initialUser={googleUser()} initialRole="customer">
        <AuthProbe />
      </AuthProvider>
    );

    expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    expect(screen.getByTestId("user-id")).toHaveTextContent("user-1");
    expect(screen.getByTestId("avatar")).toHaveTextContent(
      "https://lh3.googleusercontent.com/google.jpg"
    );
  });

  it("uses a resolved anonymous server snapshot to clear stale authenticated header state", () => {
    pathname = "/";
    const first = render(
      <AuthProvider initialUser={googleUser()} initialRole="customer" initialAuthResolved>
        <AuthProbe />
      </AuthProvider>
    );

    expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    first.unmount();

    render(
      <AuthProvider initialAuthResolved>
        <AuthProbe />
      </AuthProvider>
    );

    expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated");
    expect(screen.getByTestId("user-id")).toHaveTextContent("");
    expect(screen.getByTestId("avatar")).toHaveTextContent("");
  });

  it("normalizes server-seeded top-level Google picture into metadata for first render", () => {
    render(
      <AuthProvider
        initialUser={{
          id: "user-1",
          email: "user-1@example.com",
          picture: "https://lh3.googleusercontent.com/google.jpg",
          user_metadata: {
            full_name: "Google User",
          },
          app_metadata: {
            role: "customer",
          },
        }}
        initialRole="customer"
      >
        <AuthProbe />
      </AuthProvider>
    );

    expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    expect(screen.getByTestId("avatar")).toHaveTextContent(
      "https://lh3.googleusercontent.com/google.jpg"
    );
  });

  it("keeps seeded Google avatar through equivalent client hydration", async () => {
    render(
      <AuthProvider initialUser={googleUser()} initialRole="customer">
        <AuthProbe />
      </AuthProvider>
    );

    await act(async () => {
      authStateCallback?.(
        "TOKEN_REFRESHED",
        makeSession({
          id: "user-1",
          email: "user-1@example.com",
          picture: "https://lh3.googleusercontent.com/google.jpg",
          user_metadata: {
            full_name: "Google User",
          },
          app_metadata: {
            role: "customer",
          },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
      expect(screen.getByTestId("avatar")).toHaveTextContent(
        "https://lh3.googleusercontent.com/google.jpg"
      );
    });
  });

  it("does not clear auth or Google avatar when a profile refresh is partial", async () => {
    render(
      <AuthProvider initialUser={googleUser()} initialRole="customer">
        <AuthProbe />
      </AuthProvider>
    );

    fireEvent.click(screen.getByText("refresh profile"));

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
      expect(screen.getByTestId("user-id")).toHaveTextContent("user-1");
      expect(screen.getByTestId("profile-id")).toHaveTextContent("user-1");
    });
    expect(screen.getByTestId("avatar")).toHaveTextContent(
      "https://lh3.googleusercontent.com/google.jpg"
    );
  });

  it("does not finalize guest state from a null auth event while bootstrap is unresolved", async () => {
    let resolveSession: (value: any) => void = () => {};
    mockSupabase = makeSupabase({
      getSessionImpl: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveSession = resolve;
          })
      ),
    });

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await act(async () => {
      authStateCallback?.("INITIAL_SESSION", null);
    });

    expect(screen.getByTestId("status")).toHaveTextContent("loading");

    await act(async () => {
      resolveSession({
        data: { session: makeSession(googleUser()) },
        error: null,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
      expect(screen.getByTestId("user-id")).toHaveTextContent("user-1");
    });
  });

  it("adopts a session from another tab auth event", async () => {
    pathname = "/";
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated");
    });

    await act(async () => {
      authStateCallback?.("SIGNED_IN", makeSession(googleUser("user-2")));
    });

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
      expect(screen.getByTestId("user-id")).toHaveTextContent("user-2");
    });
  });

  it("reloads from a persisted Google session without guest downgrade", async () => {
    mockSupabase = makeSupabase({
      getSessionImpl: vi.fn().mockResolvedValue({
        data: { session: makeSession(googleUser()) },
        error: null,
      }),
    });

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
      expect(screen.getByTestId("user-id")).toHaveTextContent("user-1");
      expect(screen.getByTestId("avatar")).toHaveTextContent(
        "https://lh3.googleusercontent.com/google.jpg"
      );
    });
  });
});
