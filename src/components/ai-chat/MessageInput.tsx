"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  disabled?: boolean;
}

const MessageInput: React.FC<Props> = ({ value, onChange, onSubmit, disabled = false }) => {
  return (
    <form onSubmit={onSubmit} className="flex w-full items-center space-x-2">
      <Input
        id="message"
        placeholder="Ask about sales, employees, or anything else..."
        className="flex-1"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      <Button type="submit" disabled={disabled}>
        Send
      </Button>
    </form>
  );
};

export default MessageInput;