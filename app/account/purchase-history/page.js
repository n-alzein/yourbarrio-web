import Link from "next/link";
import AccountNavTabs from "@/components/account/AccountNavTabs";
import { requireRole } from "@/lib/auth/server";
import {
  DEFAULT_PURCHASE_HISTORY_LIMIT,
  fetchPurchaseHistoryOrders,
  parsePurchaseHistoryPagination,
} from "@/lib/orders/purchaseHistory";
import { getSupportAwareClient } from "@/lib/support/supportAwareData";
import PurchaseHistoryList from "./PurchaseHistoryList";
import PurchaseHistoryPagination from "./PurchaseHistoryPagination";

export default async function PurchaseHistoryPage({ searchParams }) {
  await requireRole("customer");
  const { client, effectiveUserId } = await getSupportAwareClient({
    expectedRole: "customer",
    feature: "purchase-history",
  });
  const resolvedParams =
    searchParams && typeof searchParams.then === "function"
      ? await searchParams
      : searchParams;
  const { page, limit } = parsePurchaseHistoryPagination({
    page: resolvedParams?.page,
    limit: resolvedParams?.limit || DEFAULT_PURCHASE_HISTORY_LIMIT,
  });

  let currentPage = page;
  let result = await fetchPurchaseHistoryOrders({
    client,
    userId: effectiveUserId,
    page: currentPage,
    limit,
  });

  if (!result.error && result.total_pages > 0 && currentPage > result.total_pages) {
    currentPage = result.total_pages;
    result = await fetchPurchaseHistoryOrders({
      client,
      userId: effectiveUserId,
      page: currentPage,
      limit,
    });
  }

  const visibleRows = result.orders;
  const error = result.error;

  return (
    <div className="min-h-screen -mt-16 px-4 pb-12 md:-mt-10 md:px-8 lg:px-12" style={{ background: "var(--background)", color: "var(--text)" }}>
      <div className="mx-auto max-w-5xl space-y-7">
        <div className="space-y-2.5">
          <p className="text-xs uppercase tracking-[0.2em] opacity-70">Orders</p>
          <h1 className="text-3xl font-semibold">Purchase History</h1>
          <p className="text-sm opacity-70">
            Review completed orders in a cleaner running history.
          </p>
        </div>

        <AccountNavTabs active="history" variant="history" />

        <div id="purchase-history-list" className="scroll-mt-6">
          {error ? (
            <div className="rounded-2xl p-4 text-sm text-rose-200" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              {error.message || "Failed to load orders."}
            </div>
          ) : null}

          {!error && visibleRows.length === 0 ? (
            <div className="rounded-3xl p-8 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <h2 className="text-xl font-semibold">No completed purchases yet</h2>
              <p className="mt-2 text-sm opacity-80">Your fulfilled orders will appear here.</p>
              <Link
                href="/customer/home"
                className="mt-5 inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-semibold"
                style={{ background: "var(--text)", color: "var(--background)" }}
              >
                Browse marketplace
              </Link>
            </div>
          ) : null}

          {!error && visibleRows.length > 0 ? (
            <PurchaseHistoryList orders={visibleRows} />
          ) : null}
        </div>

        {!error ? (
          <PurchaseHistoryPagination
            currentPage={currentPage}
            totalPages={result.total_pages}
          />
        ) : null}
      </div>
    </div>
  );
}
