"use client";

import Image from "next/image";
import Link from "next/link";
import {
  BadgeCheck,
  Gift,
  Sparkles,
  Store,
  Truck,
} from "lucide-react";
import { getListingCategoryPlaceholder } from "@/lib/taxonomy/placeholders";

const WHY_ITEMS = [
  {
    title: "Support local businesses",
    description: "Keep more spending in your neighborhood while discovering shops worth repeating.",
    Icon: Store,
  },
  {
    title: "Curated marketplace",
    description: "Browse a tighter, higher-quality mix of shops, products, and neighborhood favorites.",
    Icon: Sparkles,
  },
  {
    title: "Verified shops",
    description: "Find trusted businesses with clearer business profiles and more reliable discovery.",
    Icon: BadgeCheck,
  },
  {
    title: "Fast pickup or delivery",
    description: "Shop local with the convenience people expect from premium modern marketplaces.",
    Icon: Truck,
  },
];

const COLLECTIONS = [
  {
    title: "Local gifts",
    description: "Handmade finds, thoughtful extras, and neighborhood standouts.",
    href: "/categories/handmade-and-artisan",
    imageSrc: getListingCategoryPlaceholder({ category: "handmade-and-artisan" }),
  },
  {
    title: "Weekend shopping",
    description: "Plan a better local run with nearby fashion, food, and essentials.",
    href: "/nearby",
    customerHref: "/customer/nearby",
    imageSrc: getListingCategoryPlaceholder({ category: "clothing-and-accessories" }),
  },
  {
    title: "Home essentials",
    description: "Upgrade everyday spaces with practical picks from local sellers.",
    href: "/categories/home-and-kitchen",
    imageSrc: getListingCategoryPlaceholder({ category: "home-and-kitchen" }),
  },
  {
    title: "Self-care edit",
    description: "Beauty, wellness, and feel-good staples from businesses close to home.",
    href: "/categories/health-and-beauty",
    imageSrc: getListingCategoryPlaceholder({ category: "health-and-beauty" }),
  },
];

function resolveHref(item, mode) {
  return mode === "customer" && item.customerHref ? item.customerHref : item.href;
}

export function WhyYourBarrioSection() {
  return (
    <section className="mx-auto mt-16 w-full max-w-6xl px-6 md:mt-20 md:px-8">
      <div className="mb-7 max-w-2xl md:mb-8">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-white/55">
          Why YourBarrio
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-white sm:text-[2.2rem]">
          Discovery built for local commerce, not generic directories.
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {WHY_ITEMS.map(({ title, description, Icon }) => (
          <article
            key={title}
            className="rounded-[28px] border border-white/10 bg-white/6 p-5 shadow-[0_24px_60px_-44px_rgba(15,23,42,0.65)] backdrop-blur-xl"
          >
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/12 bg-white/10 text-white">
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-lg font-semibold tracking-[-0.03em] text-white">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-white/68">{description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function CuratedCollectionsSection({ mode = "public" }) {
  return (
    <section
      id="curated-collections"
      className="mx-auto mt-16 w-full max-w-6xl px-6 md:mt-20 md:px-8"
    >
      <div className="mb-7 max-w-2xl md:mb-8">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-white/55">
          Curated collections
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-white sm:text-[2.2rem]">
          Start with a collection, then branch into the neighborhood.
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {COLLECTIONS.map((collection) => (
          <Link
            key={collection.title}
            href={resolveHref(collection, mode)}
            prefetch={false}
            className="group relative isolate min-h-[240px] overflow-hidden rounded-[30px] border border-white/10 bg-[#15121f] shadow-[0_28px_80px_-50px_rgba(15,23,42,0.8)]"
          >
            <Image
              src={collection.imageSrc}
              alt={collection.title}
              fill
              sizes="(max-width: 767px) 100vw, 50vw"
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(0,0,0,0.46)_0%,rgba(0,0,0,0.32)_32%,rgba(0,0,0,0)_72%)]" />
            <div className="absolute inset-x-0 bottom-0 h-[54%] bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0.12)_38%,rgba(0,0,0,0.28)_100%)]" />
            <div className="absolute inset-x-0 bottom-0 z-10 p-6 sm:p-7">
              <h3
                className="text-[1.72rem] font-semibold tracking-[-0.045em] text-[#ffffff] sm:text-[1.82rem]"
                style={{ textShadow: "0 3px 12px rgba(0,0,0,0.45)" }}
              >
                {collection.title}
              </h3>
              <p
                className="mt-2 max-w-md text-sm leading-6 text-[#ffffff]"
                style={{ textShadow: "0 3px 12px rgba(0,0,0,0.45)" }}
              >
                {collection.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function SellerCTASection() {
  return (
    <section className="mx-auto mt-16 w-full max-w-6xl px-6 md:mt-20 md:px-8">
      <div className="overflow-hidden rounded-[32px] border border-[#efe3c433] bg-[linear-gradient(135deg,rgba(249,241,224,0.98)_0%,rgba(244,231,211,0.94)_48%,rgba(236,217,192,0.96)_100%)] px-6 py-10 text-center shadow-[0_28px_90px_-56px_rgba(233,185,92,0.58)] sm:px-8 md:py-12">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7f4f10]">
          For sellers
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[#20140a] sm:text-[2.35rem]">
          Own a local business?
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-[#5f4527] sm:text-base">
          Start selling on YourBarrio and reach local customers through a marketplace built for neighborhood commerce.
        </p>
        <div className="mt-7">
          <Link
            href="/business-auth/register"
            prefetch={false}
            className="inline-flex items-center justify-center rounded-full bg-[#20140a] px-6 py-3 text-sm font-semibold text-[#fff7ea] transition hover:bg-[#120b05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7f4f10] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f4e7d3]"
          >
            Start selling on YourBarrio
          </Link>
        </div>
      </div>
    </section>
  );
}
