"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { showLoading, showSuccess, showError, dismissToast } from "@/utils/toast";
import { useRpcConfirm } from "@/components/rpc-confirm";

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

  const confirmRpc = useRpcConfirm();

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

    const payload = { model, method, args, kwargs };

    // Ask user to confirm the exact payload before sending
    try {
      const ok = await confirmRpc(payload);
      if (!ok) {
        showError("Query cancelled by user.");
        return;
      }
    } catch {
      showError("Unable to confirm query.");
      return;
    }

    setRunning(true);
    setResult(null);
    const toastId = showLoading("Executing custom query...");

    try {
      const url = `${relayHost.replace(/\/$/, "")}/api/execute_method`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

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

      if (resp.ok && json && json.success) {
        showSuccess("Query executed successfully");
      } else {
        const errorMessage = (json && (json.error || json.message)) || `HTTP ${resp.status} ${resp.statusText}`;
        showError(`Query failed: ${errorMessage}`);
      }
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      setResult({ error: errorMessage });
      if (errorMessage.toLowerCase().includes("failed to fetch")) {
        showError("Network Error: Failed to fetch. Check Relay Host URL, server status, and CORS settings.");
      } else {
        showError(errorMessage);
      }
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