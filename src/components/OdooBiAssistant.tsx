"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiKeyInput } from "./ApiKeyInput";
import { SalesAnalysis } from "./SalesAnalysis";
import { EmployeeSearch } from "./EmployeeSearch";
import { CustomQuery } from "./CustomQuery";
import Diagnostics from "./Diagnostics";

export const OdooBiAssistant = () => {
  const [relayHost, setRelayHost] = useState("http://localhost:8000");
  const [apiKey, setApiKey] = useState("");

  return (
    <div className="container mx-auto p-4 space-y-6">
      <header className="text-center">
        <h1 className="text-3xl font-bold">MCP Odoo BI Assistant</h1>
        <p className="text-muted-foreground">
          Query your Odoo business data via the relay API.
        </p>
      </header>

      <ApiKeyInput
        relayHost={relayHost}
        setRelayHost={setRelayHost}
        apiKey={apiKey}
        setApiKey={setApiKey}
      />

      {/* Diagnostics panel for testing connectivity to the relay */}
      <Diagnostics relayHost={relayHost} apiKey={apiKey} />

      <Tabs defaultValue="sales">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="sales">Sales Analysis</TabsTrigger>
          <TabsTrigger value="employee">Employee Search</TabsTrigger>
          <TabsTrigger value="custom">Custom Query</TabsTrigger>
        </TabsList>
        <TabsContent value="sales" className="mt-4">
          <SalesAnalysis relayHost={relayHost} apiKey={apiKey} />
        </TabsContent>
        <TabsContent value="employee" className="mt-4">
          <EmployeeSearch relayHost={relayHost} apiKey={apiKey} />
        </TabsContent>
        <TabsContent value="custom" className="mt-4">
          <CustomQuery relayHost={relayHost} apiKey={apiKey} />
        </TabsContent>
      </Tabs>
    </div>
  );
};