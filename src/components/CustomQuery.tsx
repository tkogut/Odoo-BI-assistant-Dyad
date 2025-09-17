"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { showError, showSuccess, showLoading, dismissToast } from "@/utils/toast";

interface CustomQueryProps {
  relayHost: string;
  apiKey: string;
}

export const CustomQuery = ({ relayHost, apiKey }: CustomQueryProps) => {
  const [model, setModel] = useState("res.partner");
  const [method, setMethod] = useState("search_read");
  const [args, setArgs] = useState(`[[["is_company", "=", true]]]`);
  const [kwargs, setKwargs] = useState(`{\n  "fields": ["id", "name", "email"],\n  "limit": 5\n}`);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleExecute = async () => {
    if (!apiKey || !relayHost) {
      showError("Please provide Relay Host and API Key.");
      return;
    }

    let parsedArgs, parsedKwargs;
    try {
      parsedArgs = JSON.parse(args);
      parsedKwargs = JSON.parse(kwargs);
    } catch (error) {
      showError("Invalid JSON in args or kwargs. Please check the syntax.");
      return;
    }

    setLoading(true);
    setResult(null);
    const toastId = showLoading("Executing custom query...");

    try {
      const response = await fetch(`${relayHost}/api/execute_method`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({
          model,
          method,
          args: parsedArgs,
          kwargs: parsedKwargs,
        }),
      });

      const responseData = await response.json();
      dismissToast(toastId);

      if (response.ok && responseData.success) {
        setResult(JSON.stringify(responseData.result, null, 2));
        showSuccess("Query executed successfully.");
      } else {
        throw new Error(responseData.error || "Failed to execute custom query.");
      }
    } catch (error) {
      dismissToast(toastId);
      setResult(error instanceof Error ? error.message : "An unknown error occurred.");
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
          <CardTitle>Execute Odoo Method</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="model">Model</Label>
              <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="method">Method</Label>
              <Input id="method" value={method} onChange={(e) => setMethod(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="args">Args (JSON Array)</Label>
            <Textarea id="args" value={args} onChange={(e) => setArgs(e.target.value)} rows={4} />
          </div>
          <div>
            <Label htmlFor="kwargs">Kwargs (JSON Object)</Label>
            <Textarea id="kwargs" value={kwargs} onChange={(e) => setKwargs(e.target.value)} rows={6} />
          </div>
          <Button onClick={handleExecute} disabled={loading} className="w-full">
            {loading ? "Executing..." : "Execute"}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Result</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="p-4 bg-muted rounded-md overflow-x-auto text-sm">
              <code>{result}</code>
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
};