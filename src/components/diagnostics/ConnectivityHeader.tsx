"use client";

import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface ConnectivityHeaderProps {
  relayHost: string;
  apiKey: string;
  onRelayHostChange: (v: string) => void;
  onApiKeyChange: (v: string) => void;
  origin: string;
}

const ConnectivityHeader: React.FC<ConnectivityHeaderProps> = ({ relayHost, apiKey, onRelayHostChange, onApiKeyChange, origin }) => {
  return (
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

      <div className="col-span-full text-sm text-muted-foreground">
        App origin: <span className="font-mono">{origin}</span>
      </div>
    </div>
  );
};

export default ConnectivityHeader;