import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminBusinessListingsTab from "@/app/admin/users/[id]/_components/AdminBusinessListingsTab";

describe("AdminBusinessListingsTab", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the empty state when the business has no listings", () => {
    render(
      <AdminBusinessListingsTab
        businessOwnerUserId="11111111-1111-4111-8111-111111111111"
        initialRows={[]}
        initialTotalCount={0}
        initialPage={1}
        initialPageSize={20}
        initialError=""
      />
    );

    expect(screen.getByTestId("admin-business-listings-empty")).toHaveTextContent(
      "This business has no listings yet."
    );
  });

  it("applies search and filters through the listings API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        rows: [],
        totalCount: 0,
        page: 1,
      }),
    });
    vi.stubGlobal("fetch", fetchMock as any);

    render(
      <AdminBusinessListingsTab
        businessOwnerUserId="11111111-1111-4111-8111-111111111111"
        initialRows={[]}
        initialTotalCount={0}
        initialPage={1}
        initialPageSize={20}
        initialError=""
      />
    );

    fireEvent.change(screen.getByPlaceholderText("Search title or public ID"), {
      target: { value: "pan dulce" },
    });
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "published" },
    });
    fireEvent.change(screen.getByLabelText("Visibility"), {
      target: { value: "admin_hidden" },
    });

    await waitFor(() => {
      const calledUrl = String(fetchMock.mock.calls.at(-1)?.[0] || "");
      expect(calledUrl).toContain("q=pan+dulce");
    });

    const calledUrl = String(fetchMock.mock.calls.at(-1)?.[0] || "");
    expect(calledUrl).toContain("q=pan+dulce");
    expect(calledUrl).toContain("status=published");
    expect(calledUrl).toContain("visibility=admin_hidden");
  });
});
