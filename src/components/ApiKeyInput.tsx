"use client";

import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface ApiKeyInputProps {
  relayHost: string;
  setRelayHost: (host: string) => void;
  apiKey: string;
  setApiKey: (key: string) => void;
}

const STORAGE_KEYS = {
  RELAY: "mcp_relayHost",
  API_KEY: "mcp_apiKey",
};

export const ApiKeyInput = ({
  relayHost,
  setRelayHost,
  apiKey,
  setApiKey,
}: ApiKeyInputProps) => {
  const [localRelay, setLocalRelay] = useState(relayHost ?? "");
  const [localKey, setLocalKey] = useState(apiKey ?? "");

  // Load saved values on mount
  useEffect(() => {
    const savedRelay = localStorage.getItem(STORAGE_KEYS.RELAY);
    const savedKey = localStorage.getItem(STORAGE_KEYS.API_KEY);

    if (savedRelay) {
      setLocalRelay(savedRelay);
      setRelayHost(savedRelay);
    }

    if (savedKey) {
      setLocalKey(savedKey);
      setApiKey(savedKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist relayHost when it changes locally
  useEffect(() => {
    setRelayHost(localRelay);
    try {
      if (localRelay) {
        localStorage.setItem(STORAGE_KEYS.RELAY, localRelay);
      } else {
        localStorage.removeItem(STORAGE_KEYS.RELAY);
      }
    } catch (e) {
      // intentionally silent; localStorage can fail in some environments
      console.error("localStorage error (relayHost)", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localRelay]);

  // Persist apiKey when it changes locally
  useEffect(() => {
    setApiKey(localKey);
    try {
      if (localKey) {
        localStorage.setItem(STORAGE_KEYS.API_KEY, localKey);
      } else {
        localStorage.removeItem(STORAGE_KEYS.API_KEY);
      }
    } catch (e) {
      console.error("localStorage error (apiKey)", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localKey]);

  const handleClearApiKey = () => {
    setLocalKey("");
    setApiKey("");
    try {
      localStorage.removeItem(STORAGE_KEYS.API_KEY);
    } catch (e) {
      console.error("localStorage remove error", e);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 p-4 border rounded-lg">
      <div>
        <Label htmlFor="relay-host">Relay Host URL</Label>
        <Input
          id="relay-host"
          placeholder="http://localhost:8000"
          value={localRelay}
          onChange={(e) => setLocalRelay(e.target.value)}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Relay host is saved in your browser for convenience.
        </p>
      </div>
      <div>
        <Label htmlFor="api-key">API Key</Label>
        <div className="flex gap-2">
          <Input
            id="api-key"
            type="password"
            placeholder="Enter your Relay API Key"
            value={localKey}
            onChange={(e) => setLocalKey(e.target.value)}
          />
          <Button
            variant="ghost"
            onClick={handleClearApiKey}
            className="whitespace-nowrap"
            aria-label="Clear API key"
          >
            Clear
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          API key is stored in localStorage; click Clear to remove it for security.
        </p>
      </div>
    </div>
  );
};