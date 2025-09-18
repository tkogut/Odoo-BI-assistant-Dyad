"use client";

import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { showLoading, showSuccess, showError, dismissToast } from "@/utils/toast";
import { useAIChat } from "@/hooks/useAIChat";
import ChatMessage from "./ChatMessage";

interface Props {
  relayHost: string;
  apiKey: string;
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

export const AICustomQuery: React.FC<Props> = ({ relayHost, apiKey }) => {
  const [input, setInput] = useState("");
  const { status, messages, send, pushMessage, connect, disconnect } = useAIChat(relayHost, apiKey);
  const connectingToastRef = useRef<string | null>(null);

  useEffect(() => {
    // Show toasts for status transitions. Keep a reference for the "connecting" toast to dismiss it later.
    if (status === "connecting") {
      connectingToastRef.current = showLoading("Connecting to relay...");
    } else {
      if (connectingToastRef.current) {
        dismissToast(connectingToastRef.current);
        connectingToastRef.current = null;
      }
      if (status === "connected") {
        showSuccess("Connected to relay (WebSocket).");
      } else if (status === "disconnected") {
        showSuccess("Disconnected from relay.");
      } else if (status === "error") {
        showError("WebSocket connection error.");
      }
    }
  }, [status]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim()) return;
    const text = input.trim();
    pushMessage("user", text);

    const toastId = showLoading("Sending query to AI...");
    try {
      // Build payload consistent with relay expectations
      const payload = {
        model: "ai.assistant",
        method: "query",
        args: [[{ role: "user", content: text }]],
        kwargs: {},
      };

      const res = await send(payload);
      // WebSocket path: we rely on remote to stream messages back; show a local placeholder
      if ((res as any).via === "ws") {
        showSuccess("Sent via WebSocket; awaiting assistant reply.");
      } else {
        // HTTP response path
        const parsed = (res as any).parsed;
        if (parsed && parsed.success) {
          const content = typeof parsed.result === "string" ? parsed.result : JSON.stringify(parsed.result, null, 2);
          pushMessage("assistant", content);
          showSuccess("Assistant replied.");
        } else {
          const textResp = (res as any).text || `HTTP ${res.status}`;
          pushMessage("assistant", typeof textResp === "string" ? textResp : JSON.stringify(textResp));
          showError("Assistant responded with an error or unexpected format.");
        }
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      pushMessage("assistant", `Network error: ${msg}`);
      showError(msg);
    } finally {
      dismissToast(toastId);
      setInput("");
    }
  };

  return (
    <Card className="flex flex-col h-[420px]">
      <CardHeader className="flex items-center justify-between">
        <CardTitle>AI Natural Query</CardTitle>

        <div className="flex items-center space-x-3">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-3 h-3 rounded-full ${statusColor(status)}`} />
            <span className="text-sm text-muted-foreground capitalize">{status}</span>
          </div>

          {status !== "connected" ? (
            <Button
              onClick={() => connect()}
              disabled={!relayHost || status === "connecting"}
            >
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
        <div className="h-full pr-2 overflow-auto space-y-3">
          {messages.map((m) => (
            <ChatMessage key={m.id} message={m} />
          ))}
        </div>
      </CardContent>

      <CardFooter>
        <form onSubmit={handleSubmit} className="flex w-full items-center space-x-2">
          <Input
            placeholder={status === "connected" ? "Ask AI (via WebSocket)" : "Ask AI (HTTP fallback)"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={status === "error"}
          />
          <Button type="submit">Send</Button>
        </form>
      </CardFooter>
    </Card>
  );
};

export default AICustomQuery;