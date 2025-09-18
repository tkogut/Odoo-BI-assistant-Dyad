"use client";

import React, { useState, useRef, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { showLoading, showSuccess, showError, dismissToast } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { Bot, User } from "lucide-react";

interface Props {
  relayHost: string;
  apiKey: string;
}

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
}

export const AIChat: React.FC<Props> = ({ relayHost, apiKey }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    if (!relayHost) {
      showError("Please enter a Relay Host (e.g. http://localhost:8000)");
      return;
    }

    const userMessage: Message = {
      id: Date.now(),
      role: "user",
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    const toastId = showLoading("AI Assistant is thinking...");

    try {
      const url = `${relayHost.replace(/\/$/, "")}/api/execute_method`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout for AI

      // We'll assume a hypothetical `ai.assistant` model with a `query` method
      const payload = {
        model: "ai.assistant",
        method: "query",
        args: [
          // Pass the conversation history for context
          messages.map(m => ({ role: m.role, content: m.content })),
          // Pass the new user message
          { role: 'user', content: input }
        ],
        kwargs: {},
      };

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "X-API-Key": apiKey } : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const json = await resp.json();

      if (resp.ok && json.success) {
        const assistantMessage: Message = {
          id: Date.now() + 1,
          role: "assistant",
          content: json.result,
        };
        setMessages((prev) => [...prev, assistantMessage]);
        showSuccess("AI Assistant responded.");
      } else {
        const errorMessage = json.error || json.message || `HTTP ${resp.status} ${resp.statusText}`;
        showError(`AI query failed: ${errorMessage}`);
        // Add an error message to the chat
        const errorMessageObj: Message = {
          id: Date.now() + 1,
          role: "assistant",
          content: `Sorry, I encountered an error: ${errorMessage}`,
        };
        setMessages((prev) => [...prev, errorMessageObj]);
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