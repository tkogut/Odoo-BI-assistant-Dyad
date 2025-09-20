"use client";

import React, { useEffect, useState } from "react";
import ProbeCard from "@/components/diagnostics/ProbeCard";
import { showLoading, showSuccess, showError, dismissToast } from "@/utils/toast";
import { useRpcConfirm } from "@/components/rpc-confirm";

interface ProbesGridProps {
  relayHost: string;
  apiKey: string;
  origin: string;
}

type ProbeStatus = "idle" | "running" | "success" | "error";

const genOptionsRootCurl = (host: string, orig: string) =>
  `bash\ncurl -i -X OPTIONS "${host.replace(/\/$/, "")}/" \\\n  -H "Origin: ${orig}" \\\n  -H "Access-Control-Request-Method: GET" \\\n  -H "Access-Control-Request-Headers: X-API-Key,Content-Type"`;

const genGetRootCurl = (host: string, orig: string, key?: string) =>
  `bash\ncurl -i -X GET "${host.replace(/\/$/, "")}/" \\\n  -H "Origin: ${orig}" \\\n  -H "X-API-Key: ${key ?? ""}"`;

const genOptionsExecuteCurl = (host: string, orig: string) =>
  `bash\ncurl -i -X OPTIONS "${host.replace(/\/$/, "")}/api/execute_method" \\\n  -H "Origin: ${orig}" \\\n  -H "Access-Control-Request-Method: POST" \\\n  -H "Access-Control-Request-Headers: X-API-Key,Content-Type"`;

const genPostExecuteCurl = (host: string, orig: string, key?: string) =>
  `bash\ncurl -i -X POST "${host.replace(/\/$/, "")}/api/execute_method" \\\n  -H "Origin: ${orig}" \\\n  -H "Content-Type: application/json" \\\n  -H "X-API-Key: ${key ?? ""}" \\\n  -d '{"model":"res.partner","method":"search_read","args":[],"kwargs":{}}'`;

const safePreview = async (r: Response): Promise<string> => {
  try {
    const text = await r.text();
    return text.slice(0, 1000);
  } catch {
    return "";
  }
};

const ProbesGrid: React.FC<ProbesGridProps> = ({ relayHost, apiKey, origin }) => {
  const [getStatus, setGetStatus] = useState<ProbeStatus>("idle");
  const [optionsRootStatus, setOptionsRootStatus] = useState<ProbeStatus>("idle");
  const [optionsStatus, setOptionsStatus] = useState<ProbeStatus>("idle");
  const [postStatus, setPostStatus] = useState<ProbeStatus>("idle");

  const [getResult, setGetResult] = useState<any | null>(null);
  const [optionsRootResult, setOptionsRootResult] = useState<any | null>(null);
  const [optionsResult, setOptionsResult] = useState<any | null>(null);
  const [postResult, setPostResult] = useState<any | null>(null);

  const confirmRpc = useRpcConfirm();

  // curl editable states
  const [optionsRootCurl, setOptionsRootCurl] = useState(() => genOptionsRootCurl(relayHost, origin));
  const [optionsRootEdited, setOptionsRootEdited] = useState(false);

  const [getRootCurl, setGetRootCurl] = useState(() => genGetRootCurl(relayHost, origin, apiKey));
  const [getRootEdited, setGetRootEdited] = useState(false);

  const [optionsExecuteCurl, setOptionsExecuteCurl] = useState(() => genOptionsExecuteCurl(relayHost, origin));
  const [optionsExecuteEdited, setOptionsExecuteEdited] = useState(false);

  const [postExecuteCurl, setPostExecuteCurl] = useState(() => genPostExecuteCurl(relayHost, origin, apiKey));
  const [postExecuteEdited, setPostExecuteEdited] = useState(false);

  useEffect(() => {
    if (!optionsRootEdited) setOptionsRootCurl(genOptionsRootCurl(relayHost, origin));
    if (!getRootEdited) setGetRootCurl(genGetRootCurl(relayHost, origin, apiKey));
    if (!optionsExecuteEdited) setOptionsExecuteCurl(genOptionsExecuteCurl(relayHost, origin));
    if (!postExecuteEdited) setPostExecuteCurl(genPostExecuteCurl(relayHost, origin, apiKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relayHost, apiKey, origin]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showSuccess("Copied curl to clipboard");
    } catch {
      showError("Unable to copy to clipboard");
    }
  };

  const runGet = async () => {
    if (!relayHost) {
      showError("Please provide a Relay Host first.");
      return;
    }
    setGetStatus("running");
    setGetResult(null);
    const toastId = showLoading("Running GET probe...");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const resp = await fetch(relayHost, { method: "GET", signal: controller.signal });
        clearTimeout(timeout);
        const preview = await safePreview(resp);
        const box = {
          ok: resp.ok,
          status: resp.status,
          statusText: resp.statusText,
          bodyPreview: preview,
        };
        setGetResult(box);
        if (resp.ok) {
          setGetStatus("success");
          showSuccess("GET succeeded");
        } else {
          setGetStatus("error");
          showError(`GET returned ${resp.status}`);
        }
      } catch (err: any) {
        clearTimeout(timeout);
        const msg = err?.message || String(err);
        setGetResult({ error: msg });
        setGetStatus("error");
        showError(`GET failed: ${msg}`);
      }
    } finally {
      dismissToast(toastId);
    }
  };

  const runOptionsRoot = async () => {
    if (!relayHost) {
      showError("Please provide a Relay Host first.");
      return;
    }
    setOptionsRootStatus("running");
    setOptionsRootResult(null);
    const toastId = showLoading("Running OPTIONS (root) preflight...");
    const url = `${relayHost.replace(/\/$/, "")}/`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const resp = await fetch(url, {
          method: "OPTIONS",
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const headers: Record<string, string> = {};
        resp.headers.forEach((v, k) => {
          headers[k.toLowerCase()] = v;
        });

        const mismatches: string[] = [];
        const acaOrigin = headers["access-control-allow-origin"];
        if (!acaOrigin) mismatches.push("Missing Access-Control-Allow-Origin");
        else if (acaOrigin !== "*" && origin && acaOrigin !== origin)
          mismatches.push(`Access-Control-Allow-Origin does not match (${origin})`);

        const res = { ok: resp.ok, status: resp.status, headers, mismatches };
        setOptionsRootResult(res);

        if (resp.ok && mismatches.length === 0) {
          setOptionsRootStatus("success");
          showSuccess("Root OPTIONS looks good");
        } else {
          setOptionsRootStatus("error");
          showError("OPTIONS (root) returned issues; inspect headers");
        }
      } catch (err: any) {
        clearTimeout(timeout);
        const msg = err?.message || String(err);
        setOptionsRootResult({ error: msg });
        setOptionsRootStatus("error");
        showError(`OPTIONS (root) failed: ${msg}`);
      }
    } finally {
      dismissToast(toastId);
    }
  };

  const runOptions = async () => {
    if (!relayHost) {
      showError("Please provide a Relay Host first.");
      return;
    }
    setOptionsStatus("running");
    setOptionsResult(null);
    const toastId = showLoading("Running OPTIONS preflight...");
    const url = `${relayHost.replace(/\/$/, "")}/api/execute_method`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const resp = await fetch(url, {
          method: "OPTIONS",
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const headers: Record<string, string> = {};
        resp.headers.forEach((v, k) => {
          headers[k.toLowerCase()] = v;
        });

        const mismatches: string[] = [];
        const acaOrigin = headers["access-control-allow-origin"];
        if (!acaOrigin) mismatches.push("Missing Access-Control-Allow-Origin");
        else if (acaOrigin !== "*" && origin && acaOrigin !== origin)
          mismatches.push(`Access-Control-Allow-Origin does not match (${origin})`);

        const allowedMethods = (headers["access-control-allow-methods"] || "").toUpperCase();
        if (!allowedMethods) mismatches.push("Missing Access-Control-Allow-Methods");
        else {
          if (!allowedMethods.includes("POST")) mismatches.push("POST not allowed");
          if (!allowedMethods.includes("OPTIONS")) mismatches.push("OPTIONS not allowed");
          if (!allowedMethods.includes("GET")) mismatches.push("GET not allowed");
        }

        const allowedHeaders = (headers["access-control-allow-headers"] || "").toLowerCase();
        if (!allowedHeaders) mismatches.push("Missing Access-Control-Allow-Headers");
        else {
          if (!allowedHeaders.includes("content-type")) mismatches.push("Missing Content-Type in allowed headers");
          if (!allowedHeaders.includes("x-api-key")) mismatches.push("Missing X-API-Key in allowed headers");
        }

        const res = { ok: resp.ok, status: resp.status, headers, mismatches };
        setOptionsResult(res);

        if (resp.ok && mismatches.length === 0) {
          setOptionsStatus("success");
          showSuccess("OPTIONS looks good");
        } else {
          setOptionsStatus("error");
          showError("OPTIONS returned issues; inspect headers");
        }
      } catch (err: any) {
        clearTimeout(timeout);
        const msg = err?.message || String(err);
        setOptionsResult({ error: msg });
        setOptionsStatus("error");
        showError(`OPTIONS failed: ${msg}`);
      }
    } finally {
      dismissToast(toastId);
    }
  };

  const runPost = async () => {
    if (!relayHost) {
      showError("Please provide a Relay Host first.");
      return;
    }

    const payload = {
      model: "res.partner",
      method: "search_read",
      args: [[]],
      kwargs: { fields: ["id"], limit: 1 },
    };

    try {
      const ok = await confirmRpc({ ...payload, _diagnostic: true });
      if (!ok) {
        showError("POST probe cancelled by user.");
        return;
      }
    } catch {
      showError("Unable to confirm POST probe.");
      return;
    }

    setPostStatus("running");
    setPostResult(null);
    const toastId = showLoading("Running POST probe...");
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

        const box: any = { status: resp.status, statusText: resp.statusText, ok: resp.ok };
        try {
          const parsed = await resp.json();
          box.parsedJson = parsed;
          box.bodyPreview = JSON.stringify(parsed).slice(0, 2000);
        } catch {
          box.bodyPreview = await safePreview(resp);
        }
        setPostResult(box);

        if (resp.ok) {
          setPostStatus("success");
          showSuccess("POST succeeded (HTTP OK).");
        } else {
          setPostStatus("error");
          showError(`POST returned ${resp.status}`);
        }
      } catch (err: any) {
        clearTimeout(timeout);
        const msg = err?.message || String(err);
        setPostResult({ error: msg });
        setPostStatus("error");
        showError(`POST failed: ${msg}`);
      }
    } finally {
      dismissToast(toastId);
    }
  };

  const resetOptionsRootCurl = () => {
    setOptionsRootCurl(genOptionsRootCurl(relayHost, origin));
    setOptionsRootEdited(false);
  };
  const resetGetRootCurl = () => {
    setGetRootCurl(genGetRootCurl(relayHost, origin, apiKey));
    setGetRootEdited(false);
  };
  const resetOptionsExecuteCurl = () => {
    setOptionsExecuteCurl(genOptionsExecuteCurl(relayHost, origin));
    setOptionsExecuteEdited(false);
  };
  const resetPostExecuteCurl = () => {
    setPostExecuteCurl(genPostExecuteCurl(relayHost, origin, apiKey));
    setPostExecuteEdited(false);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <ProbeCard
        title="OPTIONS / (health check)"
        description="Preflight-style OPTIONS to the root (useful to verify CORS on health endpoints)."
        status={optionsRootStatus}
        curlValue={optionsRootCurl}
        onCurlChange={(v) => {
          setOptionsRootCurl(v);
          setOptionsRootEdited(true);
        }}
        onResetCurl={resetOptionsRootCurl}
        onCopyCurl={() => copyToClipboard(optionsRootCurl)}
        onRun={runOptionsRoot}
        runLabel="Run OPTIONS"
        runDisabled={optionsRootStatus === "running"}
        resultJson={optionsRootResult}
        curlEdited={optionsRootEdited}
      />

      <ProbeCard
        title="GET / (health check)"
        description="Simple GET health check of the relay root (include Origin/X-API-Key to reproduce browser headers)."
        status={getStatus}
        curlValue={getRootCurl}
        onCurlChange={(v) => {
          setGetRootCurl(v);
          setGetRootEdited(true);
        }}
        onResetCurl={resetGetRootCurl}
        onCopyCurl={() => copyToClipboard(getRootCurl)}
        onRun={runGet}
        runLabel="Run GET"
        runDisabled={getStatus === "running"}
        resultPreview={getResult ? JSON.stringify(getResult, null, 2) : undefined}
        curlEdited={getRootEdited}
      />

      <ProbeCard
        title="OPTIONS /api/execute_method"
        description="Validate preflight headers required by browsers (Access-Control-Allow-*)."
        status={optionsStatus}
        curlValue={optionsExecuteCurl}
        onCurlChange={(v) => {
          setOptionsExecuteCurl(v);
          setOptionsExecuteEdited(true);
        }}
        onResetCurl={resetOptionsExecuteCurl}
        onCopyCurl={() => copyToClipboard(optionsExecuteCurl)}
        onRun={runOptions}
        runLabel="Run OPTIONS"
        runDisabled={optionsStatus === "running"}
        resultJson={optionsResult}
        curlEdited={optionsExecuteEdited}
      />

      <ProbeCard
        title="POST /api/execute_method"
        description="Send a simple POST RPC to check preflight, headers, and response payload."
        status={postStatus}
        curlValue={postExecuteCurl}
        onCurlChange={(v) => {
          setPostExecuteCurl(v);
          setPostExecuteEdited(true);
        }}
        onResetCurl={resetPostExecuteCurl}
        onCopyCurl={() => copyToClipboard(postExecuteCurl)}
        onRun={runPost}
        runLabel="Run POST"
        runDisabled={postStatus === "running"}
        resultPreview={postResult ? postResult.bodyPreview : undefined}
        resultJson={postResult ? postResult.parsedJson ?? postResult : undefined}
        curlEdited={postExecuteEdited}
      />
    </div>
  );
};

export default ProbesGrid;