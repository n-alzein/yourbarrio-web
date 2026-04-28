import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, prefetch: _prefetch, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt, fill: _fill, priority: _priority, ...rest }: any) => (
    <img alt={alt} {...rest} />
  ),
}));

import HeroBanner from "@/components/home/HeroBanner";
import { homeHeroConfig } from "@/lib/home/homeHero";

describe("HeroBanner helper line", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders city-aware helper copy when city is available", () => {
    render(<HeroBanner hero={homeHeroConfig} city="Long Beach" />);

    expect(screen.getByText("Long Beach businesses, curated for you")).toBeInTheDocument();
  });

  it("falls back to the default helper copy when city is unavailable", () => {
    render(<HeroBanner hero={homeHeroConfig} city={null} />);

    expect(screen.getByText("Local businesses, curated for you")).toBeInTheDocument();
  });
});
