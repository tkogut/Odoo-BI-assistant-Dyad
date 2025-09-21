"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
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
        if (Array.isArray(cur) && cur[0]) {
          const curId = cur[0];
          const curPayload = {
            model: "res.currency",
            method: "search_read",
            args: [[["id", "=", curId]]],
            kwargs: { fields: ["name", "symbol"], limit: 1 },
          };
          const curRes = await postToRelay(execUrl, curPayload, apiKey, 10000);
          if (curRes.ok && curRes.parsed && curRes.parsed.success && Array.isArray(curRes.parsed.result) && curRes.parsed.result.length > 0) {
            const c = curRes.parsed.result[0];
            if (c.name && typeof c.name === "string" && /^[A-Z]{3}$/.test(c.name.trim())) {
              setCurrencyCode(c.name.trim());
              return;
            }
            if (c.symbol && typeof c.symbol === "string") {
              const s = c.symbol.trim();
              if (s.includes("z") || s.includes("ł") || s.toLowerCase().includes("pln")) {
                setCurrencyCode("PLN");
                return;
              }
            }
          }
        }
      }
    } catch {
      // ignore detection failures
    }
  };

  const safeNumber = (v: any) => {
    if (v === undefined || v === null || v === "") return 0;
    if (typeof v === "number") return v;
    // Remove common formatting (commas, spaces)
    const cleaned = String(v).replace(/[,\s]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
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

      // Best-effort currency detection
      await detectCompanyCurrency(execUrl);

      // Use read_group to get monthly sales aggregates (more accurate & efficient than fetching all orders)
      const groupPayload = {
        model: "sale.order",
        method: "read_group",
        args: [[["state", "in", ["sale", "done"]]], ["amount_total"], ["date_order:month"]],
        kwargs: { lazy: false },
      };
      const groupRes = await postToRelay(execUrl, groupPayload, apiKey, 30000);

      let totalRevenue = 0;
      let monthlyTrend: Array<{ period: string; value: number }> = [];

      if (groupRes.ok && groupRes.parsed && groupRes.parsed.success && Array.isArray(groupRes.parsed.result)) {
        const groups = groupRes.parsed.result as any[];

        // Sum aggregated amount fields for total revenue
        for (const g of groups) {
          const amount = safeNumber(g.amount_total ?? g.amount ?? g["amount_total"]);
          totalRevenue += amount;
          const period = g["date_order:month"] ?? g["date_order:year"] ?? g["date_order"] ?? g[0] ?? "(period)";
          monthlyTrend.push({ period: String(period), value: amount });
        }

        // Sort by period (strings are YYYY-MM so lexical sort is chronological)
        monthlyTrend.sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0));

        // Keep last 12 months (or fewer)
        const last12 = monthlyTrend.slice(-12);
        setTrendData(last12.map((t) => ({ period: t.period, value: t.value })));
        setRevenue(formatCurrency(totalRevenue));
      } else {
        // Fallback: try to fetch a bulk list and sum as before (still robust parsing)
        const salePayload = {
          model: "sale.order",
          method: "search_read",
          args: [[["state", "in", ["sale", "done"]]]],
          kwargs: { fields: ["amount_total", "date_order"], limit: 5000 },
        };
        const saleRes = await postToRelay(execUrl, salePayload, apiKey, 30000);
        if (saleRes.ok && saleRes.parsed && saleRes.parsed.success && Array.isArray(saleRes.parsed.result)) {
          const rows = saleRes.parsed.result as any[];
          totalRevenue = 0;
          const trendMap: Record<string, number> = {};
          for (const s of rows) {
            const amt = safeNumber(s.amount_total ?? s.amount_total);
            totalRevenue += amt;
            const d = s.date_order ? new Date(s.date_order) : null;
            if (d) {
              const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
              trendMap[key] = (trendMap[key] || 0) + amt;
            }
          }
          const trendKeys = Object.keys(trendMap).sort();
          const trend = trendKeys.slice(-12).map((k) => ({ period: k, value: Math.round((trendMap[k] || 0) * 100) / 100 }));
          setTrendData(trend);
          setRevenue(formatCurrency(totalRevenue));
        } else {
          setRevenue("-");
          setTrendData([]);
        }
      }

      // Inventory: sum qty_available * list_price (best-effort; may need more paging for large catalogs)
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

      // Top suppliers using read_group on purchase.order
      const purchaseGroupPayload = {
        model: "purchase.order",
        method: "read_group",
        args: [[], ["amount_total"], ["partner_id"]],
        kwargs: { lazy: false },
      };
      const purchaseRes = await postToRelay(execUrl, purchaseGroupPayload, apiKey, 30000);
      const top: KV[] = [];
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
          top.push({ title: n.partner || "(unknown)", value: formatCurrency(n.amount) });
        }
      }
      setTopSuppliers(top);

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
        <div className="flex gap-2">
          <div className="text-sm text-muted-foreground self-center">Currency: <span className="font-mono">{currencyCode}</span></div>
          <Button onClick={fetchKPIs} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh KPIs"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard title="Total Revenue" value={revenue} subtitle={`Sum of completed sales orders (${currencyCode})`} loading={loading} />
        <KPICard title="Inventory Value" value={inventoryValue} subtitle={`Estimated stock value (${currencyCode})`} loading={loading} />
        <div>
          <div className="p-4 border rounded">
            <div className="text-sm font-medium mb-2">Top Suppliers</div>
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

      <div>
        <ChartWidget title="Revenue Trend (monthly)" type="line" data={trendData} xKey="period" yKey="value" />
      </div>
    </div>
  );
};

export default BIDashboard;