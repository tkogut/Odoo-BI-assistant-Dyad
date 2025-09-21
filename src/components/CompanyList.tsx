"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { showLoading, showSuccess, showError, dismissToast } from "@/utils/toast";
import { postToRelay } from "@/components/ai-chat/utils";

interface Props {
  relayHost: string;
  apiKey?: string;
}

const CompanyList: React.FC<Props> = ({ relayHost, apiKey }) => {
  const [query, setQuery] = useState("");
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCompanies = async () => {
    if (!relayHost) {
      showError("Please configure a Relay Host in Settings.");
      return;
    }

    setLoading(true);
    const toastId = showLoading("Fetching companies...");
    try {
      const domain = query ? [["name", "ilike", query]] : [];
      const payload = {
        model: "res.company",
        method: "search_read",
        args: [domain],
        kwargs: {
          fields: ["id", "name", "partner_id", "phone", "website", "country_id"],
          limit: 200,
        },
      };

      const url = `${relayHost.replace(/\/$/, "")}/api/execute_method`;
      const res = await postToRelay(url, payload, apiKey, 20000);

      if (res.ok && res.parsed && res.parsed.success) {
        const result = res.parsed.result ?? [];
        setCompanies(Array.isArray(result) ? result : []);
        showSuccess(`Fetched ${Array.isArray(result) ? result.length : 0} companies.`);
      } else if (res.parsed && Array.isArray(res.parsed)) {
        // Some relays return arrays directly
        setCompanies(res.parsed);
        showSuccess(`Fetched ${res.parsed.length} companies.`);
      } else {
        const errTxt = (res.parsed && (res.parsed.error || res.parsed.message)) || res.text || `HTTP ${res.status}`;
        showError(`Failed to fetch companies: ${String(errTxt).slice(0, 300)}`);
      }
    } catch (err: any) {
      showError(err?.message || String(err));
    } finally {
      dismissToast(toastId);
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Companies (res.company)</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Filter by name (optional)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button onClick={fetchCompanies} disabled={loading}>
            {loading ? "Loading..." : "Fetch Companies"}
          </Button>
        </div>

        <div>
          {companies.length === 0 ? (
            <div className="text-sm text-muted-foreground">No companies loaded. Click "Fetch Companies" to load.</div>
          ) : (
            <div className="space-y-2">
              {companies.map((c) => (
                <div key={c.id} className="p-2 border rounded">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{c.name ?? c.display_name ?? `Company ${c.id}`}</div>
                      <div className="text-xs text-muted-foreground">
                        ID: {c.id} {c.is_company ? "· Company" : ""} {c.partner_id ? `· Partner: ${Array.isArray(c.partner_id) ? c.partner_id[1] : c.partner_id}` : ""}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      {c.phone && <div>{c.phone}</div>}
                      {c.website && (
                        <div>
                          <a href={String(c.website)} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                            {c.website}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter>
        <div className="text-sm text-muted-foreground">Query res.company via /api/execute_method (search_read).</div>
      </CardFooter>
    </Card>
  );
};

export default CompanyList;