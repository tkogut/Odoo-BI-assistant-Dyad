"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { showLoading, showSuccess, showError, dismissToast } from "@/utils/toast";
import { postToRelay } from "@/components/ai-chat/utils";

interface ModelEntry {
  id?: number;
  model?: string;
  name?: string;
  [k: string]: any;
}

interface Props {
  relayHost: string;
  apiKey?: string;
}

const ModelExplorer: React.FC<Props> = ({ relayHost, apiKey }) => {
  const [query, setQuery] = useState("");
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchModels = async () => {
    if (!relayHost) {
      showError("Please configure a Relay Host in Settings.");
      return;
    }

    setLoading(true);
    const toastId = showLoading("Fetching models...");
    try {
      const domain = query ? [["model", "ilike", query]] : [];
      const payload = {
        model: "ir.model",
        method: "search_read",
        args: [domain],
        kwargs: {
          fields: ["id", "model", "name"],
          limit: 2000,
        },
      };

      const url = `${relayHost.replace(/\/$/, "")}/api/execute_method`;
      const res = await postToRelay(url, payload, apiKey, 30000);

      if (res.ok && res.parsed && res.parsed.success) {
        const result = res.parsed.result ?? [];
        setModels(Array.isArray(result) ? result : []);
        showSuccess(`Fetched ${Array.isArray(result) ? result.length : 0} models.`);
      } else if (res.parsed && Array.isArray(res.parsed)) {
        // Some relays return arrays directly
        setModels(res.parsed);
        showSuccess(`Fetched ${res.parsed.length} models.`);
      } else {
        const errTxt = (res.parsed && (res.parsed.error || res.parsed.message)) || res.text || `HTTP ${res.status}`;
        showError(`Failed to fetch models: ${String(errTxt).slice(0, 300)}`);
      }
    } catch (err: any) {
      showError(err?.message || String(err));
    } finally {
      dismissToast(toastId);
      setLoading(false);
    }
  };

  const copyModelList = async () => {
    try {
      const text = models.map((m) => `${m.model}\t${m.name ?? ""}`).join("\n");
      await navigator.clipboard.writeText(text);
      showSuccess("Copied model list to clipboard");
    } catch {
      showError("Unable to copy to clipboard");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Models Explorer (ir.model)</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Filter models (optional) e.g. res.partner"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button onClick={fetchModels} disabled={loading}>
            {loading ? "Loading..." : "Fetch Models"}
          </Button>
          <Button variant="ghost" onClick={() => { setModels([]); setQuery(""); }}>
            Clear
          </Button>
        </div>

        <div>
          {models.length === 0 ? (
            <div className="text-sm text-muted-foreground">No models loaded. Click "Fetch Models" to load.</div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-auto">
              {models.map((m) => (
                <div key={m.id ?? `${m.model}`} className="p-2 border rounded flex items-center justify-between">
                  <div>
                    <div className="font-medium">{m.model}</div>
                    <div className="text-xs text-muted-foreground">{m.name ?? ""}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">{m.id ?? ""}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Lists models installed in the upstream Odoo instance.</div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={copyModelList} disabled={models.length === 0}>
            Copy list
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
};

export default ModelExplorer;