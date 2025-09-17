"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { showError, showSuccess, showLoading, dismissToast } from "@/utils/toast";
import { exportToCsv } from "@/lib/exportCsv";
import { executeMethod } from "@/lib/relayClient";

interface CustomQueryProps {
  relayHost: string;
  apiKey: string;
}

const defaultArgs = "[[]]";
const defaultKwargs = "{}";

export const CustomQuery = ({ relayHost, apiKey }: CustomQueryProps) => {
  const [model, setModel] = useState("res.partner");
  const [method, setMethod] = useState("search_read");
  const [argsText, setArgsText] = useState(defaultArgs);
  const [kwargsText, setKwargsText] = useState(defaultKwargs);
  const [loading, setLoading] = useState(false);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<unknown[][]>([]);
  const [rawResult, setRawResult] = useState<any>(null);

  const parseJSON = (text: string) => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };

  const buildTableFromRecords = (records: Record<string, any>[]) => {
    if (!records || records.length === 0) {
      setColumns([]);
      setRows([]);
      return;
    }
    const cols = Object.keys(records[0]);
    const generatedRows = records.map((r) => cols.map((c) => r[c]));
    setColumns(cols);
    setRows(generatedRows);
  };

  const extractRecords = (result: any): Record<string, any>[] | null => {
    if (!result) return null;
    if (Array.isArray(result)) return result as Record<string, any>[];
    if (result.records && Array.isArray(result.records)) return result.records;
    if (result.data && Array.isArray(result.data)) return result.data;
    if (result.result && Array.isArray(result.result)) return result.result;
    for (const k of Object.keys(result)) {
      if (Array.isArray(result[k]) && result[k].length > 0 && typeof result[k][0] === "object")
        return result[k];
    }
    return null;
  };

  const handleExecute = async () => {
    if (!relayHost || !apiKey) {
      showError("Relay host and API key are required.");
      return;
    }

    const parsedArgs = parseJSON(argsText);
    const parsedKwargs = parseJSON(kwargsText);

    if (parsedArgs === null || parsedKwargs === null) {
      showError("Invalid JSON in args or kwargs. Please fix the syntax.");
      return;
    }

    setLoading(true);
    setColumns([]);
    setRows([]);
    setRawResult(null);
    const toastId = showLoading("Executing method...");

    try {
      const result = await executeMethod(relayHost, apiKey, {
        model,
        method,
        args: parsedArgs,
        kwargs: parsedKwargs,
      });
      dismissToast(toastId);

      const records = extractRecords(result);
      if (records) {
        buildTableFromRecords(records);
        setRawResult(result);
        showSuccess(`Returned ${records.length} rows.`);
      } else {
        // If no tabular records, just show raw result
        setRawResult(result);
        showSuccess("Execution completed — no tabular records found, showing raw result.");
      }
    } catch (err) {
      dismissToast(toastId);
      console.error(err);
      showError(err instanceof Error ? err.message : "Network or parsing error while executing method.");
      setRawResult(err);
    } finally {
      setLoading(false);
    }
  };

  const debugPayload = {
    model,
    method,
    args: parseJSON(argsText) ?? argsText,
    kwargs: parseJSON(kwargsText) ?? kwargsText,
  };

  const handleCopy = async (obj: unknown) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
      showSuccess("Copied to clipboard.");
    } catch (e) {
      console.error(e);
      showError("Failed to copy to clipboard.");
    }
  };

  const handleExportCsv = () => {
    if (!columns || columns.length === 0 || !rows || rows.length === 0) {
      showError("No tabular results to export.");
      return;
    }
    exportToCsv("custom_query.csv", columns, rows);
    showSuccess("CSV download started.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Custom Query (execute_method)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="model">Model</Label>
            <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="method">Method</Label>
            <Input id="method" value={method} onChange={(e) => setMethod(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button onClick={handleExecute} disabled={loading}>
              {loading ? "Running..." : "Execute"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="args">Args (JSON)</Label>
            <textarea
              id="args"
              className="w-full border rounded p-2 min-h-[120px]"
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="kwargs">Kwargs (JSON)</Label>
            <textarea
              id="kwargs"
              className="w-full border rounded p-2 min-h-[120px]"
              value={kwargsText}
              onChange={(e) => setKwargsText(e.target.value)}
            />
          </div>
        </div>

        <div>
          <h3 className="text-lg font-medium mb-2">Debug / Execute Payload</h3>
          <div className="flex justify-between items-start gap-4">
            <pre className="bg-muted p-3 rounded text-sm overflow-auto w-full">
              {JSON.stringify(debugPayload, null, 2)}
            </pre>
            <div className="flex flex-col gap-2">
              <Button variant="ghost" onClick={() => handleCopy(debugPayload)}>Copy Payload</Button>
            </div>
          </div>
        </div>

        {columns.length > 0 && (
          <div>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-medium">Tabular Result</h3>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => handleCopy({ columns, rows })}>Copy JSON</Button>
                <Button variant="ghost" onClick={handleExportCsv}>Export CSV</Button>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((c) => (
                    <TableHead key={c}>{c}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, idx) => (
                  <TableRow key={idx}>
                    {r.map((cell, cIdx) => (
                      <TableCell key={cIdx}>{String(cell ?? "")}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <h4 className="mt-4 font-medium">Machine-friendly table</h4>
            <pre className="bg-muted p-3 rounded text-sm overflow-auto">
              {JSON.stringify({ columns, rows }, null, 2)}
            </pre>

            <div className="mt-4">
              <h4 className="font-medium">Summary</h4>
              <p className="text-sm text-muted-foreground">{`Execution returned ${rows.length} row(s) for ${model}.${method}.`}</p>
            </div>
          </div>
        )}

        {rawResult && (
          <div>
            <h3 className="text-lg font-medium mb-2">Raw response</h3>
            <pre className="bg-muted p-3 rounded text-sm overflow-auto">
              {JSON.stringify(rawResult, null, 2)}
            </pre>

            <div className="mt-4">
              <h4 className="font-medium">Suggested debug payload</h4>
              <p className="text-sm mb-2">If the result is empty or an error, try a simple search_read to validate access:</p>
              <pre className="bg-muted p-3 rounded text-sm overflow-auto">
{JSON.stringify({
  model,
  method: "search_read",
  args: [[[]]],
  kwargs: { fields: ["id", "name"], limit: 5 },
}, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};