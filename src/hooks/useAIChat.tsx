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

  // Track active streaming message ids by stream key so chunks can be appended
  const streamBuffers = useRef<Map<string, number>>(new Map());

  const connect = useCallback(() => {
    if (!relayHost) return;
    try {
      setStatus("connecting");
      const url = new URL(relayHost);
      const protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.protocol = protocol;
      // default websocket path; many relays expose a websocket endpoint — fallback to HTTP if not available
      url.pathname = "/ws/ai-chat";
      wsRef.current = new WebSocket(url.toString());

      wsRef.current.onopen = () => setStatus("connected");

      wsRef.current.onmessage = (ev) => {
        // Attempt to parse JSON. Many relays stream chunks with metadata; we support a simple chunk protocol:
        // { role: "assistant", content: "partial text", stream: true, stream_id: "abc", done: false }
        // or full messages: { role: "assistant", content: "full text" }
        try {
          const data = JSON.parse(ev.data);

          // If this looks like a streaming chunk
          if (data && data.stream && (data.content !== undefined)) {
            const streamKey = data.stream_id ?? "default_stream";
            const existingMsgId = streamBuffers.current.get(streamKey);

            if (existingMsgId === undefined) {
              // start a new assistant message
              const msg: AIMessage = { id: Date.now(), role: data.role === "user" ? "user" : "assistant", content: String(data.content || "") };
              setMessages((m) => [...m, msg]);
              streamBuffers.current.set(streamKey, msg.id);
            } else {
              // append content to the existing message
              setMessages((m) =>
                m.map((it) => (it.id === existingMsgId ? { ...it, content: it.content + String(data.content || "") } : it)),
              );
            }

            // If chunk signals completion, clear buffer
            if (data.done) {
              streamBuffers.current.delete(streamKey);
            }

            return;
          }

          // Not a stream chunk — if it has role/content, append as a normal message
          if (data && (data.role === "assistant" || data.role === "user") && data.content !== undefined) {
            const msg: AIMessage = { id: Date.now(), role: data.role, content: String(data.content) };
            setMessages((m) => [...m, msg]);
            return;
          }

          // If the JSON is an array or object that might represent a full reply, stringify it for display
          const text = JSON.stringify(data);
          setMessages((m) => [...m, { id: Date.now(), role: "assistant", content: text }]);
        } catch {
          // Non-JSON payloads: display raw text as assistant content
          const text = typeof ev.data === "string" ? ev.data : String(ev.data);
          setMessages((m) => [...m, { id: Date.now(), role: "assistant", content: text }]);
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
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }
    // clear any in-progress streams
    streamBuffers.current.clear();
    setStatus("disconnected");
  }, []);

  useEffect(() => {
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