"use client";

import React, { useState } from "react";
import ProbeCard from "@/components/diagnostics/ProbeCard";
import { showLoading, showSuccess, showError, dismissToast } from "@/utils/toast";
import { useRpcConfirm } from "@/components/rpc-confirm";

interface AiCheckProbeProps {
  relayHost: string;
  apiKey: string;
  origin: string;
}

type ProbeStatus = "idle" | "running" | "success" | "error";

const genAiCheckCurl = (host: string, orig: string, key?: string) =>
  `bash\ncurl -i -X POST "${host.replace(/\/$/, "")}/api/execute_method" \\\n  -H "Origin: ${orig}" \\\n  -H "Content-Type: application/json" \\\n  -H "X-API-Key: ${key ?? ""}" \\\n  -d '{"model":"ir.model","method":"search_read","args":[[["model","=","ai.assistant"]]],"kwargs":{"fields":["id","model","name"],"limit":5}}'`;

const AiCheckProbe: React.FC<AiCheckProbeProps> = ({ relayHost, apiKey, origin }) => {
  const [aiCheckStatus, setAiCheckStatus] = useState<ProbeStatus>("idle");
  const [aiCheckResult, setAiCheckResult] = useState<any>(null);
  const [aiCheckCurl, setAiCheckCurl] = useState(() => genAiCheckCurl(relayHost, origin, apiKey));
  const [aiCheckEdited, setAiCheckEdited] = useState(false);

  const confirmRpc = useRpcConfirm();

  const runAiCheck = async () => {
    if (!relayHost) {
      showError("Please provide a Relay Host first.");
      return;
    }

    const payload = {
      model: "ir.model",
      method: "search_read",
      args: [[["model", "=", "ai.assistant"]]],
      kwargs: { fields: ["id", "model", "name"], limit: 5 },
    };

    try {
      const ok = await confirmRpc({ ...payload, _diagnostic: true });
      if (!ok) {
        showError("ai.assistant check cancelled by user.");
        return;
      }
    } catch {
      showError("Unable to confirm ai.assistant check.");
      return;
    }

    setAiCheckStatus("running");
    setAiCheckResult(null);
    const toastId = showLoading("Checking for ai.assistant...");
    const url = `${relayHost.replace(/\/$/, "")}/api/execute_method`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { "X-API-Key": apiKey } : {}),
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        let parsed = null;
        try {
          parsed = await resp.json();
        } catch {
          parsed = null;
        }

        setAiCheckResult(parsed ?? { status: resp.status, statusText: resp.statusText });
        if (resp.ok && parsed && parsed.success) {
          setAiCheckStatus("success");
          showSuccess("ai.assistant check completed.");
        } else {
          setAiCheckStatus("error");
          showError("ai.assistant not found or returned error.");
        }
      } catch (err: any) {
        clearTimeout(timeout);
        const msg = err?.message || String(err);
        setAiCheckResult({ error: msg });
        setAiCheckStatus("error");
        showError(`ai.assistant check failed: ${msg}`);
      }
    } finally {
      dismissToast(toastId);
    }
  };

  const resetAiCheckCurl = () => {
    setAiCheckCurl(genAiCheckCurl(relayHost, origin, apiKey));
    setAiCheckEdited(false);
    setAiCheckResult(null);
    setAiCheckStatus("idle");
  };

  return (
    <ProbeCard
      title="Check ai.assistant"
      description="Query ir.model to determine whether the ai.assistant model exists on the upstream relay."
      status={aiCheckStatus}
      curlValue={aiCheckCurl}
      onCurlChange={(v) => {
        setAiCheckCurl(v);
        setAiCheckEdited(true);
      }}
      onResetCurl={resetAiCheckCurl}
      onCopyCurl={async () => {
        try {
          await navigator.clipboard.writeText(aiCheckCurl);
          showSuccess("Copied curl to clipboard");
        } catch {
          showError("Unable to copy to clipboard");
        }
      }}
      onRun={runAiCheck}
      runLabel="Check"
      runDisabled={aiCheckStatus === "running"}
      resultJson={aiCheckResult}
      curlEdited={aiCheckEdited}
    />
  );
};

export default AiCheckProbe;