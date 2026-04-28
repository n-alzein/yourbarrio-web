import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { cleanup, render } from "@testing-library/react";

import AnimatedHeroHeadline from "@/components/home/AnimatedHeroHeadline";

const HOLD_DURATIONS_MS = [2200, 3000, 2400] as const;
const TRANSITION_DURATION_MS = 1000;
const TRANSITION_FRAME_MS = 16;

function mockMatchMedia(matches: boolean) {
  return vi.fn().mockImplementation(() => ({
    matches,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("AnimatedHeroHeadline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("loops through the banner headlines one at a time", () => {
    vi.stubGlobal("matchMedia", mockMatchMedia(false));

    const { container } = render(
      <AnimatedHeroHeadline supportingText="Discover local shops you'll love" />
    );

    let layers = container.querySelectorAll(".yb-hero-headline-layer");
    expect(layers).toHaveLength(1);
    expect(layers[0]).toHaveAttribute("data-headline-state", "active");
    expect(layers[0]).toHaveTextContent("Your Neighborhood");

    act(() => {
      vi.advanceTimersByTime(HOLD_DURATIONS_MS[0]);
    });
    layers = container.querySelectorAll(".yb-hero-headline-layer");
    expect(layers).toHaveLength(2);
    expect(layers[0]).toHaveAttribute("data-headline-state", "exiting");
    expect(layers[1]).toHaveAttribute("data-headline-state", "entering");
    expect(layers[1]).toHaveTextContent("Your Barrio");

    act(() => {
      vi.advanceTimersByTime(TRANSITION_FRAME_MS);
    });
    layers = container.querySelectorAll(".yb-hero-headline-layer");
    expect(layers).toHaveLength(2);
    expect(layers[0]).toHaveAttribute("data-headline-state", "exiting");
    expect(layers[1]).toHaveAttribute("data-headline-state", "active");

    act(() => {
      vi.advanceTimersByTime(TRANSITION_DURATION_MS);
    });
    layers = container.querySelectorAll(".yb-hero-headline-layer");
    expect(layers).toHaveLength(1);
    expect(layers[0]).toHaveTextContent("Your Barrio");

    act(() => {
      vi.advanceTimersByTime(HOLD_DURATIONS_MS[1] + TRANSITION_FRAME_MS + TRANSITION_DURATION_MS);
    });
    layers = container.querySelectorAll(".yb-hero-headline-layer");
    expect(layers).toHaveLength(1);
    expect(layers[0]).toHaveTextContent("Discover local shops you'll love");

    act(() => {
      vi.advanceTimersByTime(HOLD_DURATIONS_MS[2] + TRANSITION_FRAME_MS + TRANSITION_DURATION_MS);
    });
    layers = container.querySelectorAll(".yb-hero-headline-layer");
    expect(layers).toHaveLength(1);
    expect(layers[0]).toHaveTextContent("Your Neighborhood");
  });

  it("renders only the static final headline for reduced motion", () => {
    vi.stubGlobal("matchMedia", mockMatchMedia(true));

    const { container } = render(
      <AnimatedHeroHeadline supportingText="Discover local shops you'll love" />
    );

    const staticHeadline = container.querySelector(".yb-hero-headline-static");
    expect(staticHeadline).toHaveTextContent(
      "Your Barrio. Discover local shops you'll love"
    );
  });
});
