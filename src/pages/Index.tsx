import { useState } from "react";
import { MadeWithDyad } from "@/components/made-with-dyad";
import Diagnostics from "@/components/Diagnostics";
import { SalesAnalysis } from "@/components/SalesAnalysis";
import { EmployeeSearch } from "@/components/EmployeeSearch";
import { CustomQuery } from "@/components/CustomQuery";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const Index = () => {
  const [relayHost, setRelayHost] = useState("http://localhost:8000");
  const [apiKey, setApiKey] = useState("");

  return (
    <div className="min-h-screen p-6 bg-gray-50">
      <div className="max-w-6xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Odoo Relay — Connection Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <Label htmlFor="relay-host">Relay Host</Label>
                <Input
                  id="relay-host"
                  value={relayHost}
                  onChange={(e) => setRelayHost(e.target.value)}
                  placeholder="http://localhost:8000"
                />
                <p className="text-xs text-muted-foreground mt-1">Include protocol (http:// or https://)</p>
              </div>

              <div>
                <Label htmlFor="api-key">API Key (X-API-Key)</Label>
                <Input id="api-key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API key" />
                <p className="text-xs text-muted-foreground mt-1">Used to authenticate requests to the relay</p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => {
                    // quick visual confirmation
                    alert(`Using relay: ${relayHost}\nAPI Key: ${apiKey ? "set" : "empty"}`);
                  }}
                >
                  Use settings
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <Diagnostics />
            <div>
              <SalesAnalysis relayHost={relayHost} apiKey={apiKey} />
            </div>
          </div>

          <div className="space-y-6">
            <EmployeeSearch relayHost={relayHost} apiKey={apiKey} />
            <CustomQuery relayHost={relayHost} apiKey={apiKey} />
          </div>
        </div>

        <MadeWithDyad />
      </div>
    </div>
  );
};

export default Index;