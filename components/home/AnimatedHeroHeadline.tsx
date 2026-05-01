type AnimatedHeroHeadlineProps = {
  supportingText: string;
};

export default function AnimatedHeroHeadline({
  supportingText,
}: AnimatedHeroHeadlineProps) {
  return (
    <span
      className="yb-hero-headline-shell"
      data-testid="hero-headline-shell"
    >
      <span
        className="yb-hero-headline-layer yb-hero-headline-layer-active"
        data-headline-kind="final"
        data-headline-state="active"
      >
        <span className="yb-hero-headline-copy">{supportingText}</span>
      </span>
    </span>
  );
}
