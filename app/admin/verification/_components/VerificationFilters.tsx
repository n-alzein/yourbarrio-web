"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { VerificationQueueStatus } from "@/lib/admin/businessVerification";

type VerificationFiltersProps = {
  pendingCount: number;
};

const STATUS_TABS: VerificationQueueStatus[] = ["pending", "verified", "suspended", "all"];

function normalizeStatus(value: string | null): VerificationQueueStatus {
  const status = String(value || "pending").trim().toLowerCase();
  if (
    status === "pending" ||
    status === "verified" ||
    status === "suspended" ||
    status === "all" ||
    status === "auto_verified" ||
    status === "manually_verified"
  ) {
    return status;
  }
  return "pending";
}

function statusLabel(status: VerificationQueueStatus) {
  if (status === "pending") return "Pending";
  if (status === "verified") return "Verified";
  if (status === "suspended") return "Suspended";
  if (status === "manually_verified") return "Manually verified";
  if (status === "auto_verified") return "Auto verified";
  return "All";
}

export default function VerificationFilters({ pendingCount }: VerificationFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const status = normalizeStatus(searchParams.get("status"));
  const qParam = searchParams.get("q")?.trim() || "";
  const city = searchParams.get("city")?.trim() || "";
  const isInternal = searchParams.get("is_internal")?.trim() || "";

  const [searchInput, setSearchInput] = useState(qParam);

  useEffect(() => {
    setSearchInput(qParam);
  }, [qParam]);

  const setParams = useMemo(
    () =>
      (updates: Record<string, string | null | undefined>, { clearAll = false } = {}) => {
        const next = clearAll ? new URLSearchParams() : new URLSearchParams(searchParams.toString());

        for (const [key, rawValue] of Object.entries(updates)) {
          const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;
          if (!value) {
            next.delete(key);
          } else {
            next.set(key, value);
          }
        }

        next.delete("page");
        const query = next.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (searchInput.trim() === qParam) return;
      setParams({ q: searchInput });
    }, 350);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [qParam, searchInput, setParams]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
        {STATUS_TABS.map((tab) => {
          const isActive = tab === status;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => {
                if (tab === "pending") {
                  setParams({ status: null });
                  return;
                }
                setParams({ status: tab });
              }}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                isActive
                  ? "border-neutral-600 bg-neutral-800 text-neutral-100"
                  : "border-neutral-700 bg-neutral-950 text-neutral-300 hover:border-neutral-500"
              }`}
            >
              {tab === "pending" ? `Pending (${pendingCount})` : statusLabel(tab)}
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-3 md:grid-cols-12">
        <label className="flex flex-col gap-1 text-xs text-neutral-400 md:col-span-4">
          Search
          <input
            name="q"
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
            }}
            placeholder="Business, category, city, owner email"
            className="h-10 w-full rounded border border-neutral-700 bg-neutral-950 px-3 text-sm text-neutral-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-400 md:col-span-3">
          City
          <input
            name="city"
            value={city}
            onChange={(event) => {
              setParams({ city: event.target.value });
            }}
            placeholder="Any city"
            className="h-10 w-full rounded border border-neutral-700 bg-neutral-950 px-3 text-sm text-neutral-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-400 md:col-span-3">
          Internal
          <select
            name="is_internal"
            value={isInternal}
            onChange={(event) => {
              setParams({ is_internal: event.target.value || null });
            }}
            className="h-10 w-full rounded border border-neutral-700 bg-neutral-950 px-3 text-sm text-neutral-100"
          >
            <option value="">All</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </label>
        <div className="flex h-full items-end gap-2 md:col-span-2">
          <button
            type="button"
            onClick={() => {
              setSearchInput("");
              setParams({ status: null, q: null, city: null, is_internal: null }, { clearAll: true });
            }}
            className="h-10 rounded border border-neutral-700 px-3 text-sm text-neutral-200 hover:border-neutral-500"
          >
            Clear
          </button>
        </div>
      </div>
    </>
  );
}
