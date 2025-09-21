"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";

interface ChartWidgetProps {
  title: string;
  type?: "line" | "bar";
  data: Array<Record<string, any>>;
  xKey?: string;
  yKey?: string;
  className?: string;
  currency?: string;
}

/**
 * ChartWidget
 * - Categorical X axis that preserves the provided data order (useful for Jan..Dec series).
 * - If each data point includes a 'label' field it will be used for tick formatting (e.g. "Jan 2025").
 * - Rotated tick labels and extra bottom margin prevent clipping.
 * - Formats Y axis ticks and tooltips as currency and forces a domain starting at 0 with a small top padding.
 */
const ChartWidget: React.FC<ChartWidgetProps> = ({
  title,
  type = "line",
  data = [],
  xKey = "period",
  yKey = "value",
  className,
  currency = "USD",
}) => {
  // Build a quick map from category value -> label (if points include a 'label' field)
  const labelMap = new Map<string | number, string>();
  if (Array.isArray(data) && data.length > 0) {
    for (const d of data) {
      const key = d[xKey];
      const label = d.label ?? d.period ?? String(key);
      labelMap.set(key, label);
    }
  }

  const formatCurrency = (v: number | string | undefined) => {
    try {
      const n = Number(v ?? 0);
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currency || "USD",
        maximumFractionDigits: 0,
      }).format(n);
    } catch {
      return String(v ?? "");
    }
  };

  // Domain helper: start at 0 and add 10% headroom above the max value (rounded)
  const yDomain = (data: any[]) => {
    if (!Array.isArray(data) || data.length === 0) return [0, "auto"];
    const vals = data.map((d) => Number(d[yKey] ?? 0)).filter((n) => Number.isFinite(n));
    if (vals.length === 0) return [0, "auto"];
    const max = Math.max(...vals);
    const padded = Math.ceil(max * 1.1);
    return [0, padded];
  };

  const computedDomain = yDomain(data);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="text-sm text-muted-foreground">No data to display.</div>
        ) : (
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              {type === "line" ? (
                <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 70 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  {/* Categorical X axis: preserve order of data array, show all ticks, rotate labels */}
                  <XAxis
                    dataKey={xKey}
                    type="category"
                    interval={0}
                    tick={{ fontSize: 12 }}
                    height={60}
                    angle={-45}
                    textAnchor="end"
                    allowDuplicatedCategory={false}
                    tickFormatter={(val: any) => {
                      const key = val as string | number;
                      return labelMap.get(key) ?? String(val);
                    }}
                  />
                  {/* Y axis starts at 0 and uses a padded dataMax domain; ticks formatted as currency */}
                  <YAxis
                    domain={computedDomain as any}
                    tickFormatter={(val: any) => formatCurrency(Number(val))}
                    allowDecimals={false as any}
                  />
                  <Tooltip
                    labelFormatter={(label: any) => labelMap.get(label) ?? String(label)}
                    formatter={(value: any) => formatCurrency(value)}
                  />
                  <Line type="monotone" dataKey={yKey} stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              ) : (
                <BarChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 70 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey={xKey}
                    type="category"
                    interval={0}
                    tick={{ fontSize: 12 }}
                    height={60}
                    angle={-45}
                    textAnchor="end"
                    allowDuplicatedCategory={false}
                    tickFormatter={(val: any) => {
                      const key = val as string | number;
                      return labelMap.get(key) ?? String(val);
                    }}
                  />
                  <YAxis
                    domain={computedDomain as any}
                    tickFormatter={(val: any) => formatCurrency(Number(val))}
                    allowDecimals={false as any}
                  />
                  <Tooltip
                    labelFormatter={(label: any) => labelMap.get(label) ?? String(label)}
                    formatter={(value: any) => formatCurrency(value)}
                  />
                  <Bar dataKey={yKey} fill="#3b82f6" />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ChartWidget;