"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { showLoading, showSuccess, showError, dismissToast } from "@/utils/toast";
import { useRpcConfirm } from "@/components/rpc-confirm";

interface Props {
  relayHost: string;
  apiKey: string;
}

interface SalesResult {
  "date_order:month"?: string;
  "date_order:year"?: string;
  amount_total: number;
  __count: number;
}

export const SalesAnalysis: React.FC<Props> = ({ relayHost, apiKey }) => {
  const [period, setPeriod] = useState<"month" | "year">("month");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<SalesResult[]>([]);
  const confirmRpc = useRpcConfirm();

  const analyze = async () => {
    if (!relayHost) {
      showError("Please enter a Relay Host (e.g. http://localhost:8000)");
      return;
    }

    const payload = {
      model: "sale.order",
      method: "read_group",
      args: [
        [["state", "in", ["sale", "done"]]], // domain: confirmed sales orders
        ["amount_total"], // fields to aggregate
        [`date_order:${period}`] // group by
      ],
      kwargs: {
        lazy: false // Important for read_group to return all results
      },
    };

    try {
      const ok = await confirmRpc(payload);
      if (!ok) {
        showError("Analysis cancelled by user.");
        return;
      }
    } catch {
      showError("Unable to confirm analysis.");
      return;
    }

    setRunning(true);
    setResults([]);
    const toastId = showLoading("Analyzing sales...");

    try {
      const url = `${relayHost.replace(/\/$/, "")}/api/execute_method`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "X-API-Key": apiKey } : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const json = await resp.json().catch(() => null);

      if (resp.ok && json && json.success) {
        setResults(json.result);
        showSuccess(`Sales analysis completed. Found ${json.result.length} groups.`);
      } else {
        const errorMessage = (json && (json.error || json.message)) || `HTTP ${resp.status} ${resp.statusText}`;
        showError(`Analysis failed: ${errorMessage}`);
        setResults([]);
      }
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      if (errorMessage.toLowerCase().includes("failed to fetch")) {
        showError("Network Error: Failed to fetch. Check Relay Host URL, server status, and CORS settings.");
      } else {
        showError(errorMessage);
      }
      setResults([]);
    } finally {
      dismissToast(toastId);
      setRunning(false);
    }
  };

  const formatCurrency = (amount: number) => {
    // A real app would get the currency from Odoo's res.company or res.currency
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sales Analysis</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Group By</Label>
          <Select value={period} onValueChange={(value) => setPeriod(value as any)}>
            <SelectTrigger>
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Monthly</SelectItem>
              <SelectItem value="year">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button onClick={analyze} disabled={running}>
            {running ? "Analyzing..." : "Analyze Sales"}
          </Button>
        </div>

        <div>
          <h4 className="font-medium">Results</h4>
          {results.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Total Sales</TableHead>
                  <TableHead className="text-right">Order Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell>{row[`date_order:${period}`]}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.amount_total)}</TableCell>
                    <TableCell className="text-right">{row.__count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
             <p className="text-sm text-muted-foreground mt-2">
              No results to display.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default SalesAnalysis;