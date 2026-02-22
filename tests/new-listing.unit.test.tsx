import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import NewListingPage from "@/app/(business)/business/listings/new/page";

let pushMock = vi.fn();
let mockSupabase = null;
let mockAuth = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => mockAuth,
}));

vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: () => mockSupabase,
}));

vi.mock("next/image", () => ({
  __esModule: true,
  default: (props) => {
    const {
      fill,
      priority,
      placeholder,
      blurDataURL,
      sizes,
      decoding,
      fetchPriority,
      ...rest
    } = props;
    return <img alt="" {...rest} />;
  },
}));

vi.mock("@/components/editor/RichTextDescriptionEditor", () => ({
  __esModule: true,
  default: ({ value, onChange, label }) => (
    <textarea
      aria-label={label || "Description"}
      value={value || ""}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

function makeSupabaseMock({ insertError } = {}) {
  const upload = vi.fn(async () => ({
    data: { path: "listing-photos/1.jpg", fullPath: "listing-photos/1.jpg" },
    error: null,
  }));
  const getPublicUrl = vi.fn(() => ({
    data: { publicUrl: "https://example.com/1.jpg" },
  }));

  const categoryQuery = {
    select: vi.fn(() => categoryQuery),
    eq: vi.fn(() => categoryQuery),
    order: vi.fn(async () => ({
      data: [{ id: "cat-1", name: "Food & Drink", slug: "food-and-drink" }],
      error: null,
    })),
  };

  const usersQuery = {
    select: vi.fn(() => usersQuery),
    eq: vi.fn(() => usersQuery),
    single: vi.fn(async () => ({
      data: { city: "Austin" },
      error: null,
    })),
  };

  const insert = vi.fn(async () => ({
    error: insertError || null,
  }));

  return {
    storage: {
      from: vi.fn(() => ({ upload, getPublicUrl })),
    },
    from: vi.fn((table) => {
      if (table === "business_categories") return categoryQuery;
      if (table === "users") return usersQuery;
      return { insert };
    }),
  };
}

async function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText("Listing title"), {
    target: { value: "Cold brew" },
  });
  fireEvent.change(screen.getByLabelText("Description"), {
    target: { value: "Small batch concentrate." },
  });
  await screen.findByRole("option", { name: "Food & Drink" });
  fireEvent.change(screen.getByLabelText("Category"), {
    target: { value: "cat-1" },
  });
  fireEvent.change(screen.getByLabelText("Price"), {
    target: { value: "12" },
  });
}

function addPhoto(container) {
  const fileInput = container.querySelector('input[type="file"]');
  const file = new File(["photo"], "photo.jpg", { type: "image/jpeg" });
  fireEvent.change(fileInput, { target: { files: [file] } });
}

beforeEach(() => {
  pushMock = vi.fn();
  mockSupabase = null;
  mockAuth = null;
  if (!global.URL.createObjectURL) {
    global.URL.createObjectURL = vi.fn(() => "blob:preview");
  }
  if (!global.URL.revokeObjectURL) {
    global.URL.revokeObjectURL = vi.fn();
  }
  if (!global.crypto) {
    global.crypto = {};
  }
  if (!global.crypto.randomUUID) {
    global.crypto.randomUUID = vi.fn(() => "uuid");
  }
});

describe("NewListingPage", () => {
  it("clears loading state and shows error on publish failure", async () => {
    mockSupabase = makeSupabaseMock({
      insertError: { message: "Insert failed" },
    });
    mockAuth = {
      supabase: mockSupabase,
      user: { id: "user-1" },
      profile: null,
      loadingUser: false,
    };

    const { container } = render(<NewListingPage />);

    await fillRequiredFields();
    addPhoto(container);

    fireEvent.click(screen.getByRole("button", { name: "Publish listing" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Publish listing" })).toBeEnabled();
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Insert failed");
  });

  it("redirects after successful publish", async () => {
    mockSupabase = makeSupabaseMock();
    mockAuth = {
      supabase: mockSupabase,
      user: { id: "user-1" },
      profile: null,
      loadingUser: false,
    };

    const { container } = render(<NewListingPage />);

    await fillRequiredFields();
    addPhoto(container);

    fireEvent.click(screen.getByRole("button", { name: "Publish listing" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/business/listings");
    });
  });
});
