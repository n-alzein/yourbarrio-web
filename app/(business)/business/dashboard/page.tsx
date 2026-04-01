"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, PackagePlus, ShoppingBag } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import DateRangeControls from "@/components/DateRangeControls";
import TopProductsTable from "@/components/TopProductsTable";
import RecentOrders from "@/components/RecentOrders";
import type {
  DashboardData,
  DashboardFilters,
  DateRangeKey,
  TimeSeriesPoint,
} from "@/lib/dashboardTypes";

const SalesOverTimeChart = dynamic(
  () => import("@/components/Charts/SalesOverTimeChart"),
  {
    ssr: false,
    loading: () => <PanelSkeleton className="h-[320px]" />,
  }
);
const ProfileViewsChart = dynamic(
  () => import("@/components/Charts/ProfileViewsChart"),
  {
    ssr: false,
    loading: () => <PanelSkeleton className="h-[320px]" />,
  }
);

type DashboardStatus = "loading" | "ready" | "error";

const DEFAULT_FILTERS: DashboardFilters = {
  categories: [],
};

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

const resolveDateRange = (range: DateRangeKey) => {
  const today = new Date();
  const start = new Date(today);
  if (range === "7d") {
    start.setDate(today.getDate() - 6);
  } else if (range === "30d") {
    start.setDate(today.getDate() - 29);
  }
  return { from: formatDate(start), to: formatDate(today) };
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const formatNumber = (value: number) => new Intl.NumberFormat("en-US").format(value);

const sumSeries = (series: TimeSeriesPoint[]) =>
  series.reduce((total, point) => total + Number(point.value || 0), 0);

const countNonZeroPoints = (series: TimeSeriesPoint[]) =>
  series.filter((point) => Number(point.value || 0) > 0).length;

const hasMeaningfulSeries = (series: TimeSeriesPoint[]) => {
  const nonZeroPoints = countNonZeroPoints(series);
  const total = sumSeries(series);
  return nonZeroPoints >= 3 || (nonZeroPoints >= 2 && total >= 10);
};

const rangeCopy: Record<DateRangeKey, string> = {
  today: "today",
  "7d": "last 7 days",
  "30d": "last 30 days",
  custom: "selected range",
};

const DashboardErrorState = ({ onRetry }: { onRetry: () => void }) => (
  <div className="flex min-h-[300px] flex-col items-center justify-center rounded-[28px] border border-dashed border-rose-200 bg-rose-50 p-10 text-center">
    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-500">
      Something went wrong
    </p>
    <h3 className="mt-3 text-2xl font-semibold text-rose-900">
      We could not load your dashboard
    </h3>
    <p className="mt-2 max-w-md text-sm text-rose-700">
      Retry and we&apos;ll pull your latest business activity again.
    </p>
    <button
      type="button"
      onClick={onRetry}
      className="mt-4 rounded-full bg-rose-600 px-4 py-2 text-xs font-semibold text-white"
    >
      Retry
    </button>
  </div>
);

function PanelSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)] sm:p-6 ${className}`}
    >
      <div className="h-3 w-24 animate-pulse rounded-full bg-slate-200" />
      <div className="mt-3 h-8 w-40 animate-pulse rounded-full bg-slate-100" />
      <div className="mt-5 h-32 animate-pulse rounded-[20px] bg-slate-100" />
    </div>
  );
}

function QuickActionCard({
  href,
  title,
  detail,
  icon,
}: {
  href: string;
  title: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-4 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)] transition duration-200 hover:-translate-y-0.5 hover:border-slate-300/80 hover:shadow-[0_18px_36px_rgba(15,23,42,0.1)]"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="truncate text-sm text-slate-500">{detail}</p>
        </div>
      </div>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400 transition duration-200 group-hover:text-slate-700" />
    </Link>
  );
}

function InsightCard({
  label,
  value,
  helper,
  action,
}: {
  label: string;
  value: string;
  helper: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex h-full flex-col justify-between rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)] transition duration-200 hover:-translate-y-0.5 hover:border-slate-300/80 hover:shadow-[0_18px_36px_rgba(15,23,42,0.1)] sm:p-6">
      <div>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
          {label}
        </p>
        <p className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950">{value}</p>
        <p className="mt-3 text-sm text-slate-500/85">{helper}</p>
      </div>
      {action ? (
        <Link
          href={action.href}
          className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#6d28d9] transition duration-200 hover:text-[#5b21b6]"
        >
          {action.label}
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}

function DashboardLoadingState() {
  return (
    <div className="space-y-6">
      <PanelSkeleton className="h-[220px]" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <PanelSkeleton className="h-[92px]" />
        <PanelSkeleton className="h-[92px]" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <PanelSkeleton className="h-[174px]" />
        <PanelSkeleton className="h-[174px]" />
        <PanelSkeleton className="h-[174px]" />
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <PanelSkeleton className="h-[360px]" />
        <PanelSkeleton className="h-[360px]" />
      </div>
    </div>
  );
}

const DashboardPage = () => {
  const [status, setStatus] = useState<DashboardStatus>("loading");
  const [data, setData] = useState<DashboardData | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRangeKey>("30d");
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const loadDashboard = async () => {
      setStatus("loading");
      const { from, to } = resolveDateRange(dateRange);
      const query = new URLSearchParams({
        from,
        to,
        compare: "none",
      });
      if (filters.categories.length > 0) {
        query.set("categories", filters.categories.join(","));
      }
      try {
        const response = await fetch(`/api/business/dashboard?${query.toString()}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`dashboard_fetch_failed:${response.status}`);
        }
        const payload = (await response.json()) as DashboardData;
        setData(payload);
        setCategories(payload.categories ?? []);
        setStatus("ready");
      } catch (err) {
        console.error("Dashboard load failed", err);
        setStatus("error");
      }
    };
    loadDashboard();
  }, [dateRange, filters, reloadKey]);

  const dashboardState = useMemo(() => {
    if (!data) return null;

    const totalSales = sumSeries(data.salesTimeSeries);
    const totalViews = typeof data.viewCount === "number" ? data.viewCount : sumSeries(data.profileViewsTimeSeries);
    const totalOrders = data.orderCount ?? data.recentOrders.length;
    const listingCount = data.listingCount ?? 0;

    const salesHasChart = hasMeaningfulSeries(data.salesTimeSeries);
    const viewsHasChart = hasMeaningfulSeries(data.profileViewsTimeSeries);

    const setupItems = [
      { id: "profile", label: "Profile complete", complete: Boolean(data.businessName) },
      { id: "product", label: "First product", complete: listingCount > 0 },
      { id: "storefront", label: "Storefront ready", complete: Boolean(data.businessName) },
    ];

    const quickActions = [
      {
        href: "/business/listings/new",
        title: listingCount > 0 ? "Manage products" : "Add first product",
        detail:
          listingCount > 0
            ? `${formatNumber(listingCount)} ${listingCount === 1 ? "product" : "products"} ready`
            : "Start with one clear offer",
        icon: <PackagePlus className="h-4 w-4" />,
      },
      {
        href: "/business/orders",
        title: "Orders",
        detail:
          totalOrders > 0
            ? `${formatNumber(totalOrders)} ${totalOrders === 1 ? "order" : "orders"} in ${rangeCopy[dateRange]}`
            : "Stay ready for first purchase",
        icon: <ShoppingBag className="h-4 w-4" />,
      },
    ];

    const kpiCards = [
      {
        label: "Sales",
        value: formatCurrency(totalSales),
        helper:
          totalSales > 0
            ? `Revenue across ${rangeCopy[dateRange]}`
            : "Add a product to start selling",
        action: totalSales > 0
          ? { href: "/business/orders", label: "Review orders" }
          : { href: "/business/listings/new", label: "Add product" },
      },
      {
        label: "Views",
        value: formatNumber(totalViews),
        helper:
          totalViews > 0
            ? `Storefront visits in ${rangeCopy[dateRange]}`
            : "Share your storefront",
        action: { href: "/business/preview", label: "View storefront" },
      },
      {
        label: "Orders",
        value: formatNumber(totalOrders),
        helper:
          totalOrders > 0
            ? `New purchases in ${rangeCopy[dateRange]}`
            : "Orders will appear here once customers purchase",
        action: totalOrders > 0
          ? { href: "/business/orders", label: "Open orders" }
          : { href: "/business/profile", label: "Edit profile" },
      },
    ];

    return {
      setupItems,
      quickActions,
      kpiCards,
      salesHasChart,
      viewsHasChart,
      totalSales,
      totalViews,
    };
  }, [data, dateRange]);

  return (
    <main
      className="business-theme min-h-screen -mt-8 px-4 pb-20 pt-10 sm:px-6 md:-mt-10"
      style={{
        backgroundImage:
          "radial-gradient(circle at 10% 10%, var(--glow-1), transparent 55%), radial-gradient(circle at 80% 0%, var(--glow-2), transparent 50%)",
      }}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        {status === "loading" ? (
          <DashboardLoadingState />
        ) : null}

        {status === "error" ? (
          <DashboardErrorState onRetry={() => setReloadKey((prev) => prev + 1)} />
        ) : null}

            {status === "ready" && data && dashboardState ? (
          <>
            <DateRangeControls
              dateRange={dateRange}
              filters={filters}
              categories={categories}
              businessName={data.businessName}
              businessAvatarUrl={data.businessAvatarUrl}
              lastUpdated={data.lastUpdated ?? "Just now"}
              setupItems={dashboardState.setupItems}
              onDateRangeChange={setDateRange}
              onFiltersChange={setFilters}
            />

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {dashboardState.quickActions.map((action) => (
                <QuickActionCard
                  key={action.title}
                  href={action.href}
                  title={action.title}
                  detail={action.detail}
                  icon={action.icon}
                />
              ))}
            </section>

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {dashboardState.kpiCards.map((card) => (
                <InsightCard
                  key={card.label}
                  label={card.label}
                  value={card.value}
                  helper={card.helper}
                  action={card.action}
                />
              ))}
            </section>

            {dashboardState.salesHasChart || dashboardState.viewsHasChart ? (
              <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="min-w-0">
                  {dashboardState.salesHasChart ? (
                    <SalesOverTimeChart data={data.salesTimeSeries} />
                  ) : (
                    <InsightCard
                      label="Sales pulse"
                      value={formatCurrency(dashboardState.totalSales)}
                      helper="More sales activity will unlock the trend view."
                      action={{ href: "/business/listings/new", label: "Add product" }}
                    />
                  )}
                </div>
                <div className="min-w-0">
                  {dashboardState.viewsHasChart ? (
                    <ProfileViewsChart data={data.profileViewsTimeSeries} />
                  ) : (
                    <InsightCard
                      label="Traffic pulse"
                      value={formatNumber(dashboardState.totalViews)}
                      helper="Once views pick up, the chart will show the pattern."
                      action={{ href: "/business/preview", label: "View storefront" }}
                    />
                  )}
                </div>
              </section>
            ) : null}

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="min-w-0">
                <TopProductsTable products={data.topProducts} />
              </div>
              <div className="min-w-0">
                <RecentOrders orders={data.recentOrders} />
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
};

export default DashboardPage;
