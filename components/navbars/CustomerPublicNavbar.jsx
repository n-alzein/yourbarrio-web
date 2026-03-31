"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { useModal } from "../modals/ModalProvider";
import { useAuth } from "@/components/AuthProvider";
import MobileSidebarDrawer from "@/components/nav/MobileSidebarDrawer";

function NavItem({ href, children, active, onClick, className, ...rest }) {
  return (
    <Link
      href={href}
      prefetch={href === "/business" ? false : undefined}
      className={`relative text-sm md:text-base font-medium transition-all ${
        active ? "text-white" : "text-white/70 hover:text-white"
      } ${className || ""}`}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      {...rest}
    >
      {children}
    </Link>
  );
}

export default function CustomerPublicNavbar() {
  const pathname = usePathname();
  const { openModal } = useModal();
  const [open, setOpen] = useState(false);
  const { authStatus } = useAuth();
  const hasSession = authStatus === "authenticated";
  const mobileDrawerId = useId();

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia("(min-width: 768px)");
    const handleChange = () => {
      if (media.matches) setOpen(false);
    };
    handleChange();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    }
    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, []);

  return (
    <nav
      className="fixed top-0 inset-x-0 z-50 theme-lock yb-navbar yb-navbar-bordered"
      data-public-nav
      data-customer-public-navbar="1"
    >
      <div>
        <div className="w-full px-5 sm:px-6 md:px-8 lg:px-12 xl:px-14">
          <div className="h-20 flex items-center justify-between">
            {/* MOBILE MENU BUTTON */}
            <button
              aria-label="Toggle menu"
              className="md:hidden h-11 w-11 rounded-xl border border-white/15 bg-white/5 text-white flex items-center justify-center active:scale-[0.98] transition mr-2"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls={mobileDrawerId}
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
            {/* LEFT SIDE */}
            <div className="flex items-center gap-x-10">
              <Link href="/" className="select-none">
                <span className="relative block h-10 w-10 md:hidden">
                  <Image
                    src="/business-placeholder2.png"
                    alt="YourBarrio Logo"
                    fill
                    sizes="40px"
                    priority
                    className="object-contain"
                  />
                </span>
                <span className="relative hidden h-10 w-10 md:block md:h-32 md:w-32">
                  <Image
                    src="/logo.png"
                    alt="YourBarrio Logo"
                    fill
                    sizes="128px"
                    priority
                    className="object-contain"
                  />
                </span>
              </Link>

              <div className="hidden md:flex items-center gap-x-8">
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
            <div className="hidden md:flex items-center gap-x-6">
              <Link
                href="/business"
                prefetch={false}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white/90 border border-white/20 hover:bg-white/10 transition"
              >
                For Business
              </Link>

              {hasSession ? (
                <Link
                  href="/customer/home"
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white/90 border border-white/20 hover:bg-white/10 transition"
                >
                  My account
                </Link>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => openModal("customer-login")}
                    className="relative text-sm md:text-base font-medium text-gray-300 transition-colors duration-200 ease-out hover:text-purple-400"
                  >
                    Log in
                  </button>

                  <button
                    type="button"
                    onClick={() => openModal("customer-signup")}
                    className="rounded-xl border border-purple-300/20 bg-[linear-gradient(135deg,rgba(124,58,237,0.92),rgba(147,51,234,0.92))] px-5 py-2 text-sm font-semibold text-white shadow-[0_6px_18px_rgba(124,58,237,0.18)] transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-[linear-gradient(135deg,rgba(124,58,237,1),rgba(168,85,247,0.98))] hover:shadow-[0_10px_22px_rgba(124,58,237,0.22)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-300/20 active:translate-y-0"
                  >
                    Sign Up
                  </button>
                </>
              )}
            </div>

          </div>
        </div>
      </div>

      <MobileSidebarDrawer
        open={open}
        onClose={() => setOpen(false)}
        title="Explore"
        id={mobileDrawerId}
        footer={
          <div className="text-xs text-white/60">
            Trusted community for local businesses and neighbors.
          </div>
        }
      >
        <div className="flex flex-col gap-5 text-white">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-white/60 mb-3">Navigate</div>
            <div className="flex flex-col gap-3 text-lg font-semibold">
              <NavItem
                href="/about"
                active={pathname === "/about"}
                onClick={() => setOpen(false)}
                className="text-lg font-semibold"
              >
                About YourBarrio
              </NavItem>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Link
              href="/business"
              prefetch={false}
              className="w-full text-center px-4 py-3 rounded-xl font-semibold bg-white/5 border border-white/15"
              onClick={() => setOpen(false)}
            >
              For Business
            </Link>
            {hasSession ? (
              <Link
                href="/customer/home"
                className="w-full text-center px-4 py-3 rounded-xl font-semibold bg-white/5 border border-white/15"
                onClick={() => setOpen(false)}
              >
                My account
              </Link>
            ) : (
              <>
                <button
                  type="button"
                  className="w-full text-center px-4 py-3 rounded-xl font-semibold bg-white/5 border border-white/15"
                  onClick={() => {
                    setOpen(false);
                    openModal("customer-login");
                  }}
                >
                  Log in
                </button>
                <button
                  type="button"
                  className="w-full rounded-xl border border-purple-300/20 bg-[linear-gradient(135deg,rgba(124,58,237,0.92),rgba(147,51,234,0.92))] px-4 py-3 text-center font-semibold text-white shadow-[0_6px_18px_rgba(124,58,237,0.18)] transition duration-200 ease-out hover:bg-[linear-gradient(135deg,rgba(124,58,237,1),rgba(168,85,247,0.98))] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-300/20"
                  onClick={() => {
                    setOpen(false);
                    openModal("customer-signup");
                  }}
                >
                  Sign Up
                </button>
              </>
            )}
          </div>
        </div>
      </MobileSidebarDrawer>
    </nav>
  );
}
