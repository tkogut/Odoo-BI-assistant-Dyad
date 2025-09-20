"use client";

import React from "react";
import { Bot, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
};

const MessageBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
  return (
    <div
      key={message.id}
      className={cn(
        "flex items-start gap-3",
        message.role === "user" ? "justify-end" : "justify-start"
      )}
    >
      {message.role === "assistant" && (
        <div className="p-2 bg-muted rounded-full">
          <Bot className="w-5 h-5" />
        </div>
      )}

      <div
        className={cn(
          "p-3 rounded-lg max-w-xs md:max-w-md",
          message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
        )}
      >
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
      </div>

      {message.role === "user" && (
        <div className="p-2 bg-muted rounded-full">
          <UserIcon className="w-5 h-5" />
        </div>
      )}
    </div>
  );
};

export default MessageBubble;