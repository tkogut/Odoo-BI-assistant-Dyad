"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { showError, showSuccess, showLoading, dismissToast } from "@/utils/toast";
import { useRpcConfirm } from "@/components/rpc-confirm";

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

type OptionsResult = {
  ok?: boolean;
  status?: number;
  headers?: Record<string, string>;
  error?: string;
  mismatches?: string[];
};

type ProbeStatus = "idle" | "running" | "success" | "error";

const statusColor = (s: ProbeStatus) => {
  switch (s) {
    case "running":
      return "bg-yellow-400";
    case "success":
      return "bg-green-500";
    case "error":
      return "bg-red-500";
    default:
      return "bg-gray-300";
  }
};

const safePreview = async (r: Response): Promise<string> => {
  try {
    const text = await r.text();
    return text.slice(0, 1000);
  } catch {
    return "";
  }
};

export const ConnectivityDiagnostics: React.FC<ConnectivityDiagnosticsProps> = ({
  relayHost,
  apiKey,
  onRelayHostChange,
  onApiKeyChange,
}) => {
  const [getStatus, setGetStatus] = useState<ProbeStatus>("idle");
  const [optionsRootStatus, setOptionsRootStatus] = useState<ProbeStatus>("idle");
  const [optionsStatus, setOptionsStatus] = useState<ProbeStatus>("idle");
  const [postStatus, setPostStatus] = useState<ProbeStatus>("idle");

  const [getResult, setGetResult] = useState<ResultBox | null>(null);
  const [optionsRootResult, setOptionsRootResult] = useState<OptionsResult | null>(null);
  const [optionsResult, setOptionsResult] = useState<OptionsResult | null>(null);
  const [postResult, setPostResult] = useState<ResultBox | null>(null);

  const confirmRpc = useRpcConfirm();

  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:8080";

  const normalizeHost = (host: string) => host.replace(/\/$/, "");

  // Generate default cURL snippets (match the user's requested format)
  const genOptionsRootCurl = (host: string, orig: string) =>
    `bash\ncurl -i -X OPTIONS "${normalizeHost(host)}/" \\\n  -H "Origin: ${orig}" \\\n  -H "Access-Control-Request-Method: GET" \\\n  -H "Access-Control-Request-Headers: X-API-Key,Content-Type"`;

  const genGetRootCurl = (host: string, orig: string, key?: string) =>
    `bash\ncurl -i -X GET "${normalizeHost(host)}/" \\\n  -H "Origin: ${orig}" \\\n  -H "X-API-Key: ${key ?? ""}"`;

  const genOptionsExecuteCurl = (host: string, orig: string) =>
    `bash\ncurl -i -X OPTIONS "${normalizeHost(host)}/api/execute_method" \\\n  -H "Origin: ${orig}" \\\n  -H "Access-Control-Request-Method: POST" \\\n  -H "Access-Control-Request-Headers: X-API-Key,Content-Type"`;

  const genPostExecuteCurl = (host: string, orig: string, key?: string) =>
    `bash\ncurl -i -X POST "${normalizeHost(host)}/api/execute_method" \\\n  -H "Origin: ${orig}" \\\n  -H "Content-Type: application/json" \\\n  -H "X-API-Key: ${key ?? ""}" \\\n  -d '{"model":"res.partner","method":"search_read","args":[],"kwargs":{}}'`;

  // Editable curl states and edited flags (so user edits are preserved)
  const [optionsRootCurl, setOptionsRootCurl] = useState(() => genOptionsRootCurl(relayHost, origin));
  const [optionsRootEdited, setOptionsRootEdited] = useState(false);

  const [getRootCurl, setGetRootCurl] = useState(() => genGetRootCurl(relayHost, origin, apiKey));
  const [getRootEdited, setGetRootEdited] = useState(false);

  const [optionsExecuteCurl, setOptionsExecuteCurl] = useState(() => genOptionsExecuteCurl(relayHost, origin));
  const [optionsExecuteEdited, setOptionsExecuteEdited] = useState(false);

  const [postExecuteCurl, setPostExecuteCurl] = useState(() => genPostExecuteCurl(relayHost, origin, apiKey));
  const [postExecuteEdited, setPostExecuteEdited] = useState(false);

  // When relayHost/apiKey/origin change, refresh the default curl if the user hasn't edited that field
  useEffect(() => {
    if (!optionsRootEdited) setOptionsRootCurl(genOptionsRootCurl(relayHost, origin));
    if (!getRootEdited) setGetRootCurl(genGetRootCurl(relayHost, origin, apiKey));
    if (!optionsExecuteEdited) setOptionsExecuteCurl(genOptionsExecuteCurl(relayHost, origin));
    if (!postExecuteEdited) setPostExecuteCurl(genPostExecuteCurl(relayHost, origin, apiKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relayHost, apiKey, origin]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showSuccess("Copied curl to clipboard");
    } catch (err: any) {
      showError("Unable to copy to clipboard");
    }
  };

  // Basic GET probe (root)
  const runGet = async () => {
    if (!relayHost) {
      showError("Please provide a Relay Host first.");
      return;
    }
    setGetStatus("running");
    setGetResult(null);
    const toastId = showLoading("Running GET probe...");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const resp = await fetch(relayHost, { method: "GET", signal: controller.signal });
        clearTimeout(timeout);
        const preview = await safePreview(resp);
        const box: ResultBox = {
          ok: resp.ok,
          status: resp.status,
          statusText: resp.statusText,
          bodyPreview: preview,
        };
        setGetResult(box);
        if (resp.ok) {
          setGetStatus("success");
          showSuccess("GET succeeded");
        } else {
          setGetStatus("error");
          showError(`GET returned ${resp.status}`);
        }
      } catch (err: any) {
        clearTimeout(timeout);
        const msg = err?.message || String(err);
        setGetResult({ error: msg });
        setGetStatus("error");
        showError(`GET failed: ${msg}`);
      }
    } finally {
      dismissToast(toastId);
    }
  };

  // OPTIONS preflight probe for root
  const runOptionsRoot = async () => {
    if (!relayHost) {
      showError("Please provide a Relay Host first.");
      return;
    }
    setOptionsRootStatus("running");
    setOptionsRootResult(null);
    const toastId = showLoading("Running OPTIONS (root) preflight...");
    const url = `${normalizeHost(relayHost)}/`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const resp = await fetch(url, {
          method: "OPTIONS",
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const headers: Record<string, string> = {};
        resp.headers.forEach((v, k) => {
          headers[k.toLowerCase()] = v;
        });

        const mismatches: string[] = [];
        const acaOrigin = headers["access-control-allow-origin"];
        if (!acaOrigin) mismatches.push("Missing Access-Control-Allow-Origin");
        else if (acaOrigin !== "*" && origin && acaOrigin !== origin)
          mismatches.push(`Access-Control-Allow-Origin does not match (${origin})`);

        const allowedMethods = (headers["access-control-allow-methods"] || "").toUpperCase();
        if (!allowedMethods) mismatches.push("Missing Access-Control-Allow-Methods");

        const res: OptionsResult = {
          ok: resp.ok,
          status: resp.status,
          headers,
          mismatches,
        };
        setOptionsRootResult(res);

        if (resp.ok && mismatches.length === 0) {
          setOptionsRootStatus("success");
          showSuccess("Root OPTIONS looks good");
        } else {
          setOptionsRootStatus("error");
          showError("OPTIONS (root) returned issues; inspect headers");
        }
      } catch (err: any) {
        clearTimeout(timeout);
        const msg = err?.message || String(err);
        setOptionsRootResult({ error: msg });
        setOptionsRootStatus("error");
        showError(`OPTIONS (root) failed: ${msg}`);
      }
    } finally {
      dismissToast(toastId);
    }
  };

  // OPTIONS preflight probe for /api/execute_method
  const runOptions = async () => {
    if (!relayHost) {
      showError("Please provide a Relay Host first.");
      return;
    }
    setOptionsStatus("running");
    setOptionsResult(null);
    const toastId = showLoading("Running OPTIONS preflight...");
    const url = `${normalizeHost(relayHost)}/api/execute_method`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const resp = await fetch(url, {
          method: "OPTIONS",
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const headers: Record<string, string> = {};
        resp.headers.forEach((v, k) => {
          headers[k.toLowerCase()] = v;
        });

        const mismatches: string[] = [];
        const acaOrigin = headers["access-control-allow-origin"];
        if (!acaOrigin) mismatches.push("Missing Access-Control-Allow-Origin");
        else if (acaOrigin !== "*" && origin && acaOrigin !== origin)
          mismatches.push(`Access-Control-Allow-Origin does not match (${origin})`);

        const allowedMethods = (headers["access-control-allow-methods"] || "").toUpperCase();
        if (!allowedMethods) mismatches.push("Missing Access-Control-Allow-Methods");
        else {
          if (!allowedMethods.includes("POST")) mismatches.push("POST not allowed");
          if (!allowedMethods.includes("OPTIONS")) mismatches.push("OPTIONS not allowed");
          if (!allowedMethods.includes("GET")) mismatches.push("GET not allowed");
        }

        const allowedHeaders = (headers["access-control-allow-headers"] || "").toLowerCase();
        if (!allowedHeaders) mismatches.push("Missing Access-Control-Allow-Headers");
        else {
          if (!allowedHeaders.includes("content-type")) mismatches.push("Missing Content-Type in allowed headers");
          if (!allowedHeaders.includes("x-api-key")) mismatches.push("Missing X-API-Key in allowed headers");
        }

        const res: OptionsResult = {
          ok: resp.ok,
          status: resp.status,
          headers,
          mismatches,
        };
        setOptionsResult(res);

        if (resp.ok && mismatches.length === 0) {
          setOptionsStatus("success");
          showSuccess("OPTIONS looks good");
        } else {
          setOptionsStatus("error");
          showError("OPTIONS returned issues; inspect headers");
        }
      } catch (err: any) {
        clearTimeout(timeout);
        const msg = err?.message || String(err);
        setOptionsResult({ error: msg });
        setOptionsStatus("error");
        showError(`OPTIONS failed: ${msg}`);
      }
    } finally {
      dismissToast(toastId);
    }
  };

  // POST probe to /api/execute_method
  const runPost = async () => {
    if (!relayHost) {
      showError("Please provide a Relay Host first.");
      return;
    }

    const payload = {
      model: "res.partner",
      method: "search_read",
      args: [[]],
      kwargs: { fields: ["id"], limit: 1 },
    };

    // Confirm with user before sending the POST payload
    try {
      const ok = await confirmRpc({ ...payload, _diagnostic: true });
      if (!ok) {
        showError("POST probe cancelled by user.");
        return;
      }
    } catch {
      showError("Unable to confirm POST probe.");
      return;
    }

    setPostStatus("running");
    setPostResult(null);
    const toastId = showLoading("Running POST probe...");
    const url = `${normalizeHost(relayHost)}/api/execute_method`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
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

        const box: ResultBox = { status: resp.status, statusText: resp.statusText, ok: resp.ok };
        try {
          const parsed = await resp.json();
          box.parsedJson = parsed;
          box.bodyPreview = JSON.stringify(parsed).slice(0, 2000);
        } catch {
          box.bodyPreview = await safePreview(resp);
        }
        setPostResult(box);

        if (resp.ok) {
          setPostStatus("success");
          showSuccess("POST succeeded (HTTP OK).");
        } else {
          setPostStatus("error");
          showError(`POST returned ${resp.status}`);
        }
      } catch (err: any) {
        clearTimeout(timeout);
        const msg = err?.message || String(err);
        setPostResult({ error: msg });
        setPostStatus("error");
        showError(`POST failed: ${msg}`);
      }
    } finally {
      dismissToast(toastId);
    }
  };

  const resetOptionsRootCurl = () => {
    setOptionsRootCurl(genOptionsRootCurl(relayHost, origin));
    setOptionsRootEdited(false);
  };
  const resetGetRootCurl = () => {
    setGetRootCurl(genGetRootCurl(relayHost, origin, apiKey));
    setGetRootEdited(false);
  };
  const resetOptionsExecuteCurl = () => {
    setOptionsExecuteCurl(genOptionsExecuteCurl(relayHost, origin));
    setOptionsExecuteEdited(false);
  };
  const resetPostExecuteCurl = () => {
    setPostExecuteCurl(genPostExecuteCurl(relayHost, origin, apiKey));
    setPostExecuteEdited(false);
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
              placeholder="http://127.0.0.1:8001"
              value={relayHost}
              onChange={(e) => onRelayHostChange(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="api-key">API Key (X-API-Key)</Label>
            <Input
              id="api-key"
              placeholder="Optional API key"
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
            />
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          App origin: <span className="font-mono">{origin}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* OPTIONS root probe card (editable curl) */}
          <div className="border rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${statusColor(optionsRootStatus)}`} />
                <div className="font-medium">OPTIONS / (health check)</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => copyToClipboard(optionsRootCurl)}>
                  Copy curl
                </Button>
                <Button size="sm" onClick={runOptionsRoot} disabled={optionsRootStatus === "running"}>
                  {optionsRootStatus === "running" ? "Running..." : "Run OPTIONS"}
                </Button>
              </div>
            </div>

            <div className="text-xs text-muted-foreground mb-2">Preflight-style OPTIONS to the root (useful to verify CORS on health endpoints).</div>

            <div className="mb-2">
              <Textarea
                value={optionsRootCurl}
                onChange={(e) => {
                  setOptionsRootCurl(e.target.value);
                  setOptionsRootEdited(true);
                }}
                className="text-xs font-mono h-28"
              />
              <div className="flex gap-2 mt-2">
                <Button size="sm" variant="ghost" onClick={resetOptionsRootCurl}>
                  Reset curl
                </Button>
                <Button size="sm" variant="ghost" onClick={() => copyToClipboard(optionsRootCurl)}>
                  Copy (edited)
                </Button>
              </div>
            </div>

            <pre className="bg-muted p-2 rounded text-xs h-28 overflow-auto">
              {optionsRootResult ? JSON.stringify(optionsRootResult, null, 2) : "No result yet."}
            </pre>
          </div>

          {/* GET root probe card (editable curl) */}
          <div className="border rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${statusColor(getStatus)}`} />
                <div className="font-medium">GET / (health check)</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => copyToClipboard(getRootCurl)}>
                  Copy curl
                </Button>
                <Button size="sm" onClick={runGet} disabled={getStatus === "running"}>
                  {getStatus === "running" ? "Running..." : "Run GET"}
                </Button>
              </div>
            </div>

            <div className="text-xs text-muted-foreground mb-2">Simple GET health check of the relay root (include Origin/X-API-Key to reproduce browser headers).</div>

            <div className="mb-2">
              <Textarea
                value={getRootCurl}
                onChange={(e) => {
                  setGetRootCurl(e.target.value);
                  setGetRootEdited(true);
                }}
                className="text-xs font-mono h-28"
              />
              <div className="flex gap-2 mt-2">
                <Button size="sm" variant="ghost" onClick={resetGetRootCurl}>
                  Reset curl
                </Button>
                <Button size="sm" variant="ghost" onClick={() => copyToClipboard(getRootCurl)}>
                  Copy (edited)
                </Button>
              </div>
            </div>

            <pre className="bg-muted p-2 rounded text-xs h-28 overflow-auto">
              {getResult ? JSON.stringify(getResult, null, 2) : "No result yet."}
            </pre>
          </div>

          {/* OPTIONS /api/execute_method probe card (editable curl) */}
          <div className="border rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${statusColor(optionsStatus)}`} />
                <div className="font-medium">OPTIONS /api/execute_method</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => copyToClipboard(optionsExecuteCurl)}>
                  Copy curl
                </Button>
                <Button size="sm" onClick={runOptions} disabled={optionsStatus === "running"}>
                  {optionsStatus === "running" ? "Running..." : "Run OPTIONS"}
                </Button>
              </div>
            </div>

            <div className="text-xs text-muted-foreground mb-2">
              Validate preflight headers required by browsers (Access-Control-Allow-*).
            </div>

            <div className="mb-2">
              <Textarea
                value={optionsExecuteCurl}
                onChange={(e) => {
                  setOptionsExecuteCurl(e.target.value);
                  setOptionsExecuteEdited(true);
                }}
                className="text-xs font-mono h-28"
              />
              <div className="flex gap-2 mt-2">
                <Button size="sm" variant="ghost" onClick={resetOptionsExecuteCurl}>
                  Reset curl
                </Button>
                <Button size="sm" variant="ghost" onClick={() => copyToClipboard(optionsExecuteCurl)}>
                  Copy (edited)
                </Button>
              </div>
            </div>

            <pre className="bg-muted p-2 rounded text-xs h-28 overflow-auto">
              {optionsResult ? JSON.stringify(optionsResult, null, 2) : "No result yet."}
            </pre>
          </div>

          {/* POST /api/execute_method probe card (editable curl) */}
          <div className="border rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${statusColor(postStatus)}`} />
                <div className="font-medium">POST /api/execute_method</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => copyToClipboard(postExecuteCurl)}>
                  Copy curl
                </Button>
                <Button size="sm" onClick={runPost} disabled={postStatus === "running"}>
                  {postStatus === "running" ? "Running..." : "Run POST"}
                </Button>
              </div>
            </div>

            <div className="text-xs text-muted-foreground mb-2">
              Send a simple POST RPC to check preflight, headers, and response payload.
            </div>

            <div className="mb-2">
              <Textarea
                value={postExecuteCurl}
                onChange={(e) => {
                  setPostExecuteCurl(e.target.value);
                  setPostExecuteEdited(true);
                }}
                className="text-xs font-mono h-28"
              />
              <div className="flex gap-2 mt-2">
                <Button size="sm" variant="ghost" onClick={resetPostExecuteCurl}>
                  Reset curl
                </Button>
                <Button size="sm" variant="ghost" onClick={() => copyToClipboard(postExecuteCurl)}>
                  Copy (edited)
                </Button>
              </div>
            </div>

            <pre className="bg-muted p-2 rounded text-xs h-28 overflow-auto">
              {postResult ? JSON.stringify(postResult, null, 2) : "No result yet."}
            </pre>
          </div>
        </div>

        <div>
          <h4 className="font-medium">Tips</h4>
          <ul className="list-disc list-inside text-sm text-muted-foreground">
            <li>
              If GET fails but the server is reachable from other tools, the browser may be blocking requests due to CORS: run OPTIONS and inspect Access-Control-Allow-* headers.
            </li>
            <li>
              If your app is HTTPS and the relay uses HTTP, the browser will block requests (mixed-content) — use HTTPS for the relay.
            </li>
            <li>
              Use the editable cURL block to tweak and reproduce requests from a terminal and verify headers on the relay side.
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

export default ConnectivityDiagnostics;