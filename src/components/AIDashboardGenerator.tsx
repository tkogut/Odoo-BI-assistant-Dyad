"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { showLoading, showSuccess, showError, dismissToast } from "@/utils/toast";
import DynamicDashboard from "./DynamicDashboard";

interface Props {
  relayHost: string;
  apiKey: string;
}

type DashboardConfig = {
  title?: string;
  widgets: Array<
    | { type: "stat"; title: string; value: string | number }
    | { type: "list"; title: string; items: string[] }
  >;
};

export const AIDashboardGenerator: React.FC<Props> = ({ relayHost, apiKey }) => {
  const [prompt, setPrompt] = useState("");
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [running, setRunning] = useState(false);

  const generate = async () => {
    if (!relayHost) {
      showError("Please provide a Relay Host.");
      return;
    }
    if (!prompt.trim()) {
      showError("Please describe the dashboard you want.");
      return;
    }

    setRunning(true);
    const toastId = showLoading("Generating dashboard...");
    try {
      const url = `${relayHost.replace(/\/$/, "")}/api/execute_method`;
      const payload = {
        model: "ai.assistant",
        method: "generate_dashboard",
        args: [prompt],
        kwargs: {},
      };

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "X-API-Key": apiKey } : {}),
        },
        body: JSON.stringify(payload),
      });

      const json = await resp.json().catch(() => null);

      if (resp.ok && json && json.success) {
        // Expect json.result to be a dashboard config (object)
        setConfig(typeof json.result === "string" ? JSON.parse(json.result) : json.result);
        showSuccess("Dashboard generated (preview below).");
      } else {
        // Attempt to parse text fallback
        const text = json || `HTTP ${resp.status} ${resp.statusText}`;
        showError("Generation failed: " + (text.error || text.message || JSON.stringify(text)));
      }
    } catch (err: any) {
      showError(err?.message || String(err));
    } finally {
      dismissToast(toastId);
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Dashboard Generator</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the dashboard you want (e.g. 'Monthly sales with top 5 customers and average order value')"
            rows={4}
          />
        </div>

        <div>
          <h4 className="font-medium">Preview</h4>
          {config ? (
            <div className="mt-2">
              <DynamicDashboard config={config} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-2">No dashboard generated yet.</p>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button onClick={generate} disabled={running}>
          {running ? "Generating..." : "Generate Dashboard"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setPrompt("");
            setConfig(null);
          }}
        >
          Reset
        </Button>
      </CardFooter>
    </Card>
  );
};

export default AIDashboardGenerator;