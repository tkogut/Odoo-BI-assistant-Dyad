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
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey={xKey} />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey={yKey} stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              ) : (
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey={xKey} />
                  <YAxis />
                  <Tooltip />
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