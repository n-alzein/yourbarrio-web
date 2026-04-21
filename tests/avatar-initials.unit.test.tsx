import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SafeAvatar from "@/components/SafeAvatar";
import { getAvatarInitials } from "@/lib/avatarInitials";
import { getValidAvatarUrl, mergeAvatarState } from "@/lib/avatarUrl";

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

  it("returns null when no valid avatar exists", () => {
    expect(getValidAvatarUrl("", " null ", "undefined", "/customer-placeholder.png")).toBeNull();
  });

  it("does not clear an existing valid avatar with an invalid new payload", () => {
    expect(mergeAvatarState("https://lh3.googleusercontent.com/google.jpg", "")).toBe(
      "https://lh3.googleusercontent.com/google.jpg"
    );
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
