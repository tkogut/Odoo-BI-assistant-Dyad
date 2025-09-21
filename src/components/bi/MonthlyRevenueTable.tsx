"use client";

import React from "react";

interface Row {
  period: string;
  label?: string;
  value: number;
}

interface Props {
  data: Row[];
  currency?: string;
  className?: string;
}

/**
 * MonthlyRevenueTable
 * - Renders a simple responsive table showing Month (label) and Revenue.
 * - Shows a total row at the bottom.
 */
const MonthlyRevenueTable: React.FC<Props> = ({ data = [], currency = "USD", className }) => {
  const fmt = (v: number) => {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(
        Number(v || 0),
      );
    } catch {
      return `${Number(v || 0).toFixed(2)} ${currency || "USD"}`;
    }
  };

  const total = (data || []).reduce((acc, r) => acc + Number(r.value || 0), 0);

  return (
    <div className={className}>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Month</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Monthly Revenue</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
            {(data || []).map((row) => (
              <tr key={row.period}>
                <td className="px-4 py-2 text-sm">{row.label ?? row.period}</td>
                <td className="px-4 py-2 text-sm text-right font-medium">{fmt(row.value)}</td>
              </tr>
            ))}

            <tr className="bg-gray-50 dark:bg-gray-800">
              <td className="px-4 py-2 text-sm font-semibold">Total</td>
              <td className="px-4 py-2 text-sm text-right font-semibold">{fmt(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MonthlyRevenueTable;