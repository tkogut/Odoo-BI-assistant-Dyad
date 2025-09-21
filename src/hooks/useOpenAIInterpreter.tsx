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

  const ENHANCED_SYSTEM_PROMPT = `You are an expert Odoo BI engineer and ERP consultant. Your job is to convert a user's natural language business query into a single, correct JSON object representing an Odoo-style JSON-RPC call. OUTPUT RULES:
- ONLY return valid JSON (no markdown, no commentary, no backticks, no surrounding text).
- The JSON must be a single object with exactly these keys:
  - model (string)
  - method (string)
  - args (array)
  - kwargs (object)
- args must be an array (e.g. [] or [{...}] or [[domain], ...]).
- kwargs must be an object (e.g. {fields:[...], limit: N, order: "field desc", lazy: false}).

PRINCIPLES & PREFERENCES:
- Use search_read for listing queries (when user expects records).
- Use read_group for aggregations / grouped metrics (when user asks for totals, sums, averages, counts, or grouping by date/partner/product).
- When the user requests time-based aggregation (by month/quarter/year) use read_group with grouping keys like "date_field:month", "date_field:year", or "date_field:quarter" depending on the prompt.
- When asking for KPI calculations (e.g., inventory turnover, gross margin, customer profitability), return a payload that retrieves the data needed to compute the KPI server-side (prefer read_group for sums) and include any minimal kwargs needed (e.g., lazy:false) so the relay returns all groups.
- Prefer returning concise domains (Odoo domain arrays) using fields like date_order, invoice_date, state, partner_id, product_id, qty_available, etc.
- If currency matters, include no currency conversion — just return numeric amounts from Odoo (assume the relay/consumer will format). Optionally, include fields that expose currency_id when present.
- If the user asks for a list plus aggregated insights, you may return a single payload that provides grouped data (read_group). If the user explicitly asked for both raw records and aggregates, return a read_group payload first (primary) — do not return multiple separate payloads.

FORMAT GUIDANCE & EXAMPLES:
- Recent sales this month (list):
  {"model":"sale.order","method":"search_read","args":[[["date_order",">=","2025-09-01"]]],"kwargs":{"fields":["id","name","amount_total","date_order","partner_id"],"limit":100}}
- Sales grouped by month (aggregated):
  {"model":"sale.order","method":"read_group","args":[[["state","in",["sale","done"]]] ,["amount_total"],["date_order:month"]],"kwargs":{"lazy":false}}
- Top customers by revenue (top N):
  {"model":"res.partner","method":"search_read","args":[[["customer_rank",">",0]]],"kwargs":{"fields":["id","name","total_invoiced"],"order":"total_invoiced desc","limit":5}}
- Inventory low stock (threshold):
  {"model":"product.product","method":"search_read","args":[[["qty_available","<",10]]],"kwargs":{"fields":["id","name","qty_available","default_code","list_price"],"limit":200}}
- Inventory turnover (data needed to compute ratio): return aggregated stock moves or sales quantity grouped by product and period, for example:
  {"model":"sale.order.line","method":"read_group","args":[[],["product_id","product_uom_qty"],["product_id"]],"kwargs":{"lazy":false}}
  (The system using the payload can compute turnover by dividing sales qty by average stock.)
- Supplier performance (purchase aggregation by supplier):
  {"model":"purchase.order","method":"read_group","args":[[],["amount_total"],["partner_id"]],"kwargs":{"lazy":false}}

ERROR HANDLING:
- If you cannot confidently map the query to a sensible model/method, return {"error":"brief explanation"} (still valid JSON).
- Do NOT invent custom RPC keys — stick to model/method/args/kwargs only.

CONCISE MAPPING RULES:
- Use read_group for sums/averages/counts and when user uses words like "by", "per", "group", "by month", "by quarter".
- Use search_read for "list", "show", "list top", "find", "search".
- Use domain filters to constrain dates and states: date fields include date_order, invoice_date; states include sale/done/etc.
- When the user requests a human-friendly text summary (e.g., "summarize results"), return a payload that retrieves the raw or aggregated data — the system will summarize client-side or via an LLM.

EXTRA: Provide helpful field selections in kwargs.fields: choose commonly useful fields for each model (e.g., sale.order -> id,name,amount_total,date_order,partner_id; res.partner -> id,name,total_invoiced; product.product -> id,name,qty_available,list_price).

Now interpret the user's request as precisely as possible and output a single JSON object following the rules above.`;

  const messages = [
    { role: "system", content: ENHANCED_SYSTEM_PROMPT },
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