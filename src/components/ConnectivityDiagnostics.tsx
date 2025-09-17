"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showError, showSuccess, showLoading, dismissToast } from "@/utils/toast";

interface ConnectivityDiagnosticsProps {
  relayHost: string;
  apiKey: string;
  onRelayHostChange: (v: string) => void;
  onApiKeyChange: (v: string) => void;
}

type ResultBox = {
  ok?: boolean;
  status?: number;
  statusText?: string;
  bodyPreview?: string;
  parsedJson?: any;
  error?: string;
};

export const ConnectivityDiagnostics: React.FC<ConnectivityDiagnosticsProps> = ({
  relayHost,
  apiKey,
  onRelayHostChange,
  onApiKeyChange,
}) => {
  const [basicResult, setBasicResult] = useState<ResultBox | null>(null);
  const [postResult, setPostResult] = useState<ResultBox | null>(null);
  const [running, setRunning] = useState(false);

  const safePreview = async (r: Response): Promise<string> => {
    try {
      const text = await r.text();
      return text.slice(0, 1000);
    } catch {
      return "";
    }
  };

  const runDiagnostics = async () => {
    if (!relayHost) {
      showError("Please provide a Relay Host (include protocol, e.g. http://localhost:8000).");
      return;
    }

    setBasicResult(null);
    setPostResult(null);
    setRunning(true);
    const toastId = showLoading("Running connectivity diagnostics...");

    // Basic GET to the base host to check reachability / mixed-content
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      let basic: ResultBox = {};
      try {
        const resp = await fetch(relayHost, { method: "GET", signal: controller.signal });
        basic.ok = resp.ok;
        basic.status = resp.status;
        basic.statusText = resp.statusText;
        basic.bodyPreview = await safePreview(resp);
      } catch (err: any) {
        basic.error = err?.message || String(err);
      } finally {
        clearTimeout(timeoutId);
      }
      setBasicResult(basic);
    } catch (err) {
      setBasicResult({ error: (err as Error).message || String(err) });
    }

    // Real POST to /api/execute_method with X-API-Key header to surface preflight/CORS/TLS issues
    try {
      const url = `${relayHost.replace(/\/$/, "")}/api/execute_method`;
      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), 15000);

      const payload = {
        model: "res.partner",
        method: "search_read",
        args: [[[]]],
        kwargs: { fields: ["id"], limit: 1 },
      };

      let postBox: ResultBox = {};
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { "X-API-Key": apiKey } : {}),
          },
          body: JSON.stringify(payload),
          signal: controller2.signal,
        });

        postBox.status = resp.status;
        postBox.statusText = resp.statusText;
        postBox.ok = resp.ok;

        // try parse JSON (if any)
        try {
          const parsed = await resp.json();
          postBox.parsedJson = parsed;
          postBox.bodyPreview = JSON.stringify(parsed).slice(0, 2000);
        } catch {
          postBox.bodyPreview = await safePreview(resp);
        }

        if (!resp.ok && !postBox.error) {
          postBox.error =
            (postBox.parsedJson && (postBox.parsedJson.error || postBox.parsedJson.message)) ||
            `HTTP ${resp.status} ${resp.statusText}`;
        }
      } catch (err: any) {
        // Network-level error (e.g. Failed to fetch / CORS / TLS)
        postBox.error = err?.message || String(err);
      } finally {
        clearTimeout(timeoutId2);
      }

      setPostResult(postBox);
      if (postBox.ok) {
        showSuccess("POST /api/execute_method succeeded (or returned HTTP OK).");
      } else if (postBox.error) {
        showError(`POST error: ${postBox.error}`);
      } else {
        showError("POST returned non-OK status.");
      }
    } catch (err) {
      setPostResult({ error: (err as Error).message || String(err) });
      showError((err as Error).message || "Unknown error during diagnostics.");
    } finally {
      dismissToast(toastId);
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connectivity Diagnostics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="relay-host">Relay Host</Label>
            <Input
              id="relay-host"
              placeholder="http://127.0.0.1:8000"
              value={relayHost}
              onChange={(e) => onRelayHostChange(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="api-key">API Key (X-API-Key)</Label>
            <Input
              id="api-key"
              placeholder="Paste API Key (optional for diagnostics)"
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={runDiagnostics} disabled={running}>
            {running ? "Testing..." : "Run Diagnostics"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              onRelayHostChange("http://localhost:8000");
              onApiKeyChange("");
              setBasicResult(null);
              setPostResult(null);
            }}
          >
            Reset
          </Button>
        </div>

        <div>
          <h4 className="font-medium">What this does</h4>
          <p className="text-sm text-muted-foreground">
            1) Performs a GET to the Relay Host to check basic reachability and mixed-content issues.
            2) Performs a POST to /api/execute_method with your API key header to surface CORS, preflight,
            authentication and server errors. Results and any error messages will be shown below.
          </p>
        </div>

        <div>
          <h4 className="font-medium">Basic GET result</h4>
          <pre className="bg-muted p-3 rounded text-sm overflow-auto">
            {JSON.stringify(basicResult, null, 2)}
          </pre>
        </div>

        <div>
          <h4 className="font-medium">POST /api/execute_method result</h4>
          <pre className="bg-muted p-3 rounded text-sm overflow-auto">
            {JSON.stringify(postResult, null, 2)}
          </pre>
        </div>

        <div>
          <h4 className="font-medium">Troubleshooting tips</h4>
          <ul className="list-disc list-inside text-sm text-muted-foreground">
            <li>
              If you see "Failed to fetch" or a network TypeError: the server is unreachable (DNS/port) or the browser blocked the request.
            </li>
            <li>
              If you see CORS errors in the browser console, update the relay to return Access-Control-Allow-Origin for your app origin.
            </li>
            <li>
              If your app is HTTPS and the relay is HTTP, the browser will block the request (mixed-content). Use HTTPS for the relay or run the app over HTTP.
            </li>
            <li>
              If the POST returns an error JSON, check the relay logs and ensure the API key header is named X-API-Key (adjust if your relay expects another header).
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

export default ConnectivityDiagnostics;