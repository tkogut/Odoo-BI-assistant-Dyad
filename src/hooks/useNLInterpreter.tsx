"use client";

import { useMemo } from "react";

/**
 * Small rule-based Natural Language Interpreter.
 *
 * Given a user message, returns a suggested endpoint type and a prepared payload.
 * This is intentionally simple and deterministic so it works offline and doesn't
 * require external LLM calls. It targets common patterns:
 *  - employee search (prefers /api/search_employee)
 *  - sales aggregation (read_group on sale.order)
 *  - dashboard generation (ask ai.assistant.generate_dashboard)
 *  - fallback to ai.assistant.query
 */

export type NLIntentType = "search_employee" | "sales_analysis" | "generate_dashboard" | "ai_assistant";

export type NLInterpretation =
  | {
      type: "search_employee";
      payload: { name: string; limit?: number };
      description: string;
    }
  | {
      type: "sales_analysis";
      payload: {
        model: "sale.order";
        method: "read_group";
        args: any[];
        kwargs?: Record<string, any>;
      };
      description: string;
    }
  | {
      type: "generate_dashboard";
      payload: { model: "ai.assistant"; method: "generate_dashboard"; args: any[]; kwargs?: any };
      description: string;
    }
  | {
      type: "ai_assistant";
      payload: { model: "ai.assistant"; method: string; args: any[]; kwargs?: any };
      description: string;
    };

/** naive name extractor: looks for "search for NAME" or "find NAME" patterns first */
function extractNameFromText(text: string): string | null {
  const re = /\b(?:search for|find|look up|who is|find me|find employee)\s+([A-ZĄĆĘŁŃÓŚŹŻ][\wĄĆĘŁŃÓŚŹŻ'`-]+(?:\s+[A-ZĄĆĘŁŃÓŚŹŻ][\wĄĆĘŁŃÓŚŹŻ'`-]+)*)/i;
  const m = text.match(re);
  if (m && m[1]) return m[1].trim();

  // fallback: single capitalized token (e.g. "Kogut") or Last-name-like token
  const tokenRe = /\b([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż-']{2,})\b/;
  const t = text.match(tokenRe);
  if (t && t[1]) return t[1];

  return null;
}

/** Inspect text and return a best-effort interpretation */
export function interpretTextAsRelayCommand(text: string): NLInterpretation {
  const cleaned = (text || "").trim();
  const lower = cleaned.toLowerCase();

  // Employee search heuristics
  if (
    /\b(employee|staff|colleague|people|person|employee search|find employee|who works|who is)\b/.test(lower) ||
    /\b(search for|find|look up)\b/.test(lower) && /[A-ZĄĆĘŁŃÓŚŹŻ]/.test(cleaned)
  ) {
    const name = extractNameFromText(cleaned) ?? cleaned;
    return {
      type: "search_employee",
      payload: { name: name, limit: 20 },
      description: `Search employees for "${name}" via /api/search_employee (preferred)`,
    };
  }

  // Sales analysis heuristics
  if (/\b(sales|revenue|monthly sales|orders|average order|top customers|avg order|order value)\b/.test(lower)) {
    const period = /\b(month|monthly)\b/.test(lower) ? "month" : /\b(year|annual)\b/.test(lower) ? "year" : "month";
    const payload = {
      model: "sale.order",
      method: "read_group",
      args: [
        [["state", "in", ["sale", "done"]]], // domain
        ["amount_total"],
        [`date_order:${period}`],
      ],
      kwargs: { lazy: false },
    };
    return {
      type: "sales_analysis",
      payload,
      description: `Aggregate sales by ${period}`,
    };
  }

  // Dashboard generation heuristics
  if (/\b(dashboard|generate dashboard|build dashboard|create dashboard|dashboard for)\b/.test(lower)) {
    return {
      type: "generate_dashboard",
      payload: { model: "ai.assistant", method: "generate_dashboard", args: [cleaned], kwargs: {} },
      description: "Generate an AI dashboard (ai.assistant.generate_dashboard)",
    };
  }

  // Default: forward to ai.assistant.query
  return {
    type: "ai_assistant",
    payload: { model: "ai.assistant", method: "query", args: [[{ role: "user", content: cleaned }]], kwargs: {} },
    description: "Query ai.assistant (default)",
  };
}

/** Hook wrapper if you prefer a hook; for now it just exposes the interpreter function */
export function useNLInterpreter() {
  const fn = useMemo(() => interpretTextAsRelayCommand, []);
  return { interpret: fn };
}

export default interpretTextAsRelayCommand;