"use client";

import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { showSuccess } from "@/utils/toast";

interface DiagnosticsHeaderProps {
  relayHost: string;
  apiKey: string;
  origin: string;
  onRelayHostChange: (v: string) => void;
  onApiKeyChange: (v: string) => void;
}

const DiagnosticsHeader: React.FC<DiagnosticsHeaderProps> = ({
  relayHost,
  apiKey,
  origin,
  onRelayHostChange,
  onApiKeyChange,
}) => {
  return (
    <div className="space-y-4">
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
    </div>
  );
};

export default DiagnosticsHeader;