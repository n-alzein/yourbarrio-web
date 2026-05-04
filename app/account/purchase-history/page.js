import AccountNavTabs from "@/components/account/AccountNavTabs";
import CustomerAccountShell from "@/components/customer/CustomerAccountShell";
import OrderEmptyState from "@/app/account/OrderEmptyState";
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
    <div className="min-h-screen bg-[#f6f7fb] pb-12 text-slate-950">
      <CustomerAccountShell className="space-y-7">
        <div className="space-y-2.5">
          <p className="text-xs uppercase tracking-[0.2em] opacity-70">Orders</p>
          <h1 className="text-3xl font-semibold">Purchase History</h1>
          <p className="text-sm opacity-70">
            Review completed, cancelled, and fulfilled paid orders.
          </p>
        </div>

        <AccountNavTabs active="history" variant="history" />

        <div id="purchase-history-list" className="scroll-mt-6 pt-4">
          {error ? (
            <div className="rounded-2xl p-4 text-sm text-rose-200" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              {error.message || "Failed to load orders."}
            </div>
          ) : null}

          {!error && visibleRows.length === 0 ? (
            <OrderEmptyState
              icon="history"
              title="No order history yet."
              description="Completed and closed paid orders will appear here."
              ctaLabel="Browse marketplace"
            />
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
      </CustomerAccountShell>
    </div>
  );
}
