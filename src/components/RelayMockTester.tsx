"use client";

import React, { useEffect, useRef, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { showLoading, showSuccess, showError, dismissToast } from "@/utils/toast";

interface Props {
  relayHost: string;
  apiKey: string;
}

type LogEntry = {
  time: string;
  level: "info" | "success" | "error";
  text: string;
};

const safeHost = (host: string) => host.replace(/\/$/, "");

const formatTime = () => new Date().toLocaleTimeString();

export const RelayMockTester: React.FC<Props> = ({ relayHost, apiKey }) => {
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const wsMsgCount = useRef(0);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
        wsRef.current = null;
      }
    };
  }, []);

  const pushLog = (level: LogEntry["level"], text: string) => {
    const entry = { time: formatTime(), level, text };
    setLogs((l) => [entry, ...l].slice(0, 200));
  };

  const testGet = async () => {
    pushLog("info", `Starting GET ${relayHost} ...`);
    const toastId = showLoading("Running GET test...");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(safeHost(relayHost), { method: "GET", signal: controller.signal });
      clearTimeout(timeout);
      const text = await resp.text().catch(() => "");
      pushLog("info", `GET status ${resp.status} ${resp.statusText}`);
      pushLog("info", `GET preview: ${text.slice(0, 400)}`);
      if (resp.ok) {
        showSuccess("GET succeeded");
        pushLog("success", "GET succeeded");
      } else {
        showError(`GET returned ${resp.status}`);
        pushLog("error", `GET returned ${resp.status} ${resp.statusText}`);
      }
      return { ok: resp.ok, status: resp.status, text };
    } catch (err: any) {
      const msg = err?.message || String(err);
      pushLog("error", `GET error: ${msg}`);
      showError(msg);
      return { ok: false, error: msg };
    } finally {
      dismissToast(toastId);
    }
  };

  const testPostExecute = async () => {
    const url = `${safeHost(relayHost)}/api/execute_method`;
    pushLog("info", `Starting POST ${url} ...`);
    const toastId = showLoading("Running POST /api/execute_method ...");
    try {
      const payload = {
        model: "res.partner",
        method: "search_read",
        args: [[]],
        kwargs: { fields: ["id"], limit: 1 },
      };
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

      let parsed: any = null;
      try {
        parsed = await resp.json();
      } catch {
        parsed = null;
      }

      pushLog("info", `POST status ${resp.status} ${resp.statusText}`);
      pushLog("info", `POST parsed: ${parsed ? JSON.stringify(parsed).slice(0, 1000) : "(non-JSON or empty)"}`);

      if (resp.ok) {
        showSuccess("POST succeeded");
        pushLog("success", "POST /api/execute_method succeeded");
      } else {
        const errTxt = parsed && (parsed.error || parsed.message) ? JSON.stringify(parsed.error || parsed.message) : `HTTP ${resp.status}`;
        showError(`POST failed: ${errTxt}`);
        pushLog("error", `POST failed: ${errTxt}`);
      }

      return { ok: resp.ok, status: resp.status, parsed, text: parsed ? JSON.stringify(parsed) : null };
    } catch (err: any) {
      const msg = err?.message || String(err);
      pushLog("error", `POST error: ${msg}`);
      showError(msg);
      return { ok: false, error: msg };
    } finally {
      dismissToast(toastId);
    }
  };

  const testWebSocket = (expectChunks = 3, timeoutMs = 10000) =>
    new Promise<{ ok: boolean; received: number; error?: string }>((resolve) => {
      const host = safeHost(relayHost);
      try {
        const url = new URL(host);
        const protocol = url.protocol === "https:" ? "wss:" : "ws:";
        url.protocol = protocol;
        url.pathname = "/ws/ai-chat";
        if (apiKey) {
          url.searchParams.set("api_key", apiKey);
        }
        const wsUrl = url.toString();
        pushLog("info", `Opening WS ${wsUrl}`);
        wsMsgCount.current = 0;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        const onOpen = () => {
          pushLog("success", "WebSocket opened");
        };

        const onMessage = (ev: MessageEvent) => {
          wsMsgCount.current += 1;
          let content = "";
          try {
            content = typeof ev.data === "string" ? ev.data : String(ev.data);
            // show a short preview
            pushLog("info", `WS msg #${wsMsgCount.current}: ${content.slice(0, 400)}`);
          } catch {
            pushLog("info", `WS msg #${wsMsgCount.current}: (unparsable)`);
          }
          if (wsMsgCount.current >= expectChunks) {
            pushLog("success", `Received ${wsMsgCount.current} WS messages (expected ${expectChunks})`);
            try {
              ws.close();
            } catch {}
            resolve({ ok: true, received: wsMsgCount.current });
          }
        };

        const onError = (ev: Event | any) => {
          const msg = (ev && (ev.message || String(ev))) || "WebSocket error";
          pushLog("error", `WebSocket error: ${msg}`);
          try {
            ws.close();
          } catch {}
          resolve({ ok: false, received: wsMsgCount.current, error: msg });
        };

        const onClose = () => {
          pushLog("info", `WebSocket closed after receiving ${wsMsgCount.current} message(s)`);
          if (wsMsgCount.current < expectChunks) {
            resolve({ ok: false, received: wsMsgCount.current, error: "Closed before expected messages" });
          }
        };

        ws.addEventListener("open", onOpen);
        ws.addEventListener("message", onMessage);
        ws.addEventListener("error", onError);
        ws.addEventListener("close", onClose);

        const to = setTimeout(() => {
          pushLog("error", "WebSocket test timed out");
          try {
            ws.close();
          } catch {}
          resolve({ ok: false, received: wsMsgCount.current, error: "timeout" });
        }, timeoutMs);

        // cleanup once resolved
        const finalize = () => {
          clearTimeout(to);
          try {
            ws.removeEventListener("open", onOpen);
            ws.removeEventListener("message", onMessage);
            ws.removeEventListener("error", onError);
            ws.removeEventListener("close", onClose);
          } catch {}
        };

        // Wrap resolve to finalize
        const originalResolve = resolve;
        // Do nothing — the resolve calls inside handlers will terminate the promise and we rely on effect cleanup to close socket
      } catch (err: any) {
        const msg = err?.message || String(err);
        pushLog("error", `WebSocket setup error: ${msg}`);
        resolve({ ok: false, received: wsMsgCount.current, error: msg });
      }
    });

  // Helper to wait for ws to finish (since the promise above resolves on its own through handlers, we use a thin wrapper)
  const runWebSocketWithHandlers = (expectChunks = 3, timeoutMs = 10000) =>
    new Promise<{ ok: boolean; received: number; error?: string }>((resolve) => {
      const host = safeHost(relayHost);
      try {
        const url = new URL(host);
        const protocol = url.protocol === "https:" ? "wss:" : "ws:";
        url.protocol = protocol;
        url.pathname = "/ws/ai-chat";
        if (apiKey) {
          url.searchParams.set("api_key", apiKey);
        }
        const wsUrl = url.toString();
        pushLog("info", `Opening WS ${wsUrl}`);
        wsMsgCount.current = 0;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        const to = setTimeout(() => {
          pushLog("error", "WebSocket test timed out");
          try {
            ws.close();
          } catch {}
          resolve({ ok: false, received: wsMsgCount.current, error: "timeout" });
        }, timeoutMs);

        ws.onopen = () => {
          pushLog("success", "WebSocket opened");
        };

        ws.onmessage = (ev) => {
          wsMsgCount.current += 1;
          let content = "";
          try {
            content = typeof ev.data === "string" ? ev.data : String(ev.data);
            pushLog("info", `WS msg #${wsMsgCount.current}: ${content.slice(0, 400)}`);
          } catch {
            pushLog("info", `WS msg #${wsMsgCount.current}: (unparsable)`);
          }
          if (wsMsgCount.current >= expectChunks) {
            clearTimeout(to);
            pushLog("success", `Received ${wsMsgCount.current} WS messages (expected ${expectChunks})`);
            try {
              ws.close();
            } catch {}
            resolve({ ok: true, received: wsMsgCount.current });
          }
        };

        ws.onerror = (ev) => {
          const msg = (ev && (ev as any).message) || "WebSocket error";
          clearTimeout(to);
          pushLog("error", `WebSocket error: ${msg}`);
          try {
            ws.close();
          } catch {}
          resolve({ ok: false, received: wsMsgCount.current, error: msg });
        };

        ws.onclose = () => {
          clearTimeout(to);
          pushLog("info", `WebSocket closed after receiving ${wsMsgCount.current} message(s)`);
          if (wsMsgCount.current < expectChunks) {
            resolve({ ok: false, received: wsMsgCount.current, error: "closed_before_expected" });
          }
        };
      } catch (err: any) {
        const msg = err?.message || String(err);
        pushLog("error", `WebSocket setup error: ${msg}`);
        resolve({ ok: false, received: wsMsgCount.current, error: msg });
      }
    });

  const runAll = async () => {
    setRunning(true);
    setLogs([]);
    pushLog("info", "Starting full test flow: GET -> POST -> WS");
    const toastId = showLoading("Running relay mock test flow...");
    try {
      const g = await testGet();
      if (!g.ok) {
        pushLog("error", "GET failed — aborting further tests.");
        return;
      }
      const p = await testPostExecute();
      if (!p.ok) {
        pushLog("error", "POST failed — aborting WS test.");
        return;
      }
      pushLog("info", "Beginning WebSocket test (expect 3 chunks) ...");
      const wsres = await runWebSocketWithHandlers(3, 12000);
      if (wsres.ok) {
        pushLog("success", `WebSocket test passed — ${wsres.received} messages`);
        showSuccess("Full test flow succeeded");
      } else {
        pushLog("error", `WebSocket test failed: ${wsres.error || "unknown"}`);
        showError(`WebSocket test: ${wsres.error || "failed"}`);
      }
    } finally {
      dismissToast(toastId);
      setRunning(false);
    }
  };

  const clearLogs = () => setLogs([]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Relay Mock Tester</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div>
            <Label>Relay Host</Label>
            <div className="text-sm break-words">{relayHost}</div>
          </div>
          <div>
            <Label>API Key</Label>
            <div className="text-sm break-words">{apiKey || "(none)"}</div>
          </div>
          <div>
            <Label>Actions</Label>
            <div className="flex gap-2">
              <Button onClick={runAll} disabled={running}>
                {running ? "Running..." : "Run All"}
              </Button>
              <Button variant="ghost" onClick={async () => { setRunning(true); await testGet(); setRunning(false); }}>
                GET
              </Button>
              <Button variant="ghost" onClick={async () => { setRunning(true); await testPostExecute(); setRunning(false); }}>
                POST
              </Button>
              <Button variant="ghost" onClick={async () => { setRunning(true); const r = await runWebSocketWithHandlers(3, 12000); setRunning(false); if (r.ok) showSuccess("WS OK"); }}>
                WS
              </Button>
              <Button variant="ghost" onClick={clearLogs}>
                Clear
              </Button>
            </div>
          </div>
        </div>

        <div>
          <h4 className="font-medium">Logs</h4>
          <div className="bg-muted p-3 rounded max-h-56 overflow-auto text-sm">
            {logs.length === 0 ? (
              <div className="text-muted-foreground">No logs yet. Click Run All or individual tests.</div>
            ) : (
              logs.map((l, idx) => (
                <div key={idx} className="mb-2">
                  <div className="text-xs text-muted-foreground">{l.time}</div>
                  <div className={l.level === "error" ? "text-red-600" : l.level === "success" ? "text-green-600" : ""}>
                    {l.text}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>

      <CardFooter>
        <div className="text-sm text-muted-foreground">This runner executes simple checks against a relay mock (GET, POST, WS).</div>
      </CardFooter>
    </Card>
  );
};

export default RelayMockTester;