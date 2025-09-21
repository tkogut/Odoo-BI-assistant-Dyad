"use client";

import React, { useState } from "react";
import { Link } from "react-router-dom";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import ThemeToggle from "@/components/ThemeToggle";
import AIChat from "@/components/AIChat";
import AIDashboardGenerator from "@/components/AIDashboardGenerator";
import EmployeeSearch from "@/components/EmployeeSearch";
import CompanyList from "@/components/CompanyList";
import ModelExplorer from "@/components/ModelExplorer";
import BIDashboard from "@/components/bi/BIDashboard";
import { showLoading, showSuccess, showError, dismissToast } from "@/utils/toast";
import TotalRevenueCommand from "@/components/TotalRevenueCommand";

const DEFAULT_RELAY = (import.meta.env.VITE_RELAY_HOST as string) ?? "http://localhost:8000";
const DEFAULT_API_KEY = (import.meta.env.VITE_RELAY_API_KEY as string) ?? "super_rooster";

const Index: React.FC = () => {
  const [relayHost] = useLocalStorage<string>("relayHost", DEFAULT_RELAY);
  const [apiKey] = useLocalStorage<string>("apiKey", DEFAULT_API_KEY);

  // New: track HTTP reachability so the UI lamp can show 'Connected' on successful GET
  const [relayReachable, setRelayReachable] = useState<boolean>(false);

  const runConnectionTest = async () => {
    if (!relayHost) {
      showError("No Relay Host configured. Open Settings to configure a Relay Host.");
      return;
    }

    const toastId = showLoading("Running basic connection test...");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      let resp: Response | null = null;
      try {
        resp = await fetch(relayHost, { method: "GET", signal: controller.signal });
      } catch (err: any) {
        clearTimeout(timeout);
        const msg = err?.message || String(err);
        setRelayReachable(false);
        showError(`Connection failed: ${msg}`);
        return;
      } finally {
        clearTimeout(timeout);
      }

      if (resp) {
        if (resp.ok) {
          setRelayReachable(true);
          showSuccess(`Relay reachable (HTTP ${resp.status}).`);
        } else {
          setRelayReachable(false);
          showError(`Relay responded: HTTP ${resp.status} ${resp.statusText}`);
        }
      } else {
        setRelayReachable(false);
        showError("No response from relay.");
      }
    } catch (err: any) {
      setRelayReachable(false);
      showError(err?.message || String(err));
    } finally {
      dismissToast(toastId);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 flex flex-col">
      <div className="container mx-auto w-full">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">Odoo BI Assistant</h1>
            <p className="text-sm text-muted-foreground mt-1">
              AI Assistant and dashboard builder — quick connection test available.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <ThemeToggle />
            <button
              onClick={runConnectionTest}
              className="text-sm bg-primary text-primary-foreground px-3 py-1 rounded-md hover:opacity-90"
            >
              Connection Test
            </button>
            <Link to="/settings" className="text-sm text-blue-600 hover:underline">
              Settings
            </Link>
          </div>
        </header>

        <main className="space-y-8">
          <section>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              <div className="lg:col-span-2 w-full space-y-4">
                <AIChat relayHost={relayHost} apiKey={apiKey} relayReachable={relayReachable} />
                <AIDashboardGenerator relayHost={relayHost} apiKey={apiKey} />
              </div>

              <aside className="w-full space-y-4">
                <BIDashboard relayHost={relayHost} apiKey={apiKey} />
                <ModelExplorer relayHost={relayHost} apiKey={apiKey} />
                <CompanyList relayHost={relayHost} apiKey={apiKey} />
                <TotalRevenueCommand relayHost={relayHost} apiKey={apiKey} />
                <EmployeeSearch relayHost={relayHost} apiKey={apiKey} />
              </aside>
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