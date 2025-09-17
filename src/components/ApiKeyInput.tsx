"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ApiKeyInputProps {
  relayHost: string;
  setRelayHost: (host: string) => void;
  apiKey: string;
  setApiKey: (key: string) => void;
}

export const ApiKeyInput = ({ relayHost, setRelayHost, apiKey, setApiKey }: ApiKeyInputProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 p-4 border rounded-lg">
      <div>
        <Label htmlFor="relay-host">Relay Host URL</Label>
        <Input
          id="relay-host"
          placeholder="http://localhost:8000"
          value={relayHost}
          onChange={(e) => setRelayHost(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="api-key">API Key</Label>
        <Input
          id="api-key"
          type="password"
          placeholder="Enter your Relay API Key"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </div>
    </div>
  );
};