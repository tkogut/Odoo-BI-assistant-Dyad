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
 *  - top_customer (prefer read_group aggregation by partner)
 *  - product_performance (best-selling products via sale.order.line read_group)
 *  - supplier_performance (purchase.order read_group)
 */

export type NLIntentType =
  | "search_employee"
  | "sales_analysis"
  | "generate_dashboard"
  | "ai_assistant"
  | "top_customer"
  | "inventory_analysis"
  | "financial_analysis"
  | "purchase_analysis"
  | "product_performance"
  | "supplier_performance";

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
        model: string;
        method: string;
        args: any[];
        kwargs?: Record<string, any>;
      };
      description: string;
    }
  | {
      type: "inventory_analysis";
      payload: {
        model: string;
        method: string;
        args: any[];
        kwargs?: Record<string, any>;
      };
      description: string;
    }
  | {
      type: "financial_analysis";
      payload: {
        model: string;
        method: string;
        args: any[];
        kwargs?: Record<string, any>;
      };
      description: string;
    }
  | {
      type: "purchase_analysis";
      payload: {
        model: string;
        method: string;
        args: any[];
        kwargs?: Record<string, any>;
      };
      description: string;
    }
  | {
      type: "product_performance";
      payload: {
        model: string;
        method: string;
        args: any[];
        kwargs?: Record<string, any>;
      };
      description: string;
    }
  | {
      type: "supplier_performance";
      payload: {
        model: string;
        method: string;
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

  // Top customer / highest turnover heuristics — prefer aggregation when user mentions revenue/rank
  if (/\b(top customer|top client|highest turnover|highest revenue|highest sales|largest customer|biggest customer|most revenue|rank|top 10)\b/.test(lower) || (/\b(customer|client)\b/.test(lower) && /\b(highest|top|largest|biggest)\b/.test(lower))) {
    const periodStart = year ? `${year}-01-01` : undefined;
    const periodEnd = year ? `${year}-12-31` : undefined;
    const domain: any[] = [["state", "in", ["sale", "done"]]];
    if (periodStart && periodEnd) {
      domain.push(["date_order", ">=", periodStart]);
      domain.push(["date_order", "<=", periodEnd]);
    }
    const payload = {
      model: "sale.order",
      method: "read_group",
      args: [domain, ["amount_total"], ["partner_id"]],
      kwargs: { lazy: false, orderby: "amount_total desc", limit: 10 },
    };

    return {
      type: "top_customer",
      payload,
      description: `Top customers by revenue${year ? ` for ${year}` : ""} (aggregated via sale.order.read_group).`,
    };
  }

  // Sales analysis heuristics
  if (/\b(sales|revenue|monthly sales|orders|average order|top customers|avg order|order value|trend)\b/.test(lower)) {
    const period = /\b(month|monthly)\b/.test(lower) ? "month" : /\b(year|annual)\b/.test(lower) ? "year" : "month";

    const domain: any[] = [["state", "in", ["sale", "done"]]];

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

  // Product performance / best-selling products heuristics
  if (/\b(best-?selling|best sellers|top products|top selling|selling products|most sold)\b/.test(lower)) {
    const limitMatch = cleaned.match(/\btop\s+(\d{1,2})\b/);
    const limit = limitMatch ? Number(limitMatch[1]) : 10;
    const payload = {
      model: "sale.order.line",
      method: "read_group",
      args: [[], ["product_uom_qty", "price_subtotal"], ["product_id"]],
      kwargs: { lazy: false, orderby: "product_uom_qty desc", limit },
    };
    return {
      type: "product_performance",
      payload,
      description: `Best-selling products (group by product_id) limited to ${limit}.`,
    };
  }

  // Inventory / stock heuristics
  if (/\b(stock|inventory|inventory levels|low stock|out of stock|reorder|warehouse)\b/.test(lower)) {
    // If user mentions low/threshold try to include a threshold hint
    const thresholdMatch = cleaned.match(/\bbelow\s+(\d{1,4})\b/);
    const threshold = thresholdMatch ? Number(thresholdMatch[1]) : undefined;

    // Prefer product.product search_read with qty/list_price fields
    const payload = {
      model: "product.product",
      method: "search_read",
      args: [threshold ? [["qty_available", "<", threshold]] : []],
      kwargs: { fields: ["id", "name", "default_code", "qty_available", "list_price", "categ_id"], limit: 200 },
    };

    return {
      type: "inventory_analysis",
      payload,
      description: threshold ? `Find products with qty_available < ${threshold}` : "List products and inventory levels",
    };
  }

  // Supplier / purchase heuristics (supplier performance)
  if (/\b(supplier performance|supplier|vendor performance|top suppliers|best suppliers)\b/.test(lower)) {
    const payload = {
      model: "purchase.order",
      method: "read_group",
      args: [[], ["amount_total"], ["partner_id"]],
      kwargs: { lazy: false, orderby: "amount_total desc", limit: 10 },
    };
    return {
      type: "supplier_performance",
      payload,
      description: "Aggregate purchases by supplier (purchase.order.read_group)",
    };
  }

  // Financial heuristics
  if (/\b(revenue|profit|financial|cash flow|income|invoic|accounts receivable|accounting|income statement)\b/.test(lower)) {
    const period = /\b(month|monthly)\b/.test(lower) ? "month" : /\b(year|annual)\b/.test(lower) ? "year" : "month";
    const domain: any[] = [];

    if (year) {
      domain.push(["invoice_date", ">=", `${year}-01-01`]);
      domain.push(["invoice_date", "<=", `${year}-12-31`]);
    }

    const payload = {
      model: "account.move",
      method: "read_group",
      args: [domain, ["amount_total"], [`invoice_date:${period}`]],
      kwargs: { lazy: false },
    };

    return {
      type: "financial_analysis",
      payload,
      description: `Aggregate accounting moves by ${period}${year ? ` for ${year}` : ""}`,
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