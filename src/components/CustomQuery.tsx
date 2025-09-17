"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { showLoading, showSuccess, showError, dismissToast } from "@/utils/toast";

interface Props {
  relayHost: string;
  apiKey: string;
}

export const CustomQuery: React.FC<Props> = ({ relayHost, apiKey }) => {
  const [model, setModel] = useState("res.partner");
  const [method, setMethod] = useState("search_read");
  const [argsText, setArgsText] = useState("[]");
  const [kwargsText, setKwargsText] = useState('{}');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runQuery = async () => {
    if (!relayHost) {
      showError("Please enter a Relay Host (e.g. http://localhost:8000)");
      return;
    }

    let args: any = [];
    let kwargs: any = {};
    try {
      args = JSON.parse(argsText || "[]");
    } catch (e) {
      showError("Invalid JSON in args");
      return;
    }
    try {
      kwargs = JSON.parse(kwargsText || "{}");
    } catch (e) {
      showError("Invalid JSON in kwargs");
      return;
    }

    setRunning(true);
    setResult(null);
    const toastId = showLoading("Executing custom query...");

    try {
      const url = `${relayHost.replace(/\/$/, "")}/api/execute_method`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const payload = { model, method, args, kwargs };

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
      setResult({ status: resp.status, ok: resp.ok, body: json });

      if (resp.ok) {
        showSuccess("Query executed");
      } else {
        showError(
          `Query failed: ${
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
        <CardTitle>Custom Query</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="model">Model</Label>
            <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="method">Method</Label>
            <Input id="method" value={method} onChange={(e) => setMethod(e.target.value)} />
          </div>
        </div>

        <div>
          <Label htmlFor="args">Args (JSON)</Label>
          <Textarea id="args" value={argsText} onChange={(e) => setArgsText(e.target.value)} />
        </div>

        <div>
          <Label htmlFor="kwargs">Kwargs (JSON)</Label>
          <Textarea id="kwargs" value={kwargsText} onChange={(e) => setKwargsText(e.target.value)} />
        </div>

        <div className="flex gap-2">
          <Button onClick={runQuery} disabled={running}>
            {running ? "Running..." : "Execute"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setModel("res.partner");
              setMethod("search_read");
              setArgsText("[]");
              setKwargsText("{}");
              setResult(null);
            }}
          >
            Reset
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

export default CustomQuery;