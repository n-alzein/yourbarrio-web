"use client";

import { useAuth } from "@/components/AuthProvider";
import { useState } from "react";

export default function LogoutButton({
  children,
  className = "",
  mobile,
  onSuccess,
}) {
  const { logout } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleClick(event) {
    // Prevent click-through to elements behind overlays/drawers.
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.nativeEvent?.stopImmediatePropagation?.();

    if (isSubmitting) return;
    setIsSubmitting(true);
    onSuccess?.();

    try {
      await logout();
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Logout failed", err);
      }
      setIsSubmitting(false);
      return;
    }
  }

  if (mobile) {
    return (
      <button
        onClick={handleClick}
        type="button"
        disabled={isSubmitting}
        className={`px-4 py-2 text-left text-white rounded-lg ${
          isSubmitting ? "opacity-60 cursor-not-allowed" : "hover:bg-white/10"
        }`}
      >
        {isSubmitting ? "Logging out..." : "Log out"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isSubmitting}
      className={`${className} ${isSubmitting ? "opacity-60 cursor-not-allowed" : ""}`}
    >
      {isSubmitting ? "Logging out..." : children}
    </button>
  );
}
