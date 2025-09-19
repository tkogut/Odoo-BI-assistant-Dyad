"use client";

import React from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface CurlEditorProps {
  value: string;
  onChange: (v: string) => void;
  onReset: () => void;
  onCopy: () => void;
  edited?: boolean;
  className?: string;
  rows?: number;
}

const CurlEditor: React.FC<CurlEditorProps> = ({ value, onChange, onReset, onCopy, edited, className, rows = 6 }) => {
  return (
    <div className={className}>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs font-mono"
        rows={rows}
      />
      <div className="flex gap-2 mt-2">
        <Button size="sm" variant="ghost" onClick={onReset}>
          Reset curl
        </Button>
        <Button size="sm" variant="ghost" onClick={onCopy}>
          {edited ? "Copy (edited)" : "Copy curl"}
        </Button>
      </div>
    </div>
  );
};

export default CurlEditor;