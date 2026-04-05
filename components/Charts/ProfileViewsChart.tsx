"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TimeSeriesPoint } from "@/lib/dashboardTypes";
import { chartColorTokens } from "@/lib/dashboardTypes";

type ProfileViewsChartProps = {
  data: TimeSeriesPoint[];
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="dashboard-tooltip rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
      style={{ color: "#0f172a" }}
    >
      <p className="font-semibold" style={{ color: "#0f172a" }}>
        {label}
      </p>
      <div className="mt-1 space-y-1">
        {payload.map((entry: any) => (
          <div key={entry.name} className="flex items-center justify-between gap-3">
            <span style={{ color: "#1f2937" }}>{entry.name}</span>
            <span className="font-semibold" style={{ color: "#0f172a" }}>
              {entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const ProfileViewsChart = ({ data }: ProfileViewsChartProps) => {
  return (
    <div className="dashboard-panel relative h-full p-5 transition duration-200 hover:-translate-y-[1px] hover:border-slate-300 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-slate-400/85">
            Traffic
          </p>
          <h3 className="text-lg font-semibold text-slate-900">Profile views</h3>
        </div>
      </div>
      <div className="dashboard-panel-inner mt-6 h-[240px] p-4 sm:h-[260px] sm:p-5">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 10, right: 16, left: -10, bottom: 0 }}
            barCategoryGap="30%"
            barGap={6}
          >
            <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.12)" vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--dashboard-chart-axis)" }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--dashboard-chart-axis)" }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              dataKey="value"
              name="Views"
              fill={chartColorTokens.primary}
              radius={[6, 6, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ProfileViewsChart;
