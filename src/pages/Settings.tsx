import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useRpcConfirm } from "@/components/rpc-confirm";
import { showLoading, showSuccess, showError, dismissToast } from "@/utils/toast";

const DEFAULT_RELAY = "http://localhost:8000";

const Settings: React.FC = () => {
  const [relayHost, setRelayHost] = useLocalStorage<string>("relayHost", DEFAULT_RELAY);
  const [apiKey, setApiKey] = useLocalStorage<string>("apiKey", "");
  const [localRelay, setLocalRelay] = useState<string>(relayHost);
  const [localKey, setLocalKey] = useState<string>(apiKey);
  const [testingResult, setTestingResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

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
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const resp = await fetch(localRelay, { method: "GET", signal: controller.signal });
      clearTimeout(timeout);

      let parsed = null;
      try {
        const text = await resp.text();
        parsed = text ? JSON.parse(text) : null;
      } catch {
        // ignore JSON parse
      }

      const result = {
        ok: resp.ok,
        status: resp.status,
        statusText: resp.statusText,
        parsed: parsed,
      };
      setTestingResult(result);

      if (resp.ok) {
        showSuccess("Relay reachable (basic GET succeeded).");
      } else {
        showError(`Basic GET returned ${resp.status}`);
      }
    } catch (err: any) {
      setTestingResult({ error: err?.message || String(err) });
      showError(err?.message || "Connection test failed.");
    } finally {
      dismissToast(toastId);
      setTesting(false);
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
            <div>
              <Label htmlFor="relay">Relay Host</Label>
              <Input
                id="relay"
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
          </CardContent>

          <CardFooter className="flex gap-2">
            <Button onClick={onSave}>Save Settings</Button>
            <Button variant="ghost" onClick={onReset}>
              Reset to Defaults
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default Settings;