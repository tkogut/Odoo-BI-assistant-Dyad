"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

type DashboardConfig = {
  title?: string;
  widgets: Array<
    | { type: "stat"; title: string; value: string | number }
    | { type: "list"; title: string; items: string[] }
  >;
};

const DynamicDashboard: React.FC<{ config: DashboardConfig }> = ({ config }) => {
  return (
    <div>
      {config.title && <h3 className="text-lg font-semibold mb-3">{config.title}</h3>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {config.widgets.map((w, idx) => {
          if (w.type === "stat") {
            return (
              <Card key={idx}>
                <CardHeader>
                  <CardTitle className="text-sm">{w.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{w.value}</div>
                </CardContent>
              </Card>
            );
          } else if (w.type === "list") {
            return (
              <Card key={idx}>
                <CardHeader>
                  <CardTitle className="text-sm">{w.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc list-inside space-y-1">
                    {w.items.slice(0, 10).map((it, i) => (
                      <li key={i} className="text-sm">
                        {it}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
};

export default DynamicDashboard;