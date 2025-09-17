import React, { useState } from "react";
import { MadeWithDyad } from "@/components/made-with-dyad";
import ConnectivityDiagnostics from "@/components/ConnectivityDiagnostics";
import { EmployeeSearch } from "@/components/EmployeeSearch";
import { CustomQuery } from "@/components/CustomQuery";
import { SalesAnalysis } from "@/components/SalesAnalysis";

const Index = () => {
  const [relayHost, setRelayHost] = useState<string>("http://localhost:8000");
  const [apiKey, setApiKey] = useState<string>("");

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Odoo BI Assistant — Relay Diagnostics</h1>
            <p className="text-sm text-muted-foreground">Use the diagnostics panel to troubleshoot network/CORS/TLS issues.</p>
          </div>
          <MadeWithDyad />
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
          <div className="grid grid-cols-1 gap-6">
            <div>
              <EmployeeSearch relayHost={relayHost} apiKey={apiKey} />
            </div>
            <div>
              <CustomQuery relayHost={relayHost} apiKey={apiKey} />
            </div>
            <div>
              <SalesAnalysis relayHost={relayHost} apiKey={apiKey} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Index;