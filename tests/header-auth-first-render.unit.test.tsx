import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HeaderAccountWidget from "@/components/nav/HeaderAccountWidget";

const mockOpenModal = vi.fn();
const mockAuthState = vi.hoisted(() => ({
  current: {
    supabase: null,
    user: null as any,
    profile: null as any,
    business: null as any,
    role: null as string | null,
    authStatus: "loading",
    rateLimited: false,
    rateLimitMessage: null,
    authBusy: false,
    authAction: null,
    authAttemptId: 0,
    lastAuthEvent: null,
    providerInstanceId: "test-provider",
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/components/AuthProvider", () => ({
  AUTH_UI_RESET_EVENT: "yb-auth-ui-reset",
  useAuth: () => mockAuthState.current,
}));

vi.mock("@/components/LogoutButton", () => ({
  default: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

vi.mock("@/components/modals/ModalProvider", () => ({
  useModal: () => ({
    openModal: mockOpenModal,
  }),
}));

vi.mock("@/components/location/LocationProvider", () => ({
  useLocation: () => ({
    location: null,
    setLocation: vi.fn(),
  }),
}));

vi.mock("@/lib/messages", () => ({
  fetchUnreadTotal: vi.fn().mockResolvedValue(0),
  getUnreadCount: () => 0,
}));

vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: () => null,
}));

describe("HeaderAccountWidget first render auth boundary", () => {
  beforeEach(() => {
    mockOpenModal.mockClear();
    mockAuthState.current = {
      supabase: null,
      user: null,
      profile: null,
      business: null,
      role: null,
      authStatus: "loading",
      rateLimited: false,
      rateLimitMessage: null,
      authBusy: false,
      authAction: null,
      authAttemptId: 0,
      lastAuthEvent: null,
      providerInstanceId: "test-provider",
    };
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    });
  });

  it("uses server forced auth for account UI even when client auth context is not ready", () => {
    render(
      <HeaderAccountWidget
        surface="public"
        variant="desktop"
        forcedAuth={{
          role: "customer",
          user: {
            id: "user-1",
            email: "google@example.com",
            user_metadata: {
              full_name: "Google User",
              picture: "https://lh3.googleusercontent.com/google.jpg",
            },
          },
          profile: null,
        }}
      />
    );

    expect(screen.queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign up" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /profile avatar google user/i })).toBeInTheDocument();
    expect(screen.getByText("Google User")).toBeInTheDocument();
  });

  it("uses context auth user for account UI when profile and avatar are missing", () => {
    mockAuthState.current = {
      ...mockAuthState.current,
      user: {
        id: "user-2",
        email: "context@example.com",
        user_metadata: {},
      },
      profile: null,
      role: "customer",
      authStatus: "authenticated",
    };

    render(<HeaderAccountWidget surface="public" variant="desktop" />);

    expect(screen.queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign up" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /context@example.com/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /profile avatar/i })).toHaveAttribute(
      "data-avatar-fallback",
      "initials"
    );
  });

  it("keeps account UI when the avatar image fails", () => {
    render(
      <HeaderAccountWidget
        surface="public"
        variant="desktop"
        forcedAuth={{
          role: "customer",
          user: {
            id: "user-3",
            email: "broken-avatar@example.com",
            user_metadata: {
              full_name: "Broken Avatar",
            },
          },
          profile: {
            id: "user-3",
            profile_photo_url: "https://cdn.example.com/broken.jpg",
          },
        }}
      />
    );

    fireEvent.error(screen.getByAltText("Profile avatar"));

    expect(screen.queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign up" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /broken avatar/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /profile avatar/i })).toHaveAttribute(
      "data-avatar-fallback",
      "initials"
    );
  });

  it("shows guest CTA only when no authenticated user exists", () => {
    mockAuthState.current = {
      ...mockAuthState.current,
      authStatus: "unauthenticated",
    };

    render(<HeaderAccountWidget surface="public" variant="desktop" />);

    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign up" })).toBeInTheDocument();
  });

  it("does not show guest CTA while post-callback auth is still restoring", () => {
    mockAuthState.current = {
      ...mockAuthState.current,
      authStatus: "loading",
      user: null,
    };

    render(<HeaderAccountWidget surface="public" variant="desktop" />);

    expect(screen.queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign up" })).not.toBeInTheDocument();
  });
});
