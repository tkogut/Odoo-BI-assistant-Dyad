"use client";

import { useState } from "react";
import { postToRelay } from "@/components/ai-chat/utils";
import { normalizeToYearMonth, safeNumber } from "./utils";

/**
 * useBidata
 * - Encapsulates fetchKPIs and currency detection
 * - Returns { loading, rawGroups, monthMap, unmapped, totalRevenue, fetchKPIs }
 */
export function useBidata(relayHost: string, apiKey?: string) {
  const [loading, setLoading] = useState(false);
  const [rawGroups, setRawGroups] = useState<any[] | null>(null);
  const [monthMap, setMonthMap] = useState<Record<string, number>>({});
  const [unmapped, setUnmapped] = useState<any[]>([]);
  const [totalRevenue, setTotalRevenue] = useState<number>(0);

  const safeHost = (h: string) => h.replace(/\/$/, "");

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
            return cand;
          }
        }
      }
    } catch {
      // ignore detection failures
    }
    return undefined;
  };

  const fetchKPIs = async (relayHostParam: string, year?: string) => {
    if (!relayHostParam) throw new Error("No relayHost");
    setLoading(true);
    setRawGroups(null);
    setMonthMap({});
    setUnmapped([]);
    setTotalRevenue(0);

    try {
      const execUrl = `${safeHost(relayHostParam)}/api/execute_method`;

      // build domain
      const domain: any[] = [["state", "in", ["sale", "done"]]];
      const chosenYear = (year || "").trim();
      if (/^\d{4}$/.test(chosenYear)) {
        domain.push(["date_order", ">=", `${chosenYear}-01-01`]);
        domain.push(["date_order", "<=", `${chosenYear}-12-31`]);
      }

      const groupPayload = {
        model: "sale.order",
        method: "read_group",
        args: [domain, ["amount_total"], ["date_order:month"]],
        kwargs: { lazy: false },
      };

      const groupRes = await postToRelay(execUrl, groupPayload, apiKey, 30000);

      const _monthMap: Record<string, number> = {};
      const _unmapped: any[] = [];
      let _rawGroupsLocal: any[] = [];

      if (groupRes.ok && groupRes.parsed && groupRes.parsed.success && Array.isArray(groupRes.parsed.result)) {
        const groups = groupRes.parsed.result as any[];
        _rawGroupsLocal = groups;

        for (const g of groups) {
          const raw =
            g["date_order:month"] ??
            g["date_order:year"] ??
            g["date_order"] ??
            g[0] ??
            (g as any).value ??
            (g as any).key ??
            String((g as any).period ?? "");

          const ym = normalizeToYearMonth(raw);
          const amount = safeNumber(g.amount_total ?? g.amount ?? (g[Object.keys(g).find((k) => /amount/i.test(k)) as any] ?? 0));

          if (ym && /^\d{4}-\d{2}$/.test(ym)) {
            _monthMap[ym] = (_monthMap[ym] || 0) + amount;
          } else {
            _unmapped.push({ raw, normalized: ym, amount, original: g });
          }
        }
      } else {
        _rawGroupsLocal = groupRes.parsed ?? null;
      }

      const total = Object.values(_monthMap).reduce((acc, n) => acc + Number(n || 0), 0);

      setRawGroups(_rawGroupsLocal as any);
      setMonthMap(_monthMap);
      setUnmapped(_unmapped);
      setTotalRevenue(total);

      // also return a detected currency (best-effort)
      const detectedCurrency = await detectCompanyCurrency(execUrl);

      return { monthMap: _monthMap, unmapped: _unmapped, rawGroups: _rawGroupsLocal, total, detectedCurrency };
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    rawGroups,
    monthMap,
    unmapped,
    totalRevenue,
    fetchKPIs,
    detectCompanyCurrency,
  };
}

export default useBidata;