"use client";

import React, { useState, useRef, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { showLoading, showSuccess, showError, dismissToast } from "@/utils/toast";
import { useRpcConfirm } from "@/components/rpc-confirm";
import { useAIChat } from "@/hooks/useAIChat";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import MessageList from "@/components/ai-chat/MessageList";
import MessageInput from "@/components/ai-chat/MessageInput";
import type { ChatMessage } from "@/components/ai-chat/MessageBubble";
import {
  postToRelay,
  postSearchEmployee,
  formatEmployeeSummary,
  runFallbackEmployeeSearch,
  callOpenAIFallback,
  summarizeEmployeesWithAI,
} from "@/components/ai-chat/utils";
import interpretTextAsRelayCommand from "@/hooks/useNLInterpreter";
import interpretWithOpenAI from "@/hooks/useOpenAIInterpreter";

interface Props {
  relayHost: string;
  apiKey: string;
  relayReachable?: boolean;
}

const AIChat: React.FC<Props> = ({ relayHost, apiKey, relayReachable = false }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const confirmRpc = useRpcConfirm();

  const { status, messages: wsMessages, connect, disconnect, send } = useAIChat(relayHost, apiKey);
  const displayStatus = status === "connected" ? "connected" : relayReachable ? "connected" : status;
  const mergedWsIds = useRef<Set<number>>(new Set());
  const [openaiKey] = useLocalStorage<string>("openaiApiKey", "");

  useEffect(() => {
    if (!wsMessages || wsMessages.length === 0) return;
    setMessages((prev) => {
      const existingIds = new Set(prev.map((m) => m.id));
      const newOnes = wsMessages
        .filter((wm) => !existingIds.has(wm.id) && !mergedWsIds.current.has(wm.id))
        .map((wm) => ({
          id: wm.id,
          role: wm.role,
          content: wm.content,
        }));
      newOnes.forEach((n) => mergedWsIds.current.add(n.id));
      return newOnes.length ? [...prev, ...newOnes] : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsMessages]);

  // Helper to append assistant message
  const pushAssistant = (content: string) => {
    setMessages((prev) => [...prev, { id: Date.now() + Math.floor(Math.random() * 1000), role: "assistant", content }]);
  };

  // The core message handler delegates to small helpers (kept readable).
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    if (!relayHost) {
      showError("Please enter a Relay Host (e.g. http://localhost:8000)");
      return;
    }

    const userMessageText = input.trim();
    setMessages((prev) => [...prev, { id: Date.now(), role: "user", content: userMessageText }]);
    setInput("");
    setIsLoading(true);
    const toastId = showLoading("AI Assistant is thinking...");

    try {
      // If OpenAI key is configured, first attempt the strict NL->RPC mapping via OpenAI.
      let interpretedPayload: any | null = null;
      if (openaiKey) {
        try {
          interpretedPayload = await interpretWithOpenAI(openaiKey, userMessageText);
        } catch (err: any) {
          // Surface a useful message but continue to the local heuristic fallback
          showError(`OpenAI interpretation failed: ${err?.message || String(err)} — falling back to local interpreter.`);
          interpretedPayload = null;
        }
      }

      // If we obtained a payload from OpenAI, validate and execute it
      if (interpretedPayload) {
        // Confirm the exact payload with the user before executing
        try {
          const ok = await confirmRpc({ inferred_via: "openai", payload: interpretedPayload });
          if (!ok) {
            showError("Action cancelled by user.");
            setIsLoading(false);
            dismissToast(toastId);
            return;
          }
        } catch {
          showError("Unable to confirm action.");
          setIsLoading(false);
          dismissToast(toastId);
          return;
        }

        // Execute payload via relay (HTTP)
        const execUrl = `${relayHost.replace(/\/$/, "")}/api/execute_method`;
        const r = await postToRelay(execUrl, interpretedPayload, apiKey, 30000);
        if (r.ok && r.parsed && r.parsed.success) {
          const res = r.parsed.result;
          // If this looks like an employee list, produce a friendly summary instead of raw JSON
          let assistantText = "";
          try {
            const modelName = interpretedPayload?.model ?? "";
            const looksLikeEmployeeArray =
              Array.isArray(res) &&
              res.length > 0 &&
              typeof res[0] === "object" &&
              (Object.prototype.hasOwnProperty.call(res[0], "name") || Object.prototype.hasOwnProperty.call(res[0], "work_email"));

            if (modelName === "hr.employee" || looksLikeEmployeeArray) {
              assistantText = openaiKey ? await summarizeEmployeesWithAI(openaiKey, res) : formatEmployeeSummary(res);
            } else {
              assistantText = typeof res === "string" ? res : JSON.stringify(res, null, 2);
            }
          } catch {
            assistantText = typeof res === "string" ? res : JSON.stringify(res, null, 2);
          }

          pushAssistant(assistantText);
          showSuccess("Executed interpreted payload successfully.");
        } else {
          const errTxt = (r.parsed && (r.parsed.error || r.parsed.message)) || r.text || `HTTP ${r.status}`;
          pushAssistant(`Execution failed: ${String(errTxt).slice(0, 1000)}`);
          showError(`Execution failed: ${String(errTxt).slice(0, 200)}`);
        }

        return;
      }

      // No OpenAI payload — fallback to local heuristic interpreter
      const interp = interpretTextAsRelayCommand(userMessageText);

      try {
        const ok = await confirmRpc({ intent: interp.type, payload: interp.payload, _inferred: true });
        if (!ok) {
          showError("Action cancelled by user.");
          setIsLoading(false);
          dismissToast(toastId);
          return;
        }
      } catch {
        showError("Unable to confirm action.");
        setIsLoading(false);
        dismissToast(toastId);
        return;
      }

      // TOP CUSTOMER: robust flow that tries partner search_read then falls back to aggregating sale.order and resolving partner details
      if ((interp as any).type === "top_customer") {
        const execUrl = `${relayHost.replace(/\/$/, "")}/api/execute_method`;

        // First attempt: execute the interpreter's payload as-is (often a res.partner.search_read)
        try {
          const primary = await postToRelay(execUrl, interp.payload, apiKey, 20000);

          const looksLikePartnerArray = (res: any) =>
            Array.isArray(res) &&
            res.length > 0 &&
            res.every((r: any) => typeof r === "object" && ("name" in r || "display_name" in r));

          if (primary.ok && primary.parsed && primary.parsed.success && looksLikePartnerArray(primary.parsed.result)) {
            const partners = primary.parsed.result as any[];
            // Attempt to pick the top 5 by total_invoiced if present, otherwise trust returned ordering
            const normalized = partners.map((p) => ({ id: p.id, name: p.name ?? p.display_name ?? String(p.id), total: Number(p.total_invoiced ?? p.amount_total ?? 0) }));
            normalized.sort((a, b) => b.total - a.total);
            const top = normalized.slice(0, 5);
            if (top.length > 0) {
              const lines = top.map((t) => `${t.name} — ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(t.total)}`);
              pushAssistant(`Top ${top.length} customers by revenue:\n${lines.join("\n")}`);
              showSuccess("Top customers retrieved from partner records.");
              dismissToast(toastId);
              setIsLoading(false);
              return;
            }
          }
        } catch {
          // ignore and fall back
        }

        // Fallback: aggregate sales by partner via read_group on sale.order, then fetch partner details
        try {
          // 1) read_group to get totals per partner
          const groupPayload = {
            model: "sale.order",
            method: "read_group",
            args: [
              [["state", "in", ["sale", "done"]]], // domain: confirmed sales
              ["amount_total"],
              ["partner_id"],
            ],
            kwargs: { lazy: false },
          };

          const groupRes = await postToRelay(execUrl, groupPayload, apiKey, 30000);

          if (!(groupRes.ok && groupRes.parsed && groupRes.parsed.success && Array.isArray(groupRes.parsed.result))) {
            // can't aggregate; return helpful error
            const errTxt = (groupRes.parsed && (groupRes.parsed.error || groupRes.parsed.message)) || groupRes.text || `HTTP ${groupRes.status}`;
            pushAssistant(`Could not aggregate sales by partner: ${String(errTxt).slice(0, 400)}`);
            showError("Sales aggregation failed.");
            dismissToast(toastId);
            setIsLoading(false);
            return;
          }

          const groups = groupRes.parsed.result as any[];
          if (groups.length === 0) {
            pushAssistant("No grouped sales data returned to determine top customers.");
            showError("No grouped sales data returned.");
            dismissToast(toastId);
            setIsLoading(false);
            return;
          }

          // Normalize group entries and sort by amount_total (or amount)
          const normGroups = groups
            .map((g) => {
              const partner = Array.isArray(g.partner_id) ? g.partner_id[0] : g.partner_id;
              const amount = Number(g.amount_total ?? g.amount ?? 0);
              return { partnerId: partner, amount };
            })
            .filter((g) => !!g.partnerId)
            .sort((a, b) => b.amount - a.amount);

          const topGroups = normGroups.slice(0, 5);
          const partnerIds = Array.from(new Set(topGroups.map((g) => g.partnerId)));

          // 2) fetch partner details for those ids
          const partnerPayload = {
            model: "res.partner",
            method: "search_read",
            args: [[["id", "in", partnerIds]]],
            kwargs: { fields: ["id", "name", "total_invoiced", "email", "phone"], limit: 20 },
          };

          const partnersRes = await postToRelay(execUrl, partnerPayload, apiKey, 20000);

          let partnerMap: Record<number, any> = {};
          if (partnersRes.ok && partnersRes.parsed && partnersRes.parsed.success && Array.isArray(partnersRes.parsed.result)) {
            for (const p of partnersRes.parsed.result) {
              partnerMap[p.id] = p;
            }
          }

          // Compose final top list with names and amounts
          const lines = topGroups.map((g) => {
            const p = partnerMap[g.partnerId];
            const name = p ? p.name ?? p.display_name ?? String(g.partnerId) : `Partner ${g.partnerId}`;
            const amountStr = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(g.amount);
            return `${name} — ${amountStr}`;
          });

          if (lines.length > 0) {
            pushAssistant(`Top ${lines.length} customers by revenue:\n${lines.join("\n")}`);
            showSuccess("Top customers determined from sales aggregation.");
          } else {
            pushAssistant("Unable to determine top customers after aggregation.");
            showError("Could not map aggregated results to partner records.");
          }
        } catch (err: any) {
          const msg = err?.message || String(err);
          pushAssistant(`Failed to determine top customers: ${msg}`);
          showError(`Top customer flow failed: ${msg}`);
        }

        dismissToast(toastId);
        setIsLoading(false);
        return;
      }

      // Employee search flow (department-aware)
      if (interp.type === "search_employee") {
        const name = (interp.payload as any).name ?? undefined;
        const dept = (interp.payload as any).dept ?? undefined;

        // Try preferred endpoint with optional dept
        const primary = await postSearchEmployee(relayHost, apiKey, name, (interp.payload as any).limit ?? 20, dept);
        if (primary.ok && primary.parsed && primary.parsed.success) {
          const employees = primary.parsed.employees ?? primary.parsed.result ?? [];
          const summary = openaiKey ? await summarizeEmployeesWithAI(openaiKey, employees) : formatEmployeeSummary(employees);
          pushAssistant(summary);
          showSuccess("Employee search returned results.");
          return;
        }

        // Dept fallback: lookup department id then query hr.employee via execute_method
        if (dept) {
          try {
            const deptPayload = {
              model: "hr.department",
              method: "search_read",
              args: [[["name", "ilike", dept]]],
              kwargs: { fields: ["id", "name"], limit: 1 },
            };
            const execUrl = `${relayHost.replace(/\/$/, "")}/api/execute_method`;
            const deptRes = await postToRelay(execUrl, deptPayload, apiKey, 15000);
            if (deptRes.ok && deptRes.parsed && deptRes.parsed.success && Array.isArray(deptRes.parsed.result) && deptRes.parsed.result.length > 0) {
              const deptId = deptRes.parsed.result[0].id;
              const domain: any[] = [["department_id", "=", deptId]];
              if (name) domain.unshift(["name", "ilike", name]);
              const empPayload = {
                model: "hr.employee",
                method: "search_read",
                args: [domain],
                kwargs: { fields: ["name", "work_email", "work_phone", "department_id"], limit: (interp.payload as any).limit ?? 50 },
              };
              const empRes = await postToRelay(execUrl, empPayload, apiKey, 15000);
              if (empRes.ok && empRes.parsed && empRes.parsed.success) {
                const employees = empRes.parsed.result ?? [];
                const summary = openaiKey ? await summarizeEmployeesWithAI(openaiKey, employees) : formatEmployeeSummary(employees);
                pushAssistant(summary);
                showSuccess("Employee search by department returned results.");
                return;
              }
            }
          } catch {
            // continue to fallback
          }
        }

        // Name-only fallback via execute_method
        showError("Preferred employee endpoint failed; trying execute_method fallback by name.");
        const fallbackText = await runFallbackEmployeeSearch(relayHost, apiKey, name ?? userMessageText);
        pushAssistant(fallbackText);
        return;
      }

      // Sales analysis flows
      if (interp.type === "sales_analysis") {
        const url = `${relayHost.replace(/\/$/, "")}/api/execute_method`;
        const r = await postToRelay(url, interp.payload, apiKey, 20000);
        if (r.ok && r.parsed && r.parsed.success) {
          const groups = r.parsed.result || [];
          if (Array.isArray(groups) && groups.length > 0) {
            const lines = groups.slice(0, 12).map((g: any) => {
              const period = g["date_order:month"] ?? g["date_order:year"] ?? g["date_order"] ?? "(period)";
              const amt = g.amount_total ?? g.amount ?? 0;
              return `${period}: ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
                amt,
              )} (${g.__count ?? 0} orders)`;
            });
            pushAssistant(`Sales analysis (${(interp as any).description}):\n${lines.join("\n")}`);
            showSuccess("Sales analysis returned results.");
          } else {
            pushAssistant("Sales analysis returned no grouped results.");
            showError("No sales groups returned.");
          }
        } else {
          const errTxt = (r.parsed && (r.parsed.error || r.parsed.message)) || r.text || `HTTP ${r.status}`;
          pushAssistant(`Sorry, sales analysis failed: ${String(errTxt).slice(0, 500)}`);
          showError(`Sales analysis failed: ${String(errTxt).slice(0, 400)}`);
        }
        return;
      }

      // Dashboard generation
      if (interp.type === "generate_dashboard") {
        const url = `${relayHost.replace(/\/$/, "")}/api/execute_method`;
        const r = await postToRelay(url, interp.payload, apiKey, 20000);
        if (r.ok && r.parsed && r.parsed.success) {
          const cfg = typeof r.parsed.result === "string" ? JSON.parse(r.parsed.result) : r.parsed.result;
          pushAssistant(`Generated dashboard preview (JSON):\n${JSON.stringify(cfg, null, 2)}`);
          showSuccess("Dashboard generation succeeded (preview returned).");
        } else {
          const errTxt = (r.parsed && (r.parsed.error || r.parsed.message)) || r.text || `HTTP ${r.status}`;
          pushAssistant(`Dashboard generation failed: ${String(errTxt).slice(0, 400)}`);
          showError(`Dashboard generation failed: ${String(errTxt).slice(0, 400)}`);
        }
        return;
      }

      // ai_assistant default flow (supports WS send)
      if (interp.type === "ai_assistant") {
        if (status === "connected" && send) {
          await send(interp.payload);
          showSuccess("Sent via WebSocket; awaiting assistant reply.");
          return;
        }

        const url = `${relayHost.replace(/\/$/, "")}/api/execute_method`;
        const res = await postToRelay(url, interp.payload, apiKey, 30000);
        const textLower = (res.text || "").toLowerCase();

        const aiMissing =
          (res.parsed &&
            ((res.parsed.error && typeof res.parsed.error === "string" && res.parsed.error.toLowerCase().includes("object ai.assistant")) ||
              (res.parsed.message && typeof res.parsed.message === "string" && res.parsed.message.toLowerCase().includes("object ai.assistant")))) ||
          textLower.includes("object ai.assistant doesn't exist") ||
          textLower.includes("object ai.assistant does not exist");

        if (res.ok && res.parsed && res.parsed.success) {
          pushAssistant(typeof res.parsed.result === "string" ? res.parsed.result : JSON.stringify(res.parsed.result));
          showSuccess("AI Assistant responded.");
          return;
        } else if (aiMissing) {
          showError("ai.assistant model not found on relay; attempting fallback queries.");

          if (openaiKey) {
            try {
              const openAiText = await callOpenAIFallback(openaiKey, userMessageText, messages);
              pushAssistant(`(OpenAI fallback) ${openAiText}`);
              showSuccess("Assistant responded via OpenAI fallback.");
            } catch (err: any) {
              const errMsg = err?.message || String(err);
              showError(`OpenAI fallback failed: ${errMsg}. Trying targeted employee search.`);
              const fallbackText = await runFallbackEmployeeSearch(relayHost, apiKey, userMessageText);
              pushAssistant(`I couldn't find the ai.assistant model on the relay. I attempted an OpenAI fallback but it failed: ${errMsg}\n\nEmployee search fallback:\n\n${fallbackText}`);
            }
          } else {
            const fallbackText = await runFallbackEmployeeSearch(relayHost, apiKey, userMessageText);
            pushAssistant(`I couldn't find the ai.assistant model on the relay. ${fallbackText}\n\nIf you want richer responses, provide an OpenAI API key in Settings to enable a direct LLM fallback.`);
          }
          return;
        } else {
          const errorMessage = (res.parsed && (res.parsed.error || res.parsed.message)) || (res.text ? res.text.slice(0, 1000) : `HTTP ${res.status}`);
          pushAssistant(`Sorry, I couldn't complete the request: ${String(errorMessage)}`);
          showError(`AI query failed: ${String(errorMessage).slice(0, 200)}`);
          return;
        }
      }
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      showError(errorMessage);
      pushAssistant(`Sorry, I encountered a network error: ${errorMessage}`);
    } finally {
      dismissToast(toastId);
      setIsLoading(false);
    }
  };

  return (
    <Card className="flex flex-col h-[500px]">
      <CardHeader className="flex items-center justify-between">
        <CardTitle>AI Assistant</CardTitle>

        <div className="flex items-center space-x-3">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-3 h-3 rounded-full ${status === "connected" ? "bg-green-500" : relayReachable ? "bg-green-500" : "bg-gray-400"}`} />
            <span className="text-sm text-muted-foreground capitalize">{displayStatus}</span>
          </div>

          {status !== "connected" ? (
            <Button onClick={() => connect()} disabled={!relayHost || status === "connecting"}>
              Connect
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => disconnect()}>
              Disconnect
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-grow overflow-hidden">
        <div style={{ height: "100%" }}>
          <MessageList messages={messages} isLoading={isLoading} scrollRef={scrollAreaRef} />
        </div>
      </CardContent>

      <CardFooter>
        <MessageInput value={input} onChange={setInput} onSubmit={handleSendMessage} disabled={isLoading} />
      </CardFooter>
    </Card>
  );
};

export default AIChat;