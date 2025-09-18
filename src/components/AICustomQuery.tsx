"use client";

import React, { useState } from "react";
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

export const AICustomQuery: React.FC<Props> = ({ relayHost, apiKey }) => {
  const [input, setInput] = useState("");
  const { status, messages, send, pushMessage } = useAIChat(relayHost, apiKey);

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
      <CardHeader>
        <CardTitle>AI Natural Query</CardTitle>
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