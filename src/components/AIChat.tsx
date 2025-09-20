"use client";

import React, { useState, useRef, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { showLoading, showSuccess, showError, dismissToast } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { Bot, User } from "lucide-react";
import { useRpcConfirm } from "@/components/rpc-confirm";
import { useAIChat, type AIMessage } from "@/hooks/useAIChat";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { interpretTextAsRelayCommand } from "@/hooks/useNLInterpreter";

interface Props {
  relayHost: string;
  apiKey: string;
  // New optional prop: when true, indicate the relay is reachable via HTTP (connection test)
  relayReachable?: boolean;
}

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
}

type RelayResult = {
  ok: boolean;
  status: number;
  parsed?: any | null;
  text?: string | null;
};

/**
 * Post a payload to the relay and attempt to parse JSON, falling back to raw text.
 * Returns an object containing ok/status/parsed/text.
 */
async function postToRelay(url: string, payload: any, apiKey?: string, timeoutMs = 30000): Promise<RelayResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "X-API-Key": apiKey } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const text = await resp.text().catch(() => "");
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    return { ok: resp.ok, status: resp.status, parsed, text };
  } finally {
    clearTimeout(timeout);
  }
}

const statusColor = (status: string) => {
  switch (status) {
    case "connected":
      return "bg-green-500";
    case "connecting":
      return "bg-yellow-500";
    case "error":
      return "bg-red-500";
    default:
      return "bg-gray-400";
  }
};

export const AIChat: React.FC<Props> = ({ relayHost, apiKey, relayReachable = false }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const confirmRpc = useRpcConfirm();

  // Use the WebSocket helper hook for live connections
  const { status, messages: wsMessages, connect, disconnect, send } = useAIChat(relayHost, apiKey);

  // Compute display status: prefer actual WS status, otherwise treat HTTP reachability as "connected" for the lamp.
  const displayStatus = status === "connected" ? "connected" : relayReachable ? "connected" : status;

  // Keep track of which ws message ids we've already merged to avoid duplicates
  const mergedWsIds = useRef<Set<number>>(new Set());

  // OpenAI key stored in localStorage via hook (empty string if missing)
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

  // Auto-scroll only if user is near the bottom already.
  useEffect(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    try {
      const threshold = 150; // px from bottom to consider "near bottom"
      const scrollTop = el.scrollTop;
      const clientHeight = el.clientHeight;
      const scrollHeight = el.scrollHeight;
      const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
      const shouldScroll = distanceFromBottom < threshold;
      if (shouldScroll) {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      }
    } catch {
      // ignore
    }
  }, [messages]);

  // Simple helper to convert employee results into a readable summary string
  const formatEmployeeSummary = (results: any[]) => {
    if (!results || results.length === 0) {
      return "No matching employees were found.";
    }
    const lines = results.slice(0, 50).map((r: any) => {
      const dept = r.department_id ? ` (${r.department_id[1]})` : "";
      const email = r.work_email ? ` — ${r.work_email}` : "";
      const phone = r.work_phone ? ` — ${r.work_phone}` : "";
      return `• ${r.name}${dept}${email}${phone}`;
    });
    return `Found ${results.length} employee(s):\n` + lines.join("\n");
  };

  // Fallback: when ai.assistant model doesn't exist, try a targeted hr.employee search using user's message.
  const runFallbackEmployeeSearch = async (userMessage: string) => {
    const url = `${relayHost.replace(/\/$/, "")}/api/execute_method`;
    const payload = {
      model: "hr.employee",
      method: "search_read",
      args: [[["name", "ilike", userMessage]]],
      kwargs: { fields: ["name", "work_email", "work_phone", "department_id"], limit: 10 },
    };

    const res = await postToRelay(url, payload, apiKey, 15000);
    if (res.ok && res.parsed && res.parsed.success) {
      return formatEmployeeSummary(res.parsed.result);
    }

    // If non-JSON success (some relays may return plain arrays/objects), try parsed or text
    if (res.parsed && Array.isArray(res.parsed)) {
      return formatEmployeeSummary(res.parsed);
    }
    if (res.text) {
      return `Fallback employee search attempted but relay returned non-JSON response: ${res.text.slice(0, 500)}`;
    }
    return `Fallback employee search failed (HTTP ${res.status}).`;
  };

  // OpenAI HTTP fallback (client-supplied key)
  const callOpenAIFallback = async (userMessageText: string, historyMessages: Message[]) => {
    if (!openaiKey) throw new Error("No OpenAI API key provided");
    const url = "https://api.openai.com/v1/chat/completions";
    const messagesPayload = [
      {
        role: "system",
        content:
          "You are an Odoo BI assistant. If the relay does not provide the ai.assistant model, try to answer concisely based on the user's question and, when appropriate, indicate that this response was generated via an external LLM fallback.",
      },
      // include a short conversation history to provide context (limit to last 6)
      ...historyMessages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: userMessageText },
    ];
    const body = {
      model: "gpt-3.5-turbo",
      messages: messagesPayload,
      temperature: 0.2,
      max_tokens: 800,
      n: 1,
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`OpenAI API error: ${resp.status} ${resp.statusText} ${txt}`);
    }

    const json = await resp.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned an unexpected response");
    }
    return content as string;
  };

  // New helper: POST to /api/search_employee (preferred endpoint) — now supports optional dept
  const postSearchEmployee = async (name?: string, limit = 20, dept?: string) => {
    const url = `${relayHost.replace(/\/$/, "")}/api/search_employee`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const body: any = { limit };
      if (name) body.name = name;
      if (dept) body.department = dept;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "X-API-Key": apiKey } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const json = await resp.json().catch(() => null);
      return { ok: resp.ok, parsed: json, status: resp.status, text: json ? JSON.stringify(json) : null };
    } catch (err: any) {
      clearTimeout(timeout);
      return { ok: false, error: err?.message || String(err) };
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    if (!relayHost) {
      showError("Please enter a Relay Host (e.g. http://localhost:8000)");
      return;
    }

    const userMessageText = input.trim();

    const userMessage: Message = {
      id: Date.now(),
      role: "user",
      content: userMessageText,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    const toastId = showLoading("AI Assistant is thinking...");

    try {
      // Run rule-based interpreter to decide the best relay endpoint/payload
      const interp = interpretTextAsRelayCommand(userMessageText);

      // Confirm the action with the user (consistent UX)
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

      // Branch based on interpretation
      if (interp.type === "search_employee") {
        const name = interp.payload.name ?? undefined;
        const dept = (interp.payload as any).dept ?? undefined;
        // Preferred path: POST /api/search_employee (may accept department)
        const primary = await postSearchEmployee(name, interp.payload.limit ?? 20, dept);

        if (primary.ok && primary.parsed && primary.parsed.success) {
          const employees = primary.parsed.employees ?? primary.parsed.result ?? [];
          const summary = formatEmployeeSummary(employees);
          const assistantMessage: Message = {
            id: Date.now() + 1,
            role: "assistant",
            content: summary,
          };
          setMessages((prev) => [...prev, assistantMessage]);
          showSuccess("Employee search returned results.");
          return;
        }

        // Fallback: if dept provided, try to lookup department id then search employees by department_id via execute_method
        if (dept) {
          try {
            // 1) find department id by name
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
              // 2) fetch employees with department_id == deptId (and by name if provided)
              const domain: any[] = [["department_id", "=", deptId]];
              if (name) domain.unshift(["name", "ilike", name]);
              const empPayload = {
                model: "hr.employee",
                method: "search_read",
                args: [domain],
                kwargs: { fields: ["name", "work_email", "work_phone", "department_id"], limit: interp.payload.limit ?? 50 },
              };
              const empRes = await postToRelay(execUrl, empPayload, apiKey, 15000);
              if (empRes.ok && empRes.parsed && empRes.parsed.success) {
                const employees = empRes.parsed.result ?? [];
                const summary = formatEmployeeSummary(employees);
                const assistantMessage: Message = {
                  id: Date.now() + 1,
                  role: "assistant",
                  content: summary,
                };
                setMessages((prev) => [...prev, assistantMessage]);
                showSuccess("Employee search by department returned results.");
                return;
              } else {
                // empRes failed — fall through to name-only fallback
              }
            } else {
              // department not found — fall through to name-only fallback
            }
          } catch (err: any) {
            // allow fallback to name-only search
          }
        }

        // If we reach here, either dept path failed or wasn't present — try execute_method fallback searching by name
        showError("Preferred employee endpoint failed; trying execute_method fallback by name.");
        const fallbackText = await runFallbackEmployeeSearch(name ?? userMessageText);
        const assistantMessage: Message = {
          id: Date.now() + 1,
          role: "assistant",
          content: fallbackText,
        };
        setMessages((prev) => [...prev, assistantMessage]);
        return;
      }

      if (interp.type === "sales_analysis") {
        // POST to /api/execute_method with prepared read_group payload
        const url = `${relayHost.replace(/\/$/, "")}/api/execute_method`;
        const r = await postToRelay(url, interp.payload, apiKey, 20000);
        if (r.ok && r.parsed && r.parsed.success) {
          const groups = r.parsed.result || [];
          if (Array.isArray(groups) && groups.length > 0) {
            const lines = groups.slice(0, 12).map((g: any) => {
              const period =
                g["date_order:month"] ?? g["date_order:year"] ?? g["date_order"] ?? "(period)";
              const amt = g.amount_total ?? g.amount ?? 0;
              return `${period}: ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
                amt,
              )} (${g.__count ?? 0} orders)`;
            });
            const assistantMessage: Message = {
              id: Date.now() + 1,
              role: "assistant",
              content: `Sales analysis (${interp.description}):\n` + lines.join("\n"),
            };
            setMessages((prev) => [...prev, assistantMessage]);
            showSuccess("Sales analysis returned results.");
          } else {
            const assistantMessage: Message = {
              id: Date.now() + 1,
              role: "assistant",
              content: `Sales analysis returned no grouped results.`,
            };
            setMessages((prev) => [...prev, assistantMessage]);
            showError("No sales groups returned.");
          }
        } else {
          const errTxt = (r.parsed && (r.parsed.error || r.parsed.message)) || r.text || `HTTP ${r.status}`;
          showError(`Sales analysis failed: ${String(errTxt).slice(0, 400)}`);
          const assistantMessage: Message = {
            id: Date.now() + 1,
            role: "assistant",
            content: `Sorry, sales analysis failed: ${String(errTxt).slice(0, 500)}`,
          };
          setMessages((prev) => [...prev, assistantMessage]);
        }
        return;
      }

      if (interp.type === "generate_dashboard") {
        // Ask relay to generate a dashboard (ai.assistant.generate_dashboard via execute_method)
        const url = `${relayHost.replace(/\/$/, "")}/api/execute_method`;
        const r = await postToRelay(url, interp.payload, apiKey, 20000);
        if (r.ok && r.parsed && r.parsed.success) {
          const cfg = typeof r.parsed.result === "string" ? JSON.parse(r.parsed.result) : r.parsed.result;
          const assistantMessage: Message = {
            id: Date.now() + 1,
            role: "assistant",
            content: `Generated dashboard preview (JSON):\n${JSON.stringify(cfg, null, 2)}`,
          };
          setMessages((prev) => [...prev, assistantMessage]);
          showSuccess("Dashboard generation succeeded (preview returned).");
        } else {
          const errTxt = (r.parsed && (r.parsed.error || r.parsed.message)) || r.text || `HTTP ${r.status}`;
          showError(`Dashboard generation failed: ${String(errTxt).slice(0, 400)}`);
          const assistantMessage: Message = {
            id: Date.now() + 1,
            role: "assistant",
            content: `Dashboard generation failed: ${String(errTxt).slice(0, 400)}`,
          };
          setMessages((prev) => [...prev, assistantMessage]);
        }
        return;
      }

      // Default: ai_assistant flow (can go via WS if connected)
      if (interp.type === "ai_assistant") {
        // If WebSocket connected, send via WS
        if (status === "connected" && send) {
          await send(interp.payload);
          showSuccess("Sent via WebSocket; awaiting assistant reply.");
          return;
        }

        // Otherwise POST to execute_method (HTTP)
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
          const assistantMessage: Message = {
            id: Date.now() + 1,
            role: "assistant",
            content: typeof res.parsed.result === "string" ? res.parsed.result : JSON.stringify(res.parsed.result),
          };
          setMessages((prev) => [...prev, assistantMessage]);
          showSuccess("AI Assistant responded.");
          return;
        } else if (aiMissing) {
          // attempt OpenAI or employee fallback (existing behavior)
          showError("ai.assistant model not found on relay; attempting fallback queries.");

          if (openaiKey) {
            try {
              const openAiText = await callOpenAIFallback(userMessageText, messages);
              const assistantMessage: Message = {
                id: Date.now() + 1,
                role: "assistant",
                content: `(OpenAI fallback) ${openAiText}`,
              };
              setMessages((prev) => [...prev, assistantMessage]);
              showSuccess("Assistant responded via OpenAI fallback.");
            } catch (err: any) {
              const errMsg = err?.message || String(err);
              showError(`OpenAI fallback failed: ${errMsg}. Trying targeted employee search.`);
              const fallbackText = await runFallbackEmployeeSearch(userMessageText);
              const assistantMessage: Message = {
                id: Date.now() + 1,
                role: "assistant",
                content:
                  `I couldn't find the ai.assistant model on the relay. I attempted an OpenAI fallback but it failed: ${errMsg}\n\nEmployee search fallback:\n\n${fallbackText}`,
              };
              setMessages((prev) => [...prev, assistantMessage]);
            }
          } else {
            const fallbackText = await runFallbackEmployeeSearch(userMessageText);
            const assistantMessage: Message = {
              id: Date.now() + 1,
              role: "assistant",
              content:
                `I couldn't find the ai.assistant model on the relay. ${fallbackText}\n\nIf you want richer responses, provide an OpenAI API key in Settings to enable a direct LLM fallback.`,
            };
            setMessages((prev) => [...prev, assistantMessage]);
          }
          return;
        } else {
          const errorMessage =
            (res.parsed && (res.parsed.error || res.parsed.message)) ||
            (res.text ? res.text.slice(0, 1000) : `HTTP ${res.status}`);
          showError(`AI query failed: ${String(errorMessage).slice(0, 200)}`);
          const assistantMessage: Message = {
            id: Date.now() + 1,
            role: "assistant",
            content: `Sorry, I couldn't complete the request: ${String(errorMessage)}`,
          };
          setMessages((prev) => [...prev, assistantMessage]);
          return;
        }
      }
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      showError(errorMessage);
      const errorMessageObj: Message = {
        id: Date.now() + 1,
        role: "assistant",
        content: `Sorry, I encountered a network error: ${errorMessage}`,
      };
      setMessages((prev) => [...prev, errorMessageObj]);
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
            <span className={`inline-block w-3 h-3 rounded-full ${statusColor(displayStatus)}`} />
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
        <ScrollArea className="h-full pr-4" ref={scrollAreaRef as any}>
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex items-start gap-3",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {message.role === "assistant" && (
                  <div className="p-2 bg-muted rounded-full">
                    <Bot className="w-6 h-6" />
                  </div>
                )}
                <div
                  className={cn(
                    "p-3 rounded-lg max-w-xs md:max-w-md",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
                {message.role === "user" && (
                  <div className="p-2 bg-muted rounded-full">
                    <User className="w-6 h-6" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex items-start gap-3 justify-start">
                <div className="p-2 bg-muted rounded-full">
                  <Bot className="w-6 h-6 animate-pulse" />
                </div>
                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-sm">Thinking...</p>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter>
        <form onSubmit={handleSendMessage} className="flex w-full items-center space-x-2">
          <Input
            id="message"
            placeholder="Ask about sales, employees, or anything else..."
            className="flex-1"
            autoComplete="off"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
          />
          <Button type="submit" disabled={isLoading}>
            Send
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
};

export default AIChat;