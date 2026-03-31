"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { openBusinessAuthPopup } from "@/lib/openBusinessAuthPopup";
import { AUTH_UI_RESET_EVENT } from "@/components/AuthProvider";

function NavItem({ href, children, active, onClick, className, ...rest }) {
  return (
    <Link
      href={href}
      prefetch={href === "/business" ? false : undefined}
      className={`relative text-sm md:text-base font-medium transition-all ${
        active ? "text-white" : "text-white/68 hover:text-white"
      } ${className || ""}`}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      {...rest}
    >
      {children}
    </Link>
  );
}

export default function BusinessMarketingNavbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    // Prevent background scroll when the mobile menu is open
    if (typeof document === "undefined") return;
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleReset = () => {
      setOpen(false);
    };
    window.addEventListener(AUTH_UI_RESET_EVENT, handleReset);
    return () => window.removeEventListener(AUTH_UI_RESET_EVENT, handleReset);
  }, []);

  const handlePopup = (event, path) => {
    event.preventDefault();
    openBusinessAuthPopup(path);
  };

  return (
    <nav
      className="fixed top-0 inset-x-0 z-50 yb-navbar border-b border-white/6 bg-[rgba(15,23,42,0.92)] shadow-[0_16px_40px_-34px_rgba(2,6,23,0.58)] backdrop-blur-xl"
      style={{
        backgroundColor: "rgba(15, 23, 42, 0.92)",
        borderBottomColor: "rgba(255,255,255,0.06)",
      }}
      data-public-nav
      data-business-public-navbar="1"
      data-business-marketing-nav="1"
    >
      <div>
        <div className="mx-auto flex h-[72px] w-full max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
            {/* LEFT SIDE */}
            <div className="flex items-center gap-x-8">
              <Link href="/business" prefetch={false} className="select-none">
                <span className="relative block h-10 w-10 lg:hidden">
                  <Image
                    src="/logo-off4.png"
                    alt="YourBarrio Logo"
                    fill
                    sizes="40px"
                    priority
                    className="object-contain"
                  />
                </span>
                <span className="relative hidden h-10 w-10 lg:block lg:h-32 lg:w-32">
                  <Image
                    src="/logo-off4.png"
                    alt="YourBarrio Logo"
                    fill
                    sizes="128px"
                    priority
                    className="object-contain"
                  />
                </span>
              </Link>

              <div className="hidden items-center gap-x-8 lg:flex">
                <NavItem
                  href="/about"
                  active={pathname === "/about"}
                  onClick={() => setOpen(false)}
                >
                  About
                </NavItem>
              </div>
            </div>

            {/* RIGHT SIDE */}
            <div className="ml-auto hidden items-center gap-3 lg:flex">
              <Link
                href="/business/login"
                onClick={(e) => handlePopup(e, "/business/login")}
                className="inline-flex items-center justify-center rounded-full px-3 py-2 text-sm font-medium text-white/72 transition hover:text-white"
              >
                Log in
              </Link>

              <Link
                href="/business-auth/register"
                onClick={(e) => handlePopup(e, "/business-auth/register")}
                className="inline-flex items-center justify-center rounded-full border border-purple-300/20 bg-[linear-gradient(135deg,rgba(124,58,237,0.96),rgba(147,51,234,0.96))] px-5 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_-16px_rgba(124,58,237,0.42)] transition hover:-translate-y-0.5 hover:bg-[linear-gradient(135deg,rgba(124,58,237,1),rgba(168,85,247,0.98))]"
              >
                Get started
              </Link>
            </div>

            {/* MOBILE MENU BUTTON */}
            <button
              aria-label="Toggle menu"
              className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/12 text-white transition active:scale-[0.98] hover:bg-white/[0.06] lg:hidden"
              onClick={() => setOpen((o) => !o)}
            >
              <div className="flex flex-col gap-1.5">
                <span
                  className={`block h-0.5 w-6 rounded-full bg-white transition-transform ${
                    open ? "translate-y-2 rotate-45" : ""
                  }`}
                />
                <span
                  className={`block h-0.5 w-4 rounded-full bg-white transition ${
                    open ? "opacity-0" : ""
                  }`}
                />
                <span
                  className={`block h-0.5 w-6 rounded-full bg-white transition-transform ${
                    open ? "-translate-y-2 -rotate-45" : ""
                  }`}
                />
              </div>
            </button>
        </div>
      </div>

      {/* MOBILE MENU */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 top-20 px-4 pb-6">
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-[var(--yb-navbar-bg)] text-white shadow-[0_18px_44px_rgba(0,0,0,0.32)] backdrop-blur-xl">
              <div className="px-6 pt-6 pb-4">
                <div className="text-xs uppercase tracking-[0.2em] text-white/60 mb-3">Navigate</div>
                <div className="flex flex-col gap-3 text-lg font-semibold">
                  <NavItem
                    href="/about"
                    active={pathname === "/about"}
                    onClick={() => setOpen(false)}
                    className="text-lg font-semibold text-white/80 hover:text-white"
                  >
                    About YourBarrio
                  </NavItem>
                </div>
              </div>

              <div className="h-px bg-white/10 mx-6" />

              <div className="px-6 py-6 flex flex-col gap-3">
                <Link
                  href="/business/login"
                  className="w-full text-center px-4 py-3 rounded-xl font-semibold bg-white/5 border border-white/15"
                  onClick={(e) => {
                    setOpen(false);
                    handlePopup(e, "/business/login");
                  }}
                >
                  Log in
                </Link>
                <Link
                  href="/business-auth/register"
                  className="w-full text-center px-4 py-3 rounded-xl font-semibold bg-[var(--color-primary)]"
                  onClick={(e) => {
                    setOpen(false);
                    handlePopup(e, "/business-auth/register");
                  }}
                >
                  Get started
                </Link>
              </div>

              <div className="px-6 pb-6 text-xs text-white/60">
                Built for neighborhood business growth.
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
