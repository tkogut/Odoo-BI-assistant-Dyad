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
    // pick a locale hint for PLN vs others
    const locale = code === "PLN" ? "pl-PL" : "en-US";
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(Number(n || 0));
    } catch {
      // If Intl fails (unknown currency code), fall back to simple formatting with code appended
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
          // If the name appears to be a 3-letter ISO code, use it directly (e.g., "PLN", "USD")
          const cand = String(cur[1]).trim();
          if (/^[A-Z]{3}$/.test(cand)) {
            setCurrencyCode(cand);
            return;
          }
        }
        // If currency_id is an id or name not in ISO form, attempt to fetch res.currency by id
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
            // Prefer 'name' if it's an ISO code; otherwise try to infer from symbol -> map PLN symbol to PLN if possible
            if (c.name && typeof c.name === "string" && /^[A-Z]{3}$/.test(c.name.trim())) {
              setCurrencyCode(c.name.trim());
              return;
            }
            if (c.symbol && typeof c.symbol === "string") {
              // common symbols: "zł" -> assume PLN
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
      // ignore detection failures and keep default currency
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
      const saleUrl = `${safeHost(relayHost)}/api/execute_method`;

      // Try to detect company currency first (best-effort)
      await detectCompanyCurrency(saleUrl);

      // 1) Revenue: sum amount_total from sale.order (recent window or all completed)
      const salePayload = {
        model: "sale.order",
        method: "search_read",
        args: [[["state", "in", ["sale", "done"]]]],
        kwargs: { fields: ["amount_total", "date_order"], limit: 1000 },
      };
      const saleRes = await postToRelay(saleUrl, salePayload, apiKey, 30000);
      let totalRevenue = 0;
      if (saleRes.ok && saleRes.parsed && saleRes.parsed.success && Array.isArray(saleRes.parsed.result)) {
        for (const s of saleRes.parsed.result) {
          totalRevenue += Number(s.amount_total || 0);
        }
        setRevenue(formatCurrency(totalRevenue));
      } else {
        setRevenue("-");
      }

      // 2) Inventory value: fetch product.product list and compute qty * list_price
      const prodPayload = {
        model: "product.product",
        method: "search_read",
        args: [[]],
        kwargs: { fields: ["qty_available", "list_price", "name"], limit: 500 },
      };
      const prodRes = await postToRelay(saleUrl, prodPayload, apiKey, 30000);
      let invValue = 0;
      if (prodRes.ok && prodRes.parsed && prodRes.parsed.success && Array.isArray(prodRes.parsed.result)) {
        for (const p of prodRes.parsed.result) {
          invValue += Number(p.qty_available || 0) * Number(p.list_price || 0);
        }
        setInventoryValue(formatCurrency(invValue));
      } else {
        setInventoryValue("-");
      }

      // 3) Top suppliers: read_group on purchase.order partner totals
      const purchaseGroupPayload = {
        model: "purchase.order",
        method: "read_group",
        args: [[], ["amount_total"], ["partner_id"]],
        kwargs: { lazy: false },
      };
      const purchaseRes = await postToRelay(saleUrl, purchaseGroupPayload, apiKey, 30000);
      const top: KV[] = [];
      if (purchaseRes.ok && purchaseRes.parsed && Array.isArray(purchaseRes.parsed.result)) {
        const groups = purchaseRes.parsed.result as any[];
        // Normalize and sort by amount_total
        const norm = groups
          .map((g) => {
            const partner = Array.isArray(g.partner_id) ? g.partner_id[1] : String(g.partner_id || "");
            const amount = Number(g.amount_total || 0);
            return { partner, amount };
          })
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 5);
        for (const n of norm) {
          top.push({ title: n.partner, value: formatCurrency(n.amount) });
        }
        setTopSuppliers(top);
      } else {
        setTopSuppliers([]);
      }

      // 4) Trend: produce simple monthly revenue trend from saleRes if available
      const trendMap: Record<string, number> = {};
      if (saleRes.ok && saleRes.parsed && saleRes.parsed.success && Array.isArray(saleRes.parsed.result)) {
        for (const s of saleRes.parsed.result) {
          const d = s.date_order ? new Date(s.date_order) : null;
          if (!d) continue;
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          trendMap[key] = (trendMap[key] || 0) + Number(s.amount_total || 0);
        }
      }
      const trend = Object.keys(trendMap)
        .sort()
        .slice(-12)
        .map((k) => ({ period: k, value: Math.round((trendMap[k] || 0) * 100) / 100 }));
      setTrendData(trend);

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