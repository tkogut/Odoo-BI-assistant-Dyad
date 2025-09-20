"use client";

import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useRpcConfirm } from "@/components/rpc-confirm";
import { showLoading, showSuccess, showError, dismissToast } from "@/utils/toast";
import ThemeToggle from "@/components/ThemeToggle";

const DEFAULT_RELAY = "http://localhost:8000";

type RelayConfig = {
  id: string;
  name: string;
  url: string;
  apiKey?: string;
};

type ConnectionTest = {
  id: string;
  when: string;
  type: "GET" | "POST";
  ok?: boolean;
  status?: number;
  statusText?: string;
  error?: string;
  preview?: any;
};

const Settings: React.FC = () => {
  const [relayHost, setRelayHost] = useLocalStorage<string>("relayHost", DEFAULT_RELAY);
  const [apiKey, setApiKey] = useLocalStorage<string>("apiKey", "");
  const [localRelay, setLocalRelay] = useState<string>(relayHost);
  const [localKey, setLocalKey] = useState<string>(apiKey);

  const [configs, setConfigs] = useLocalStorage<RelayConfig[]>("relayConfigs", []);
  const [tests, setTests] = useLocalStorage<ConnectionTest[]>("connectionTests", []);

  const [testingResult, setTestingResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);
  const [newConfigName, setNewConfigName] = useState("");

  const confirmRpc = useRpcConfirm();

  const onSave = async () => {
    const payload = { relayHost: localRelay, apiKey: localKey };
    try {
      const ok = await confirmRpc({ type: "save_settings", payload });
      if (!ok) {
        showError("Save cancelled by user.");
        return;
      }
    } catch {
      showError("Unable to confirm settings save.");
      return;
    }

    const toastId = showLoading("Saving settings...");
    try {
      setRelayHost(localRelay);
      setApiKey(localKey);
      showSuccess("Settings saved to localStorage.");
    } catch (err: any) {
      showError(err?.message || "Failed to save settings.");
    } finally {
      dismissToast(toastId);
    }
  };

  const onReset = () => {
    setLocalRelay(DEFAULT_RELAY);
    setLocalKey("");
    setRelayHost(DEFAULT_RELAY);
    setApiKey("");
    showSuccess("Settings reset to defaults.");
  };

  const onTestConnection = async () => {
    if (!localRelay) {
      showError("Please provide a relay host to test.");
      return;
    }
    setTesting(true);
    setTestingResult(null);
    const toastId = showLoading("Testing connection...");
    const testId = Date.now().toString();
    const when = new Date().toISOString();

    const recordTest = (entry: ConnectionTest) => {
      setTests((prev) => [entry, ...(prev || [])].slice(0, 50));
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      // Try a simple GET to the configured host root
      let resp;
      try {
        resp = await fetch(localRelay, { method: "GET", signal: controller.signal });
      } catch (err: any) {
        clearTimeout(timeout);
        // network-level failure: try an automatic fallback to port 8001
        const errMsg = err?.message || String(err);
        setTestingResult({ error: errMsg });

        const entry: ConnectionTest = {
          id: testId,
          when,
          type: "GET",
          error: errMsg,
        };
        recordTest(entry);

        // Attempt fallback to port 8001 if the original host looks like localhost or contains a port
        try {
          const alt = buildAlternativeHost(localRelay, "8001");
          if (alt && alt !== localRelay) {
            const altController = new AbortController();
            const altTimeout = setTimeout(() => altController.abort(), 8000);
            try {
              const altResp = await fetch(alt, { method: "GET", signal: altController.signal });
              clearTimeout(altTimeout);
              if (altResp.ok) {
                // apply the detected working host (both local input and persisted)
                setLocalRelay(alt);
                setRelayHost(alt);
                setTestingResult({ ok: true, status: altResp.status, note: `Switched to ${alt}` });
                const altEntry: ConnectionTest = {
                  id: Date.now().toString(),
                  when: new Date().toISOString(),
                  type: "GET",
                  ok: altResp.ok,
                  status: altResp.status,
                  statusText: altResp.statusText,
                  preview: await safeTextPreview(altResp),
                };
                recordTest(altEntry);
                showSuccess(`Relay reachable at ${alt}; applied to settings.`);
                return;
              } else {
                const preview = await safeTextPreview(altResp);
                const altEntry: ConnectionTest = {
                  id: Date.now().toString(),
                  when: new Date().toISOString(),
                  type: "GET",
                  ok: altResp.ok,
                  status: altResp.status,
                  statusText: altResp.statusText,
                  preview,
                };
                recordTest(altEntry);
                showError(`Fallback to ${alt} returned ${altResp.status}`);
              }
            } catch {
              // ignore fallback errors — fall through to final error handling
            }
          }
        } catch {
          // ignore fallback construction errors
        }

        showError(errMsg || "Connection test failed.");
        return;
      } finally {
        // keep timeout cleared later after successful resp flow
      }

      clearTimeout(timeout);

      let parsed = null;
      try {
        const text = await resp.text();
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = null;
      }

      const result = {
        ok: resp.ok,
        status: resp.status,
        statusText: resp.statusText,
        parsed: parsed,
      };
      setTestingResult(result);

      // Record test in history
      const entry: ConnectionTest = {
        id: testId,
        when,
        type: "GET",
        ok: resp.ok,
        status: resp.status,
        statusText: resp.statusText,
        preview: parsed ?? null,
      };
      recordTest(entry);

      if (resp.ok) {
        showSuccess("Relay reachable (basic GET succeeded).");
      } else {
        // If GET returned 404 (common when pointing at a static server), attempt auto-fallback to port 8001
        if (resp.status === 404) {
          // build and probe an alternative host using port 8001
          try {
            const alt = buildAlternativeHost(localRelay, "8001");
            if (alt && alt !== localRelay) {
              const altController = new AbortController();
              const altTimeout = setTimeout(() => altController.abort(), 8000);
              try {
                const altResp = await fetch(alt, { method: "GET", signal: altController.signal });
                clearTimeout(altTimeout);
                let altParsed = null;
                try {
                  const t = await altResp.text();
                  altParsed = t ? JSON.parse(t) : null;
                } catch {
                  altParsed = null;
                }

                const altEntry: ConnectionTest = {
                  id: Date.now().toString(),
                  when: new Date().toISOString(),
                  type: "GET",
                  ok: altResp.ok,
                  status: altResp.status,
                  statusText: altResp.statusText,
                  preview: altParsed ?? null,
                };
                recordTest(altEntry);

                if (altResp.ok) {
                  // apply the detected working host (both local input and persisted)
                  setLocalRelay(alt);
                  setRelayHost(alt);
                  setTestingResult({ ok: true, status: altResp.status, note: `Switched to ${alt}` });
                  showSuccess(`Relay reachable at ${alt}; applied to settings.`);
                } else {
                  showError(`GET returned ${resp.status} (${resp.statusText}) and fallback ${alt} returned ${altResp.status}`);
                }
                return;
              } catch (err: any) {
                clearTimeout(altTimeout);
                // fallback attempt failed — continue to notify user of original 404
              }
            }
          } catch {
            // ignore
          }
        }
        showError(`Basic GET returned ${resp.status}`);
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      setTestingResult({ error: errMsg });
      const entry: ConnectionTest = {
        id: testId,
        when,
        type: "GET",
        error: errMsg,
      };
      setTests((prev) => [entry, ...(prev || [])].slice(0, 50));
      showError(errMsg || "Connection test failed.");
    } finally {
      dismissToast(toastId);
      setTesting(false);
    }
  };

  // Named relay config helpers
  const saveNamedConfig = () => {
    if (!newConfigName.trim()) {
      showError("Please provide a name for this config.");
      return;
    }
    const id = Date.now().toString();
    const cfg: RelayConfig = { id, name: newConfigName.trim(), url: localRelay, apiKey: localKey || undefined };
    setConfigs((prev) => [cfg, ...(prev || [])]);
    setNewConfigName("");
    showSuccess("Saved relay configuration.");
  };

  const applyConfig = (cfg: RelayConfig) => {
    setLocalRelay(cfg.url);
    setLocalKey(cfg.apiKey ?? "");
    showSuccess(`Applied config "${cfg.name}".`);
  };

  const deleteConfig = (id: string) => {
    setConfigs((prev) => (prev || []).filter((c) => c.id !== id));
    showSuccess("Deleted configuration.");
  };

  const clearHistory = () => {
    setTests([]);
    showSuccess("Cleared connection test history.");
  };

  // Helpers
  const buildAlternativeHost = (host: string, port = "8001") => {
    try {
      const url = new URL(host);
      // If the host already uses the desired port, return same
      if (url.port === port) return host;
      url.port = port;
      // ensure no trailing slash for consistency with earlier code
      return url.toString().replace(/\/$/, "");
    } catch {
      // Fallback naive replacement: replace :<digits> with :port, or append :port
      try {
        if (host.match(/:\d+$/)) {
          return host.replace(/:\d+$/, `:${port}`);
        }
        // if host ends with slash, strip it
        return host.replace(/\/$/, "") + `:${port}`;
      } catch {
        return host;
      }
    }
  };

  const safeTextPreview = async (r: Response) => {
    try {
      const t = await r.text();
      return t.slice(0, 1000);
    } catch {
      return "";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Settings</h1>
            <p className="text-sm text-muted-foreground">Configure Relay Host and API Key (persisted in localStorage).</p>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link to="/" className="text-sm text-blue-600 hover:underline">
              Back to Home
            </Link>
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Connection Settings</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="relay">Relay Host</Label>
                <Input
                  id="relay-host"
                  value={localRelay}
                  onChange={(e) => setLocalRelay(e.target.value)}
                  placeholder="http://127.0.0.1:8000"
                />
              </div>

              <div>
                <Label htmlFor="apikey">API Key (X-API-Key)</Label>
                <Input
                  id="apikey"
                  value={localKey}
                  onChange={(e) => setLocalKey(e.target.value)}
                  placeholder="Optional API key"
                />
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              Values are saved to localStorage and will be available across app pages and reloads.
            </div>

            <div>
              <h4 className="font-medium">Connection Test</h4>
              <p className="text-sm text-muted-foreground mb-2">Run a basic GET to the Relay Host to confirm reachability.</p>
              <div className="flex gap-2">
                <Button onClick={onTestConnection} disabled={testing}>
                  {testing ? "Testing..." : "Test Connection"}
                </Button>
                <Button variant="ghost" onClick={() => { setTestingResult(null); }}>
                  Clear Result
                </Button>
              </div>

              <div className="mt-3">
                <pre className="bg-muted p-3 rounded text-sm overflow-auto max-h-48 whitespace-pre-wrap">
                  {testingResult ? JSON.stringify(testingResult, null, 2) : "No test run yet."}
                </pre>
              </div>
            </div>

            <div>
              <h4 className="font-medium">Named Relay Configurations</h4>
              <p className="text-sm text-muted-foreground mb-2">Save multiple relay configurations for quick switching.</p>

              <div className="flex gap-2 mb-3">
                <Input placeholder="Config name" value={newConfigName} onChange={(e) => setNewConfigName(e.target.value)} />
                <Button onClick={saveNamedConfig}>Save Config</Button>
              </div>

              <div className="space-y-2">
                {(configs || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No saved configs.</p>
                ) : (
                  configs.map((c) => (
                    <div key={c.id} className="flex items-center justify-between p-2 border rounded">
                      <div>
                        <div className="font-medium">{c.name}</div>
                        <div className="text-sm text-muted-foreground">{c.url}</div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" onClick={() => applyConfig(c)}>Apply</Button>
                        <Button variant="ghost" onClick={() => deleteConfig(c.id)}>Delete</Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex gap-2">
            <Button onClick={onSave}>Save Settings</Button>
            <Button variant="ghost" onClick={onReset}>Reset to Defaults</Button>
          </CardFooter>
        </Card>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Connection Test History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-center mb-2">
                <div className="text-sm text-muted-foreground">Recent GET/POST tests (most recent first).</div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setTests([])}>Clear</Button>
                </div>
              </div>
              <div className="space-y-2 max-h-64 overflow-auto">
                {(tests || []).length === 0 ? (
                  <div className="text-sm text-muted-foreground">No tests recorded yet.</div>
                ) : (
                  tests.map((t) => (
                    <div key={t.id} className="p-2 border rounded">
                      <div className="text-xs text-muted-foreground">{new Date(t.when).toLocaleString()}</div>
                      <div className="font-medium">{t.type} {t.ok ? "OK" : "Error"}</div>
                      {t.status !== undefined && <div className="text-sm">HTTP {t.status} {t.statusText}</div>}
                      {t.error && <div className="text-sm text-red-600">{t.error}</div>}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Apply current values to saved settings (does not create a named config).</div>
                <div className="flex gap-2">
                  <Button onClick={onSave}>Save</Button>
                  <Button variant="ghost" onClick={onReset}>Reset</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Settings;