"use client";

import * as React from "react";

/**
 * useLocalStorage - a tiny hook to persist state to localStorage and sync across tabs.
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
      localStorage.setItem(key, JSON.stringify(state));
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

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, initialValue]);

  return [state, setState] as const;
}