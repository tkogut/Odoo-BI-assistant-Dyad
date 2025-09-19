import React from "react";
import { Link } from "react-router-dom";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import ThemeToggle from "@/components/ThemeToggle";
import AIChat from "@/components/AIChat";
import RelayMockTester from "@/components/RelayMockTester";
import AIDashboardGenerator from "@/components/AIDashboardGenerator";

const Index: React.FC = () => {
  const [relayHost, setRelayHost] = useLocalStorage<string>("relayHost", "http://localhost:8001");
  const [apiKey, setApiKey] = useLocalStorage<string>("apiKey", "super_rooster");

  return (
    <div className="min-h-screen bg-gray-50 py-8 flex flex-col">
      <div className="container mx-auto w-full">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">Odoo BI Assistant</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Minimal dashboard: AI Assistant, connection test, and AI dashboard generator.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link to="/settings" className="text-sm text-blue-600 hover:underline">
              Settings
            </Link>
          </div>
        </header>

        <main className="space-y-8">
          <section>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <div className="w-full">
                <AIChat relayHost={relayHost} apiKey={apiKey} />
              </div>

              <div className="flex flex-col gap-6">
                <RelayMockTester relayHost={relayHost} apiKey={apiKey} />
                <AIDashboardGenerator relayHost={relayHost} apiKey={apiKey} />
              </div>
            </div>
          </section>
        </main>
      </div>

      <footer className="mt-8">
        <div className="container mx-auto text-center">
          <MadeWithDyad />
        </div>
      </footer>
    </div>
  );
};

export default Index;