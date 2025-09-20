"use client";

import React, { useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import MessageBubble, { type ChatMessage } from "./MessageBubble";
import { Bot } from "lucide-react";

interface Props {
  messages: ChatMessage[];
  isLoading?: boolean;
  scrollRef?: React.RefObject<HTMLDivElement>;
}

const MessageList: React.FC<Props> = ({ messages, isLoading = false, scrollRef }) => {
  // Auto-scroll logic: only scroll when near bottom
  useEffect(() => {
    const el = scrollRef?.current;
    if (!el) return;
    try {
      const threshold = 150;
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
  }, [messages, isLoading, scrollRef]);

  return (
    <ScrollArea className="h-full pr-4" ref={scrollRef as any}>
      <div className="space-y-4">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
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
  );
};

export default MessageList;