"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showLoading, showSuccess, showError, dismissToast } from "@/utils/toast";
import KPICard from "./KPICard";
import ChartWidget from "./ChartWidget";
import MonthlyRevenueTable from "./MonthlyRevenueTable";
import { postToRelay } from "@/components/ai-chat/utils";
import { useLocalStorage } from "@/hooks/useLocalStorage";

interface Props {
  relayHost: string;
  apiKey?: string;
}

const defaultCurrency = "USD";

/** Safe number parsing */
const safeNumber = (v: any) => {
  if (v === undefined || v === null || v === "") return 0;
  if (typeof v === "number") return v;
  const cleaned = String(v).replace(/[,\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

/** Format a YYYY-MM string like "2025-03" to "Mar 2025" */
function formatMonthLabel(ym: string) {
  try {
    const [yStr, mStr] = (ym || "").split("-");
    if (!yStr || !mStr) return ym;
    const y = Number(yStr);
    const m = Number(mStr);
    if (!Number.isFinite(y) || !Number.isFinite(m)) return ym;
    return new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(new Date(y, m - 1, 1));
  } catch {
    return ym;
  }
}

/** Build YYYY-MM key from various upstream period formats.
 * Supports:
 * - "2025-03" or "2025-3" or "202503" or "20250301"
 * - "2025-03-15"
 * - Date strings parseable by Date.parse (e.g. "Mar 2025", "2025/03/01")
 * - Month names in other locales (e.g. "kwietnia 2025", "kwi 2025")
 * - Arrays like [2025,3] or [2025, "03"]
 * - Objects like {year:2025, month:3}
 * - Fallback: return String(raw)
 */
function normalizeToYearMonth(raw: any): string {
  if (raw === null || raw === undefined) return "";
  // If already YYYY-MM string
  if (typeof raw === "string") {
    const s = raw.trim();

    // Directly match YYYY-MM or YYYY-M
    const ym = s.match(/^(\d{4})-(\d{1,2})$/);
    if (ym) {
      const y = ym[1];
      const m = ym[2].padStart(2, "0");
      return `${y}-${m}`;
    }

    // YYYY-MM-DD
    const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (ymd) {
      const y = ymd[1];
      const m = ymd[2].padStart(2, "0");
      return `${y}-${m}`;
    }

    // Compact YYYYMM or YYYYMMDD
    const compact = s.match(/^(\d{4})(\d{2})(\d{2})?$/);
    if (compact) {
      const y = compact[1];
      const m = compact[2];
      return `${y}-${m}`;
    }

    // Try to parse localized month names (Polish and common English/short forms)
    try {
      // helper to strip diacritics and lowercase
      const normalizeStr = (src: string) =>
        src.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

      // mapping normalized month name fragments -> month number
      const monthNamesMap: Record<string, number> = {
        // English full & short
        january: 1,
        jan: 1,
        february: 2,
        feb: 2,
        march: 3,
        mar: 3,
        april: 4,
        apr: 4,
        may: 5,
        june: 6,
        jun: 6,
        july: 7,
        jul: 7,
        august: 8,
        aug: 8,
        september: 9,
        sept: 9,
        sep: 9,
        october: 10,
        oct: 10,
        november: 11,
        nov: 11,
        december: 12,
        dec: 12,
        // Polish (nominative/genitive/short forms) - normalized (diacritics removed)
        stycznia: 1,
        stycz: 1,
        styczen: 1,
        sty: 1,
        lutego: 2,
        luty: 2,
        lut: 2,
        marca: 3,
        marzec: 3,
        mar: 3,
        kwietnia: 4,
        kwiecien: 4,
        kwi: 4,
        maja: 5,
        maj: 5,
        czerwca: 6,
        czerwiec: 6,
        cze: 6,
        lipca: 7,
        lipiec: 7,
        lip: 7,
        sierpnia: 8,
        sierpien: 8,
        sie: 8,
        wrzesnia: 9,
        wrzesien: 9,
        wrz: 9,
        pazdziernika: 10,
        pazdziernik: 10,
        paz: 10,
        pazdz: 10,
        pazdzier: 10,
        listopada: 11,
        listopad: 11,
        lis: 11,
        grudnia: 12,
        grudzien: 12,
        gru: 12,
      };

      const norm = normalizeStr(s);

      // Attempt patterns like "kwietnia 2025", "kwi 2025", "april 2025", "apr 2025", "mar 2025"
      const monthNameThenYear = norm.match(/^([a-ząęółśżźćń\-\.]{3,})\s+(\d{4})$/u);
      if (monthNameThenYear) {
        const namePart = monthNameThenYear[1].replace(/\./g, "");
        const y = monthNameThenYear[2];
        const mapped = monthNamesMap[namePart];
        if (mapped) return `${y}-${String(mapped).padStart(2, "0")}`;
      }

      // Also check patterns like "2025 kwietnia" or "2025 kwi"
      const yearThenMonthName = norm.match(/^(\d{4})\s+([a-ząęółśżźćń\-\.]{3,})$/u);
      if (yearThenMonthName) {
        const y = yearThenMonthName[1];
        const namePart = yearThenMonthName[2].replace(/\./g, "");
        const mapped = monthNamesMap[namePart];
        if (mapped) return `${y}-${String(mapped).padStart(2, "0")}`;
      }

      // Try to pull any month token and a year anywhere in the string
      const anyMonth = norm.match(/([a-ząęółśżźćń\-\.]{3,})/u);
      const anyYear = norm.match(/(\d{4})/);
      if (anyMonth && anyYear) {
        const namePart = anyMonth[1].replace(/\./g, "");
        const y = anyYear[1];
        const mapped = monthNamesMap[namePart];
        if (mapped) return `${y}-${String(mapped).padStart(2, "0")}`;
      }
    } catch {
      // fallthrough to Date.parse fallback
    }

    // Try Date.parse (e.g. "Mar 2025")
    const parsed = Date.parse(s);
    if (!Number.isNaN(parsed)) {
      const d = new Date(parsed);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      return `${y}-${m}`;
    }

    // Fallback to string (keep it so debug can show unmapped ident)
    return s;
  }

  // Arrays like [2025,3] or ["2025","03"]
  if (Array.isArray(raw) && raw.length >= 2) {
    const a0 = raw[0];
    const a1 = raw[1];
    const y = Number(a0);
    const m = Number(a1);
    if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
      return `${String(y)}-${String(m).padStart(2, "0")}`;
    }
  }

  // Objects with year/month keys
  if (typeof raw === "object") {
    if (raw.year && raw.month) {
      const y = Number(raw.year);
      const m = Number(raw.month);
      if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
        return `${String(y)}-${String(m).padStart(2, "0")}`;
      }
    }
    // sometimes Odoo returns arrays inside objects or the group label under 'value' etc.
    if (raw.value) {
      return normalizeToYearMonth(raw.value);
    }
  }

  // As a last resort stringify the raw value so it does not crash downstream
  try {
    return String(raw);
  } catch {
    return "";
  }
}

/** Generate array of YYYY-MM for a full calendar year (Jan..Dec) */
function monthsForYear(year: string) {
  const y = Number(year);
  if (!Number.isFinite(y)) return [];
  const arr: string[] = [];
  for (let m = 1; m <= 12; m++) {
    arr.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return arr;
}

type MonthlyRow = { date_order: string; amount_total: number };

const BIDashboard: React.FC<Props> = ({ relayHost, apiKey }) => {
  const [loading, setLoading] = useState(false);
  const [revenue, setRevenue] = useState<string>("-");
  const [trendData, setTrendData] = useState<Array<Record<string, any>>>([]);
  const [currencyCode, setCurrencyCode] = useState<string>(defaultCurrency);

  // Debug states
  const [rawGroups, setRawGroups] = useState<any[] | null>(null);
  const [monthMapDebug, setMonthMapDebug] = useState<{ monthMap: Record<string, number>; unmapped: any[] }>({
    monthMap: {},
    unmapped: [],
  });
  const [showDebug, setShowDebug] = useState<boolean>(false);

  // Year selector for revenue/trend (default to current year)
  const [year, setYear] = useState<string>(new Date().getFullYear().toString());

  // last run from TotalRevenueCommand (if any)
  const [lastRun] = useLocalStorage<{ year: string; data: MonthlyRow[]; savedAt: string } | null>("last_total_revenue_results", null);

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

      // Build normalized monthMap first, collect unmapped entries for debugging
      const monthMap: Record<string, number> = {};
      const unmapped: any[] = [];
      let rawGroupsLocal: any[] = [];

      if (groupRes.ok && groupRes.parsed && groupRes.parsed.success && Array.isArray(groupRes.parsed.result)) {
        const groups = groupRes.parsed.result as any[];
        rawGroupsLocal = groups;

        for (const g of groups) {
          // Many relays return a grouping label under a field named after the group e.g. {'date_order:month': '2025-03', 'amount_total': 1234}
          const raw =
            g["date_order:month"] ??
            g["date_order:year"] ??
            g["date_order"] ??
            g[0] ??
            // Some read_group responses return a tuple-like array inside the 'value' or 'key' field
            g.value ??
            g.key ??
            String(g.period ?? "");

          const ym = normalizeToYearMonth(raw);
          const amount = safeNumber(g.amount_total ?? g.amount ?? (g[Object.keys(g).find((k) => /amount/i.test(k)) as any] ?? 0));

          if (ym && /^\d{4}-\d{2}$/.test(ym)) {
            monthMap[ym] = (monthMap[ym] || 0) + amount;
          } else {
            unmapped.push({ raw, normalized: ym, amount, original: g });
          }
        }
      } else {
        // If upstream returned non-standard shape, capture whatever parsed value exists for debugging
        rawGroupsLocal = groupRes.parsed ?? null;
      }

      // compute totalRevenue from normalized monthMap (safer than summing raw groups in case of duplicates)
      const totalRevenue = Object.values(monthMap).reduce((acc, n) => acc + Number(n || 0), 0);

      // Persist debug info before building final series
      setRawGroups(rawGroupsLocal as any);
      setMonthMapDebug({ monthMap, unmapped });

      let finalSeries: Array<{ period: string; label: string; value: number }> = [];

      if (Object.keys(monthMap).length === 0) {
        // If there are no normalized months but unmapped entries exist, try to display nothing and surface debug info
        setTrendData([]);
        setRevenue("-");
        showSuccess("BI KPIs loaded (no normalized month data). Check Debug for unmapped entries.");
      } else {
        if (/^\d{4}$/.test(chosenYear)) {
          // Build full Jan..Dec for the chosen year and map amounts (0 if missing)
          const months = monthsForYear(chosenYear);
          finalSeries = months.map((ym) => ({
            period: ym,
            label: formatMonthLabel(ym),
            value: monthMap[ym] ?? 0,
          }));
        } else {
          // No specific year chosen: build chronological list from monthMap keys
          const monthsArray = Object.keys(monthMap);
          monthsArray.sort((a, b) => {
            const aDate = Date.parse(`${a}-01`);
            const bDate = Date.parse(`${b}-01`);
            if (Number.isFinite(aDate) && Number.isFinite(bDate)) return aDate - bDate;
            return String(a).localeCompare(String(b));
          });
          finalSeries = monthsArray.map((ym) => ({
            period: ym,
            label: formatMonthLabel(ym),
            value: monthMap[ym] ?? 0,
          }));
        }

        setTrendData(finalSeries);
        setRevenue(formatCurrency(totalRevenue));
        showSuccess("BI KPIs loaded.");
      }
    } catch (err: any) {
      showError(err?.message || String(err));
      setRevenue("-");
      setTrendData([]);
      setRawGroups(null);
      setMonthMapDebug({ monthMap: {}, unmapped: [] });
    } finally {
      dismissToast(toastId);
      setLoading(false);
    }
  };

  // Import last run saved by TotalRevenueCommand
  const importLastRun = async () => {
    if (!lastRun || !lastRun.data || lastRun.data.length === 0) {
      showError("No saved TotalRevenueCommand run found. Execute the TotalRevenueCommand first.");
      return;
    }

    try {
      // Build monthMap from saved rows
      const monthMap: Record<string, number> = {};
      const unmapped: any[] = [];

      for (const item of lastRun.data) {
        const ym = normalizeToYearMonth(item.date_order);
        const amount = safeNumber(item.amount_total);
        if (ym && /^\d{4}-\d{2}$/.test(ym)) {
          monthMap[ym] = (monthMap[ym] || 0) + amount;
        } else {
          unmapped.push({ raw: item.date_order, normalized: ym, amount, original: item });
        }
      }

      // Build final series respecting chosen year if set
      let finalSeries: Array<{ period: string; label: string; value: number }> = [];
      const chosenYear = (year || "").trim();
      if (/^\d{4}$/.test(chosenYear)) {
        const months = monthsForYear(chosenYear);
        finalSeries = months.map((ym) => ({
          period: ym,
          label: formatMonthLabel(ym),
          value: monthMap[ym] ?? 0,
        }));
      } else {
        const keys = Object.keys(monthMap).sort((a, b) => {
          const ad = Date.parse(`${a}-01`);
          const bd = Date.parse(`${b}-01`);
          if (Number.isFinite(ad) && Number.isFinite(bd)) return ad - bd;
          return String(a).localeCompare(String(b));
        });
        finalSeries = keys.map((ym) => ({ period: ym, label: formatMonthLabel(ym), value: monthMap[ym] ?? 0 }));
      }

      const totalRevenue = Object.values(monthMap).reduce((s, n) => s + Number(n || 0), 0);

      setTrendData(finalSeries);
      setRevenue(formatCurrency(totalRevenue));
      setRawGroups(lastRun.data as any);
      setMonthMapDebug({ monthMap, unmapped });
      showSuccess(`Imported last run (${lastRun.year}) into dashboard.`);
    } catch (err: any) {
      showError(err?.message || String(err));
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

          <Button variant="ghost" onClick={() => setShowDebug((s) => !s)}>
            {showDebug ? "Hide Debug" : "Show Debug"}
          </Button>

          <Button variant="ghost" onClick={importLastRun} title="Import last TotalRevenueCommand run">
            Import Last Run
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
      <div className="p-4 border rounded space-y-4">
        <div>
          <div className="text-sm font-medium mb-2">Revenue Trend (monthly)</div>
          <ChartWidget title="" type="line" data={trendData} xKey="period" yKey="value" currency={currencyCode} />
        </div>

        <div>
          <div className="text-sm font-medium mb-2">Month vs Monthly Revenue</div>
          <MonthlyRevenueTable data={trendData.map((d) => ({ period: d.period, label: d.label, value: Number(d.value || 0) }))} currency={currencyCode} />
        </div>
      </div>

      {showDebug && (
        <div className="p-4 border rounded bg-white">
          <div className="flex items-center justify-between mb-3">
            <div className="font-medium">Debug: Aggregation details</div>
            <div className="text-sm text-muted-foreground">Useful to verify read_group → month mapping</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-xs font-medium mb-2">Raw read_group response</div>
              <pre className="bg-muted p-2 rounded text-xs max-h-56 overflow-auto whitespace-pre-wrap">
                {rawGroups ? JSON.stringify(rawGroups, null, 2) : "No raw groups captured."}
              </pre>
            </div>

            <div>
              <div className="text-xs font-medium mb-2">Normalized YYYY‑MM → revenue map</div>
              <pre className="bg-muted p-2 rounded text-xs max-h-56 overflow-auto whitespace-pre-wrap">
                {Object.keys(monthMapDebug.monthMap).length ? JSON.stringify(monthMapDebug.monthMap, null, 2) : "No month map data."}
              </pre>
            </div>

            <div>
              <div className="text-xs font-medium mb-2">Unmapped group entries (why some groups couldn't be normalized)</div>
              <pre className="bg-muted p-2 rounded text-xs max-h-56 overflow-auto whitespace-pre-wrap">
                {monthMapDebug.unmapped && monthMapDebug.unmapped.length ? JSON.stringify(monthMapDebug.unmapped, null, 2) : "No unmapped entries."}
              </pre>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-xs font-medium mb-2">Final series (what is rendered)</div>
            <pre className="bg-muted p-2 rounded text-xs max-h-56 overflow-auto whitespace-pre-wrap">
              {trendData && trendData.length ? JSON.stringify(trendData, null, 2) : "No final series."}
            </pre>
          </div>
        </div>
      )}

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
            The revenue trend now shows the months of the chosen year (Jan–Dec) on the X axis and monthly revenue on the Y axis, filling missing months with zero.
            If values still look incorrect, toggle Debug and inspect "Raw read_group response" + "Unmapped group entries" to see how upstream groups are represented.
          </div>
        </div>
      </div>
    </div>
  );
};

export default BIDashboard;