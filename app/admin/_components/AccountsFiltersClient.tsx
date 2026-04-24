"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AdminTableToolbar from "@/app/admin/_components/AdminTableToolbar";
import type { AdminUserRoleFilter } from "@/lib/admin/users";

type InternalFilter = "all" | "true" | "false";

type AccountsFiltersClientProps = {
  presetRole?: Exclude<AdminUserRoleFilter, "all">;
  initialRole: AdminUserRoleFilter;
  initialInternal: InternalFilter;
  initialQuery: string;
  initialPageSize: number;
};

function normalizePageSize(value: string | null, fallback: number) {
  const parsed = Number(value || "");
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

export default function AccountsFiltersClient({
  presetRole,
  initialRole,
  initialInternal,
  initialQuery,
  initialPageSize,
}: AccountsFiltersClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [queryInput, setQueryInput] = useState(initialQuery);

  const urlQuery = searchParams.get("q") || "";
  const urlRole = (searchParams.get("role") || initialRole) as AdminUserRoleFilter;
  const urlInternal = (searchParams.get("internal") || initialInternal) as InternalFilter;
  const urlPageSize = normalizePageSize(searchParams.get("pageSize"), initialPageSize);
  const effectiveRole = presetRole || urlRole;
  const internalLabel = presetRole === "business" ? "Internal/test business" : "Internal tester access";
  const searchPlaceholder =
    presetRole === "business"
      ? "Search business UUID, YB-BIZ, public ID, name, email, phone"
      : "Search ID, name, email, phone, business";

  useEffect(() => {
    setQueryInput(urlQuery);
  }, [urlQuery]);

  const updateQueryParams = useCallback(
    (updates: Record<string, string | null>, { resetPage = false }: { resetPage?: boolean } = {}) => {
      const next = new URLSearchParams(searchParams.toString());
      if (presetRole) {
        next.set("role", presetRole);
      }
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      if (resetPage) next.set("page", "1");
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, presetRole, router, searchParams]
  );

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (queryInput === urlQuery) return;
      updateQueryParams({ q: queryInput || null }, { resetPage: true });
    }, 320);

    return () => window.clearTimeout(handle);
  }, [queryInput, updateQueryParams, urlQuery]);

  const pageSizeOptions = useMemo(() => [10, 25, 50], []);

  return (
    <AdminTableToolbar
      left={
        <>
          <input
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder={searchPlaceholder}
            className="w-full min-w-[220px] flex-1 rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm sm:max-w-xl"
          />

          {!presetRole ? (
            <label className="flex items-center gap-2 rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm">
              <span className="text-neutral-400">Role:</span>
              <select
                value={effectiveRole}
                onChange={(event) =>
                  updateQueryParams({ role: event.target.value }, { resetPage: true })
                }
                className="bg-transparent text-sm outline-none"
              >
                <option value="all">All</option>
                <option value="customer">Customer</option>
                <option value="business">Business</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          ) : (
            <div className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-300">
              Role: {presetRole[0].toUpperCase() + presetRole.slice(1)}
            </div>
          )}

          <label className="flex items-center gap-2 rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm">
            <span className="text-neutral-400">{internalLabel}:</span>
            <select
              value={urlInternal}
              onChange={(event) =>
                updateQueryParams({ internal: event.target.value }, { resetPage: true })
              }
              className="bg-transparent text-sm outline-none"
            >
              <option value="all">All</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
        </>
      }
      right={
        <label className="flex items-center gap-2 rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm">
          <span className="text-neutral-400">Page size:</span>
          <select
            value={String(urlPageSize)}
            onChange={(event) =>
              updateQueryParams({ pageSize: event.target.value }, { resetPage: true })
            }
            className="bg-transparent text-sm outline-none"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={String(size)}>
                {size}
              </option>
            ))}
          </select>
        </label>
      }
    />
  );
}
