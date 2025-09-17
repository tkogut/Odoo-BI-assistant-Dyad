"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showLoading, showSuccess, showError, dismissToast } from "@/utils/toast";

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

  const searchEmployees = async () => {
    if (!relayHost) {
      showError("Please enter a Relay Host (e.g. http://localhost:8000)");
      return;
    }
    if (!searchTerm) {
      showError("Please enter a search term.");
      return;
    }

    setRunning(true);
    setResults([]);
    const toastId = showLoading("Searching for employees...");

    try {
      const url = `${relayHost.replace(/\/$/, "")}/api/execute_method`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const payload = {
        model: "hr.employee",
        method: "search_read",
        args: [[["name", "ilike", searchTerm]]],
        kwargs: {
          fields: ["name", "work_email", "work_phone", "department_id"],
          limit: 10,
        },
      };

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

      const json = await resp.json();

      if (resp.ok) {
        setResults(json);
        showSuccess(`Found ${json.length} employee(s).`);
      } else {
        showError(
          `Search failed: ${
            (json && (json.error || json.message)) || `HTTP ${resp.status} ${resp.statusText}`
          }`,
        );
      }
    } catch (err: any) {
      showError(err?.message || String(err));
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
              placeholder="e.g. John Doe"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchEmployees()}
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
                    {employee.department_id ? employee.department_id[1] : 'No Department'}
                  </p>
                  <p className="text-sm">{employee.work_email}</p>
                  <p className="text-sm">{employee.work_phone}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground mt-2">
              No results to display.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};