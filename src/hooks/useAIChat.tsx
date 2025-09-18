"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export type AIMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
};

type Status = "disconnected" | "connecting" | "connected" | "error";

export function useAIChat(relayHost?: string, apiKey?: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<Status>("disconnected");
  const [messages, setMessages] = useState<AIMessage[]>([]);

  const connect = useCallback(() => {
    if (!relayHost) return;
    try {
      setStatus("connecting");
      // Choose ws protocol based on relayHost protocol
      const url = new URL(relayHost);
      const protocol = url.protocol === "https:" ? "wss:" : "ws:";
      // Assume websocket endpoint at /ws/ai-chat (this is conventional; fallbacks handled)
      url.protocol = protocol;
      url.pathname = "/ws/ai-chat";
      wsRef.current = new WebSocket(url.toString());
      wsRef.current.onopen = () => setStatus("connected");
      wsRef.current.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          // Expect { role, content }
          if (data && (data.role === "user" || data.role === "assistant")) {
            setMessages((m) => [...m, { id: Date.now(), role: data.role, content: String(data.content) }]);
          } else if (typeof data === "string") {
            setMessages((m) => [...m, { id: Date.now(), role: "assistant", content: data }]);
          }
        } catch {
          setMessages((m) => [...m, { id: Date.now(), role: "assistant", content: ev.data }]);
        }
      };
      wsRef.current.onerror = () => setStatus("error");
      wsRef.current.onclose = () => setStatus("disconnected");
    } catch {
      setStatus("error");
    }
  }, [relayHost]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus("disconnected");
  }, []);

  useEffect(() => {
    // Auto-connect when relayHost is provided
    if (relayHost) connect();
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relayHost]);

  const send = useCallback(
    (payload: any) => {
      // If websocket connected, send over WS
      if (status === "connected" && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(payload));
        return Promise.resolve({ via: "ws" });
      }

      // Fallback: POST to /api/execute_method on the relay (HTTP)
      if (!relayHost) return Promise.reject(new Error("No relay host configured"));
      const url = `${relayHost.replace(/\/$/, "")}/api/execute_method`;
      return fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "X-API-Key": apiKey } : {}),
        },
        body: JSON.stringify(payload),
      }).then(async (resp) => {
        let parsed = null;
        try {
          parsed = await resp.json();
        } catch {}
        return { via: "http", ok: resp.ok, status: resp.status, parsed, text: parsed ? JSON.stringify(parsed) : await resp.text().catch(() => "") };
      });
    },
    [status, relayHost, apiKey],
  );

  const pushMessage = useCallback((role: AIMessage["role"], content: string) => {
    setMessages((m) => [...m, { id: Date.now(), role, content }]);
  }, []);

  return {
    status,
    messages,
    connect,
    disconnect,
    send,
    pushMessage,
  };
}