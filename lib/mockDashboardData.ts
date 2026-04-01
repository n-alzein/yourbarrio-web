import type {
  DashboardData,
  TimeSeriesPoint,
  TopProduct,
  RecentOrder,
} from "./dashboardTypes";

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

const buildTimeSeries = (
  days: number,
  startValue: number,
  variance: number,
  compareOffset = 0.12
): TimeSeriesPoint[] => {
  const points: TimeSeriesPoint[] = [];
  const today = new Date();
  const start = new Date();
  start.setDate(today.getDate() - (days - 1));

  for (let i = 0; i < days; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const wave = Math.sin(i / 4) * variance;
    const value = Math.max(0, Math.round(startValue + wave + i * 6));
    const compareValue = Math.max(
      0,
      Math.round(value * (1 - compareOffset + Math.sin(i / 5) * 0.02))
    );
    points.push({ date: formatDate(date), value, compareValue });
  }

  return points;
};

const topProducts: TopProduct[] = [
  {
    id: "p1",
    name: "Cedar + Citrus Candle",
    category: "Home Fragrance",
    revenue: 12840,
    orders: 240,
    inventoryQty: 120,
  },
  {
    id: "p2",
    name: "Everyday Linen Set",
    category: "Home Textiles",
    revenue: 11220,
    orders: 182,
    inventoryQty: 48,
  },
  {
    id: "p3",
    name: "Heritage Coffee Kit",
    category: "Pantry",
    revenue: 9860,
    orders: 154,
    inventoryQty: 210,
  },
  {
    id: "p4",
    name: "Market Tote Bundle",
    category: "Accessories",
    revenue: 8140,
    orders: 132,
    inventoryQty: 62,
  },
  {
    id: "p5",
    name: "Stoneware Mug Set",
    category: "Kitchen",
    revenue: 7420,
    orders: 118,
    inventoryQty: 34,
  },
];

const recentOrders: RecentOrder[] = [
  {
    id: "ORD-10241",
    customerName: "Arianna Lopez",
    total: 128.4,
    status: "fulfilled",
    date: "2024-10-18",
    items: 3,
    href: "/business/dashboard/sales",
  },
  {
    id: "ORD-10237",
    customerName: "Marcus Reed",
    total: 86.2,
    status: "pending",
    date: "2024-10-18",
    items: 2,
    href: "/business/dashboard/sales",
  },
  {
    id: "ORD-10233",
    customerName: "Nina Patel",
    total: 214.0,
    status: "on_hold",
    date: "2024-10-17",
    items: 4,
    href: "/business/dashboard/sales",
  },
  {
    id: "ORD-10226",
    customerName: "Erik Jensen",
    total: 54.75,
    status: "fulfilled",
    date: "2024-10-17",
    items: 1,
    href: "/business/dashboard/sales",
  },
  {
    id: "ORD-10211",
    customerName: "Tara Nguyen",
    total: 162.9,
    status: "refunded",
    date: "2024-10-16",
    items: 2,
    href: "/business/dashboard/sales",
  },
];

const salesTimeSeries = buildTimeSeries(30, 2100, 280, 0.08);
const profileViewsTimeSeries = buildTimeSeries(30, 860, 140, 0.1);

export const mockDashboardData: DashboardData = {
  lastUpdated: "2024-10-18 09:42 AM",
  businessName: "YourBarrio",
  businessAvatarUrl: "/business-placeholder.png",
  salesTimeSeries,
  profileViewsTimeSeries,
  topProducts,
  recentOrders,
  categories: ["Home Fragrance", "Home Textiles", "Pantry", "Accessories", "Kitchen"],
  listingCount: topProducts.length,
  orderCount: recentOrders.length,
  viewCount: profileViewsTimeSeries.reduce((total, point) => total + point.value, 0),
};
