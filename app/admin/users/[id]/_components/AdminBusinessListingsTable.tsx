"use client";

import SafeImage from "@/components/SafeImage";
import { resolveListingCoverImageUrl } from "@/lib/listingPhotos";
import AdminListingActionsMenu from "@/app/admin/users/[id]/_components/AdminListingActionsMenu";

export type AdminBusinessListingRow = {
  id: string;
  public_id: string | null;
  title: string | null;
  status: string;
  raw_status: string | null;
  admin_hidden: boolean;
  visibility_state: "visible" | "admin_hidden" | "internal";
  inventory_state: "in_stock" | "out_of_stock" | "unknown";
  created_at: string | null;
  updated_at: string | null;
  price: number | null;
  photo_url: string | null;
  photo_variants: unknown;
  cover_image_id: string | null;
  inventory_quantity: number | null;
  inventory_status: string | null;
  is_internal: boolean;
  is_test: boolean | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(date);
}

function formatPrice(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function visibilityBadge(row: AdminBusinessListingRow) {
  if (row.visibility_state === "admin_hidden") {
    return {
      label: "Hidden (admin)",
      className: "border-amber-800/70 bg-amber-950/50 text-amber-200",
    };
  }
  if (row.visibility_state === "internal") {
    return {
      label: "Internal/test",
      className: "border-fuchsia-800/70 bg-fuchsia-950/40 text-fuchsia-200",
    };
  }
  return {
    label: "Visible",
    className: "border-emerald-800/70 bg-emerald-950/50 text-emerald-200",
  };
}

function statusBadge(row: AdminBusinessListingRow) {
  const normalized = String(row.raw_status || row.status || "").trim().toLowerCase();
  if (normalized === "draft") {
    return {
      label: "Draft",
      className: "border-slate-700 bg-slate-900/80 text-slate-200",
    };
  }
  if (normalized === "published") {
    return {
      label: "Published",
      className: "border-sky-800/70 bg-sky-950/50 text-sky-200",
    };
  }
  return {
    label: normalized || "Unknown",
    className: "border-neutral-700 bg-neutral-900 text-neutral-200",
  };
}

function inventoryBadge(row: AdminBusinessListingRow) {
  if (row.inventory_state === "out_of_stock") {
    return {
      label: "Out of stock",
      className: "border-rose-800/70 bg-rose-950/40 text-rose-200",
    };
  }
  if (row.inventory_state === "in_stock") {
    return {
      label: "In stock",
      className: "border-emerald-800/70 bg-emerald-950/40 text-emerald-200",
    };
  }
  return {
    label: "Unknown",
    className: "border-neutral-700 bg-neutral-900 text-neutral-200",
  };
}

function inventoryDetail(row: AdminBusinessListingRow) {
  if (typeof row.inventory_quantity === "number") {
    return `${row.inventory_quantity} available`;
  }
  return row.inventory_status || "—";
}

export default function AdminBusinessListingsTable({
  rows,
  onRowUpdated,
}: {
  rows: AdminBusinessListingRow[];
  onRowUpdated: (nextRow: AdminBusinessListingRow) => void;
}) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-neutral-800 bg-neutral-950/80 text-left text-[11px] uppercase tracking-[0.16em] text-neutral-500">
              <tr>
                <th className="px-5 py-3 font-medium">Listing</th>
                <th className="px-5 py-3 font-medium">Public ID</th>
                <th className="px-5 py-3 font-medium">Price</th>
                <th className="px-5 py-3 font-medium">Visibility</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Inventory</th>
                <th className="px-5 py-3 font-medium">Updated</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const coverImageUrl = resolveListingCoverImageUrl(row);
                const visibility = visibilityBadge(row);
                const status = statusBadge(row);
                const inventory = inventoryBadge(row);
                return (
                  <tr key={row.id} className="border-b border-neutral-900 align-middle">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3.5">
                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
                          <SafeImage
                            src={coverImageUrl || "/listing-placeholder.png"}
                            alt={row.title || "Listing thumbnail"}
                            className="h-full w-full object-cover"
                            fallbackSrc="/listing-placeholder.png"
                          />
                        </div>
                        <div className="min-w-0 max-w-[22rem]">
                          <div className="line-clamp-2 text-[15px] font-medium leading-5 text-neutral-100">
                            {row.title || "Untitled listing"}
                          </div>
                          <div className="mt-1 text-xs text-neutral-500">Created {formatDate(row.created_at)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-neutral-300">{row.public_id || row.id}</td>
                    <td className="px-5 py-4 text-neutral-200">{formatPrice(row.price)}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${visibility.className}`}>
                        {visibility.label}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex w-fit rounded-md border px-2 py-0.5 text-[11px] font-medium ${inventory.className}`}>
                          {inventory.label}
                        </span>
                        <span className="text-xs text-neutral-400">{inventoryDetail(row)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-neutral-400">{formatDate(row.updated_at)}</td>
                    <td className="px-5 py-4">
                      <AdminListingActionsMenu row={row} onUpdated={onRowUpdated} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-3 md:hidden">
        {rows.map((row) => {
          const coverImageUrl = resolveListingCoverImageUrl(row);
          const visibility = visibilityBadge(row);
          const status = statusBadge(row);
          const inventory = inventoryBadge(row);
          return (
            <article key={row.id} className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
                  <SafeImage
                    src={coverImageUrl || "/listing-placeholder.png"}
                    alt={row.title || "Listing thumbnail"}
                    className="h-full w-full object-cover"
                    fallbackSrc="/listing-placeholder.png"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="line-clamp-2 text-[15px] font-medium leading-5 text-neutral-100">
                    {row.title || "Untitled listing"}
                  </h4>
                  <p className="mt-1 break-all font-mono text-xs text-neutral-400">{row.public_id || row.id}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${visibility.className}`}>
                      {visibility.label}
                    </span>
                    <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${status.className}`}>
                      {status.label}
                    </span>
                    <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${inventory.className}`}>
                      {inventory.label}
                    </span>
                  </div>
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-[110px_1fr] gap-y-2 text-sm">
                <dt className="text-neutral-500">Price</dt>
                <dd className="text-neutral-200">{formatPrice(row.price)}</dd>
                <dt className="text-neutral-500">Inventory</dt>
                <dd className="text-neutral-200">{inventoryDetail(row)}</dd>
                <dt className="text-neutral-500">Created</dt>
                <dd className="text-neutral-300">{formatDate(row.created_at)}</dd>
                <dt className="text-neutral-500">Updated</dt>
                <dd className="text-neutral-300">{formatDate(row.updated_at)}</dd>
              </dl>

              <div className="mt-4">
                <AdminListingActionsMenu row={row} onUpdated={onRowUpdated} />
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
