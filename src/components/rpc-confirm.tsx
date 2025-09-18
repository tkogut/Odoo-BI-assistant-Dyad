"use client";

import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

type ConfirmRpcFn = (payload: any) => Promise<boolean>;
const RpcConfirmContext = createContext<ConfirmRpcFn | null>(null);

export const RpcConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const [payloadText, setPayloadText] = useState<string>("");
  const resolveRef = useRef<(ok: boolean) => void | null>(null);

  const confirm = useCallback((payload: any) => {
    return new Promise<boolean>((resolve) => {
      try {
        const pretty = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
        setPayloadText(pretty);
      } catch {
        setPayloadText(String(payload));
      }
      resolveRef.current = resolve;
      setOpen(true);
    });
  }, []);

  const onConfirm = () => {
    setOpen(false);
    const r = resolveRef.current;
    if (r) r(true);
    resolveRef.current = null;
  };

  const onCancel = () => {
    setOpen(false);
    const r = resolveRef.current;
    if (r) r(false);
    resolveRef.current = null;
  };

  return (
    <RpcConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={open} onOpenChange={(val) => !val && onCancel()}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Confirm RPC Payload</DialogTitle>
          </DialogHeader>

          <div className="mt-2">
            <p className="text-sm text-muted-foreground mb-2">
              Review the payload below and confirm to send it to the relay:
            </p>

            <pre className="bg-muted p-3 rounded text-sm overflow-auto max-h-96 whitespace-pre-wrap">
              {payloadText}
            </pre>
          </div>

          <DialogFooter>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
              <Button onClick={onConfirm}>Confirm & Send</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RpcConfirmContext.Provider>
  );
};

export function useRpcConfirm() {
  const ctx = useContext(RpcConfirmContext);
  if (!ctx) {
    throw new Error("useRpcConfirm must be used within RpcConfirmProvider");
  }
  return ctx;
}