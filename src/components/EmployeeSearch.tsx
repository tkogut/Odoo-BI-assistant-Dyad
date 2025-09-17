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
import { searchEmployee } from "@/lib/mcpApi";

interface EmployeeSearchProps {
  relayHost: string;
  apiKey: string;
}

function maskEmail(value: string) {
  try {
    const [local, domain] = value.split("@");
    if (!domain) return value;
    const visible = local.slice(0, 1);
    return `${visible}***@${domain}`;
  } catch {
    return value;
  }
}

function maskPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) return "***";
  const visible = digits.slice(-2);
  return `${"*".repeat(digits.length - 2)}${visible}`;
}

function maskPII(key: string, val: any) {
  if (typeof val !== "string") return val;
  const lower = key.toLowerCase();
  if (lower.includes("email") || lower.includes("mail")) return maskEmail(val);
  if (lower.includes("phone") || lower.includes("mobile") || lower.includes("tel"))
    return maskPhone(val);
  return val;
}

export const EmployeeSearch = ({ relayHost, apiKey }: EmployeeSearchProps) => {
  const [name, setName] = useState("");
  const [limit, setLimit] = useState<number>(5);
  const [loading, setLoading] = useState(false);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<unknown[][]>([]);
  const [rawResult, setRawResult] = useState<any>(null);

  const buildTableFromRecords = (records: Record<string, any>[]) => {
    if (!records || records.length === 0) {
      setColumns([]);
      setRows([]);
      return;
    }
    const cols = Object.keys(records[0]);
    const generatedRows = records.map((r) =>
      cols.map((c) => {
        const v = r[c];
        return maskPII(c, v);
      }),
    );
    setColumns(cols);
    setRows(generatedRows);
  };

  const extractRecords = (result: any): Record<string, any>[] | null => {
    if (!result) return null;
    if (Array.isArray(result)) return result as Record<string, any>[];
    if (result.employees && Array.isArray(result.employees)) return result.employees;
    if (result.records && Array.isArray(result.records)) return result.records;
    if (result.data && Array.isArray(result.data)) return result.data;
    // fallback: try to find first array of objects
    for (const k of Object.keys(result)) {
      if (Array.isArray(result[k]) && result[k].length > 0 && typeof result[k][0] === "object")
        return result[k];
    }
    return null;
  };

  const handleSearch = async () => {
    if (!relayHost || !apiKey) {
      showError("Relay host and API key are required.");
      return;
    }

    setLoading(true);
    setColumns([]);
    setRows([]);
    setRawResult(null);
    const toastId = showLoading("Searching employees...");

    try {
      const resp = await searchEmployee(relayHost, apiKey, { name, limit });

      dismissToast(toastId);

      if (!resp.ok) {
        showError(resp.error || `Search failed (status ${resp.status})`);
        setRawResult(resp.data ?? null);
        return;
      }

      const result = resp.data;
      const records = extractRecords(result);
      if (!records) {
        showError("No employee records found in response. See raw output for debugging.");
        setRawResult(result);
        return;
      }

      buildTableFromRecords(records);
      setRawResult(result);
      showSuccess(`Found ${records.length} employee(s).`);
    } catch (err) {
      dismissToast(toastId);
      console.error(err);
      showError("Network or parsing error while searching employees.");
      setRawResult(err);
    } finally {
      setLoading(false);
    }
  };

  const followupExecuteMethodPayload = (n: number | string) => {
    return {
      model: "hr.employee",
      method: "search_read",
      args: [[["name", "ilike", String(n)]]],
      kwargs: { fields: ["id", "name", "work_email", "work_phone"], limit: 20 },
    };
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
    exportToCsv("employees.csv", columns, rows);
    showSuccess("CSV download started.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Employee Search</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <Label htmlFor="employee-name">Name</Label>
            <Input
              id="employee-name"
              placeholder="e.g. Tomasz"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="employee-limit">Limit</Label>
            <Input
              id="employee-limit"
              type="number"
              min={1}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            />
          </div>
          <div>
            <Button onClick={handleSearch} disabled={loading}>
              {loading ? "Searching..." : "Search"}
            </Button>
          </div>
        </div>

        {columns.length > 0 && (
          <div>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-medium">Results</h3>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => handleCopy({ columns, rows })}>Copy JSON</Button>
                <Button variant="ghost" onClick={handleExportCsv}>Export CSV</Button>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((col) => (
                    <TableHead key={col}>{col}</TableHead>
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

            <div className="mt-4">
              <h4 className="font-medium">Machine-friendly table</h4>
              <pre className="bg-muted p-3 rounded text-sm overflow-auto">
                {JSON.stringify({ columns, rows }, null, 2)}
              </pre>
            </div>

            <div className="mt-4">
              <h4 className="font-medium">Summary</h4>
              <p className="text-sm text-muted-foreground">
                Found {rows.length} employee(s) matching "{name}" (limit {limit}).
              </p>
            </div>

            <div className="mt-4">
              <h4 className="font-medium">Follow-up</h4>
              <p className="text-sm mb-2">To retrieve full employee records (unmasked) run:</p>
              <pre className="bg-muted p-3 rounded text-sm overflow-auto">
                {JSON.stringify(followupExecuteMethodPayload(name || "%"), null, 2)}
              </pre>
              <p className="text-xs text-muted-foreground mt-2">
                Note: The API key must have permission to read hr.employee.
              </p>
            </div>
          </div>
        )}

        {rawResult && (
          <div>
            <h3 className="text-lg font-medium mb-2">Raw response</h3>
            <pre className="bg-muted p-3 rounded text-sm overflow-auto">
              {JSON.stringify(rawResult, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
};