"use client";

import * as React from "react";

/**
 * useLocalStorage - a tiny hook to persist state to localStorage and sync across tabs
 * and within the same window (via a custom 'local-storage' event).
 *
 * @param key localStorage key
 * @param initialValue default value when none exists in storage
 * @returns [value, setValue]
 */
export function useLocalStorage<T>(key: string, initialValue: T) {
  const [state, setState] = React.useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  React.useEffect(() => {
    try {
      const raw = JSON.stringify(state);
      localStorage.setItem(key, raw);

      // Dispatch a custom event so same-tab listeners can react immediately.
      const ev = new CustomEvent("local-storage", { detail: { key, newValue: state } });
      window.dispatchEvent(ev);
    } catch {
      // ignore write errors (e.g. storage full, private mode)
    }
  }, [key, state]);

  React.useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      try {
        const newVal = e.newValue ? (JSON.parse(e.newValue) as T) : initialValue;
        setState(newVal);
      } catch {
        setState(initialValue);
      }
    };

    const onCustom = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail;
        if (!detail) return;
        if (detail.key !== key) return;
        setState(detail.newValue as T);
      } catch {
        // ignore
      }
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("local-storage", onCustom as EventListener);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("local-storage", onCustom as EventListener);
    };
  }, [key, initialValue]);

  return [state, setState] as const;
}