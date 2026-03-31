"use client";

import BusinessAuthPopupLink from "@/components/business/BusinessAuthPopupLink";
import { useModal } from "@/components/modals/ModalProviderClient";

export default function BusinessHeroHeaderActions() {
  const { openModal } = useModal();

  return (
    <div className="ml-auto flex items-center gap-4">
      <button
        type="button"
        onClick={() => openModal("business-login")}
        className="inline-flex h-11 items-center justify-center rounded-full px-3 text-sm font-medium transition-colors hover:opacity-100"
        style={{ color: "#FFFFFF" }}
      >
        Log in
      </button>
      <BusinessAuthPopupLink
        href="/business-auth/register"
        className="inline-flex h-11 items-center justify-center rounded-full bg-[linear-gradient(135deg,#7C3AED,#6D28D9)] px-5 text-sm font-semibold transition hover:bg-[linear-gradient(135deg,#8753f0,#7c3aed)]"
        style={{ color: "#FFFFFF" }}
      >
        Get started
      </BusinessAuthPopupLink>
    </div>
  );
}
