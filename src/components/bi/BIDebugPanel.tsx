"use client";

import React from "react";

interface Props {
  rawGroups: any[] | null;
  monthMap: Record<string, number>;
  unmapped: any[];
  finalSeries: any[] | null;
}

const BIDebugPanel: React.FC<Props> = ({ rawGroups, monthMap, unmapped, finalSeries }) => {
  return (
    <div className="p-4 border rounded bg-white">
      <div className="flex items-center justify-between mb-3">
        <div className="font-medium">Debug: Aggregation details</div>
        <div className="text-sm text-muted-foreground">Useful to verify read_group → month mapping</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <div className="text-xs font-medium mb-2">Raw read_group response</div>
          <pre className="bg-muted p-2 rounded text-xs max-h-56 overflow-auto whitespace-pre-wrap">
            {rawGroups ? JSON.stringify(rawGroups, null, 2) : "No raw groups captured."}
          </pre>
        </div>

        <div>
          <div className="text-xs font-medium mb-2">Normalized YYYY‑MM → revenue map</div>
          <pre className="bg-muted p-2 rounded text-xs max-h-56 overflow-auto whitespace-pre-wrap">
            {Object.keys(monthMap).length ? JSON.stringify(monthMap, null, 2) : "No month map data."}
          </pre>
        </div>

        <div>
          <div className="text-xs font-medium mb-2">Unmapped group entries (why some groups couldn't be normalized)</div>
          <pre className="bg-muted p-2 rounded text-xs max-h-56 overflow-auto whitespace-pre-wrap">
            {unmapped && unmapped.length ? JSON.stringify(unmapped, null, 2) : "No unmapped entries."}
          </pre>
        </div>
      </div>

      <div className="mt-4">
        <div className="text-xs font-medium mb-2">Final series (what is rendered)</div>
        <pre className="bg-muted p-2 rounded text-xs max-h-56 overflow-auto whitespace-pre-wrap">
          {finalSeries && finalSeries.length ? JSON.stringify(finalSeries, null, 2) : "No final series."}
        </pre>
      </div>
    </div>
  );
};

export default BIDebugPanel;