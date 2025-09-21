"use client";

/**
 * JSON-RPC interpreter with richer system prompt and validation.
 *
 * Converts a natural language user prompt into a validated JSON-RPC payload
 * suitable for sending to an Odoo-style relay. Uses OpenAI chat completions
 * and ensures the assistant returns a strict JSON object with required keys.
 *
 * This version contains an enhanced BI-focused system prompt to improve
 * mapping of complex business queries (aggregations, KPIs, time-series,
 * multi-model joins) into Odoo JSON-RPC calls.
 */

export async function interpretWithOpenAI(openaiKey: string | undefined, userText: string) {
  if (!openaiKey) {
    throw new Error("No OpenAI API key provided");
  }

  const ENHANCED_BI_SYSTEM_PROMPT = `You are an expert Odoo ERP analyst and BI engineer. Convert business questions to a single JSON object representing an Odoo-style JSON-RPC call. OUTPUT RULES:
- ONLY return valid JSON (no markdown, no commentary, no backticks, no surrounding text).
- The JSON must be a single object with exactly these keys:
  - model (string)
  - method (string)
  - args (array)
  - kwargs (object)
- args must be an array (e.g. [] or [[domain], ...]).
- kwargs must be an object (e.g. {fields:[...], limit: N, order: "field desc", lazy: false}).

USE THESE BI PATTERNS & EXAMPLES:
- Monthly revenue breakdown (read_group):
  {"model":"sale.order","method":"read_group","args":[[["state","in",["sale","done"]],["date_order",">=","2023-01-01"]],["amount_total"],["date_order:month"]],"kwargs":{"lazy":false}}

- Customer revenue ranking (top customers by revenue):
  {"model":"sale.order","method":"read_group","args":[[["state","in",["sale","done"]]],["amount_total"],["partner_id"]],"kwargs":{"lazy":false,"orderby":"amount_total desc","limit":10}}

- Best-selling products (aggregate sales lines):
  {"model":"sale.order.line","method":"read_group","args":[[],["product_uom_qty","price_subtotal"],["product_id"]],"kwargs":{"lazy":false,"orderby":"product_uom_qty desc","limit":10}}

- Inventory low stock (search_read):
  {"model":"product.product","method":"search_read","args":[[["qty_available","<",10],["sale_ok","=",true]]],"kwargs":{"fields":["id","name","qty_available","list_price"],"limit":50}}

- Supplier performance (purchase aggregations):
  {"model":"purchase.order","method":"read_group","args":[[["state","in",["purchase","done"]]],["amount_total"],["partner_id"]],"kwargs":{"lazy":false,"orderby":"amount_total desc","limit":10}}

PRINCIPLES & PREFERENCES:
- Use read_group for sums/averages/counts and when the user asks to group "by" something or mentions "monthly/annual/quarterly".
- Include lazy:false for read_group so the relay returns full groups.
- Use search_read for straightforward lists and low-stock lookups.
- When the user asks "top customers" prefer read_group on sale.order grouped by partner_id (server-side aggregation).
- Always include useful fields in kwargs.fields when returning search_read payloads.
- If the user gives a year or date range, include date_order comparisons in the domain.
- Do NOT return multiple payloads: return a single payload that best maps to the user's intent.
- If you cannot confidently map the query, return {"error":"brief explanation"} (still valid JSON).
- Do NOT invent custom keys; only model/method/args/kwargs.

Now interpret the user's request precisely and output a single JSON object following the rules above.`;

  const messages = [
    { role: "system", content: ENHANCED_BI_SYSTEM_PROMPT },
    { role: "user", content: userText },
  ];

  const body = {
    model: "gpt-4",
    messages,
    temperature: 0.0,
    max_tokens: 800,
    n: 1,
  };

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`OpenAI API error: ${resp.status} ${resp.statusText} ${txt}`);
  }

  const json = await resp.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned an unexpected response");
  }

  // Normalize assistant text to try to extract only the JSON object
  let jsonText = content.trim();

  // Remove code fences if present
  if (jsonText.startsWith("```")) {
    const fenceEnd = jsonText.lastIndexOf("```");
    if (fenceEnd > 3) {
      const firstNewline = jsonText.indexOf("\n");
      jsonText = jsonText.slice(firstNewline + 1, fenceEnd).trim();
    }
  }

  // Extract first {...} object if assistant added commentary
  const firstBrace = jsonText.indexOf("{");
  const lastBrace = jsonText.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
    jsonText = jsonText.slice(firstBrace, lastBrace + 1);
  }

  let parsed: any = null;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err: any) {
    throw new Error("OpenAI returned non-JSON or malformed JSON: " + (err?.message || String(err)));
  }

  // If assistant explicitly returned error object, throw that as an error
  if (parsed && typeof parsed === "object" && parsed.error) {
    throw new Error(String(parsed.error));
  }

  // Validate required keys
  if (
    !parsed ||
    typeof parsed.model !== "string" ||
    typeof parsed.method !== "string" ||
    !Array.isArray(parsed.args) ||
    typeof parsed.kwargs !== "object" ||
    Array.isArray(parsed.kwargs)
  ) {
    throw new Error(
      "Parsed JSON missing required keys or wrong types (expect: model:string, method:string, args:array, kwargs:object).",
    );
  }

  return {
    model: parsed.model,
    method: parsed.method,
    args: parsed.args,
    kwargs: parsed.kwargs,
  };
}

export default interpretWithOpenAI;