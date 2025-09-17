"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { showError, showSuccess } from "@/utils/toast";

interface DiagnosticsProps {
  relayHost: string;
  apiKey: string;
}

type TestResult = {
  ok: boolean;
  status?: number;
  statusText?: string;
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody?: unknown;
  responseText?: string;
  responseJson?: unknown;
  error?: string;
};

const DEFAULT_TIMEOUT = 10000;

export const Diagnostics = ({ relayHost, apiKey }: DiagnosticsProps) => {
  const [customPath, setCustomPath] = useState("/api/execute_method");
  const [lastResult, setLastResult] = useState<TestResult | null>(null);
  const [loading, setLoading] = useState(false);

  const buildUrl = (path: string) => {
    if (!relayHost) return "";
    const base = relayHost.replace(/\/$/, "");
    return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
  };

  const doFetch = async (method: "GET" | "POST", path: string, body?: unknown) => {
    const url = buildUrl(path);
    if (!url) {
      showError("Please enter a Relay Host to run diagnostics.");
      return;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) headers["X-API-Key"] = apiKey;

    setLoading(true);
    setLastResult(null);

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    try {
      const resp = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const text = await resp.text();
      let json: unknown | undefined = undefined;
      try {
        json = text ? JSON.parse(text) : undefined;
      } catch {
        // not JSON
      }

      const result: TestResult = {
        ok: resp.ok,
        status: resp.status,
        statusText: resp.statusText,
        url,
        method,
        requestHeaders: headers,
        requestBody: body,
        responseText: text,
        responseJson: json,
      };

      setLastResult(result);

      if (resp.ok) {
        showSuccess(`Request succeeded (${resp.status})`);
      } else {
        showError(`Request failed (${resp.status}) — see diagnostics below`);
      }
    } catch (err: any) {
      // Common network errors (CORS, connection refused, timeout) come through here
      const message = err?.name === "AbortError" ? "Request timed out" : err?.message || String(err);
      const result: TestResult = {
        ok: false,
        url,
        method,
        requestHeaders: headers,
        requestBody: body,
        error: message,
      };
      setLastResult(result);

      // Provide a helpful toast
      if (message === "Failed to fetch") {
        showError("Network-level error: 'Failed to fetch' (possible CORS, DNS, or connection issue). See diagnostics below.");
      } else {
        showError(message);
      }
      console.error("Diagnostics fetch error:", err);
    } finally {
      clearTimeout(id);
      setLoading(false);
    }
  };

  const runSimplePost = () =>
    doFetch("POST", "/api/execute_method", {
      model: "res.partner",
      method: "search_read",
      args: [[[]]],
      kwargs: { fields: ["id", "name"], limit: 1 },
    });

  const runSearchEmployee = () => doFetch("POST", "/api/search_employee", { name: "test", limit: 1 });

  const runGetRoot = () => doFetch("GET", "/");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Diagnostics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Relay Host</Label>
            <Input value={relayHost} readOnly />
          </div>
          <div>
            <Label>API Key</Label>
            <Input value={apiKey ? "●".repeat(8) : ""} readOnly />
          </div>
          <div>
            <Label>Custom Path</Label>
            <Input value={customPath} onChange={(e) => setCustomPath(e.target.value)} />
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={runGetRoot} disabled={loading}>GET / (root)</Button>
          <Button onClick={runSimplePost} disabled={loading}>POST /api/execute_method (simple)</Button>
          <Button onClick={runSearchEmployee} disabled={loading}>POST /api/search_employee</Button>
          <Button variant="ghost" onClick={() => doFetch("POST", customPath, { debug: true })} disabled={loading}>POST custom</Button>
        </div>

        <div>
          <h4 className="font-medium mb-2">Last result</h4>
          {!lastResult && <p className="text-sm text-muted-foreground">No diagnostics run yet.</p>}
          {lastResult && (
            <div className="space-y-2">
              <div className="text-sm">
                <div><strong>URL:</strong> {lastResult.url}</div>
                <div><strong>Method:</strong> {lastResult.method}</div>
                {lastResult.status !== undefined && <div><strong>Status:</strong> {lastResult.status} {lastResult.statusText ?? ""}</div>}
                {lastResult.error && <div className="text-red-600"><strong>Error:</strong> {lastResult.error}</div>}
              </div>

              <div>
                <h5 className="font-medium">Request headers</h5>
                <pre className="bg-muted p-2 rounded text-sm overflow-auto">{JSON.stringify(lastResult.requestHeaders, null, 2)}</pre>
              </div>

              {lastResult.requestBody !== undefined && (
                <div>
                  <h5 className="font-medium">Request body</h5>
                  <pre className="bg-muted p-2 rounded text-sm overflow-auto">{JSON.stringify(lastResult.requestBody, null, 2)}</pre>
                </div>
              )}

              {lastResult.responseText !== undefined && (
                <div>
                  <h5 className="font-medium">Response text</h5>
                  <pre className="bg-muted p-2 rounded text-sm overflow-auto">{lastResult.responseText}</pre>
                </div>
              )}

              {lastResult.responseJson !== undefined && (
                <div>
                  <h5 className="font-medium">Response JSON (parsed)</h5>
                  <pre className="bg-muted p-2 rounded text-sm overflow-auto">{JSON.stringify(lastResult.responseJson, null, 2)}</pre>
                </div>
              )}

              {lastResult.responseText === undefined && lastResult.error && (
                <div>
                  <p className="text-sm text-muted-foreground">
                    If you see "Failed to fetch" or no response: this is commonly caused by CORS, DNS/connection issues, mixed-content (HTTPS vs HTTP), or the server not running. Check the browser console Network tab for more details.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default Diagnostics;