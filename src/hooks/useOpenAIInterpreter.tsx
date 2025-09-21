JSON-RPC interpreter with richer system prompt and validation.">
"use client";

export async function interpretWithOpenAI(openaiKey: string | undefined, userText: string) {
  if (!openaiKey) {
    throw new Error("No OpenAI API key provided");
  }

  const ENHANCED_SYSTEM_PROMPT = `You are an expert Odoo ERP consultant. Convert natural language to JSON-RPC calls using these models:

CORE MODELS & FIELDS:
• res.partner: Companies/customers (name, total_invoiced, customer_rank, supplier_rank, is_company)
• sale.order: Sales orders (name, partner_id, amount_total, date_order, state)
• account.move: Invoices/accounting (name, partner_id, amount_total, invoice_date, move_type)
• product.product: Products (name, default_code, list_price, qty_available, categ_id)
• purchase.order: Purchase orders (name, partner_id, amount_total, date_order)
• hr.employee: Employees (name, work_email, department_id, job_title)
• stock.quant: Inventory levels (product_id, quantity, location_id)

QUERY PATTERNS:
• "highest turnover/revenue" → res.partner with total_invoiced desc
• "top customers" → res.partner where customer_rank > 0, order by total_invoiced desc
• "low stock products" → product.product where qty_available < threshold
• "recent orders" → sale.order order by date_order desc
• "sales by month" → sale.order read_group by date_order:month
• "best selling products" → sale.order.line read_group by product_id

REQUIREMENTS:
- ONLY output valid JSON (no extra commentary).
- JSON must be an object with keys:
  - model (string)
  - method (string)
  - args (array)
  - kwargs (object)
- Use Odoo domain and kwargs conventions (e.g. args: [[["field","operator",value]]], kwargs: {fields: [...], limit: N, order: "field desc"})
- When the user asks for a period or year (e.g., '2024' or 'this month'), include date bounds using date fields where appropriate (date_order, invoice_date).
- Prefer using read_group for grouped/aggregated queries and search_read for listing queries.

If you cannot map the query to a specific model/method, return {"error":"explanation"}.

Example:
Q: List recent sales orders this month.
A: {"model":"sale.order","method":"search_read","args":[[["date_order",">=","2025-09-01"]]],"kwargs":{"fields":["id","name","amount_total"]}}

Output only the JSON object (no markdown, no backticks).`;

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
      // drop the opening line if it contains a language token
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