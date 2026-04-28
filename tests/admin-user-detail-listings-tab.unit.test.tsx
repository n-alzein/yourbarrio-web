import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAdminRoleMock,
  canAdminMock,
  getSupabaseServerAuthedClientMock,
  getActorAdminRoleKeysMock,
  getAdminDataClientMock,
  getBusinessByUserIdMock,
  listAdminBusinessListingsMock,
} = vi.hoisted(() => ({
  requireAdminRoleMock: vi.fn(),
  canAdminMock: vi.fn(),
  getSupabaseServerAuthedClientMock: vi.fn(),
  getActorAdminRoleKeysMock: vi.fn(),
  getAdminDataClientMock: vi.fn(),
  getBusinessByUserIdMock: vi.fn(),
  listAdminBusinessListingsMock: vi.fn(),
}));

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/app/admin/actions", () => ({
  startImpersonationAction: vi.fn(),
  toggleBusinessInternalAction: vi.fn(),
  toggleUserInternalAction: vi.fn(),
}));

vi.mock("@/app/admin/_components/AdminPage", () => ({
  __esModule: true,
  default: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/app/admin/_components/AdminFlash", () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock("@/app/admin/verification/_components/BusinessVerificationActionsClient", () => ({
  __esModule: true,
  default: () => <div>Business verification actions</div>,
}));

vi.mock("@/app/admin/users/[id]/_components/AdminUserDetailLayout", () => ({
  __esModule: true,
  default: ({ canSeeListingsTab, children }: any) => (
    <div>
      {canSeeListingsTab ? <div>Listings tab</div> : null}
      {children}
    </div>
  ),
}));

vi.mock("@/app/admin/users/[id]/_components/AdminUserHeaderBar", () => ({
  __esModule: true,
  default: () => <div>User header</div>,
}));

vi.mock("@/app/admin/users/[id]/_components/AdminUserActivityPanel", () => ({
  __esModule: true,
  default: () => <div>User activity</div>,
}));

vi.mock("@/app/admin/users/[id]/_components/AdminBusinessListingsTab", () => ({
  __esModule: true,
  default: () => <div>Business listings</div>,
}));

vi.mock("@/app/admin/users/[id]/_components/AdminUserNotesPanel", () => ({
  __esModule: true,
  default: () => <div>User notes</div>,
}));

vi.mock("@/app/admin/users/[id]/_components/AdminUserProfileEditor", () => ({
  __esModule: true,
  default: () => <div>Profile editor</div>,
}));

vi.mock("@/app/admin/users/[id]/_components/AdminUserRoleEditor", () => ({
  __esModule: true,
  default: () => <div>Role editor</div>,
}));

vi.mock("@/app/admin/users/[id]/_components/AdminUserSecurityActions", () => ({
  __esModule: true,
  default: () => <div>Security actions</div>,
}));

vi.mock("@/app/admin/users/[id]/_components/AdminRestoreAccountButton", () => ({
  __esModule: true,
  default: () => <div>Restore button</div>,
}));

vi.mock("@/app/admin/users/[ref]/_components/DeleteUserButton", () => ({
  __esModule: true,
  default: () => <div>Delete button</div>,
}));

vi.mock("@/lib/admin/getActorAdminRoleKeys", () => ({
  getActorAdminRoleKeys: getActorAdminRoleKeysMock,
}));

vi.mock("@/lib/business/getBusinessByUserId", () => ({
  getBusinessByUserId: getBusinessByUserIdMock,
}));

vi.mock("@/lib/admin/listings", () => ({
  ADMIN_BUSINESS_LISTINGS_PAGE_SIZE: 20,
  listAdminBusinessListings: listAdminBusinessListingsMock,
}));

vi.mock("@/lib/admin/permissions", () => ({
  requireAdminRole: requireAdminRoleMock,
  canAdmin: canAdminMock,
}));

vi.mock("@/lib/ids/normalizeUserRef", () => ({
  normalizeUserRef: (id: string) => ({ id, public_id: null }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getAdminDataClient: getAdminDataClientMock,
}));

vi.mock("@/lib/supabaseServer", () => ({
  getSupabaseServerAuthedClient: getSupabaseServerAuthedClientMock,
}));

import AdminUserDetailPage from "@/app/admin/users/[id]/page";

function buildAdminClient(role: string) {
  return {
    rpc: vi.fn((fn: string) => {
      if (fn === "admin_get_account") {
        return Promise.resolve({
          data: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              public_id: "usr-111",
              email: "owner@example.com",
              full_name: "Owner",
              role,
              created_at: "2026-04-20T00:00:00.000Z",
              updated_at: "2026-04-21T00:00:00.000Z",
            },
          ],
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    }),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: "11111111-1111-4111-8111-111111111111",
              public_id: "usr-111",
              email: "owner@example.com",
              full_name: "Owner",
              role,
              is_internal: false,
              business_name: role === "business" ? "Barrio Shop" : null,
              category: null,
              website: null,
              address: null,
              address_2: null,
              city: "Los Angeles",
              state: "CA",
              postal_code: "90001",
              account_status: "active",
              created_at: "2026-04-20T00:00:00.000Z",
              updated_at: "2026-04-21T00:00:00.000Z",
            },
            error: null,
          }),
        })),
      })),
    })),
  };
}

describe("AdminUserDetailPage listings tab gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminRoleMock.mockResolvedValue({
      roles: ["admin_ops"],
      strictPermissionBypassUsed: false,
    });
    canAdminMock.mockReturnValue(true);
    getSupabaseServerAuthedClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: { id: "admin-user-1" },
          },
        }),
      },
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    getActorAdminRoleKeysMock.mockResolvedValue(["admin_ops"]);
    listAdminBusinessListingsMock.mockResolvedValue({
      rows: [],
      totalCount: 0,
      page: 1,
      pageSize: 20,
    });
  });

  it("shows the Listings tab for business accounts", async () => {
    getAdminDataClientMock.mockResolvedValue({
      client: buildAdminClient("business"),
      usingServiceRole: true,
    });
    getBusinessByUserIdMock.mockResolvedValue({
      owner_user_id: "11111111-1111-4111-8111-111111111111",
      business_name: "Barrio Shop",
      is_internal: false,
      verification_status: "pending",
      stripe_connected: false,
    });

    render(
      await AdminUserDetailPage({
        params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }),
        searchParams: Promise.resolve({}),
      })
    );

    expect(screen.getByText("Listings tab")).toBeInTheDocument();
    expect(listAdminBusinessListingsMock).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      expect.objectContaining({ page: 1, pageSize: 20 })
    );
  });

  it("does not show the Listings tab for non-business accounts without a business entity", async () => {
    getAdminDataClientMock.mockResolvedValue({
      client: buildAdminClient("customer"),
      usingServiceRole: true,
    });
    getBusinessByUserIdMock.mockResolvedValue(null);

    render(
      await AdminUserDetailPage({
        params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }),
        searchParams: Promise.resolve({}),
      })
    );

    expect(screen.queryByText("Listings tab")).not.toBeInTheDocument();
    expect(listAdminBusinessListingsMock).not.toHaveBeenCalled();
  });
});
