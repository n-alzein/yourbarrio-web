import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import BusinessAbout, {
  getStaticMapUrl,
} from "@/components/publicBusinessProfile/BusinessAbout";

const profile = {
  business_name: "Barrio Boutique",
  description: "Neighborhood boutique with local goods.",
  address: "123 Main St",
  city: "Los Angeles",
  state: "CA",
  phone: "5551234567",
  website: "barrioboutique.com",
  category: "Boutique",
  latitude: 33.769283,
  longitude: -118.185036,
  hours_json: {
    mon: { open: "09:00", close: "17:00", isClosed: false },
  },
};

afterEach(() => {
  delete process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
});

describe("BusinessAbout", () => {
  it("builds a valid static mapbox image url with longitude-latitude ordering", () => {
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN = "test-access-token";

    const src = getStaticMapUrl(profile);

    expect(src).toContain("api.mapbox.com/styles/v1/mapbox/streets-v12/");
    expect(src).toContain("static/");
    expect(src).toContain("pin-l+6d3df5");
    expect(src).toContain("-118.185036,33.769283");
    expect(src).toContain("/900x320?");
    expect(src).toContain("access_token=test-access-token");
  });

  it("renders an editorial flex layout with a stacked fixed-width sidebar", () => {
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN = "test-access-token";
    const { container } = render(
      <BusinessAbout
        profile={profile}
        headerAction={<button type="button">Edit details</button>}
      />
    );

    expect(screen.getByRole("heading", { name: "About" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit details" })).toBeInTheDocument();
    expect(screen.getByText("Neighborhood boutique with local goods.")).toBeInTheDocument();
    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(screen.getByText("Hours")).toBeInTheDocument();
    const map = screen.getByAltText(/Map preview/i);
    expect(map).toBeInTheDocument();
    const mapLink = screen.getByRole("link", { name: "Open location in maps" });
    expect(mapLink).toHaveAttribute(
      "href",
      "https://maps.google.com/?q=33.769283%2C-118.185036"
    );
    expect(map.getAttribute("src")).toContain("api.mapbox.com/styles/v1/mapbox/streets-v12/static");
    expect(map.getAttribute("src")).toContain("pin-l+6d3df5");
    expect(map.getAttribute("src")).toContain("-118.185036,33.770533");
    expect(map.getAttribute("src")).toContain("/900x320?");
    expect(map.getAttribute("src")).toContain("access_token=test-access-token");
    expect(map.getAttribute("data-static-map-src")).toBe(map.getAttribute("src"));

    const layout = container.querySelector(".lg\\:flex-row");
    expect(layout).toBeInTheDocument();
    expect(layout).toHaveClass("mb-12", "flex", "flex-col", "gap-6", "lg:flex-row", "lg:items-start");

    const sidebar = container.querySelector(".lg\\:w-\\[340px\\]");
    expect(sidebar).toBeInTheDocument();
    expect(sidebar).toHaveClass("space-y-3", "lg:shrink-0");
  });

  it("displays the business phone from the public business profile", () => {
    render(<BusinessAbout profile={{ ...profile, phone: "(562) 123-4567" }} />);

    expect(screen.getByText("(562) 123-4567")).toBeInTheDocument();
  });

  it("hides phone details instead of falling back to owner account phone", () => {
    render(
      <BusinessAbout
        profile={{
          ...profile,
          phone: null,
          owner_phone: "(562) 123-4567",
          address: null,
          website: null,
          category: null,
        }}
      />
    );

    expect(screen.queryByText("(562) 123-4567")).not.toBeInTheDocument();
    expect(screen.queryByText("Phone")).not.toBeInTheDocument();
  });
});
