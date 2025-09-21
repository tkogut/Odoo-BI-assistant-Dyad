"use client";

import { useMemo } from "react";

/**
 * Small rule-based Natural Language Interpreter.
 *
 * Given a user message, returns a suggested endpoint type and a prepared payload.
 * This is intentionally simple and deterministic so it works offline and doesn't
 * require external LLM calls. It targets common patterns:
 *  - employee search (prefers /api/search_employee) and supports 'in <department>'
 *  - sales aggregation (read_group on sale.order)
 *  - dashboard generation (ask ai.assistant.generate_dashboard)
 *  - fallback to ai.assistant.query
 *  - top customer by turnover (read_group grouping by partner_id)
 */

export type NLIntentType = "search_employee" | "sales_analysis" | "generate_dashboard" | "ai_assistant" | "top_customer";

export type NLInterpretation =
  | {
      type: "search_employee";
      payload: { name?: string; dept?: string; limit?: number };
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
    }
  | {
      type: "top_customer";
      payload: {
        model: "sale.order";
        method: "read_group";
        args: any[];
        kwargs?: Record<string, any>;
      };
      description: string;
    };

/** naive name extractor: looks for "search for NAME" or "find NAME" patterns first */
function extractNameFromText(text: string): string | null {
  const re = /\b(?:search for|find|look up|who is|find me|find employee)\s+([A-ZĄĆĘŁŃÓŚŹŻ][\wĄĆĘŁŃÓŚŹŻ'`-]+(?:\s+[A-ZĄĆĘŁŃÓŚŹŻ][\wĄĆĘŁŃÓŚŹŻ'`-]+)*)/i;
  const m = text.match(re);
  if (m && m[1]) return m[1].trim();

  // fallback: single capitalized token (e.g. "Kogut") or Last-name-like token
  const tokenRe = /\b([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż'\-]{2,})\b/;
  const t = text.match(tokenRe);
  if (t && t[1]) return t[1];

  return null;
}

/** naive department extractor: looks for "in <department>" or "<department> department" */
function extractDepartmentFromText(text: string): string | null {
  const cleaned = text.trim();
  // Try "in <dept> (department|dept)?"
  const inRe = /\bin\s+(the\s+)?([A-Za-zĄĆĘŁŃÓŚŹŻażćęłńóśźż'\-\s]{2,}?)\s*(?:department|dept|team)?\b/i;
  const m = cleaned.match(inRe);
  if (m && m[2]) return m[2].trim();

  // Try "<dept> department" standalone
  const deptRe = /\b([A-Za-zĄĆĘŁŃÓŚŹŻażćęłńóśźż'\-\s]{2,}?)\s+(?:department|dept|team)\b/i;
  const m2 = cleaned.match(deptRe);
  if (m2 && m2[1]) return m2[1].trim();

  return null;
}

/** Inspect text and return a best-effort interpretation */
export function interpretTextAsRelayCommand(text: string): NLInterpretation {
  const cleaned = (text || "").trim();
  const lower = cleaned.toLowerCase();

  // Detect a 4-digit year like 2024
  const yearMatch = cleaned.match(/\b(20\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : null;

  // Employee search heuristics
  if (
    /\b(employee|employees|staff|colleague|people|person|employee search|find employee|who works|who is)\b/.test(lower) ||
    (/\b(search for|find|look up)\b/.test(lower) && /[A-ZĄĆĘŁŃÓŚŹŻ]/.test(cleaned))
  ) {
    const name = extractNameFromText(cleaned) ?? undefined;
    const dept = extractDepartmentFromText(cleaned) ?? undefined;
    return {
      type: "search_employee",
      payload: { name, dept, limit: 20 },
      description: dept
        ? `Search employees for name="${name ?? "(any)"}" in department="${dept}" via /api/search_employee (preferred)`
        : `Search employees for "${name ?? "(any)"}" via /api/search_employee (preferred)`,
    };
  }

  // Top customer / highest turnover heuristics
  if (/\b(top customer|top client|highest turnover|highest revenue|highest sales|largest customer|biggest customer|most revenue)\b/.test(lower) || (/\b(company|customer|client)\b/.test(lower) && /\b(highest|top|largest|biggest)\b/.test(lower))) {
    const period = year ? ` for ${year}` : "";
    // Base domain: confirmed sales orders
    const domain: any[] = [["state", "in", ["sale", "done"]]];
    if (year) {
      domain.push(["date_order", ">=", `${year}-01-01`]);
      domain.push(["date_order", "<=", `${year}-12-31`]);
    }

    // Group by partner_id and aggregate amount_total
    const payload = {
      model: "sale.order",
      method: "read_group",
      args: [domain, ["amount_total", "partner_id"], ["partner_id"]],
      kwargs: { lazy: false },
    };

    return {
      type: "top_customer",
      payload,
      description: `Find top customer by turnover${period}`,
    };
  }

  // Sales analysis heuristics
  if (/\b(sales|revenue|monthly sales|orders|average order|top customers|avg order|order value)\b/.test(lower)) {
    const period = /\b(month|monthly)\b/.test(lower) ? "month" : /\b(year|annual)\b/.test(lower) ? "year" : "month";

    // Base domain: confirmed sales orders
    const domain: any[] = [["state", "in", ["sale", "done"]]];

    // If a specific year was detected, add a date range filter for that year
    if (year) {
      domain.push(["date_order", ">=", `${year}-01-01`]);
      domain.push(["date_order", "<=", `${year}-12-31`]);
    }

    const payload = {
      model: "sale.order",
      method: "read_group",
      args: [
        domain,
        ["amount_total"],
        [`date_order:${period}`],
      ],
      kwargs: { lazy: false },
    };

    return {
      type: "sales_analysis",
      payload,
      description: `Aggregate sales by ${period}${year ? ` for ${year}` : ""}`,
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