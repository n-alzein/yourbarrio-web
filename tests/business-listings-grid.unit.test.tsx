import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BusinessListingsGrid from "@/components/publicBusinessProfile/BusinessListingsGrid";

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/FastImage", () => ({
  __esModule: true,
  default: ({ alt, fill, priority, sizes, decoding, ...rest }) => <img alt={alt} {...rest} />,
}));

const listings = [
  {
    id: "listing-1",
    title: "Cold Brew Concentrate",
    price: 12,
    category: "food-drink",
    city: "Los Angeles",
    photo_url: "/cold-brew.jpg",
    photo_variants: [
      { id: "photo-1", original: { url: "/cold-brew.jpg", path: null } },
      { id: "photo-2", original: { url: "/cold-brew-cover.jpg", path: null } },
    ],
    cover_image_id: "photo-2",
    public_id: "listing-1",
  },
  {
    id: "listing-2",
    title: "Pan Dulce Box",
    price: 18,
    category: "food-drink",
    city: "Los Angeles",
    images: [
      {
        id: "photo-2",
        url: "/pan-dulce-cropped.jpg",
        original: { url: "/pan-dulce-full.jpg" },
        is_cover: true,
      },
    ],
    public_id: "listing-2",
  },
];

describe("BusinessListingsGrid", () => {
  it("renders listings in a single-row snap carousel without changing links", () => {
    const { container } = render(
      <BusinessListingsGrid
        listings={listings}
        itemHrefResolver={(item) => `/listings/${item.public_id}`}
      />
    );

    const carousel = container.querySelector(".overflow-x-auto");
    expect(carousel).toBeInTheDocument();
    expect(carousel).toHaveClass("flex", "snap-x", "snap-mandatory");

    const cards = screen.getAllByRole("link");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveAttribute("href", "/listings/listing-1");
    expect(cards[1]).toHaveAttribute("href", "/listings/listing-2");
    expect(cards[0]).toHaveClass("shrink-0", "snap-start");
    expect(cards[0].className).toContain("w-[calc((100%-1rem)/2)]");
    expect(cards[0].className).toContain("sm:w-[18.5rem]");
  });

  it("uses cover_image_id for the visible listing image and falls back when absent", () => {
    const { container } = render(
      <BusinessListingsGrid
        listings={listings}
        itemHrefResolver={(item) => `/listings/${item.public_id}`}
      />
    );

    const images = screen.getAllByRole("img");
    expect(images[0]).toHaveAttribute("src", "/cold-brew-cover.jpg");
    expect(images[1]).toHaveAttribute("src", "/pan-dulce-full.jpg");
    expect(images[0]).toHaveClass("object-contain");

    const imageFrame = container.querySelector(".aspect-\\[4\\/3\\]");
    expect(imageFrame).toHaveClass("bg-white", "flex", "items-center", "justify-center");
  });

  it("removes the top category pill while keeping category metadata below the title", () => {
    render(
      <BusinessListingsGrid
        listings={listings}
        itemHrefResolver={(item) => `/listings/${item.public_id}`}
      />
    );

    expect(document.querySelector(".border-\\[\\#e5dcff\\]")).not.toBeInTheDocument();
    expect(screen.getAllByText("Los Angeles")).toHaveLength(2);
    expect(document.querySelectorAll(".bg-slate-50").length).toBeGreaterThanOrEqual(4);
  });
});
