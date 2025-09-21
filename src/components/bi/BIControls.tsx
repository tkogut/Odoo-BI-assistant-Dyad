"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  year: string;
  onYearChange: (y: string) => void;
  onRefresh: () => void;
  onToggleDebug: () => void;
  onImportLastRun: () => void;
  loading?: boolean;
  showDebug?: boolean;
}

const BIControls: React.FC<Props> = ({ year, onYearChange, onRefresh, onToggleDebug, onImportLastRun, loading = false, showDebug = false }) => {
  return (
    <div className="flex items-center gap-3">
      <div className="text-sm text-muted-foreground self-center">
        Currency: <span className="font-mono">{/* parent may render currency separately */}</span>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground">Year</label>
        <Input value={year} onChange={(e) => onYearChange(e.target.value)} className="w-24" placeholder="YYYY" />
      </div>

      <Button onClick={onRefresh} disabled={loading}>
        {loading ? "Refreshing..." : "Refresh KPIs"}
      </Button>

      <Button variant="ghost" onClick={onToggleDebug}>
        {showDebug ? "Hide Debug" : "Show Debug"}
      </Button>

      <Button variant="ghost" onClick={onImportLastRun} title="Import last TotalRevenueCommand run">
        Import Last Run
      </Button>
    </div>
  );
};

export default BIControls;