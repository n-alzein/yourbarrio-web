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
  default: ({ header, flash, aside, children }: any) => (
    <div>
      {header}
      {flash}
      {aside}
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

function buildAdminClient({
  role = "business",
  userIsInternal = false,
}: {
  role?: string;
  userIsInternal?: boolean;
} = {}) {
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
    from: vi.fn((table: string) => {
      if (table !== "users") throw new Error(`Unexpected table ${table}`);
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "11111111-1111-4111-8111-111111111111",
                public_id: "usr-111",
                email: "owner@example.com",
                full_name: "Owner",
                role,
                is_internal: userIsInternal,
                business_name: role === "business" ? "Barrio Shop" : null,
                category: null,
                website: null,
                address: null,
                address_2: null,
                city: "Los Angeles",
                state: "CA",
                postal_code: "90001",
                account_status: "active",
                deletion_requested_at: null,
                scheduled_purge_at: null,
                deleted_at: null,
                restored_at: null,
                created_at: "2026-04-20T00:00:00.000Z",
                updated_at: "2026-04-21T00:00:00.000Z",
              },
              error: null,
            }),
          })),
        })),
      };
    }),
  };
}

describe("AdminUserDetailPage internal toggle rendering", () => {
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

  it("shows only the business internal toggle for business accounts", async () => {
    getAdminDataClientMock.mockResolvedValue({
      client: buildAdminClient({ role: "business", userIsInternal: false }),
      usingServiceRole: true,
    });
    getBusinessByUserIdMock.mockResolvedValue({
      public_id: "biz-111",
      business_name: "Barrio Shop",
      business_type: "Retail",
      category: "Retail",
      website: null,
      phone: null,
      address: null,
      address_2: null,
      city: "Los Angeles",
      state: "CA",
      postal_code: "90001",
      verification_status: "pending",
      stripe_connected: false,
      verified_at: null,
      is_internal: true,
    });

    render(
      await AdminUserDetailPage({
        params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }),
        searchParams: Promise.resolve({}),
      })
    );

    expect(screen.queryByText("Toggle internal tester access")).not.toBeInTheDocument();
    expect(screen.getByText("Toggle internal/test business")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Hidden from normal public users\. Turning this on also grants the owner internal tester access/i
      )
    ).toBeInTheDocument();
  });

  it("keeps the user-level internal tester toggle for non-business accounts", async () => {
    getAdminDataClientMock.mockResolvedValue({
      client: buildAdminClient({ role: "customer", userIsInternal: true }),
      usingServiceRole: true,
    });
    getBusinessByUserIdMock.mockResolvedValue(null);

    render(
      await AdminUserDetailPage({
        params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }),
        searchParams: Promise.resolve({}),
      })
    );

    expect(screen.getByText("Toggle internal tester access")).toBeInTheDocument();
    expect(screen.queryByText("Toggle internal/test business")).not.toBeInTheDocument();
  });
});
