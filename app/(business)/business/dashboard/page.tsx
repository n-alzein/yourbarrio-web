"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Landmark, Loader2, PackagePlus, ShoppingBag } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import DateRangeControls from "@/components/DateRangeControls";
import TopProductsTable from "@/components/TopProductsTable";
import RecentOrders from "@/components/RecentOrders";
import type { BusinessStripeStatus } from "@/lib/stripe/status";
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

type StripeConnectStatus = BusinessStripeStatus;
type DashboardFetchState = "idle" | "loading" | "refreshing" | "error";
type PayoutCardState = "ready" | "needs_action" | "issue";
type PayoutCardViewModel = {
  state: PayoutCardState;
  title: string;
  body: string;
  actionLabel: string;
};
type SetupItem = {
  id: string;
  label: string;
  complete: boolean;
};

const DEFAULT_FILTERS: DashboardFilters = {
  categories: [],
};
const DASHBOARD_CACHE_KEY = "yb:business-dashboard:v1";
const DASHBOARD_SKELETON_DELAY_MS = 200;
const DEFAULT_SETUP_ITEMS: SetupItem[] = [
  { id: "profile", label: "Profile complete", complete: false },
  { id: "product", label: "First product", complete: false },
  { id: "profile_visibility", label: "Profile ready", complete: false },
];

let dashboardMemoryCache: DashboardData | null = null;

const startOfLocalDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

const endOfLocalDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

const resolveDateRange = (range: DateRangeKey) => {
  const today = new Date();
  const start = startOfLocalDay(today);
  const end = endOfLocalDay(today);
  if (range === "7d") {
    start.setDate(start.getDate() - 6);
  } else if (range === "30d") {
    start.setDate(start.getDate() - 29);
  }
  return { from: start.toISOString(), to: end.toISOString() };
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

const readDashboardCache = () => {
  if (dashboardMemoryCache) return dashboardMemoryCache;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DASHBOARD_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DashboardData;
    dashboardMemoryCache = parsed;
    return parsed;
  } catch {
    return null;
  }
};

const writeDashboardCache = (nextData: DashboardData) => {
  dashboardMemoryCache = nextData;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(nextData));
  } catch {
    // Ignore storage failures and keep the in-memory cache.
  }
};

function useDelayedVisibility(active: boolean, delayMs = DASHBOARD_SKELETON_DELAY_MS) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      const resetTimeout = window.setTimeout(() => setVisible(false), 0);
      return () => window.clearTimeout(resetTimeout);
    }

    const timeout = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timeout);
  }, [active, delayMs]);

  return active && visible;
}

function PanelSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`dashboard-panel p-5 sm:p-6 ${className}`}
    >
      <div className="h-3 w-24 animate-pulse rounded-md bg-slate-200" />
      <div className="mt-3 h-8 w-40 animate-pulse rounded-md bg-slate-100" />
      <div className="mt-5 h-32 animate-pulse rounded-[18px] bg-slate-100" />
    </div>
  );
}

function SectionShell({
  className = "",
  showSkeleton = false,
  lines = 3,
}: {
  className?: string;
  showSkeleton?: boolean;
  lines?: number;
}) {
  return (
    <div className={`dashboard-panel p-5 sm:p-6 ${className}`}>
      <div className="h-3 w-24 rounded-md bg-slate-200/70" />
      <div className="mt-3 h-8 w-40 rounded-md bg-slate-100/80" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: lines }).map((_, index) => (
          <div
            key={index}
            className={`h-10 rounded-[14px] bg-slate-100/85 ${
              showSkeleton ? "animate-pulse" : ""
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function ContentFade({
  ready,
  children,
}: {
  ready: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`transition-opacity duration-200 ${
        ready ? "opacity-100" : "opacity-80"
      }`}
    >
      {children}
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
      className="dashboard-panel group flex items-center justify-between gap-4 bg-white px-5 py-4 transition duration-200 hover:border-slate-300/90 hover:bg-slate-50/[0.35] sm:px-6 sm:py-5"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-slate-200/70 bg-slate-50 text-slate-700">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-base font-semibold text-slate-900">{title}</p>
          <p className="mt-2 truncate text-sm text-slate-400/90">{detail}</p>
        </div>
      </div>
      <span className="text-[0.64rem] font-medium uppercase tracking-[0.1em] text-slate-300 transition duration-200 group-hover:text-slate-400">
        Open
      </span>
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
    <div className="dashboard-panel flex h-full flex-col justify-between p-5 transition duration-200 hover:-translate-y-[1px] hover:border-slate-300 sm:p-6">
      <div>
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-slate-400/85">
          {label}
        </p>
        <p className="mt-5 text-[2.5rem] font-semibold tracking-[-0.055em] text-slate-950">
          {value}
        </p>
        <p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-400/90">{helper}</p>
      </div>
      {action ? (
        <Link
          href={action.href}
          className="mt-8 inline-flex w-fit items-center gap-2 text-sm font-extrabold text-[#4c1d95] transition duration-200 hover:text-[#3b0764]"
        >
          {action.label}
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}

function getPayoutViewModel(
  stripeStatus: StripeConnectStatus | null
): PayoutCardViewModel {
  const isPayoutReady =
    stripeStatus?.uiStatus === "active" ||
    (stripeStatus?.hasStripeAccount &&
      stripeStatus.chargesEnabled &&
      stripeStatus.payoutsEnabled &&
      stripeStatus.detailsSubmitted);

  if (isPayoutReady) {
    return {
      state: "ready",
      title: "Payouts enabled",
      body: "You're all set to receive payouts from your sales.",
      actionLabel: "Manage payouts",
    };
  }

  if (
    stripeStatus?.hasStripeAccount &&
    stripeStatus.uiStatus !== "restricted"
  ) {
    return {
      state: "needs_action",
      title: "Finish setup to get paid",
      body: "Complete your payout setup to start receiving money from customers.",
      actionLabel: "Complete payout setup",
    };
  }

  return {
    state: "issue",
    title: "Payout setup incomplete",
    body: "There's an issue with your payment setup.",
    actionLabel: "Fix setup",
  };
}

function StripeStatusCard({
  status,
  loading,
  actionLoading,
  error,
  onAction,
  onRetry,
}: {
  status: StripeConnectStatus | null;
  loading: boolean;
  actionLoading: boolean;
  error: string;
  onAction: () => void;
  onRetry: () => void;
}) {
  const viewModel = getPayoutViewModel(status);
  const showAction = !loading;
  const isReady = viewModel.state === "ready";
  const statusLabel = loading
    ? "Checking setup"
    : isReady
      ? "Ready to get paid"
      : "Action needed";

  return (
    <section className="dashboard-panel p-5 sm:p-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-slate-200 bg-slate-50 text-slate-700">
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            ) : isReady ? (
              <BadgeCheck className="h-5 w-5 text-emerald-600" />
            ) : (
              <Landmark className="h-5 w-5" />
            )}
          </div>
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-slate-400/85">
              Payouts
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-slate-950">
                {loading ? "Checking payout setup" : viewModel.title}
              </h2>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] ${
                  isReady
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-violet-100 bg-violet-50 text-[#5b21b6]"
                }`}
              >
                {statusLabel}
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              {loading
                ? "We're checking whether your payout setup is ready."
                : viewModel.body}
            </p>
            <p className="mt-3 text-xs font-medium text-slate-400">
              Powered by Stripe
            </p>
            {error ? (
              <p className="mt-2 text-sm text-rose-600">
                We couldn&apos;t refresh your payout status. Try again.
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 md:items-end">
          {showAction ? (
            <button
              type="button"
              onClick={onAction}
              disabled={loading || actionLoading}
              className="yb-primary-button inline-flex min-w-[190px] items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold !text-white hover:!text-white focus-visible:!text-white active:!text-white disabled:cursor-not-allowed disabled:!text-white disabled:opacity-60"
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {actionLoading ? "Opening Stripe..." : viewModel.actionLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onRetry}
            disabled={loading || actionLoading}
            className="inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-semibold text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Refresh status
          </button>
        </div>
      </div>
    </section>
  );
}

const DashboardPage = () => {
  const [data, setData] = useState<DashboardData | null>(() => dashboardMemoryCache);
  const [fetchState, setFetchState] = useState<DashboardFetchState>(() =>
    dashboardMemoryCache ? "refreshing" : "loading"
  );
  const [loadError, setLoadError] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeKey>("30d");
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS);
  const [reloadKey, setReloadKey] = useState(0);
  const [stripeStatus, setStripeStatus] = useState<StripeConnectStatus | null>(null);
  const [stripeLoading, setStripeLoading] = useState(true);
  const [stripeError, setStripeError] = useState("");
  const [stripeActionLoading, setStripeActionLoading] = useState(false);
  const hasDataRef = useRef(Boolean(data));
  const showSectionSkeletons = useDelayedVisibility(!data && fetchState === "loading");

  useEffect(() => {
    hasDataRef.current = Boolean(data);
  }, [data]);

  useEffect(() => {
    if (data) return;
    const cachedData = readDashboardCache();
    if (!cachedData) return;
    setData(cachedData);
    setFetchState("refreshing");
  }, [data]);

  useEffect(() => {
    let cancelled = false;

    const loadDashboard = async () => {
      if (!cancelled) {
        setFetchState(hasDataRef.current ? "refreshing" : "loading");
        setLoadError("");
      }
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
        if (cancelled) return;
        setData(payload);
        writeDashboardCache(payload);
        setFetchState("idle");
      } catch (err) {
        if (cancelled) return;
        console.error("Dashboard load failed", err);
        setLoadError("We could not load your dashboard.");
        setFetchState(hasDataRef.current ? "idle" : "error");
      }
    };

    loadDashboard();

    const handleVisibilityRefresh = () => {
      if (document.visibilityState === "visible") {
        loadDashboard();
      }
    };

    window.addEventListener("focus", loadDashboard);
    document.addEventListener("visibilitychange", handleVisibilityRefresh);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", loadDashboard);
      document.removeEventListener("visibilitychange", handleVisibilityRefresh);
    };
  }, [dateRange, filters, reloadKey]);

  const loadStripeStatus = async () => {
    setStripeLoading(true);
    setStripeError("");
    try {
      const response = await fetch("/api/stripe/connect/status", {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load Stripe status");
      }
      setStripeStatus(payload as StripeConnectStatus);
    } catch (err: any) {
      setStripeError(err?.message || "Failed to load Stripe status");
    } finally {
      setStripeLoading(false);
    }
  };

  useEffect(() => {
    loadStripeStatus();
  }, []);

  const handleStripeAction = async () => {
    setStripeActionLoading(true);
    setStripeError("");
    try {
      const response = await fetch("/api/stripe/connect/start", {
        method: "POST",
        credentials: "include",
      });
      const payload = await response.json();
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || "Failed to start Stripe onboarding");
      }
      window.location.href = payload.url;
    } catch (err: any) {
      setStripeError(err?.message || "Failed to start Stripe onboarding");
      setStripeActionLoading(false);
    }
  };

  const dashboardState = useMemo(() => {
    const source = data;
    const totalSales = source ? sumSeries(source.salesTimeSeries) : 0;
    const totalViews = source
      ? typeof source.viewCount === "number"
        ? source.viewCount
        : sumSeries(source.profileViewsTimeSeries)
      : 0;
    const totalOrders = source ? source.orderCount ?? source.recentOrders.length : 0;
    const listingCount = source?.listingCount ?? 0;

    const salesHasChart = source ? hasMeaningfulSeries(source.salesTimeSeries) : false;
    const viewsHasChart = source ? hasMeaningfulSeries(source.profileViewsTimeSeries) : false;

    const setupItems = [
      { id: "profile", label: "Profile complete", complete: Boolean(source?.businessName) },
      { id: "product", label: "First product", complete: listingCount > 0 },
      { id: "profile_visibility", label: "Profile ready", complete: Boolean(source?.businessName) },
    ];

    const quickActions = [
      {
        href: listingCount > 0 ? "/business/listings" : "/business/listings/new",
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
        action: { href: "/business/listings/new", label: "Add product" },
      },
      {
        label: "Views",
        value: formatNumber(totalViews),
        helper:
          totalViews > 0
            ? `Storefront visits in ${rangeCopy[dateRange]}`
            : "Share your profile",
        action: { href: "/business/profile", label: "View profile" },
      },
      {
        label: "Orders",
        value: formatNumber(totalOrders),
        helper:
          totalOrders > 0
            ? `New purchases in ${rangeCopy[dateRange]}`
            : "Orders will appear here once customers purchase",
        action: { href: "/business/orders", label: "View orders" },
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

  const categories = data?.categories ?? [];
  const hasDashboardData = Boolean(data && dashboardState);
  const showFatalError = fetchState === "error" && !hasDashboardData;
  const dashboardLastUpdated = data?.lastUpdated ?? "Just now";
  const dashboardName = data?.businessName;
  const dashboardAvatarUrl = data?.businessAvatarUrl ?? null;
  const setupItems = dashboardState?.setupItems ?? DEFAULT_SETUP_ITEMS;

  return (
    <main
      className="business-theme min-h-screen px-4 pb-20 sm:px-6"
      style={{
        backgroundImage:
          "radial-gradient(circle at 10% 10%, var(--glow-1), transparent 55%), radial-gradient(circle at 80% 0%, var(--glow-2), transparent 50%)",
      }}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:gap-[1.625rem]">
        {showFatalError ? (
          <DashboardErrorState onRetry={() => setReloadKey((prev) => prev + 1)} />
        ) : (
          <>
            <DateRangeControls
              dateRange={dateRange}
              filters={filters}
              categories={categories}
              businessName={dashboardName}
              businessAvatarUrl={dashboardAvatarUrl}
              lastUpdated={dashboardLastUpdated}
              setupItems={setupItems}
              onDateRangeChange={setDateRange}
              onFiltersChange={setFilters}
            />

            {loadError && hasDashboardData ? (
              <div className="rounded-[14px] border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-800">
                {loadError}
              </div>
            ) : null}

            <ContentFade ready={hasDashboardData}>
              <StripeStatusCard
                status={stripeStatus}
                loading={stripeLoading}
                actionLoading={stripeActionLoading}
                error={stripeError}
                onAction={handleStripeAction}
                onRetry={loadStripeStatus}
              />
            </ContentFade>

            {hasDashboardData && dashboardState ? (
              <ContentFade ready>
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
              </ContentFade>
            ) : (
              <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <SectionShell className="h-[92px]" showSkeleton={showSectionSkeletons} lines={1} />
                <SectionShell className="h-[92px]" showSkeleton={showSectionSkeletons} lines={1} />
              </section>
            )}

            {hasDashboardData && dashboardState ? (
              <ContentFade ready>
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
              </ContentFade>
            ) : (
              <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <SectionShell className="h-[174px]" showSkeleton={showSectionSkeletons} lines={2} />
                <SectionShell className="h-[174px]" showSkeleton={showSectionSkeletons} lines={2} />
                <SectionShell className="h-[174px]" showSkeleton={showSectionSkeletons} lines={2} />
              </section>
            )}

            {hasDashboardData && dashboardState && data && (dashboardState.salesHasChart || dashboardState.viewsHasChart) ? (
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
                      action={{ href: "/business/profile", label: "View profile" }}
                    />
                  )}
                </div>
              </section>
            ) : !hasDashboardData ? (
              <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <SectionShell className="h-[320px]" showSkeleton={showSectionSkeletons} lines={3} />
                <SectionShell className="h-[320px]" showSkeleton={showSectionSkeletons} lines={3} />
              </section>
            ) : null}

            {hasDashboardData && data ? (
              <ContentFade ready>
                <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                  <div className="min-w-0">
                    <TopProductsTable products={data.topProducts} />
                  </div>
                  <div className="min-w-0">
                    <RecentOrders orders={data.recentOrders} />
                  </div>
                </section>
              </ContentFade>
            ) : null}
            {!hasDashboardData ? (
              <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <SectionShell className="h-[360px]" showSkeleton={showSectionSkeletons} lines={4} />
                <SectionShell className="h-[360px]" showSkeleton={showSectionSkeletons} lines={4} />
              </section>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
};

export default DashboardPage;
