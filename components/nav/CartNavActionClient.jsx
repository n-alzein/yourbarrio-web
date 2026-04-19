"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ShoppingCart } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useCart } from "@/components/cart/CartProvider";

const HIDDEN_ROLES = new Set(["business", "admin", "internal"]);

export default function CartNavActionClient({ variant = "desktop", onNavigate }) {
  const { user, role, authStatus } = useAuth();
  const { itemCount } = useCart();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(id);
  }, []);

  if (!mounted) return null;
  if (authStatus === "loading" && itemCount <= 0) return null;
  if (!user && itemCount <= 0) return null;
  if (HIDDEN_ROLES.has(role || "")) return null;

  if (variant === "mobile") {
    return (
      <Link
        href="/cart"
        onClick={() => onNavigate?.()}
        className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--yb-border)] bg-white transition hover:bg-black/5"
        aria-label="View cart"
        data-safe-nav="1"
      >
        <ShoppingCart className="h-5 w-5" />
        {itemCount > 0 ? (
          <span className="absolute -top-2 -right-2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-semibold text-black">
            {itemCount}
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <Link
      href="/cart"
      className="relative text-white/90 transition-colors duration-200 ease-out hover:text-purple-400"
      aria-label="View cart"
      data-nav-guard="1"
    >
      <ShoppingCart className="h-6 w-6" />
      {itemCount > 0 ? (
        <span className="absolute -top-2 -right-2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-semibold text-black">
          {itemCount}
        </span>
      ) : null}
    </Link>
  );
}
