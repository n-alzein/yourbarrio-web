import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import CategoryTilesGrid from "@/components/customer/CategoryTilesGrid";

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, prefetch, onNavigate, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt, fill, priority, ...rest }) => <img alt={alt} {...rest} />,
}));

describe("CategoryTilesGrid", () => {
  it("renders category tiles with links", () => {
    render(
      <CategoryTilesGrid
        categories={[
          {
            id: 1,
            name: "Coffee",
            slug: "coffee",
            tileImageUrl: "/coffee.png",
          },
          {
            id: 2,
            name: "Groceries",
            slug: "groceries",
            tileImageUrl: "/groceries.png",
          },
        ]}
      />
    );

    expect(screen.getByText("Coffee")).toBeInTheDocument();
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(screen.getByLabelText("Shop Coffee")).toHaveAttribute(
      "href",
      "/categories/coffee"
    );
    expect(screen.getByLabelText("Shop Groceries")).toHaveAttribute(
      "href",
      "/categories/groceries"
    );
  });

  it("shows empty state when no categories", () => {
    render(<CategoryTilesGrid categories={[]} />);
    expect(screen.getByText("No categories yet.")).toBeInTheDocument();
  });
});
