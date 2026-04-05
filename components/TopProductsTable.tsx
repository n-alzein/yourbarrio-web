"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import DashboardEmptyState from "@/components/DashboardEmptyState";
import type { TopProduct } from "@/lib/dashboardTypes";

type TopProductsTableProps = {
  products: TopProduct[];
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const TopProductsTable = ({ products }: TopProductsTableProps) => {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([
    { id: "revenue", desc: true },
  ]);

  const columns = useMemo<ColumnDef<TopProduct>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Product",
        cell: (info) => (
          <div>
            <p className="font-semibold text-slate-900">{info.getValue<string>()}</p>
            <p className="mt-1 text-xs text-slate-400">{info.row.original.category}</p>
          </div>
        ),
      },
      {
        accessorKey: "revenue",
        header: "Revenue",
        cell: (info) => (
          <span className="font-semibold text-slate-900">
            {formatCurrency(info.getValue<number>())}
          </span>
        ),
      },
      {
        accessorKey: "orders",
        header: "Orders",
        cell: (info) => info.getValue<number>().toLocaleString(),
      },
      {
        accessorKey: "inventoryQty",
        header: "Inventory",
        cell: (info) => {
          const value = info.getValue<number | null>();
          return value === null ? "—" : value.toLocaleString();
        },
      },
    ],
    []
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: products,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;

  return (
    <div className="dashboard-panel p-5 transition duration-200 hover:border-slate-300 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Merchandising
          </p>
          <h3 className="text-lg font-semibold text-slate-900">Top products</h3>
        </div>
        {rows.length > 0 ? (
          <Link
            href="/business/listings"
            className="dashboard-toolbar-button px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:bg-white"
          >
            View all
          </Link>
        ) : null}
      </div>
      <div className="dashboard-panel-inner mt-5 overflow-hidden">
        {rows.length === 0 ? (
          <div className="min-h-[200px] p-4">
            <DashboardEmptyState
              compact
              title="No products live yet"
              description="Add your first product to start showing inventory, revenue, and performance here."
              primaryAction={{ href: "/business/listings/new", label: "Add product" }}
              className="min-h-[168px] border-dashed bg-white"
            />
          </div>
        ) : (
          <div className="h-[300px] overflow-auto">
            <table className="dashboard-table dashboard-table--no-hover-dark w-full min-w-[520px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50/80 text-[0.66rem] uppercase tracking-[0.18em] text-slate-400/85">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="px-5 py-3.5 text-left"
                        scope="col"
                        aria-sort={
                          header.column.getIsSorted()
                            ? header.column.getIsSorted() === "desc"
                              ? "descending"
                              : "ascending"
                            : "none"
                        }
                      >
                        {header.isPlaceholder ? null : (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="flex items-center gap-1 font-semibold text-slate-400 hover:text-slate-600"
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                            <span className="text-[10px]">
                              {header.column.getIsSorted() === "desc"
                                ? "▼"
                                : header.column.getIsSorted() === "asc"
                                  ? "▲"
                                  : ""}
                            </span>
                          </button>
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-t border-slate-200 hover:bg-slate-50/60"
                    onClick={() => router.push("/business/listings")}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") router.push("/business/listings");
                    }}
                    tabIndex={0}
                    role="row"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-5 py-[1.15rem] text-slate-600">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default TopProductsTable;
