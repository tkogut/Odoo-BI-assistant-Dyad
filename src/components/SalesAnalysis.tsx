"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { showLoading, showSuccess, showError, dismissToast } from "@/utils/toast";

interface Props {
  relayHost: string;
  apiKey: string;
}

export const SalesAnalysis: React.FC<Props> = ({ relayHost, apiKey }) => {
  const [period, setPeriod] = useState<"monthly" | "quarterly" | "yearly">("monthly");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  const analyze = async () => {
    if (!relayHost) {
      showError("Please enter a Relay Host (e.g. http://localhost:8000)");
      return;
    }
    setRunning(true);
    setResult(null);
    const toastId = showLoading("Analyzing sales...");

    try {
      const url = `${relayHost.replace(/\/$/, "")}/api/sales/analyze`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "X-API-Key": apiKey } : {}),
        },
        body: JSON.stringify({ period }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const json = await resp.json().catch(() => null);
      setResult({ status: resp.status, ok: resp.ok, body: json });

      if (resp.ok) {
        showSuccess("Sales analysis completed");
      } else {
        showError(
          `Analysis failed: ${
            (json && (json.error || json.message)) || `HTTP ${resp.status} ${resp.statusText}`
          }`,
        );
      }
    } catch (err: any) {
      setResult({ error: err?.message || String(err) });
      showError(err?.message || String(err));
    } finally {
      dismissToast(toastId);
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sales Analysis</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Period</Label>
          <Select value={period} onChange={(e) => setPeriod(e as any)}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button onClick={analyze} disabled={running}>
            {running ? "Analyzing..." : "Analyze Sales"}
          </Button>
        </div>

        <div>
          <h4 className="font-medium">Raw response</h4>
          <pre className="bg-muted p-3 rounded text-sm overflow-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
};

export default SalesAnalysis;