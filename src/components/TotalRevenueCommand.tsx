"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showSuccess, showError } from "@/utils/toast";

interface Props {
  relayHost?: string;
  apiKey?: string;
}

const TotalRevenueCommand: React.FC<Props> = ({ relayHost = "http://localhost:8000", apiKey = "super_rooster" }) => {
  const [year, setYear] = useState<string>(new Date().getFullYear().toString());

  // JSON payload uses read_group and groups by date_order:month to request monthly revenue
  const jsonPayload = JSON.stringify(
    {
      model: "sale.order",
      method: "read_group",
      args: [
        [
          ["state", "in", ["sale", "done"]],
          ["date_order", ">=", `${year}-01-01`],
          ["date_order", "<=", `${year}-12-31`],
        ],
        ["amount_total"],
        ["date_order:month"],
      ],
      kwargs: { lazy: false },
    },
    null,
    2,
  );

  const curl = `curl -s -X POST "${relayHost.replace(/\/$/, "")}/api/execute_method" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${apiKey ?? ""}" \\
  -d '${jsonPayload.replace(/'/g, "'\"'\"'")}'`;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showSuccess("Copied to clipboard");
    } catch {
      showError("Unable to copy to clipboard");
    }
  };

  return (
    <div className="p-4 border rounded space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Total Revenue Command (by year)</h3>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground block mb-1">Year</label>
          <Input value={year} onChange={(e) => setYear(e.target.value)} />
        </div>
        <div className="flex items-end">
          <Button onClick={() => { /* no-op; year is applied live */ }}>Apply</Button>
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">JSON payload (monthly grouping)</label>
        <pre className="bg-muted p-2 rounded text-xs overflow-auto">{jsonPayload}</pre>
        <div className="flex gap-2 mt-2">
          <Button size="sm" variant="ghost" onClick={() => copy(jsonPayload)}>
            Copy JSON
          </Button>
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">cURL</label>
        <pre className="bg-muted p-2 rounded text-xs overflow-auto">{curl}</pre>
        <div className="flex gap-2 mt-2">
          <Button size="sm" onClick={() => copy(curl)}>Copy cURL</Button>
        </div>
      </div>
    </div>
  );
};

export default TotalRevenueCommand;