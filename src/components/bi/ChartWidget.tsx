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
 * - Coerces incoming Y values to numbers so charts render correctly.
 * - Ensures Y axis has a sensible max (at least 1) to avoid a collapsed axis when all values are zero.
 * - Formats Y axis ticks and tooltips as currency.
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

  // Coerce Y values to numbers and produce a processed data set used by the charts
  const processedData = (Array.isArray(data) ? data : []).map((d) => {
    const raw = d[yKey];
    const num = typeof raw === "number" ? raw : parseFloat(String(raw ?? "").replace(/[, ]+/g, ""));
    const value = Number.isFinite(num) ? num : 0;
    return {
      ...d,
      [yKey]: value,
    };
  });

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

  // Domain helper: start at 0 and add 10% headroom above the max value (rounded).
  // Ensure at least 1 when max is 0 so axis does not collapse.
  const yDomain = (d: any[]) => {
    if (!Array.isArray(d) || d.length === 0) return [0, "auto"];
    const vals = d.map((it) => Number(it[yKey] ?? 0)).filter((n) => Number.isFinite(n));
    if (vals.length === 0) return [0, "auto"];
    const max = Math.max(...vals);
    const padded = Math.max(1, Math.ceil(max * 1.1));
    return [0, padded];
  };

  const computedDomain = yDomain(processedData);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {processedData.length === 0 ? (
          <div className="text-sm text-muted-foreground">No data to display.</div>
        ) : (
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              {type === "line" ? (
                <LineChart data={processedData} margin={{ top: 10, right: 16, left: 0, bottom: 70 }}>
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
                  <Line type="monotone" dataKey={yKey} stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              ) : (
                <BarChart data={processedData} margin={{ top: 10, right: 16, left: 0, bottom: 70 }}>
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