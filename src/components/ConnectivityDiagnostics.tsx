"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DiagnosticsHeader from "@/components/diagnostics/DiagnosticsHeader";
import ProbesGrid from "@/components/diagnostics/ProbesGrid";
import AiCheckProbe from "@/components/diagnostics/AiCheckProbe";

interface ConnectivityDiagnosticsProps {
  relayHost: string;
  apiKey: string;
  onRelayHostChange: (v: string) => void;
  onApiKeyChange: (v: string) => void;
}

const ConnectivityDiagnostics: React.FC<ConnectivityDiagnosticsProps> = ({
  relayHost,
  apiKey,
  onRelayHostChange,
  onApiKeyChange,
}) => {
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:8080";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connectivity Diagnostics</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <DiagnosticsHeader
          relayHost={relayHost}
          apiKey={apiKey}
          origin={origin}
          onRelayHostChange={onRelayHostChange}
          onApiKeyChange={onApiKeyChange}
        />

        <ProbesGrid relayHost={relayHost} apiKey={apiKey} origin={origin} />

        <div className="mt-4">
          <AiCheckProbe relayHost={relayHost} apiKey={apiKey} origin={origin} />
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
            <li>
              Use the "Check ai.assistant" probe to confirm whether the relay exposes the ai.assistant model; if it's missing, consider enabling the AI module upstream or provide an OpenAI API key in Settings to enable a client-side fallback.
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

export default ConnectivityDiagnostics;