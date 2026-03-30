"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";

export default function Footer({ className = "" }) {
  const pathname = usePathname();
  const { user, profile, role } = useAuth();
  const isAdminRoute = pathname?.startsWith("/admin");

  const resolvedRole = role || user?.app_metadata?.role || profile?.role;
  const aboutHref =
    resolvedRole === "business"
      ? "/about"
      : user || profile
        ? "/customer/about"
        : "/about";
  const footerLinkClass =
    "inline-flex w-fit text-[0.95rem] text-slate-300/88 transition-colors duration-200 ease-out hover:text-[#cbb6ff] focus-visible:text-[#cbb6ff] focus-visible:outline-none";
  const footerHeadingClass =
    "text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-slate-300/78";

  return (
    <footer
      className={`theme-lock relative w-full overflow-hidden border-t border-white/8 bg-[#171920] py-12 text-white sm:py-14 ${
        className || (isAdminRoute ? "mt-0" : "mt-20")
      }`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#8b5cf6]/28 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-white/[0.035] to-transparent" />
      <div className="w-full px-5 sm:px-6 md:px-8 lg:px-12">
        <div
          className="mx-auto grid max-w-[1180px] grid-cols-1 gap-12 text-slate-300 md:grid-cols-[minmax(0,1.15fr)_0.72fr_0.72fr] md:gap-8 lg:gap-12"
        >
          {/* BRAND COLUMN */}
          <div className="max-w-[19rem]">
            <Link
              href="/"
              className="group inline-flex items-center gap-3 text-white transition-colors duration-200 ease-out hover:text-white"
            >
              <span className="flex h-9 w-9 items-center justify-center overflow-hidden">
                <Image
                  src="/YBpin.png"
                  alt="YourBarrio logo"
                  width={36}
                  height={36}
                  className="h-full w-full object-contain"
                />
              </span>
              <span className="pt-0.5 text-[1.65rem] font-semibold tracking-[-0.025em] text-slate-50">
                YourBarrio
              </span>
            </Link>

            <p className="mt-4 max-w-[15.5rem] text-[0.95rem] leading-6 text-slate-400">
              Discover great local businesses around you.
            </p>

            <div className="mt-6">
              <Link
                href="/business"
                prefetch={false}
                className="inline-flex w-fit items-center gap-2 rounded-full border border-[#8b5cf6]/22 bg-[#8b5cf6]/[0.045] px-4 py-2.5 text-sm font-medium text-slate-100 transition-all duration-200 ease-out hover:border-[#8b5cf6]/38 hover:bg-[#8b5cf6]/[0.08] hover:text-[#ede9fe] focus-visible:border-[#8b5cf6]/45 focus-visible:bg-[#8b5cf6]/[0.09] focus-visible:text-[#ede9fe] focus-visible:outline-none"
              >
                YourBarrio for Business
              </Link>
            </div>
          </div>

          {/* COMPANY COLUMN */}
          <div className="md:pt-2">
            <h4 className={footerHeadingClass}>Company</h4>
            <ul className="mt-5 space-y-3.5">
              <li>
                <Link href={aboutHref} className={footerLinkClass}>
                  About
                </Link>
              </li>
              <li>
                <Link href="/privacy" className={footerLinkClass}>
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/terms" className={footerLinkClass}>
                  Terms
                </Link>
              </li>
            </ul>
          </div>

          {/* CONTACT COLUMN */}
          <div className="md:pt-2">
            <h4 className={footerHeadingClass}>Contact</h4>
            <ul className="mt-5 space-y-3.5 text-[0.95rem] leading-6 text-slate-400">
              <li>
                <a
                  href="mailto:support@yourbarrio.com"
                  className="inline-flex w-fit transition-colors duration-200 ease-out hover:text-[#cbb6ff] focus-visible:text-[#cbb6ff] focus-visible:outline-none"
                >
                  support@yourbarrio.com
                </a>
              </li>
              <li className="text-slate-400/92">
                Long Beach, CA
              </li>
            </ul>
          </div>
        </div>

        <div className="mx-auto mt-14 max-w-[1180px] border-t border-white/8 pt-7 sm:mt-16 sm:pt-8">
          <div className="flex flex-col gap-3 text-xs tracking-[0.08em] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-left">
              © {new Date().getFullYear()} YourBarrio. All rights reserved.
            </div>
            <div className="hidden text-[0.7rem] uppercase tracking-[0.24em] text-slate-600 sm:block">
              Local discovery, refined
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
