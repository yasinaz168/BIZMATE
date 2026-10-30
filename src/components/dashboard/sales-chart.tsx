"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatIDR, formatIDRCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface SalesChartProps {
  data: Array<{ day: string; value: number }>;
  className?: string;
}

/**
 * Grafik area penjualan (Recharts).
 * ⚠️ Input harus berupa data nyata/kontoh yang jelas — bukan angka hasil karangan.
 */
export function SalesChart({ data, className }: SalesChartProps) {
  if (data.length === 0) {
    return (
      <div className={cn("flex h-[280px] items-center justify-center text-sm text-muted-foreground", className)}>
        Belum ada data penjualan untuk ditampilkan.
      </div>
    );
  }

  return (
    <div className={cn("h-[280px] w-full", className)} role="img" aria-label="Grafik penjualan harian">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="bizmateSalesFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#087F73" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#087F73" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 4" stroke="#DCE5E2" vertical={false} />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "#71817D" }}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "#71817D" }}
            width={48}
            tickFormatter={(v: number) => formatIDRCompact(v)}
          />
          <Tooltip
            cursor={{ stroke: "#087F73", strokeWidth: 1, strokeDasharray: "4 4" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const item = payload[0];
              return (
                <div className="rounded-lg border border-line bg-surface px-3 py-2 shadow-lift">
                  <p className="text-xs font-medium text-muted-foreground">{label}</p>
                  <p className="text-sm font-bold text-foreground">
                    {formatIDR(Number(item.value))}
                  </p>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#087F73"
            strokeWidth={2.5}
            fill="url(#bizmateSalesFill)"
            activeDot={{ r: 4, fill: "#087F73", stroke: "#fff", strokeWidth: 2 }}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
