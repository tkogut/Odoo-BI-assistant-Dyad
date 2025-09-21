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
}

const ChartWidget: React.FC<ChartWidgetProps> = ({ title, type = "line", data = [], xKey = "period", yKey = "value", className }) => {
  const numericXAxis = data.length > 0 && data[0].ts !== undefined && (xKey === "ts" || xKey === "ts");
  // Prepare ticks if numeric
  const ticks = numericXAxis ? data.map((d) => Number(d.ts)) : undefined;

  const tickFormatterDate = (ts: number) => {
    try {
      const d = new Date(ts);
      return new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(d);
    } catch {
      return String(ts);
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="text-sm text-muted-foreground">No data to display.</div>
        ) : (
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              {type === "line" ? (
                <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  {numericXAxis ? (
                    <XAxis
                      dataKey="ts"
                      type="number"
                      scale="time"
                      domain={["dataMin", "dataMax"]}
                      ticks={ticks}
                      tickFormatter={tickFormatterDate}
                      tick={{ fontSize: 12 }}
                      height={70}
                      angle={-45}
                      textAnchor="end"
                    />
                  ) : (
                    <XAxis
                      dataKey={xKey}
                      type="category"
                      interval={0}
                      tick={{ fontSize: 12 }}
                      height={60}
                      angle={-45}
                      textAnchor="end"
                      allowDuplicatedCategory={false}
                    />
                  )}
                  <YAxis />
                  <Tooltip labelFormatter={(label) => (numericXAxis ? tickFormatterDate(Number(label)) : String(label))} />
                  <Line type="monotone" dataKey={yKey} stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              ) : (
                <BarChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  {numericXAxis ? (
                    <XAxis
                      dataKey="ts"
                      type="number"
                      scale="time"
                      domain={["dataMin", "dataMax"]}
                      ticks={ticks}
                      tickFormatter={tickFormatterDate}
                      tick={{ fontSize: 12 }}
                      height={70}
                      angle={-45}
                      textAnchor="end"
                    />
                  ) : (
                    <XAxis
                      dataKey={xKey}
                      type="category"
                      interval={0}
                      tick={{ fontSize: 12 }}
                      height={60}
                      angle={-45}
                      textAnchor="end"
                      allowDuplicatedCategory={false}
                    />
                  )}
                  <YAxis />
                  <Tooltip labelFormatter={(label) => (numericXAxis ? tickFormatterDate(Number(label)) : String(label))} />
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