"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { showError, showSuccess, showLoading, dismissToast } from "@/utils/toast";

interface EmployeeSearchProps {
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

export const EmployeeSearch = ({ relayHost, apiKey }: EmployeeSearchProps) => {
  const [name, setName] = useState("");
  const [limit, setLimit] = useState(5);
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const handleSearch = async () => {
    if (!apiKey || !relayHost) {
      showError("Please provide Relay Host and API Key.");
      return;
    }
    if (!name) {
      showError("Please enter a name to search.");
      return;
    }

    setLoading(true);
    setEmployees([]);
    const toastId = showLoading("Searching for employees...");

    try {
      const response = await fetch(`${relayHost}/api/search_employee`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({ name, limit: Number(limit) }),
      });

      const result = await response.json();
      dismissToast(toastId);

      if (response.ok && result.success) {
        setEmployees(result.employees);
        showSuccess(`Found ${result.employees.length} employee(s).`);
      } else {
        throw new Error(result.error || "Failed to search for employees.");
      }
    } catch (error) {
      dismissToast(toastId);
      showError(error instanceof Error ? error.message : "An unknown error occurred.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Search Parameters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2">
            <Label htmlFor="employee-name">Name</Label>
            <Input
              id="employee-name"
              placeholder="e.g., John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="employee-limit">Limit</Label>
            <Input
              id="employee-limit"
              type="number"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            />
          </div>
          <Button onClick={handleSearch} disabled={loading} className="md:col-span-3">
            {loading ? "Searching..." : "Search Employees"}
          </Button>
        </CardContent>
      </Card>

      {employees.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Search Results</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Department</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell>{employee.id}</TableCell>
                    <TableCell>{employee.name}</TableCell>
                    <TableCell>{employee.work_email || "N/A"}</TableCell>
                    <TableCell>{employee.department_id ? employee.department_id[1] : "N/A"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};