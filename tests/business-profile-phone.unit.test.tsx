import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import OverviewEditor from "@/components/business/profile/OverviewEditor";

const refreshProfileMock = vi.fn();

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({
    supabase: {},
    user: { id: "user-1" },
    refreshProfile: refreshProfileMock,
  }),
}));

vi.mock("@/components/business/AIDescriptionAssistant", () => ({
  __esModule: true,
  default: () => <div data-testid="ai-description-assistant" />,
}));

const tone = {
  input: "border-slate-300",
  textSoft: "text-slate-500",
  textMuted: "text-slate-600",
  textStrong: "text-slate-900",
  errorText: "mt-1 text-sm text-red-600",
  cardBorder: "border-slate-200",
  cardSoft: "bg-white",
};

const baseProfile = {
  id: "user-1",
  business_name: "Barrio Market",
  full_name: "Barrio Market",
  business_type: "retail",
  category: "retail",
  description: "A neighborhood market with locally made goods and everyday pantry staples.",
  website: "",
  phone: "",
  email: "",
  address: "123 Main St",
  city: "Long Beach",
  hours_json: null,
  social_links_json: null,
  profile_photo_url: "",
  cover_photo_url: "",
};

function renderEditor(profile = baseProfile) {
  const onProfileUpdate = vi.fn();
  const onToast = vi.fn();
  render(
    <OverviewEditor
      profile={profile}
      businessId="biz-1"
      tone={tone}
      editMode
      setEditMode={vi.fn()}
      onProfileUpdate={onProfileUpdate}
      onToast={onToast}
    />
  );

  return { onProfileUpdate, onToast };
}

function phoneInput() {
  const input = document.querySelector('input[type="tel"]');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Phone input not found");
  }
  return input;
}

function websiteInput() {
  const input = document.querySelector('input[type="url"]');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Website input not found");
  }
  return input;
}

describe("business profile phone formatting", () => {
  beforeEach(() => {
    refreshProfileMock.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ profile: { ...baseProfile, phone: "(562) 123-4567" } }),
      }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("formats raw digits while typing", async () => {
    renderEditor();

    await userEvent.type(phoneInput(), "5621234567");

    expect(phoneInput()).toHaveValue("(562) 123-4567");
  });

  it("normalizes dashed, parenthesized, and +1 pasted values", () => {
    renderEditor();

    for (const value of ["562-123-4567", "(562) 123-4567", "+1 562 123 4567"]) {
      fireEvent.change(phoneInput(), { target: { value } });
      expect(phoneInput()).toHaveValue("(562) 123-4567");
    }
  });

  it("blocks save for incomplete non-empty values", async () => {
    renderEditor();

    fireEvent.change(phoneInput(), { target: { value: "562" } });
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(screen.getByText("Enter a complete 10-digit US phone number.")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("allows an empty optional phone value", async () => {
    renderEditor();

    fireEvent.change(websiteInput(), { target: { value: "https://example.com" } });
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [, request] = vi.mocked(global.fetch).mock.calls[0];
    expect(JSON.parse(String(request?.body))).toEqual(
      expect.objectContaining({
        phone: "",
      })
    );
  });
});
