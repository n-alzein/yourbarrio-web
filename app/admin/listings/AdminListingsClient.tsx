"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ExternalLink, X } from "lucide-react";
import CopyIdButtonClient from "@/app/admin/_components/CopyIdButtonClient";
import { formatEntityId } from "@/lib/entityIds";

type AdminListingRow = {
  id: string;
  public_id: string | null;
  title: string | null;
  business_id: string | null;
  business: {
    id: string | null;
    public_id: string | null;
    business_name: string | null;
  } | null;
  status: string;
  status_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  inventory_quantity: number | null;
  inventory_status: string | null;
  inventory_type: string | null;
  low_stock_threshold: number | null;
  inventory_last_updated_at: string | null;
  is_internal: boolean;
  is_seeded: boolean;
  related_order_count: number;
  recent_orders: Array<{
    id: string;
    order_number: string | null;
    status: string | null;
    created_at: string | null;
  }>;
};

const SEARCH_DEBOUNCE_MS = 350;

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function statusBadgeClass(status: string) {
  if (status === "active") return "border-emerald-800/70 bg-emerald-950/50 text-emerald-200";
  if (status === "hidden") return "border-amber-800/70 bg-amber-950/50 text-amber-200";
  if (status === "deleted") return "border-rose-800/70 bg-rose-950/50 text-rose-200";
  if (status === "draft") return "border-slate-700 bg-slate-900/80 text-slate-200";
  return "border-neutral-700 bg-neutral-900 text-neutral-200";
}

function inventoryLabel(row: AdminListingRow) {
  if (typeof row.inventory_quantity === "number") {
    return `${row.inventory_quantity} in stock`;
  }
  return row.inventory_status || row.inventory_type || "-";
}

function InspectorRow({
  label,
  value,
  mono = false,
  action,
  breakAll = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  action?: ReactNode;
  breakAll?: boolean;
}) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-3 py-2">
      <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">{label}</div>
      <div className="min-w-0">
        <div
          className={[
            "text-sm text-neutral-100",
            mono ? "font-mono text-[12px] text-neutral-200" : "",
            breakAll ? "break-all" : "",
          ].join(" ")}
        >
          {value}
        </div>
        {action ? <div className="mt-1">{action}</div> : null}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950">
      <div className="animate-pulse">
        <div className="grid grid-cols-7 gap-4 border-b border-neutral-800 px-4 py-3">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="h-3 rounded bg-neutral-800" />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, rowIndex) => (
          <div key={rowIndex} className="grid grid-cols-7 gap-4 border-b border-neutral-900 px-4 py-3">
            {Array.from({ length: 7 }).map((__, cellIndex) => (
              <div key={cellIndex} className="h-3 rounded bg-neutral-900" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminListingsClient({
  canModerate,
}: {
  canModerate: boolean;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [rows, setRows] = useState<AdminListingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedRowId, setSelectedRowId] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (!debouncedQuery) {
      setRows([]);
      setError("");
      setSelectedRowId("");
      return;
    }

    let active = true;
    setLoading(true);
    setError("");

    (async () => {
      try {
        const response = await fetch(
          `/api/admin/listings/search?q=${encodeURIComponent(debouncedQuery)}&limit=20`,
          { credentials: "include", cache: "no-store" }
        );
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to search listings.");
        }
        if (!active) return;
        const nextRows = Array.isArray(payload?.rows) ? payload.rows : [];
        setRows(nextRows);
        setSelectedRowId((current) =>
          current && nextRows.some((row: AdminListingRow) => row.id === current)
            ? current
            : nextRows[0]?.id || ""
        );
      } catch (fetchError: any) {
        if (!active) return;
        setRows([]);
        setSelectedRowId("");
        setError(fetchError?.message || "Failed to search listings.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [debouncedQuery]);

  const selectedRow = useMemo(
    () => rows.find((row) => row.id === selectedRowId) || null,
    [rows, selectedRowId]
  );

  async function updateVisibility(hidden: boolean) {
    if (!selectedRow) return;
    const reason = window.prompt(
      hidden ? "Reason for hiding this listing from the marketplace:" : "Reason for restoring marketplace visibility:"
    );
    if (!reason || !reason.trim()) {
      setActionError("Reason is required.");
      return;
    }
    setActionLoading(true);
    setActionError("");
    try {
      const response = await fetch(`/api/admin/listings/${selectedRow.id}/visibility`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ hidden, reason: reason.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to update listing visibility.");
      }
      const nextRow = payload?.row as AdminListingRow | null;
      if (!nextRow?.id) return;
      setRows((current) => current.map((row) => (row.id === nextRow.id ? nextRow : row)));
      setSelectedRowId(nextRow.id);
    } catch (updateError: any) {
      setActionError(updateError?.message || "Failed to update listing visibility.");
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0">
        <div className="mb-4">
          <label htmlFor="admin-listings-search" className="sr-only">
            Search listings
          </label>
          <input
            id="admin-listings-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by ID, SKU, order, title, business, UUID..."
            className="h-11 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/40"
          />
          <p className="mt-2 text-xs text-neutral-500">
            Supports 537b949ec6, YB-LST-*, YB-SKU-*, YB-ORD-*, UUIDs, listing titles, and business names.
          </p>
        </div>

        {loading ? <LoadingSkeleton /> : null}

        {!loading && error ? (
          <div className="rounded-lg border border-rose-800/70 bg-rose-950/50 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        {!loading && !error && debouncedQuery && rows.length === 0 ? (
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-10 text-center text-sm text-neutral-400">
            No listings found
          </div>
        ) : null}

        {!loading && !error && !debouncedQuery ? (
          <div className="rounded-lg border border-dashed border-neutral-800 bg-neutral-950/40 px-4 py-10 text-center text-sm text-neutral-500">
            Search and inspect listings, SKUs, and order-linked references.
          </div>
        ) : null}

        {!loading && rows.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-neutral-800 bg-neutral-950/80 text-left text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Listing</th>
                    <th className="px-4 py-3 font-medium">ID</th>
                    <th className="px-4 py-3 font-medium">SKU</th>
                    <th className="px-4 py-3 font-medium">Business</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Inventory</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const listingId = formatEntityId("listing", row.public_id) || "-";
                    const skuId = formatEntityId("sku", row.public_id) || "-";
                    const isSelected = row.id === selectedRowId;
                    return (
                      <tr
                        key={row.id}
                        className={`cursor-pointer border-b border-neutral-900 transition-colors ${
                          isSelected
                            ? "border-l-2 border-l-violet-500 bg-violet-500/8"
                            : "border-l-2 border-l-transparent hover:bg-neutral-900/80"
                        }`}
                        onClick={() => setSelectedRowId(row.id)}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-neutral-100">{row.title || "Untitled listing"}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-neutral-300">{listingId}</td>
                        <td className="px-4 py-3 font-mono text-xs text-neutral-400">{skuId}</td>
                        <td className="px-4 py-3 text-neutral-300">{row.business?.business_name || "-"}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(
                                row.status
                              )}`}
                            >
                              {row.status}
                            </span>
                            {row.is_seeded ? (
                              <span className="inline-flex rounded-md border border-neutral-700 px-2 py-0.5 text-[11px] font-medium text-neutral-300">
                                Seeded
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-neutral-300">{inventoryLabel(row)}</td>
                        <td className="px-4 py-3 text-neutral-400">{formatDate(row.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      <aside className="min-h-[18rem] xl:sticky xl:top-6 xl:self-start">
        <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950">
          <div className="flex items-start justify-between gap-3 border-b border-neutral-800 px-4 py-4">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-neutral-100">
                {selectedRow?.title || "Listing inspector"}
              </h2>
              {selectedRow ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(
                      selectedRow.status
                    )}`}
                  >
                    {selectedRow.status}
                  </span>
                  {selectedRow.is_seeded ? (
                    <span className="inline-flex rounded-md border border-neutral-700 px-2 py-0.5 text-[11px] font-medium text-neutral-300">
                      Seeded
                    </span>
                  ) : null}
                  <span className="font-mono text-xs text-neutral-400">
                    {formatEntityId("listing", selectedRow.public_id) || selectedRow.public_id || "-"}
                  </span>
                </div>
              ) : (
                <p className="mt-1 text-sm text-neutral-500">
                  Select a listing to inspect identifiers, inventory, related orders, and safe admin actions.
                </p>
              )}
            </div>
            {selectedRow ? (
              <button
                type="button"
                onClick={() => setSelectedRowId("")}
                className="rounded-md p-2 text-neutral-500 transition hover:bg-neutral-900 hover:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                aria-label="Close listing inspector"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          {!selectedRow ? (
            <div className="px-4 py-8 text-sm text-neutral-500">
              Search results stay on the left. The selected listing opens here as a compact inspector.
            </div>
          ) : (
            <div className="text-sm">
              <section className="border-b border-neutral-800 px-4 py-3">
                <div className="mb-1 text-[11px] uppercase tracking-[0.16em] text-neutral-500">Identifiers</div>
                <InspectorRow
                  label="Listing ID"
                  value={formatEntityId("listing", selectedRow.public_id) || "-"}
                  mono
                />
                <InspectorRow
                  label="SKU"
                  value={formatEntityId("sku", selectedRow.public_id) || "-"}
                  mono
                />
                <InspectorRow
                  label="public_id"
                  value={selectedRow.public_id || "-"}
                  mono
                  action={
                    selectedRow.public_id ? (
                      <CopyIdButtonClient
                        value={selectedRow.public_id}
                        className="rounded border border-neutral-700 px-2 py-1 text-[11px] text-neutral-300 transition hover:border-neutral-500"
                      />
                    ) : null
                  }
                />
                <InspectorRow
                  label="UUID"
                  value={selectedRow.id}
                  mono
                  breakAll
                  action={
                    <CopyIdButtonClient
                      value={selectedRow.id}
                      className="rounded border border-neutral-700 px-2 py-1 text-[11px] text-neutral-300 transition hover:border-neutral-500"
                    />
                  }
                />
              </section>

              <section className="border-b border-neutral-800 px-4 py-3">
                <div className="mb-1 text-[11px] uppercase tracking-[0.16em] text-neutral-500">Business</div>
                <InspectorRow label="Name" value={selectedRow.business?.business_name || "-"} />
                <InspectorRow
                  label="Admin"
                  value={
                    selectedRow.business_id ? (
                      <Link
                        href={`/admin/businesses?q=${encodeURIComponent(
                          selectedRow.business?.public_id || selectedRow.business_id
                        )}`}
                        className="inline-flex items-center gap-1 text-sm text-sky-300 transition hover:text-sky-200 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                      >
                        Open business
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    ) : (
                      "-"
                    )
                  }
                />
              </section>

              <section className="border-b border-neutral-800 px-4 py-3">
                <div className="mb-1 text-[11px] uppercase tracking-[0.16em] text-neutral-500">Inventory</div>
                <InspectorRow
                  label="Status"
                  value={
                    <span
                      className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(
                        selectedRow.status
                      )}`}
                    >
                      {selectedRow.status}
                    </span>
                  }
                />
                <InspectorRow label="Reason" value={selectedRow.status_reason || "-"} />
                <InspectorRow label="Seeded" value={selectedRow.is_seeded ? "Yes" : "No"} />
                <InspectorRow label="Quantity" value={selectedRow.inventory_quantity ?? "-"} />
                <InspectorRow
                  label="Type"
                  value={selectedRow.inventory_type || selectedRow.inventory_status || "-"}
                />
              </section>

              <section className="border-b border-neutral-800 px-4 py-3">
                <div className="mb-1 text-[11px] uppercase tracking-[0.16em] text-neutral-500">Timestamps</div>
                <InspectorRow label="Created" value={formatDate(selectedRow.created_at)} />
                <InspectorRow
                  label="Updated"
                  value={formatDate(selectedRow.updated_at || selectedRow.inventory_last_updated_at)}
                />
              </section>

              <section className="border-b border-neutral-800 px-4 py-3">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                    Related orders
                  </div>
                  <div className="text-xs text-neutral-400">{selectedRow.related_order_count}</div>
                </div>
                <div className="space-y-2">
                  {selectedRow.recent_orders.length ? (
                    selectedRow.recent_orders.map((order) => (
                      <div
                        key={order.id}
                        className="flex items-start justify-between gap-3 rounded-md border border-neutral-900 bg-neutral-950/60 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-mono text-xs text-neutral-200">
                            {formatEntityId("order", order.order_number) || order.order_number || order.id}
                          </div>
                          <div className="mt-1 text-xs text-neutral-500">{formatDate(order.created_at)}</div>
                        </div>
                        <div className="shrink-0 text-xs text-neutral-400">{order.status || "unknown"}</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-neutral-500">No related orders.</div>
                  )}
                </div>
              </section>

              <section className="px-4 py-3">
                <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-neutral-500">Actions</div>

                {actionError ? (
                  <div className="mb-3 rounded-md border border-rose-800/70 bg-rose-950/50 px-3 py-2 text-sm text-rose-100">
                    {actionError}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {selectedRow.public_id ? (
                    <Link
                      href={`/listings/${selectedRow.public_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition hover:border-neutral-500 hover:text-neutral-100"
                    >
                      View in store
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  ) : null}

                  {canModerate ? (
                    selectedRow.status !== "hidden" && selectedRow.status !== "deleted" ? (
                      <button
                        type="button"
                        onClick={() => updateVisibility(true)}
                        disabled={actionLoading}
                        className="rounded-md border border-amber-700/70 px-3 py-2 text-sm text-amber-200 transition hover:border-amber-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40 disabled:opacity-60"
                      >
                        {actionLoading ? "Updating..." : "Hide listing"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => updateVisibility(false)}
                        disabled={actionLoading}
                        className="rounded-md border border-emerald-700/70 px-3 py-2 text-sm text-emerald-200 transition hover:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40 disabled:opacity-60"
                      >
                        {actionLoading ? "Updating..." : "Unhide listing"}
                      </button>
                    )
                  ) : (
                    <div className="text-sm text-neutral-500">
                      Your admin role can view listing context but cannot change listing visibility.
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
