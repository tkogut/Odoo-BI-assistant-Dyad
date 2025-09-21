"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  loading?: boolean;
  className?: string;
}

const KPICard: React.FC<KPICardProps> = ({ title, value, subtitle, loading = false, className }) => {
  return (
    <Card className={cn("p-4", className)}>
      <CardHeader className="p-0">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0 mt-2">
        <div className="flex items-baseline justify-between">
          <div className="text-2xl font-bold">{loading ? "—" : value}</div>
        </div>
        {subtitle && <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>}
      </CardContent>
    </Card>
  );
};

export default KPICard;