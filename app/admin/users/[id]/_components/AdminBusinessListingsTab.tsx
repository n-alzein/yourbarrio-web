"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import AdminBusinessListingsTable, {
  type AdminBusinessListingRow,
} from "@/app/admin/users/[id]/_components/AdminBusinessListingsTable";

type AdminBusinessListingsTabProps = {
  businessOwnerUserId: string;
  initialRows: AdminBusinessListingRow[];
  initialTotalCount: number;
  initialPage: number;
  initialPageSize: number;
  initialError?: string;
};

function LoadingSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950">
      <div className="animate-pulse">
        <div className="grid grid-cols-7 gap-4 border-b border-neutral-800 px-4 py-3">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="h-3 rounded bg-neutral-800" />
          ))}
        </div>
        {Array.from({ length: 4 }).map((_, rowIndex) => (
          <div key={rowIndex} className="grid grid-cols-7 gap-4 border-b border-neutral-900 px-4 py-5">
            {Array.from({ length: 7 }).map((__, cellIndex) => (
              <div key={cellIndex} className="h-3 rounded bg-neutral-900" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminBusinessListingsTab({
  businessOwnerUserId,
  initialRows,
  initialTotalCount,
  initialPage,
  initialPageSize,
  initialError,
}: AdminBusinessListingsTabProps) {
  const [rows, setRows] = useState(initialRows);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [page, setPage] = useState(initialPage);
  const [pageSize] = useState(initialPageSize);
  const [error, setError] = useState(initialError || "");
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [visibility, setVisibility] = useState("all");
  const [internal, setInternal] = useState("all");
  const [inventory, setInventory] = useState("all");
  const firstLoadRef = useRef(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [query]);

  async function loadRows(nextPage = page) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        page_size: String(pageSize),
        status,
        visibility,
        internal,
        inventory,
      });
      if (debouncedQuery) {
        params.set("q", debouncedQuery);
      }

      const response = await fetch(
        `/api/admin/businesses/${businessOwnerUserId}/listings?${params.toString()}`,
        {
          credentials: "include",
          cache: "no-store",
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load listings.");
      }
      setRows(Array.isArray(payload?.rows) ? payload.rows : []);
      setTotalCount(Number(payload?.totalCount || 0));
      setPage(Number(payload?.page || nextPage));
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "Failed to load listings.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (firstLoadRef.current) {
      firstLoadRef.current = false;
      return;
    }
    void loadRows(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedQuery, status, visibility, internal, inventory]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <section className="space-y-5" data-testid="admin-business-listings-tab">
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="font-medium text-neutral-100">Listings</h3>
            <p className="mt-1 text-sm text-neutral-400">
              Listings linked through <code className="rounded bg-neutral-950 px-1 py-0.5 text-xs">listings.business_id = businesses.owner_user_id</code>.
              Moderation uses admin-only flags and does not rewrite business-controlled publish state.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadRows(page)}
            disabled={loading}
            className="rounded border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-500 disabled:opacity-60"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="block text-sm text-neutral-200 xl:col-span-2">
            Search
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title or public ID"
              className="mt-1 h-11 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
            />
          </label>

          <FilterSelect
            label="Status"
            value={status}
            onChange={(next) => {
              setStatus(next);
              setPage(1);
            }}
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </FilterSelect>

          <FilterSelect
            label="Visibility"
            value={visibility}
            onChange={(next) => {
              setVisibility(next);
              setPage(1);
            }}
          >
            <option value="all">All visibility</option>
            <option value="visible">Visible</option>
            <option value="admin_hidden">Hidden (admin)</option>
          </FilterSelect>

          <FilterSelect
            label="Internal/Test"
            value={internal}
            onChange={(next) => {
              setInternal(next);
              setPage(1);
            }}
          >
            <option value="all">All listings</option>
            <option value="internal">Internal/test only</option>
            <option value="external">Exclude internal/test</option>
          </FilterSelect>

          <FilterSelect
            label="Inventory"
            value={inventory}
            onChange={(next) => {
              setInventory(next);
              setPage(1);
            }}
          >
            <option value="all">All inventory</option>
            <option value="in_stock">In stock</option>
            <option value="out_of_stock">Out of stock</option>
          </FilterSelect>
        </div>
      </div>

      {loading ? <LoadingSkeleton /> : null}

      {!loading && error ? (
        <div className="rounded-lg border border-rose-800/70 bg-rose-950/50 p-4 text-sm text-rose-100">
          <div>{error}</div>
          <button
            type="button"
            onClick={() => void loadRows(page)}
            className="mt-3 rounded border border-rose-700/70 px-3 py-1.5 text-sm text-rose-100 hover:border-rose-500"
          >
            Retry
          </button>
        </div>
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <div
          className="rounded-lg border border-dashed border-neutral-800 bg-neutral-950/40 px-4 py-10 text-center text-sm text-neutral-400"
          data-testid="admin-business-listings-empty"
        >
          This business has no listings yet.
        </div>
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <>
          <AdminBusinessListingsTable
            rows={rows}
            onRowUpdated={(nextRow) =>
              setRows((current) => current.map((row) => (row.id === nextRow.id ? nextRow : row)))
            }
          />

          <div className="flex flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-300 sm:flex-row sm:items-center sm:justify-between">
            <div>
              Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, totalCount)} of {totalCount}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || loading}
                className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:border-neutral-500 disabled:opacity-60"
              >
                Previous
              </button>
              <span className="text-neutral-400">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages || loading}
                className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:border-neutral-500 disabled:opacity-60"
              >
                Next
              </button>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm text-neutral-200">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-11 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
      >
        {children}
      </select>
    </label>
  );
}
