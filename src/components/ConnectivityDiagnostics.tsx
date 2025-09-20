"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ProbeCard from "@/components/diagnostics/ProbeCard";
import ConnectivityHeader from "@/components/diagnostics/ConnectivityHeader";
import { useConnectivityProbes } from "@/components/diagnostics/useConnectivityProbes";
import { useRpcConfirm } from "@/components/rpc-confirm";

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
  const confirmRpc = useRpcConfirm();
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:8080";

  const probes = useConnectivityProbes(relayHost, apiKey, origin, confirmRpc);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connectivity Diagnostics</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <ConnectivityHeader
          relayHost={relayHost}
          apiKey={apiKey}
          onRelayHostChange={onRelayHostChange}
          onApiKeyChange={onApiKeyChange}
          origin={origin}
        />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <ProbeCard
            title="OPTIONS / (health check)"
            description="Preflight-style OPTIONS to the root (useful to verify CORS on health endpoints)."
            status={probes.optionsRootStatus}
            curlValue={probes.optionsRootCurl}
            onCurlChange={(v) => {
              probes.setOptionsRootCurl(v);
              probes.setOptionsRootEdited(true);
            }}
            onResetCurl={probes.resetOptionsRootCurl}
            onCopyCurl={() => probes.copyToClipboard(probes.optionsRootCurl)}
            onRun={probes.runOptionsRoot}
            runLabel="Run OPTIONS"
            runDisabled={probes.optionsRootStatus === "running"}
            resultJson={probes.optionsRootResult}
            curlEdited={probes.optionsRootEdited}
          />

          <ProbeCard
            title="GET / (health check)"
            description="Simple GET health check of the relay root (include Origin/X-API-Key to reproduce browser headers)."
            status={probes.getStatus}
            curlValue={probes.getRootCurl}
            onCurlChange={(v) => {
              probes.setGetRootCurl(v);
              probes.setGetRootEdited(true);
            }}
            onResetCurl={probes.resetGetRootCurl}
            onCopyCurl={() => probes.copyToClipboard(probes.getRootCurl)}
            onRun={probes.runGet}
            runLabel="Run GET"
            runDisabled={probes.getStatus === "running"}
            resultPreview={probes.getResult ? JSON.stringify(probes.getResult, null, 2) : undefined}
            curlEdited={probes.getRootEdited}
          />

          <ProbeCard
            title="OPTIONS /api/execute_method"
            description="Validate preflight headers required by browsers (Access-Control-Allow-*)."
            status={probes.optionsStatus}
            curlValue={probes.optionsExecuteCurl}
            onCurlChange={(v) => {
              probes.setOptionsExecuteCurl(v);
              probes.setOptionsExecuteEdited(true);
            }}
            onResetCurl={probes.resetOptionsExecuteCurl}
            onCopyCurl={() => probes.copyToClipboard(probes.optionsExecuteCurl)}
            onRun={probes.runOptions}
            runLabel="Run OPTIONS"
            runDisabled={probes.optionsStatus === "running"}
            resultJson={probes.optionsResult}
            curlEdited={probes.optionsExecuteEdited}
          />

          <ProbeCard
            title="POST /api/execute_method"
            description="Send a simple POST RPC to check preflight, headers, and response payload."
            status={probes.postStatus}
            curlValue={probes.postExecuteCurl}
            onCurlChange={(v) => {
              probes.setPostExecuteCurl(v);
              probes.setPostExecuteEdited(true);
            }}
            onResetCurl={probes.resetPostExecuteCurl}
            onCopyCurl={() => probes.copyToClipboard(probes.postExecuteCurl)}
            onRun={probes.runPost}
            runLabel="Run POST"
            runDisabled={probes.postStatus === "running"}
            resultPreview={probes.postResult ? probes.postResult.bodyPreview : undefined}
            resultJson={probes.postResult ? probes.postResult.parsedJson ?? probes.postResult : undefined}
            curlEdited={probes.postExecuteEdited}
          />

          <ProbeCard
            title="Check ai.assistant"
            description="Query ir.model to determine whether the ai.assistant model exists on the upstream relay."
            status={probes.aiCheckStatus}
            curlValue={probes.aiCheckCurl}
            onCurlChange={(v) => {
              probes.setAiCheckCurl(v);
              probes.setAiCheckEdited(true);
            }}
            onResetCurl={probes.resetAiCheckCurl}
            onCopyCurl={() => probes.copyToClipboard(probes.aiCheckCurl)}
            onRun={probes.runAiCheck}
            runLabel="Check"
            runDisabled={probes.aiCheckStatus === "running"}
            resultJson={probes.aiCheckResult}
            curlEdited={probes.aiCheckEdited}
          />
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