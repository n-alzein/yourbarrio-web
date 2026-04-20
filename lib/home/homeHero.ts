import { MapPin } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type HomeHeroConfig = {
  imageSrc: string;
  headline: string;
  subtitle?: string | null;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  supportingText: string;
  supportingIcon?: LucideIcon | null;
};

export const homeHeroConfig: HomeHeroConfig = {
  imageSrc: "/images/homepage/hero-main.png",
  headline: "Discover local shops you'll actually love",
  subtitle: null,
  primaryCtaLabel: "Explore local businesses",
  primaryCtaHref: "/nearby",
  supportingText: "Local businesses, curated for you",
  supportingIcon: MapPin,
};
