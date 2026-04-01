export type DateRangeKey = "today" | "7d" | "30d" | "custom";
export type CompareMode = "previous" | "yoy" | "none";

export type ChartColorToken =
  | "primary"
  | "compare"
  | "accent"
  | "success"
  | "warning"
  | "neutral";

export const chartColorTokens: Record<ChartColorToken, string> = {
  primary: "var(--dashboard-chart-primary)",
  compare: "var(--dashboard-chart-compare)",
  accent: "var(--dashboard-chart-accent)",
  success: "var(--dashboard-chart-success)",
  warning: "var(--dashboard-chart-warning)",
  neutral: "var(--dashboard-chart-neutral)",
};

export type KpiMetric = {
  id: string;
  label: string;
  value: string;
  deltaPct: number;
  sparklinePoints: number[];
  href: string;
};

export type TimeSeriesPoint = {
  date: string;
  value: number;
  compareValue?: number;
};

export type FunnelStep = {
  id: string;
  label: string;
  value: number;
};

export type ChannelPerformance = {
  id: string;
  label: string;
  sessions: number;
  orders: number;
  revenue: number;
  conversionRate: number;
  sharePct: number;
  colorToken: ChartColorToken;
  href: string;
};

export type TopProduct = {
  id: string;
  name: string;
  category: string;
  revenue: number;
  orders: number;
  inventoryQty: number | null;
};

export type AlertTask = {
  id: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
  kind: "alert" | "task";
  href?: string;
  actionLabel?: string;
};

export type RecentOrder = {
  id: string;
  customerName: string;
  total: number;
  status: "pending" | "fulfilled" | "refunded" | "on_hold";
  date: string;
  items: number;
  href?: string;
};

export type DashboardFilters = {
  categories: string[];
};

export type DashboardData = {
  lastUpdated: string;
  salesTimeSeries: TimeSeriesPoint[];
  profileViewsTimeSeries: TimeSeriesPoint[];
  topProducts: TopProduct[];
  recentOrders: RecentOrder[];
  categories: string[];
  listingCount: number;
  orderCount: number;
  viewCount: number;
  businessName?: string;
  businessAvatarUrl?: string | null;
};
