"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type AnimatedHeroHeadlineProps = {
  supportingText: string;
};

type HeadlineLayer = {
  id: number;
  text: string;
  kind: "neighborhood" | "brand" | "final";
  state: "active" | "entering" | "exiting";
};

const INTRO_HEADLINES = ["Your Neighborhood", "Your Barrio"] as const;
const HOLD_DURATIONS_MS = [2200, 3000, 2400] as const;
const TRANSITION_DURATION_MS = 1000;
const TRANSITION_FRAME_MS = 16;

function getHoldDuration(kind: HeadlineLayer["kind"]) {
  if (kind === "brand") return HOLD_DURATIONS_MS[1];
  if (kind === "final") return HOLD_DURATIONS_MS[2];
  return HOLD_DURATIONS_MS[0];
}

function prefersReducedMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function AnimatedHeroHeadline({
  supportingText,
}: AnimatedHeroHeadlineProps) {
  const loopHeadlines = useMemo(
    () => [...INTRO_HEADLINES, supportingText],
    [supportingText]
  );
  const staticHeadline = useMemo(
    () => `Your Barrio. ${supportingText}`,
    [supportingText]
  );
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const currentIndexRef = useRef(0);
  const currentLayerIdRef = useRef(0);
  const nextLayerIdRef = useRef(1);
  const [layers, setLayers] = useState<HeadlineLayer[]>([
    {
      id: 0,
      text: loopHeadlines[0],
      kind: "neighborhood",
      state: "active",
    },
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (event: MediaQueryListEvent) => {
      const matches = event.matches;
      setReducedMotion(matches);

      if (matches) {
        const nextId = nextLayerIdRef.current++;
        currentLayerIdRef.current = nextId;
        setLayers([
          {
            id: nextId,
            text: staticHeadline,
            kind: "final",
            state: "active",
          },
        ]);
        return;
      }

      currentIndexRef.current = 0;
      const nextId = nextLayerIdRef.current++;
      currentLayerIdRef.current = nextId;
      setLayers([
        {
          id: nextId,
          text: loopHeadlines[0],
          kind: "neighborhood",
          state: "active",
        },
      ]);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [loopHeadlines, staticHeadline]);

  useEffect(() => {
    if (reducedMotion) return undefined;

    const timers: number[] = [];
    let cancelled = false;

    const scheduleCycle = (currentIndex: number, currentLayerId: number) => {
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return;

          const nextIndex = (currentIndex + 1) % loopHeadlines.length;
          const nextLayerId = nextLayerIdRef.current++;
          const currentHeadline = loopHeadlines[currentIndex];
          const nextHeadline = loopHeadlines[nextIndex];
          const currentKind =
            currentIndex === 0 ? "neighborhood" : currentIndex === 1 ? "brand" : "final";
          const nextKind =
            nextIndex === 0 ? "neighborhood" : nextIndex === 1 ? "brand" : "final";

          setLayers([
            {
              id: currentLayerId,
              text: currentHeadline,
              kind: currentKind,
              state: "exiting",
            },
            {
              id: nextLayerId,
              text: nextHeadline,
              kind: nextKind,
              state: "entering",
            },
          ]);

          timers.push(
            window.setTimeout(() => {
              if (cancelled) return;

              setLayers([
                {
                  id: currentLayerId,
                  text: currentHeadline,
                  kind: currentKind,
                  state: "exiting",
                },
                {
                  id: nextLayerId,
                  text: nextHeadline,
                  kind: nextKind,
                  state: "active",
                },
              ]);
            }, TRANSITION_FRAME_MS)
          );

          timers.push(
            window.setTimeout(() => {
              if (cancelled) return;

              currentIndexRef.current = nextIndex;
              currentLayerIdRef.current = nextLayerId;
              setLayers([
                {
                  id: nextLayerId,
                  text: nextHeadline,
                  kind: nextKind,
                  state: "active",
                },
              ]);

              scheduleCycle(nextIndex, nextLayerId);
            }, TRANSITION_FRAME_MS + TRANSITION_DURATION_MS)
          );
        }, HOLD_DURATIONS_MS[currentIndex])
      );
    };

    scheduleCycle(currentIndexRef.current, currentLayerIdRef.current);

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [loopHeadlines, reducedMotion, supportingText]);

  if (reducedMotion) {
    return (
      <span
        className="yb-hero-headline-shell"
        data-testid="hero-headline-shell"
      >
        <span className="yb-hero-headline-static">{staticHeadline}</span>
      </span>
    );
  }

  return (
    <span
      className="yb-hero-headline-shell"
      data-testid="hero-headline-shell"
    >
      {layers.map((layer) => (
        <span
          key={layer.id}
          aria-hidden={layer.state !== "active"}
          className={`yb-hero-headline-layer yb-hero-headline-layer-${layer.state}`}
          data-headline-kind={layer.kind}
          data-headline-state={layer.state}
          style={
            layer.state === "active"
              ? { ["--yb-headline-hold" as string]: `${getHoldDuration(layer.kind)}ms` }
              : undefined
          }
        >
          <span className="yb-hero-headline-copy">{layer.text}</span>
        </span>
      ))}
    </span>
  );
}
