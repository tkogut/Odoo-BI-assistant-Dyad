"use client";

import React, { useState } from "react";
import KPICard from "./KPICard";
import ChartWidget from "./ChartWidget";
import MonthlyRevenueTable from "./MonthlyRevenueTable";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { showError, showSuccess } from "@/utils/toast";
import BIControls from "./BIControls";
import BIDebugPanel from "./BIDebugPanel";
import useBidata from "./useBidata";
import { formatMonthLabel, monthsForYear } from "./utils";

interface Props {
  relayHost: string;
  apiKey?: string;
}

type MonthlyRow = { date_order: string; amount_total: number };

const BIDashboard: React.FC<Props> = ({ relayHost, apiKey }) => {
  const [loadingState, setLoadingState] = useState(false);
  const [revenue, setRevenue] = useState<string>("-");
  const [trendData, setTrendData] = useState<Array<{ period: string; label: string; value: number }>>([]);
  const [currencyCode, setCurrencyCode] = useState<string>("USD");

  // Debug toggles
  const [showDebug, setShowDebug] = useState<boolean>(false);

  // Year selector
  const [year, setYear] = useState<string>(new Date().getFullYear().toString());

  // last run from TotalRevenueCommand (if any)
  const [lastRun] = useLocalStorage<{ year: string; data: MonthlyRow[]; savedAt: string } | null>("last_total_revenue_results", null);

  // useBidata provides fetchKPIs and debug data (monthMap, unmapped, rawGroups)
  const bidata = useBidata(relayHost, apiKey);

  // Helper to build and apply final series from a month-map
  const applyMonthMapToSeries = (monthMap: Record<string, number>, chosenYear?: string) => {
    let finalSeries: Array<{ period: string; label: string; value: number }> = [];
    const chosen = (chosenYear || year || "").trim();
    if (/^\d{4}$/.test(chosen)) {
      const months = monthsForYear(chosen);
      finalSeries = months.map((ym) => ({ period: ym, label: formatMonthLabel(ym), value: monthMap[ym] ?? 0 }));
    } else {
      const keys = Object.keys(monthMap).sort((a, b) => {
        const ad = Date.parse(`${a}-01`);
        const bd = Date.parse(`${b}-01`);
        if (Number.isFinite(ad) && Number.isFinite(bd)) return ad - bd;
        return String(a).localeCompare(String(b));
      });
      finalSeries = keys.map((ym) => ({ period: ym, label: formatMonthLabel(ym), value: monthMap[ym] ?? 0 }));
    }
    setTrendData(finalSeries);
    const total = Object.values(monthMap).reduce((s, n) => s + Number(n || 0), 0);
    setRevenue(total === 0 ? "-" : new Intl.NumberFormat(undefined, { style: "currency", currency: currencyCode || "USD" }).format(total));
    return finalSeries;
  };

  // Refresh KPIs (delegates to hook)
  const fetchKPIs = async () => {
    if (!relayHost) {
      showError("Please configure a Relay Host in Settings.");
      return;
    }
    setLoadingState(true);
    try {
      const result = await bidata.fetchKPIs(relayHost, year);
      // If the hook detected a currency, set it
      if (result && result.detectedCurrency) {
        setCurrencyCode(result.detectedCurrency);
      }
      applyMonthMapToSeries(result.monthMap || {}, year);
      showSuccess("BI KPIs loaded.");
    } catch (err: any) {
      showError(err?.message || String(err));
      setTrendData([]);
      setRevenue("-");
    } finally {
      setLoadingState(false);
    }
  };

  const importLastRun = async () => {
    if (!lastRun || !lastRun.data || lastRun.data.length === 0) {
      showError("No saved TotalRevenueCommand run found. Execute the TotalRevenueCommand first.");
      return;
    }

    try {
      const monthMap: Record<string, number> = {};
      const unmapped: any[] = [];
      for (const item of lastRun.data) {
        const ym = item.date_order;
        const amount = Number(item.amount_total || 0);
        // accept already-normalized values (TotalRevenueCommand stores the label as provided)
        // rely on same normalization logic as prior (we expect YYYY-MM or similar). If it's not normalized,
        // BIDebugPanel will show the unmapped entries.
        monthMap[ym] = (monthMap[ym] || 0) + amount;
      }
      applyMonthMapToSeries(monthMap, year);
      setShowDebug(true);
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

          <BIControls
            year={year}
            onYearChange={setYear}
            onRefresh={fetchKPIs}
            onToggleDebug={() => setShowDebug((s) => !s)}
            onImportLastRun={importLastRun}
            loading={loadingState || bidata.loading}
            showDebug={showDebug}
          />
        </div>
      </div>

      <div>
        <KPICard title="Total Revenue" value={revenue} subtitle={`Sum of completed sales orders (${year || "all time"})`} loading={loadingState || bidata.loading} />
      </div>

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
        <BIDebugPanel rawGroups={bidata.rawGroups} monthMap={bidata.monthMap} unmapped={bidata.unmapped} finalSeries={trendData} />
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
            The revenue trend shows months on the X axis and monthly revenue on the Y axis, filling missing months with zero when a year is selected.
            If values look incorrect, toggle Debug to inspect the upstream read_group response and unmapped entries.
          </div>
        </div>
      </div>
    </div>
  );
};

export default BIDashboard;