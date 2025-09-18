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

interface Props {
  relayHost: string;
  apiKey: string;
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

export const AIChat: React.FC<Props> = ({ relayHost, apiKey }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const confirmRpc = useRpcConfirm();

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  // Simple helper to convert employee results into a readable summary string
  const formatEmployeeSummary = (results: any[]) => {
    if (!results || results.length === 0) {
      return "No matching employees were found.";
    }
    const lines = results.slice(0, 5).map((r: any) => {
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
      const url = `${relayHost.replace(/\/$/, "")}/api/execute_method`;

      // Build payload - the relay might expect the conversation as context
      const payload = {
        model: "ai.assistant",
        method: "query",
        args: [
          // conversation history (only minimal context to keep payload small)
          messages.map((m) => ({ role: m.role, content: m.content })),
          // new user message
          { role: "user", content: userMessageText },
        ],
        kwargs: {},
      };

      // Ask user to confirm HTTP RPC payload before sending
      try {
        const ok = await confirmRpc(payload);
        if (!ok) {
          showError("AI query cancelled by user.");
          setIsLoading(false);
          dismissToast(toastId);
          return;
        }
      } catch {
        showError("Unable to confirm AI query.");
        setIsLoading(false);
        dismissToast(toastId);
        return;
      }

      const res = await postToRelay(url, payload, apiKey, 30000);

      // If parsed JSON looks like an RPC response
      const textLower = (res.text || "").toLowerCase();

      const aiMissing =
        // JSON error structures
        (res.parsed &&
          ((res.parsed.error && typeof res.parsed.error === "string" && res.parsed.error.toLowerCase().includes("object ai.assistant")) ||
            (res.parsed.message && typeof res.parsed.message === "string" && res.parsed.message.toLowerCase().includes("object ai.assistant")))) ||
        // plain text (including XML-RPC Fault) that mentions the missing object
        textLower.includes("object ai.assistant doesn't exist".toLowerCase()) ||
        textLower.includes("object ai.assistant does not exist") ||
        textLower.includes("object ai.assistant doesn't exist");

      if (res.ok && res.parsed && res.parsed.success) {
        const assistantMessage: Message = {
          id: Date.now() + 1,
          role: "assistant",
          content: typeof res.parsed.result === "string" ? res.parsed.result : JSON.stringify(res.parsed.result),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        showSuccess("AI Assistant responded.");
      } else if (aiMissing) {
        // Detected missing ai.assistant model — run fallback
        showError("ai.assistant model not found on relay; attempting targeted fallback queries.");
        const fallbackText = await runFallbackEmployeeSearch(userMessageText);
        const assistantMessage: Message = {
          id: Date.now() + 1,
          role: "assistant",
          content:
            `I couldn't find the ai.assistant model on the relay. I ran an employee search fallback using your query:\n\n${fallbackText}\n\nIf you expected an AI assistant, ensure your relay exposes the ai.assistant model or configure an AI-capable backend.`,
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        // Generic failure: include parsed errors or text preview
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
      <CardHeader>
        <CardTitle>AI Assistant</CardTitle>
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