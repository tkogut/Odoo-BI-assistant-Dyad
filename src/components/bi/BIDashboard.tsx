"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showLoading, showSuccess, showError, dismissToast } from "@/utils/toast";
import KPICard from "./KPICard";
import ChartWidget from "./ChartWidget";
import { postToRelay } from "@/components/ai-chat/utils";

interface Props {
  relayHost: string;
  apiKey?: string;
}

const defaultCurrency = "USD";

/** Try to parse a period string into a Date.
 * Supports: YYYY-MM, YYYY-MM-DD, YYYY and many common date formats.
 * Returns timestamp (number) or NaN when not parsable.
 */
function parsePeriodToTimestamp(period: string): number {
  if (!period) return NaN;

  // Trim and normalize
  const s = String(period).trim();

  // YYYY-MM
  const ym = s.match(/^(\d{4})-(\d{1,2})$/);
  if (ym) {
    const y = Number(ym[1]);
    const m = Number(ym[2]);
    return new Date(y, m - 1, 1).getTime();
  }

  // YYYY-MM-DD
  const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const d = Number(ymd[3]);
    return new Date(y, m - 1, d).getTime();
  }

  // YYYY
  const yOnly = s.match(/^(\d{4})$/);
  if (yOnly) {
    const y = Number(yOnly[1]);
    return new Date(y, 0, 1).getTime();
  }

  // Try parsing human-readable month names like "Jan 2025" or "January 2025"
  const tryDateParse = Date.parse(s);
  if (!Number.isNaN(tryDateParse)) return tryDateParse;

  // Fallback: attempt to parse formats like "2025-01" handled above; otherwise give NaN
  return NaN;
}

/** Format a timestamp (ms) to a short "Mon YYYY" label; if invalid, return original period string. */
function formatTsLabel(ts: number, fallback?: string) {
  if (!Number.isFinite(ts)) return fallback ?? "";
  const d = new Date(ts);
  return new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(d);
}

const BIDashboard: React.FC<Props> = ({ relayHost, apiKey }) => {
  const [loading, setLoading] = useState(false);
  const [revenue, setRevenue] = useState<string>("-");
  const [trendData, setTrendData] = useState<Array<Record<string, any>>>([]);
  const [currencyCode, setCurrencyCode] = useState<string>(defaultCurrency);

  // Year selector for revenue/trend (default to current year)
  const [year, setYear] = useState<string>(new Date().getFullYear().toString());

  const safeHost = (h: string) => h.replace(/\/$/, "");

  const formatCurrency = (n: number) => {
    const code = currencyCode || defaultCurrency;
    const locale = code === "PLN" ? "pl-PL" : "en-US";
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(Number(n || 0));
    } catch {
      return `${Number(n || 0).toFixed(2)} ${code}`;
    }
  };

  const safeNumber = (v: any) => {
    if (v === undefined || v === null || v === "") return 0;
    if (typeof v === "number") return v;
    const cleaned = String(v).replace(/[,\s]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  };

  const detectCompanyCurrency = async (execUrl: string) => {
    try {
      const companyPayload = {
        model: "res.company",
        method: "search_read",
        args: [[]],
        kwargs: { fields: ["currency_id"], limit: 1 },
      };
      const companyRes = await postToRelay(execUrl, companyPayload, apiKey, 10000);
      if (
        companyRes.ok &&
        companyRes.parsed &&
        companyRes.parsed.success &&
        Array.isArray(companyRes.parsed.result) &&
        companyRes.parsed.result.length > 0
      ) {
        const comp = companyRes.parsed.result[0];
        const cur = comp.currency_id;
        if (Array.isArray(cur) && cur[1]) {
          const cand = String(cur[1]).trim();
          if (/^[A-Z]{3}$/.test(cand)) {
            setCurrencyCode(cand);
            return;
          }
        }
      }
    } catch {
      // ignore detection failures
    }
  };

  const fetchKPIs = async () => {
    if (!relayHost) {
      showError("Please configure a Relay Host in Settings.");
      return;
    }
    setLoading(true);
    const toastId = showLoading("Fetching BI KPIs...");
    try {
      const execUrl = `${safeHost(relayHost)}/api/execute_method`;

      await detectCompanyCurrency(execUrl);

      // Build domain for sale.order grouped query and include year bounds if provided
      const domain: any[] = [["state", "in", ["sale", "done"]]];
      const chosenYear = (year || "").trim();
      if (/^\d{4}$/.test(chosenYear)) {
        domain.push(["date_order", ">=", `${chosenYear}-01-01`]);
        domain.push(["date_order", "<=", `${chosenYear}-12-31`]);
      }

      // monthly revenue via read_group filtered by year when applicable
      const groupPayload = {
        model: "sale.order",
        method: "read_group",
        args: [domain, ["amount_total"], ["date_order:month"]],
        kwargs: { lazy: false },
      };
      const groupRes = await postToRelay(execUrl, groupPayload, apiKey, 30000);

      let totalRevenue = 0;
      let monthlyTrend: Array<{ rawPeriod: string; ts: number; value: number }> = [];

      if (groupRes.ok && groupRes.parsed && groupRes.parsed.success && Array.isArray(groupRes.parsed.result)) {
        const groups = groupRes.parsed.result as any[];
        for (const g of groups) {
          const rawPeriod = g["date_order:month"] ?? g["date_order:year"] ?? g["date_order"] ?? g[0] ?? String(g.period ?? "");
          const amount = safeNumber(g.amount_total ?? g.amount ?? g["amount_total"]);
          totalRevenue += amount;
          const ts = parsePeriodToTimestamp(String(rawPeriod));
          // If timestamp is NaN, try to coerce from common readable labels
          const finalTs = Number.isFinite(ts) ? ts : Date.parse(String(rawPeriod)) || NaN;
          monthlyTrend.push({ rawPeriod: String(rawPeriod), ts: Number.isFinite(finalTs) ? finalTs : Number.MAX_SAFE_INTEGER, value: amount });
        }

        // Sort chronologically using parsed timestamps; fallback to original order if unparsable
        monthlyTrend.sort((a, b) => a.ts - b.ts);

        // Keep the last 12 chronological points
        const last12 = monthlyTrend.slice(-12);

        // Map to the shape ChartWidget expects: { ts: number, period: string, label: string, value: number }
        const formatted = last12.map((t) => ({
          ts: t.ts === Number.MAX_SAFE_INTEGER ? NaN : t.ts,
          period: t.rawPeriod,
          label: Number.isFinite(t.ts) ? formatTsLabel(t.ts, t.rawPeriod) : t.rawPeriod,
          value: t.value,
        }));
        setTrendData(formatted);
        setRevenue(formatCurrency(totalRevenue));
      } else {
        // Clear values if no data
        setRevenue("-");
        setTrendData([]);
      }

      showSuccess("BI KPIs loaded.");
    } catch (err: any) {
      showError(err?.message || String(err));
      setRevenue("-");
      setTrendData([]);
    } finally {
      dismissToast(toastId);
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">BI Dashboard</h3>
        <div className="flex items-center gap-3">
          <div className="text-sm text-muted-foreground self-center">
            Currency: <span className="font-mono">{currencyCode}</span>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Year</label>
            <Input value={year} onChange={(e) => setYear(e.target.value)} className="w-24" placeholder="YYYY" />
          </div>

          <Button onClick={fetchKPIs} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh KPIs"}
          </Button>
        </div>
      </div>

      {/* Total Revenue on top */}
      <div>
        <KPICard
          title="Total Revenue"
          value={revenue}
          subtitle={`Sum of completed sales orders (${year || "all time"})`}
          loading={loading}
        />
      </div>

      {/* Revenue trend directly under Total Revenue for readability */}
      <div className="p-4 border rounded">
        <div className="text-sm font-medium mb-2">Revenue Trend (monthly)</div>
        {/* Use ts (timestamp) as xKey to enable a time-based X axis in ChartWidget */}
        <ChartWidget title="" type="line" data={trendData} xKey="ts" yKey="value" />
      </div>

      <div className="p-4 border rounded space-y-3">
        <div className="text-sm font-medium mb-2">Summary</div>
        <div className="text-sm">
          <div>
            Total Revenue: <span className="font-medium">{revenue}</span>
          </div>
          <div className="mt-2">
            Showing data for: <span className="font-mono">{year || "all time"}</span>
          </div>
          <div className="mt-4 text-sm text-muted-foreground">
            The revenue trend is now derived from timestamps so months render in chronological order with the correct values.
          </div>
        </div>
      </div>
    </div>
  );
};

export default BIDashboard;