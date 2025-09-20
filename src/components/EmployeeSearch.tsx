"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showLoading, showSuccess, showError, dismissToast } from "@/utils/toast";
import { useRpcConfirm } from "@/components/rpc-confirm";

interface Props {
  relayHost: string;
  apiKey: string;
}

interface Employee {
  id: number;
  name: string;
  work_email?: string;
  work_phone?: string;
  department_id?: [number, string];
}

export const EmployeeSearch: React.FC<Props> = ({ relayHost, apiKey }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Employee[]>([]);
  const confirmRpc = useRpcConfirm();

  const trySearchEmployeeEndpoint = async (name: string, limit = 10) => {
    const url = `${relayHost.replace(/\/$/, "")}/api/search_employee`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "X-API-Key": apiKey } : {}),
        },
        body: JSON.stringify({ name, limit }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const json = await resp.json().catch(() => null);
      if (resp.ok && json && json.success && Array.isArray(json.employees)) {
        return { ok: true, employees: json.employees };
      }
      return { ok: false, parsed: json, status: resp.status, statusText: resp.statusText };
    } catch (err: any) {
      clearTimeout(timeout);
      return { ok: false, error: err?.message || String(err) };
    }
  };

  const tryExecuteMethodFallback = async (term: string) => {
    // Reuse the older execute_method approach
    const payload = {
      model: "hr.employee",
      method: "search_read",
      args: [[["name", "ilike", term]]],
      kwargs: {
        fields: ["name", "work_email", "work_phone", "department_id"],
        limit: 10,
      },
    };

    const url = `${relayHost.replace(/\/$/, "")}/api/execute_method`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
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

      const json = await resp.json().catch(() => null);
      if (resp.ok && json && json.success) {
        return { ok: true, employees: json.result || [] };
      }
      // Some relays may return arrays directly
      if (resp.ok && Array.isArray(json)) {
        return { ok: true, employees: json };
      }
      return { ok: false, parsed: json, status: resp.status, statusText: resp.statusText };
    } catch (err: any) {
      clearTimeout(timeout);
      return { ok: false, error: err?.message || String(err) };
    }
  };

  const searchEmployees = async () => {
    if (!relayHost) {
      showError("Please enter a Relay Host (e.g. http://localhost:8000)");
      return;
    }
    if (!searchTerm) {
      showError("Please enter a search term.");
      return;
    }

    // Confirm the intended action with the user (keeps consistent UX with other probes)
    try {
      const previewPayload = { endpoint: "/api/search_employee (preferred)", body: { name: searchTerm, limit: 10 } };
      const ok = await confirmRpc(previewPayload);
      if (!ok) {
        showError("Search cancelled by user.");
        return;
      }
    } catch {
      showError("Unable to confirm search.");
      return;
    }

    setRunning(true);
    setResults([]);
    const toastId = showLoading("Searching for employees...");

    try {
      // First try the dedicated endpoint your relay exposes
      const primary = await trySearchEmployeeEndpoint(searchTerm, 20);
      if (primary.ok) {
        setResults(primary.employees);
        showSuccess(`Found ${primary.employees.length} employee(s) via /api/search_employee.`);
        return;
      }

      // If primary failed (404, not implemented, error), fall back to execute_method
      const fallback = await tryExecuteMethodFallback(searchTerm);
      if (fallback.ok) {
        setResults(fallback.employees);
        showSuccess(`Found ${fallback.employees.length} employee(s) via execute_method fallback.`);
        return;
      }

      // Both attempts failed — show helpful error from whichever returned a message
      const errMsg =
        (primary && (primary.error || JSON.stringify(primary.parsed || primary))) ||
        (fallback && (fallback.error || JSON.stringify(fallback.parsed || fallback))) ||
        "Unknown error";
      showError(`Search failed: ${String(errMsg).slice(0, 400)}`);
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      showError(errorMessage);
    } finally {
      dismissToast(toastId);
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Employee Search</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <div className="flex-grow">
            <Label htmlFor="employee-search">Employee Name</Label>
            <Input
              id="employee-search"
              placeholder="e.g. Kogut"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchEmployees()}
            />
          </div>
          <div className="self-end">
            <Button onClick={searchEmployees} disabled={running}>
              {running ? "Searching..." : "Search"}
            </Button>
          </div>
        </div>

        <div>
          <h4 className="font-medium">Results</h4>
          {results.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {results.map((employee) => (
                <li key={employee.id} className="p-2 border rounded">
                  <p className="font-semibold">{employee.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {employee.department_id ? employee.department_id[1] : "No Department"}
                  </p>
                  <p className="text-sm">{employee.work_email}</p>
                  <p className="text-sm">{employee.work_phone}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground mt-2">No results to display.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default EmployeeSearch;