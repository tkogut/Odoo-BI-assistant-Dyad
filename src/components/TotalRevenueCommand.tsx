"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showSuccess, showError } from "@/utils/toast";
import { postToRelay } from "@/components/ai-chat/utils";

interface Props {
  relayHost?: string;
  apiKey?: string;
}

type MonthlyResult = { date_order: string; amount_total: number };

const TotalRevenueCommand: React.FC<Props> = ({ relayHost = "http://localhost:8000", apiKey = "super_rooster" }) => {
  const [year, setYear] = useState<string>(new Date().getFullYear().toString());
  const [results, setResults] = useState<MonthlyResult[] | null>(null);
  const [loading, setLoading] = useState(false);

  const payload = {
    model: "sale.order",
    method: "read_group" as const,
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
  };

  const jsonPayload = JSON.stringify(payload, null, 2);

  const curl = `curl -s -X POST "${relayHost.replace(/\/$/, "")}/api/execute_method" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${apiKey ?? ""}" \\
  -d '${jsonPayload.replace(/'/g, "'\"'\"'")}'`;

  const execute = async () => {
    if (!relayHost) {
      showError("Please configure a Relay Host in Settings.");
      return;
    }
    setLoading(true);
    setResults(null);

    try {
      const url = `${relayHost.replace(/\/$/, "")}/api/execute_method`;
      const r = await postToRelay(url, payload, apiKey, 30000);

      if (r.ok && r.parsed && r.parsed.success && Array.isArray(r.parsed.result)) {
        const mapped: MonthlyResult[] = r.parsed.result.map((item: any) => {
          // Robust key detection for grouped month label
          const month =
            item["date_order:month"] ??
            item["date_order"] ??
            item.period ??
            (item[0] && typeof item[0] === "string" ? item[0] : String(item[Object.keys(item)[0]] ?? ""));
          const amount = Number(item.amount_total ?? item.amount ?? 0) || 0;
          return { date_order: String(month), amount_total: amount };
        });

        setResults(mapped);
        showSuccess("Fetched monthly revenue.");
      } else {
        const errTxt = (r.parsed && (r.parsed.error || r.parsed.message)) || r.text || `HTTP ${r.status}`;
        throw new Error(String(errTxt));
      }
    } catch (err: any) {
      showError(`Failed: ${err?.message || String(err)}`);
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showSuccess("Copied to clipboard");
    } catch {
      showError("Unable to copy to clipboard");
    }
  };

  const currencyFormatter = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });

  const total = results ? results.reduce((s, r) => s + Number(r.amount_total || 0), 0) : 0;

  return (
    <div className="p-4 border rounded space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Total Revenue Command (by year)</h3>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground block mb-1">Year</label>
          <Input value={year} onChange={(e) => setYear(e.target.value)} />
        </div>

        <div className="flex items-end space-x-2">
          <Button onClick={execute} disabled={loading}>
            {loading ? "Loading..." : "Execute"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setResults(null)}>
            Clear
          </Button>
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
          <Button size="sm" onClick={() => copy(curl)}>
            Copy cURL
          </Button>
        </div>
      </div>

      {results && (
        <div>
          <div className="text-sm font-medium mb-2">Monthly Results</div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-muted">
                  <th className="p-2 text-left">Month</th>
                  <th className="p-2 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row) => (
                  <tr key={row.date_order} className="border-b">
                    <td className="p-2">{row.date_order}</td>
                    <td className="p-2 text-right">{currencyFormatter.format(Number(row.amount_total || 0))}</td>
                  </tr>
                ))}

                <tr className="font-semibold">
                  <td className="p-2">Total</td>
                  <td className="p-2 text-right">{currencyFormatter.format(total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default TotalRevenueCommand;