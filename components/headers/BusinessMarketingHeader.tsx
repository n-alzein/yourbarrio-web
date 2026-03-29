"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import HeaderShell from "@/components/headers/HeaderShell";
import NavLink from "@/components/headers/NavLink";
import MobileMenuSheet from "@/components/headers/MobileMenuSheet";

const NAV_ITEMS = [
  { label: "How it works", href: "/business/how-it-works" },
  { label: "Pricing", href: "/business/pricing" },
  { label: "For retailers", href: "/business/retailers" },
  { label: "FAQ", href: "/business/faq" },
];

const LOGIN_HREF = "/business/login";
const CTA_HREF = "/business-auth/register";

function isActivePath(pathname: string, href: string) {
  if (href === "/business") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isBusinessAuthPath(pathname: string | null) {
  if (!pathname) return false;
  return (
    pathname === "/business/login" ||
    pathname.startsWith("/business/login/") ||
    pathname === "/business-auth" ||
    pathname.startsWith("/business-auth/")
  );
}

export default function BusinessMarketingHeader() {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);
  const firstMobileLinkRef = useRef<HTMLAnchorElement>(null);
  const isBusinessLanding = pathname === "/business";
  const isBusinessAuth = isBusinessAuthPath(pathname);
  const useLandingNav = isBusinessLanding || isBusinessAuth;
  const showPrimaryNav = !useLandingNav;

  useEffect(() => {
    if (typeof window === "undefined") return;
    lastScrollY.current = window.scrollY;

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      window.requestAnimationFrame(() => {
        const currentY = window.scrollY;
        const delta = currentY - lastScrollY.current;

        if (currentY < 20) {
          setHidden(false);
        } else if (currentY > 80 && delta > 0) {
          setHidden(true);
        } else if (delta < 0) {
          setHidden(false);
        }

        lastScrollY.current = currentY;
        ticking.current = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-transform duration-300 ease-out ${
          hidden ? "-translate-y-full" : "translate-y-0"
        }`}
      >
        <div className="yb-navbar-accent-line bg-white shadow-sm">
          <HeaderShell innerClassName="h-[74px] w-full max-w-[1180px] gap-5">
            <div className="flex min-w-0 items-center gap-5">
              <Link
                href="/business"
                prefetch={false}
                className="flex shrink-0 items-center"
              >
                <Image
                  src="/logo.png"
                  alt="YourBarrio"
                  width={867}
                  height={306}
                  sizes="(min-width: 1024px) 152px, 136px"
                  className="h-auto w-[136px] object-contain sm:w-[144px] lg:w-[152px]"
                  priority
                />
                {!useLandingNav && (
                  <span className="ml-3 text-base font-semibold tracking-tight text-neutral-900">
                    YourBarrio
                  </span>
                )}
              </Link>
              {showPrimaryNav && (
                <nav className="ml-4 hidden items-center gap-6 lg:flex">
                  {NAV_ITEMS.map((item) => (
                    <NavLink
                      key={item.href}
                      href={item.href}
                      active={isActivePath(pathname, item.href)}
                      activeClassName="text-neutral-900"
                      inactiveClassName="text-neutral-600 hover:text-neutral-900"
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </nav>
              )}
            </div>

            <div className="ml-auto hidden items-center gap-3 lg:flex">
              <Link
                href={LOGIN_HREF}
                className="inline-flex h-11 items-center justify-center rounded-full border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 hover:text-neutral-900"
              >
                Log in
              </Link>
              <Link
                href={CTA_HREF}
                className="inline-flex h-11 items-center justify-center rounded-full bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Get started
              </Link>
            </div>

            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setMenuOpen(true)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-neutral-300 text-neutral-900 transition hover:bg-neutral-50 lg:hidden"
            >
              <span className="sr-only">Open menu</span>
              <div className="flex flex-col gap-1">
                <span className="h-0.5 w-5 bg-neutral-900" />
                <span className="h-0.5 w-5 bg-neutral-900" />
                <span className="h-0.5 w-5 bg-neutral-900" />
              </div>
            </button>
          </HeaderShell>
        </div>
      </header>

      <MobileMenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        initialFocusRef={firstMobileLinkRef}
        title="Business menu"
      >
        <div className="flex flex-col gap-4">
          {showPrimaryNav &&
            NAV_ITEMS.map((item, index) => (
              <NavLink
                key={item.href}
                href={item.href}
                active={isActivePath(pathname, item.href)}
                onClick={() => setMenuOpen(false)}
                className="text-base text-white/80 hover:text-white"
                activeClassName="text-white"
                inactiveClassName="text-white/80 hover:text-white"
                ref={index === 0 ? firstMobileLinkRef : undefined}
              >
                {item.label}
              </NavLink>
            ))}
          {showPrimaryNav && <div className="h-px bg-white/10" />}
          <Link
            href={LOGIN_HREF}
            onClick={() => setMenuOpen(false)}
            className="text-sm font-medium text-white/80 hover:text-white"
          >
            Log in
          </Link>
          <Link
            href={CTA_HREF}
            onClick={() => setMenuOpen(false)}
            className="inline-flex items-center justify-center rounded-full bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Get started
          </Link>
        </div>
      </MobileMenuSheet>
    </>
  );
}
