import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import AnimatedHeroHeadline from "@/components/home/AnimatedHeroHeadline";

describe("AnimatedHeroHeadline", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the supplied headline immediately", () => {
    const { container } = render(
      <AnimatedHeroHeadline supportingText="Discover local shops you’ll love" />
    );

    const layers = container.querySelectorAll(".yb-hero-headline-layer");
    expect(layers).toHaveLength(1);
    expect(layers[0]).toHaveAttribute("data-headline-state", "active");
    expect(layers[0]).toHaveAttribute("data-headline-kind", "final");
    expect(layers[0]).toHaveTextContent("Discover local shops you’ll love");
  });
});
