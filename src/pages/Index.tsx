import React from "react";
import { Link } from "react-router-dom";
import { MadeWithDyad } from "@/components/made-with-dyad";
import ConnectivityDiagnostics from "@/components/ConnectivityDiagnostics";
import { EmployeeSearch } from "@/components/EmployeeSearch";
import { CustomQuery } from "@/components/CustomQuery";
import { SalesAnalysis } from "@/components/SalesAnalysis";
import { AIChat } from "@/components/AIChat";
import AICustomQuery from "@/components/AICustomQuery";
import AIDashboardGenerator from "@/components/AIDashboardGenerator";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import ThemeToggle from "@/components/ThemeToggle";
import RelayMockTester from "@/components/RelayMockTester";

const Index = () => {
  const [relayHost, setRelayHost] = useLocalStorage<string>("relayHost", "http://localhost:8001");
  const [apiKey, setApiKey] = useLocalStorage<string>("apiKey", "mockkey");

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Odoo BI Assistant — Relay Diagnostics</h1>
            <p className="text-sm text-muted-foreground">Use the diagnostics panel to troubleshoot network/CORS/TLS issues.</p>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link to="/settings" className="text-sm text-blue-600 hover:underline">
              Settings
            </Link>
            <MadeWithDyad />
          </div>
        </header>

        <section>
          <ConnectivityDiagnostics
            relayHost={relayHost}
            apiKey={apiKey}
            onRelayHostChange={setRelayHost}
            onApiKeyChange={setApiKey}
          />
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">Interactive Tools</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <EmployeeSearch relayHost={relayHost} apiKey={apiKey} />
              <CustomQuery relayHost={relayHost} apiKey={apiKey} />
              <SalesAnalysis relayHost={relayHost} apiKey={apiKey} />
            </div>
            <div className="space-y-6">
              <AIChat relayHost={relayHost} apiKey={apiKey} />
              <AICustomQuery relayHost={relayHost} apiKey={apiKey} />
              <AIDashboardGenerator relayHost={relayHost} apiKey={apiKey} />
              <RelayMockTester relayHost={relayHost} apiKey={apiKey} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Index;