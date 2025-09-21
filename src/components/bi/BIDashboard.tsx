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

type KV = { title: string; value: string };

const defaultCurrency = "USD";

const BIDashboard: React.FC<Props> = ({ relayHost, apiKey }) => {
  const [loading, setLoading] = useState(false);
  const [revenue, setRevenue] = useState<string>("-");
  const [inventoryValue, setInventoryValue] = useState<string>("-");
  const [topSuppliers, setTopSuppliers] = useState<KV[]>([]);
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
      if (companyRes.ok && companyRes.parsed && companyRes.parsed.success && Array.isArray(companyRes.parsed.result) && companyRes.parsed.result.length > 0) {
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
      let monthlyTrend: Array<{ period: string; value: number }> = [];

      if (groupRes.ok && groupRes.parsed && groupRes.parsed.success && Array.isArray(groupRes.parsed.result)) {
        const groups = groupRes.parsed.result as any[];
        for (const g of groups) {
          const amount = safeNumber(g.amount_total ?? g.amount ?? g["amount_total"]);
          totalRevenue += amount;
          const period = g["date_order:month"] ?? g["date_order:year"] ?? g["date_order"] ?? g[0] ?? "(period)";
          monthlyTrend.push({ period: String(period), value: amount });
        }
        monthlyTrend.sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0));
        const last12 = monthlyTrend.slice(-12);
        setTrendData(last12.map((t) => ({ period: t.period, value: t.value })));
        setRevenue(formatCurrency(totalRevenue));
      } else {
        setRevenue("-");
        setTrendData([]);
      }

      // Inventory estimate
      const prodPayload = {
        model: "product.product",
        method: "search_read",
        args: [[]],
        kwargs: { fields: ["qty_available", "list_price", "name"], limit: 2000 },
      };
      const prodRes = await postToRelay(execUrl, prodPayload, apiKey, 30000);
      let invValue = 0;
      if (prodRes.ok && prodRes.parsed && prodRes.parsed.success && Array.isArray(prodRes.parsed.result)) {
        for (const p of prodRes.parsed.result) {
          const qty = safeNumber(p.qty_available ?? p.virtual_available ?? 0);
          const price = safeNumber(p.list_price ?? p.standard_price ?? 0);
          invValue += qty * price;
        }
        setInventoryValue(formatCurrency(invValue));
      } else {
        setInventoryValue("-");
      }

      // Top suppliers (unchanged)
      const purchaseGroupPayload = {
        model: "purchase.order",
        method: "read_group",
        args: [[], ["amount_total"], ["partner_id"]],
        kwargs: { lazy: false },
      };
      const purchaseRes = await postToRelay(execUrl, purchaseGroupPayload, apiKey, 30000);
      const topSup: KV[] = [];
      if (purchaseRes.ok && purchaseRes.parsed && Array.isArray(purchaseRes.parsed.result)) {
        const groups = purchaseRes.parsed.result as any[];
        const norm = groups
          .map((g) => {
            const partner = Array.isArray(g.partner_id) ? g.partner_id[1] : String(g.partner_id || "");
            const amount = safeNumber(g.amount_total || g.amount);
            return { partner, amount };
          })
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 5);
        for (const n of norm) {
          topSup.push({ title: n.partner || "(unknown)", value: formatCurrency(n.amount) });
        }
      }
      setTopSuppliers(topSup);

      showSuccess("BI KPIs loaded.");
    } catch (err: any) {
      showError(err?.message || String(err));
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
          <div className="text-sm text-muted-foreground self-center">Currency: <span className="font-mono">{currencyCode}</span></div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Year</label>
            <Input
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-24"
              placeholder="YYYY"
            />
          </div>

          <Button onClick={fetchKPIs} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh KPIs"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard title="Total Revenue" value={revenue} subtitle={`Sum of completed sales orders (${year || "all time"})`} loading={loading} />
        <KPICard title="Inventory Value" value={inventoryValue} subtitle={`Estimated stock value (${currencyCode})`} loading={loading} />
        <div>
          <div className="p-4 border rounded space-y-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium">Top Suppliers</div>
            </div>
            {topSuppliers.length === 0 ? (
              <div className="text-sm text-muted-foreground">No suppliers listed</div>
            ) : (
              topSuppliers.map((s, i) => (
                <div key={i} className="flex items-center justify-between py-1">
                  <div className="text-sm">{s.title}</div>
                  <div className="text-sm font-medium">{s.value}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 border rounded">
          <div className="text-sm font-medium mb-2">Revenue Trend (monthly)</div>
          <ChartWidget title="" type="line" data={trendData} xKey="period" yKey="value" />
        </div>

        <div className="p-4 border rounded space-y-3">
          <div className="text-sm font-medium mb-2">Summary</div>
          <div className="text-sm">
            <div>Total Revenue: <span className="font-medium">{revenue}</span></div>
            <div className="mt-2">Showing data for: <span className="font-mono">{year || "all time"}</span></div>
            <div className="mt-4 text-sm text-muted-foreground">Removed Top Customers and Best-selling Products panels (per settings) — use the Refresh KPIs button after changing the year.</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BIDashboard;