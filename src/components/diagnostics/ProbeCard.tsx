"use client";

import React from "react";
import CurlEditor from "./CurlEditor";
import { Button } from "@/components/ui/button";

type ProbeStatus = "idle" | "running" | "success" | "error";

const statusColor = (s: ProbeStatus) => {
  switch (s) {
    case "running":
      return "bg-yellow-400";
    case "success":
      return "bg-green-500";
    case "error":
      return "bg-red-500";
    default:
      return "bg-gray-300";
  }
};

interface ProbeCardProps {
  title: string;
  description?: string;
  status: ProbeStatus;
  curlValue: string;
  onCurlChange: (v: string) => void;
  onResetCurl: () => void;
  onCopyCurl: () => void;
  onRun: () => void;
  runLabel?: string;
  runDisabled?: boolean;
  resultPreview?: string;
  resultJson?: any;
  curlEdited?: boolean;
}

const ProbeCard: React.FC<ProbeCardProps> = ({
  title,
  description,
  status,
  curlValue,
  onCurlChange,
  onResetCurl,
  onCopyCurl,
  onRun,
  runLabel = "Run",
  runDisabled,
  resultPreview,
  resultJson,
  curlEdited,
}) => {
  return (
    <div className="border rounded p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${statusColor(status)}`} />
          <div className="font-medium">{title}</div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onCopyCurl}>
            Copy curl
          </Button>
          <Button size="sm" onClick={onRun} disabled={runDisabled}>
            {status === "running" ? "Running..." : runLabel}
          </Button>
        </div>
      </div>

      {description && <div className="text-xs text-muted-foreground mb-2">{description}</div>}

      <div className="mb-2">
        <CurlEditor
          value={curlValue}
          onChange={onCurlChange}
          onReset={onResetCurl}
          onCopy={onCopyCurl}
          edited={!!curlEdited}
        />
      </div>

      <pre className="bg-muted p-2 rounded text-xs h-28 overflow-auto">
        {resultJson ? JSON.stringify(resultJson, null, 2) : resultPreview ? resultPreview : "No result yet."}
      </pre>
    </div>
  );
};

export default ProbeCard;