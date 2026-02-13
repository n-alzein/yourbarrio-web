"use client";

import Image from "next/image";
import Link from "next/link";

type AdminNavbarProps = {
  onOpenMobileSidebar?: () => void;
};

export default function AdminNavbar({ onOpenMobileSidebar }: AdminNavbarProps) {
  return (
    <nav className="fixed top-0 left-0 right-0 m-0 z-[5000] theme-lock pointer-events-auto yb-navbar yb-navbar-bordered yb-admin-navbar bg-neutral-950">
      <div className="relative flex h-20 w-full items-center gap-6 px-5 sm:px-6 md:px-8 lg:px-10 xl:px-14">
        <Link href="/admin" aria-label="Go to admin dashboard" className="touch-manipulation">
          <span className="relative block h-10 w-10 md:hidden">
            <Image
              src="/business-placeholder2.png"
              alt="YourBarrio"
              fill
              sizes="40px"
              priority
              className="object-contain"
            />
          </span>
          <span className="relative hidden h-10 w-10 md:block md:h-32 md:w-32">
            <Image
              src="/logo.png"
              alt="YourBarrio"
              fill
              sizes="128px"
              priority
              className="object-contain"
            />
          </span>
        </Link>

        <p className="absolute left-1/2 -translate-x-1/2 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80 md:static md:ml-auto md:translate-x-0 md:text-sm">
          ADMIN ACCOUNT
        </p>

        <button
          type="button"
          onClick={onOpenMobileSidebar}
          className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-700 bg-neutral-900 text-neutral-100 md:hidden"
          aria-label="Open admin menu"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </div>
    </nav>
  );
}
