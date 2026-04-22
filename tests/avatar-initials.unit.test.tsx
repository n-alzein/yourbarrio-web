import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SafeAvatar from "@/components/SafeAvatar";
import { getAvatarInitials } from "@/lib/avatarInitials";
import { getValidAvatarUrl, getValidAvatarUrls, mergeAvatarState } from "@/lib/avatarUrl";
import { normalizeAuthUser } from "@/lib/auth/normalizeAuthUser";

describe("getAvatarInitials", () => {
  it("uses first and last word initials for full names", () => {
    expect(getAvatarInitials({ fullName: "Test Account" })).toBe("TA");
    expect(getAvatarInitials({ fullName: "  Nour  Example  User " })).toBe("NU");
  });

  it("uses one letter for single-word names", () => {
    expect(getAvatarInitials({ displayName: "Nour" })).toBe("N");
  });

  it("uses the first alphabetic local-part character for email fallback", () => {
    expect(getAvatarInitials({ email: "faketest@test.com" })).toBe("F");
    expect(getAvatarInitials({ email: "123.nour@test.com" })).toBe("N");
  });

  it("skips punctuation and number-only values", () => {
    expect(getAvatarInitials({ fullName: "1234", displayName: "!!!" })).toBe("");
  });
});

describe("getValidAvatarUrl", () => {
  it("returns DB avatar when present", () => {
    expect(
      getValidAvatarUrl(
        " https://cdn.example.com/db-avatar.jpg ",
        { avatar_url: "https://lh3.googleusercontent.com/google.jpg" }
      )
    ).toBe("https://cdn.example.com/db-avatar.jpg");
  });

  it("returns Google metadata avatar when DB avatar is missing", () => {
    expect(
      getValidAvatarUrl("", { picture: " https://lh3.googleusercontent.com/google.jpg " })
    ).toBe("https://lh3.googleusercontent.com/google.jpg");
  });

  it("reads Google avatar metadata from a full Supabase user shape", () => {
    expect(
      getValidAvatarUrl({
        id: "user-1",
        user_metadata: {
          picture: "https://lh3.googleusercontent.com/google.jpg",
        },
      })
    ).toBe("https://lh3.googleusercontent.com/google.jpg");
  });

  it("keeps DB avatar ahead of Google metadata in ordered candidates", () => {
    expect(
      getValidAvatarUrls("https://cdn.example.com/db-avatar.jpg", {
        user_metadata: {
          picture: "https://lh3.googleusercontent.com/google.jpg",
        },
      })
    ).toEqual([
      "https://cdn.example.com/db-avatar.jpg",
      "https://lh3.googleusercontent.com/google.jpg",
    ]);
  });

  it("returns null when no valid avatar exists", () => {
    expect(getValidAvatarUrl("", " null ", "undefined", "/customer-placeholder.png")).toBeNull();
  });

  it("rejects partial non-image avatar strings before rendering", () => {
    expect(getValidAvatarUrl("not-a-google-avatar")).toBeNull();
  });

  it("does not clear an existing valid avatar with an invalid new payload", () => {
    expect(mergeAvatarState("https://lh3.googleusercontent.com/google.jpg", "")).toBe(
      "https://lh3.googleusercontent.com/google.jpg"
    );
  });
});

describe("normalizeAuthUser", () => {
  it("preserves Google avatar candidates in the serialized auth snapshot shape", () => {
    const normalized = normalizeAuthUser({
      id: "user-1",
      email: "test@example.com",
      picture: "https://lh3.googleusercontent.com/google.jpg",
      user_metadata: {
        full_name: "Google User",
      },
    });

    expect(normalized?.user_metadata?.avatar_url).toBe(
      "https://lh3.googleusercontent.com/google.jpg"
    );
    expect(getValidAvatarUrl(normalized)).toBe("https://lh3.googleusercontent.com/google.jpg");
  });
});

describe("SafeAvatar", () => {
  it("renders a metadata avatar image before falling back to initials", () => {
    render(
      <SafeAvatar
        src=""
        userMetadata={{ picture: "https://lh3.googleusercontent.com/google.jpg" }}
        fullName="Test Account"
        alt="Profile avatar"
      />
    );

    const avatar = screen.getByAltText("Profile avatar");
    expect(avatar).toHaveAttribute("src", "https://lh3.googleusercontent.com/google.jpg");
    expect(avatar).toHaveAttribute("referrerPolicy", "no-referrer");
    expect(screen.queryByText("TA")).not.toBeInTheDocument();
  });

  it("keeps a known Google avatar when a later render omits metadata", () => {
    const { rerender } = render(
      <SafeAvatar
        src=""
        userMetadata={{ avatar_url: "https://lh3.googleusercontent.com/google.jpg" }}
        fullName="Test Account"
        alt="Profile avatar"
      />
    );

    fireEvent.load(screen.getByAltText("Profile avatar"));

    rerender(<SafeAvatar src="" userMetadata={{}} fullName="Test Account" alt="Profile avatar" />);

    expect(screen.getByAltText("Profile avatar")).toHaveAttribute(
      "src",
      "https://lh3.googleusercontent.com/google.jpg"
    );
    expect(screen.queryByText("TA")).not.toBeInTheDocument();
  });

  it("uses a DB avatar over metadata when both are present", () => {
    render(
      <SafeAvatar
        src="https://cdn.example.com/db-avatar.jpg"
        userMetadata={{ avatar_url: "https://lh3.googleusercontent.com/google.jpg" }}
        fullName="Test Account"
        alt="Profile avatar"
      />
    );

    expect(screen.getByAltText("Profile avatar")).toHaveAttribute(
      "src",
      "https://cdn.example.com/db-avatar.jpg"
    );
  });

  it("tries Google metadata when the first profile avatar candidate fails", async () => {
    render(
      <SafeAvatar
        src="https://cdn.example.com/stale-profile-avatar.jpg"
        userMetadata={{ picture: "https://lh3.googleusercontent.com/google.jpg" }}
        fullName="Test Account"
        alt="Profile avatar"
      />
    );

    fireEvent.error(screen.getByAltText("Profile avatar"));

    expect(await screen.findByAltText("Profile avatar")).toHaveAttribute(
      "src",
      "https://lh3.googleusercontent.com/google.jpg"
    );
    expect(screen.queryByText("TA")).not.toBeInTheDocument();
  });

  it("renders initials when initial render has no avatar or metadata", () => {
    render(<SafeAvatar src="" userMetadata={{}} fullName="Test Account" alt="Profile avatar" />);

    expect(screen.getByRole("img", { name: "Profile avatar" })).toHaveAttribute(
      "data-avatar-fallback",
      "initials"
    );
    expect(screen.getByText("TA")).toBeInTheDocument();
  });

  it("renders initials when no avatar source exists", () => {
    render(<SafeAvatar src="" fullName="Test Account" alt="Profile avatar" />);

    expect(screen.getByRole("img", { name: "Profile avatar" })).toHaveAttribute(
      "data-avatar-fallback",
      "initials"
    );
    expect(screen.getByText("TA")).toBeInTheDocument();
  });

  it("falls back to initials when the image fails to load", () => {
    render(
      <SafeAvatar
        src="https://example.com/broken.jpg"
        fullName="Test Account"
        alt="Profile avatar"
      />
    );

    fireEvent.error(screen.getByAltText("Profile avatar"));

    expect(screen.getByRole("img", { name: "Profile avatar" })).toHaveAttribute(
      "data-avatar-fallback",
      "initials"
    );
    expect(screen.getByText("TA")).toBeInTheDocument();
  });

  it("falls back to initials when a Google avatar URL fails to load", () => {
    render(
      <SafeAvatar
        src=""
        userMetadata={{ picture: "https://lh3.googleusercontent.com/broken-google-avatar.jpg" }}
        fullName="Google Account"
        alt="Profile avatar"
      />
    );

    fireEvent.error(screen.getByAltText("Profile avatar"));

    expect(screen.getByRole("img", { name: "Profile avatar" })).toHaveAttribute(
      "data-avatar-fallback",
      "initials"
    );
    expect(screen.getByText("GA")).toBeInTheDocument();
  });

  it("renders initials immediately for invalid avatar source strings", () => {
    render(<SafeAvatar src="not-a-google-avatar" fullName="Test Account" alt="Profile avatar" />);

    expect(screen.queryByAltText("Profile avatar")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Profile avatar" })).toHaveAttribute(
      "data-avatar-fallback",
      "initials"
    );
    expect(screen.getByText("TA")).toBeInTheDocument();
  });

  it("uses business initials in a rounded-square fallback for business avatars", () => {
    render(
      <SafeAvatar
        src=""
        businessName="Test Bakery"
        displayName="Nour"
        email="owner@test.com"
        identityType="business"
        shape="rounded-square"
        alt="Business avatar"
      />
    );

    const avatar = screen.getByRole("img", { name: "Business avatar" });
    expect(screen.getByText("TB")).toBeInTheDocument();
    expect(avatar).toHaveStyle({ borderRadius: "1rem" });
  });
});
