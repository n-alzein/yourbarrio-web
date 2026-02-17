"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useModal } from "./modals/ModalProvider";
import { useAuth } from "./AuthProvider";

export default function Footer({ className = "" }) {
  const pathname = usePathname();
  const { openModal } = useModal();
  const { user, profile, role } = useAuth();
  const isAdminRoute = pathname?.startsWith("/admin");
  const isBusinessAppRoute = pathname?.startsWith("/business/");

  const resolvedRole = role || user?.app_metadata?.role || profile?.role;
  const aboutHref =
    resolvedRole === "business"
      ? "/about"
      : user || profile
        ? "/customer/about"
        : "/about";

  return (
    <footer
      className={`py-10 theme-lock w-full ${
        isBusinessAppRoute
          ? "bg-slate-950 border-t border-white/10 text-slate-200"
          : "bg-white border-t border-slate-200"
      } ${
        className || (isAdminRoute ? "mt-0" : "mt-20")
      }`}
    >
      <div className="w-full px-5 sm:px-6 md:px-8 lg:px-12">
        <div
          className={`max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-10 ${
            isBusinessAppRoute ? "text-slate-200" : "text-slate-700"
          }`}
        >

          {/* BRAND COLUMN */}
          <div>
            {/* 🔥 YourBarrio title now acts as a link */}
            <Link
              href="/"
              className={`text-xl font-bold ${
                isBusinessAppRoute
                  ? "text-white hover:text-slate-200"
                  : "text-indigo-600 hover:text-indigo-700"
              }`}
            >
              YourBarrio
            </Link>

            <p className={`mt-2 ${isBusinessAppRoute ? "text-slate-300" : "text-slate-500"}`}>
              Discover your neighborhood like never before.
            </p>

            {/* Business home link */}
            <div className="mt-4">
              <Link
                href="/business"
                className={isBusinessAppRoute ? "hover:text-white" : "hover:text-indigo-600"}
              >
                YourBarrio for Business
              </Link>
            </div>
          </div>

          {/* NAVIGATION COLUMN */}
          <div>
            <h4 className="text-lg font-semibold">Navigation</h4>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href={aboutHref} className={isBusinessAppRoute ? "hover:text-white" : "hover:text-indigo-600"}>About</Link>
              </li>
              <li>
                <Link href="/privacy" className={isBusinessAppRoute ? "hover:text-white" : "hover:text-indigo-600"}>Privacy</Link>
              </li>
              <li>
                <Link href="/terms" className={isBusinessAppRoute ? "hover:text-white" : "hover:text-indigo-600"}>Terms</Link>
              </li>
            </ul>
          </div>

          {/* CONTACT COLUMN */}
          <div>
            <h4 className="text-lg font-semibold">Contact</h4>
            <ul className="mt-3 space-y-2">
              <li>support@yourbarrio.com</li>
              <li>Long Beach, CA</li>
            </ul>
          </div>
        </div>
        <div className={`text-center mt-10 ${isBusinessAppRoute ? "text-slate-400" : "text-slate-500"}`}>
          © {new Date().getFullYear()} YourBarrio — All rights reserved.
        </div>
      </div>
    </footer>
  );
}
