"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type SignupChartRow = {
  bucketStart: string;
  label: string;
  customerCount: number;
  businessCount: number;
};

type AdminUserSignupsChartProps = {
  data: SignupChartRow[];
};

const customerColor = "#38bdf8";
const businessColor = "#f59e0b";

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="dashboard-tooltip rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-neutral-100 shadow-lg">
      <p className="font-semibold text-neutral-50">{label}</p>
      <div className="mt-1 space-y-1">
        {payload.map((entry: any) => (
          <div key={entry.name} className="flex items-center justify-between gap-3">
            <span className="text-neutral-300">{entry.name}</span>
            <span className="font-semibold text-neutral-50">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function AdminUserSignupsChart({ data }: AdminUserSignupsChartProps) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="mb-3">
        <h3 className="font-medium">User signups (last 30 days)</h3>
        <p className="text-xs text-neutral-400">Customers vs Businesses</p>
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(115,115,115,0.4)" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              minTickGap={18}
              tick={{ fontSize: 11, fill: "#a3a3a3" }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "#a3a3a3" }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: "12px" }} />
            <Bar dataKey="customerCount" name="Customers" fill={customerColor} radius={[4, 4, 0, 0]} />
            <Bar dataKey="businessCount" name="Businesses" fill={businessColor} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
