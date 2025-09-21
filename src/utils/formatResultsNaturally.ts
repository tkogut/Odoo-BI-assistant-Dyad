/**
 * formatResultsNaturally.ts
 *
 * Model-aware business-friendly summary for raw Odoo RPC results.
 * - Uses ODOO_MODELS when possible to pick relevant fields/formatting.
 * - If an OpenAI key is provided, produces a polished summary via the Chat Completions API.
 * - Falls back to a deterministic human-friendly formatter if OpenAI is unavailable or fails.
 */

import { ODOO_MODELS } from "@/utils/odooModels";

type AnyResult = any;

export async function formatResultsBasic(results: AnyResult, query: string, model?: string): Promise<string> {
  if (!results || (Array.isArray(results) && results.length === 0)) {
    return `No results found for "${query}".`;
  }

  // Helper: currency formatter
  const money = (n: number | string | undefined) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n || 0));

  // If the caller provided a model, try to format specifically
  if (model) {
    const modelKey = Object.keys(ODOO_MODELS).find((k) => ODOO_MODELS[k].model === model);
    if (modelKey) {
      const meta = (ODOO_MODELS as any)[modelKey];

      // Partners / customers / companies (revenue-focused)
      if (model === "res.partner") {
        if (Array.isArray(results)) {
          const rows = results.slice(0, 10).map((r: any, i: number) => {
            const name = r.name ?? r.display_name ?? `Partner ${r.id ?? i + 1}`;
            const revenue = r.total_invoiced ?? r.amount_total ?? null;
            const contact = r.email ?? r.phone ? ` — ${r.email ?? r.phone}` : "";
            return revenue ? `${i + 1}. ${name} — ${money(revenue)}${contact}` : `${i + 1}. ${name}${contact}`;
          });
          return `Found ${results.length} partners:\n\n${rows.join("\n")}`;
        }
      }

      // Sales orders / invoices (amount_total)
      if (model === "sale.order" || model === "account.move") {
        if (Array.isArray(results)) {
          const rows = results.slice(0, 10).map((r: any, i: number) => {
            const label = r.name ?? r.display_name ?? `Record ${r.id ?? i + 1}`;
            const date = r.date_order ?? r.invoice_date ?? r.date ?? null;
            const amt = r.amount_total ?? r.total_invoiced ?? r.amount ?? null;
            const partner = Array.isArray(r.partner_id) ? r.partner_id[1] : r.partner_id ?? null;
            const dateStr = date ? ` on ${new Date(date).toLocaleDateString()}` : "";
            const partnerStr = partner ? ` — ${partner}` : "";
            const amtStr = amt !== null ? ` — ${money(amt)}` : "";
            return `${i + 1}. ${label}${dateStr}${partnerStr}${amtStr}`;
          });
          return `Found ${results.length} ${model === "sale.order" ? "sales orders" : "invoices"}:\n\n${rows.join("\n")}`;
        }
      }

      // Products / inventory
      if (model === "product.product") {
        if (Array.isArray(results)) {
          const rows = results.slice(0, 10).map((r: any, i: number) => {
            const name = r.name ?? r.display_name ?? `Product ${r.id ?? i + 1}`;
            const sku = r.default_code ? ` (${r.default_code})` : "";
            const qty = r.qty_available ?? r.virtual_available ?? null;
            const price = r.list_price ?? null;
            const qtyStr = qty !== null ? ` — Stock: ${qty}` : "";
            const priceStr = price !== null ? ` — ${money(price)}` : "";
            return `${i + 1}. ${name}${sku}${qtyStr}${priceStr}`;
          });
          return `Found ${results.length} products:\n\n${rows.join("\n")}`;
        }
      }

      // Employees
      if (model === "hr.employee") {
        if (Array.isArray(results)) {
          const rows = results.slice(0, 10).map((r: any, i: number) => {
            const name = r.name ?? `Employee ${r.id ?? i + 1}`;
            const dept = Array.isArray(r.department_id) ? r.department_id[1] : r.department_id ?? null;
            const email = r.work_email ?? null;
            const phone = r.work_phone ?? null;
            const parts = [dept ? `dept: ${dept}` : null, email ? `email: ${email}` : null, phone ? `phone: ${phone}` : null].filter(Boolean);
            return `${i + 1}. ${name}${parts.length ? " — " + parts.join(" | ") : ""}`;
          });
          return `Found ${results.length} employees:\n\n${rows.join("\n")}`;
        }
      }
    }
  }

  // Generic array handling (fallback)
  if (Array.isArray(results)) {
    // Detect revenue-like objects
    if (results[0] && (results[0].total_invoiced !== undefined || results[0].amount_total !== undefined)) {
      return `Found ${results.length} results by revenue:\n\n${results
        .slice(0, 10)
        .map((item: any, i: number) => {
          const amount = item.total_invoiced ?? item.amount_total ?? 0;
          const rev = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
          const name = item.name ?? item.display_name ?? `Item ${item.id ?? i + 1}`;
          return `${i + 1}. ${name} — ${rev}`;
        })
        .join("\n")}`;
    }

    // Inventory-like objects
    if (results[0] && results[0].qty_available !== undefined) {
      return `Found ${results.length} products:\n\n${results
        .slice(0, 10)
        .map((item: any, i: number) => {
          const name = item.name ?? item.display_name ?? `Product ${item.id ?? i + 1}`;
          const qty = item.qty_available ?? 0;
          return `${i + 1}. ${name} — Stock: ${qty} units`;
        })
        .join("\n")}`;
    }

    // Generic list of objects
    return `Found ${results.length} results:\n\n${results
      .slice(0, 10)
      .map((item: any, i: number) => {
        const name = item.name ?? item.display_name ?? `Item ${item.id ?? i + 1}`;
        const extra = item.department_id && Array.isArray(item.department_id) ? ` (${item.department_id[1]})` : item.email ? ` — ${item.email}` : "";
        return `${i + 1}. ${name}${extra}`;
      })
      .join("\n")}`;
  }

  // Non-array result
  try {
    return `Result:\n${JSON.stringify(results, null, 2)}`;
  } catch {
    return String(results);
  }
}

export async function formatResultsNaturally(
  openaiKey: string | null | undefined,
  originalQuery: string,
  rawResults: AnyResult,
  modelUsed?: string,
): Promise<string> {
  // If no results, delegate to basic formatter
  if (!rawResults || (Array.isArray(rawResults) && rawResults.length === 0)) {
    return formatResultsBasic(rawResults, originalQuery, modelUsed);
  }

  // If OpenAI key is not provided, use the basic formatter
  if (!openaiKey) {
    return formatResultsBasic(rawResults, originalQuery, modelUsed);
  }

  // Compose a context-aware prompt that includes model metadata when available
  let modelInfo = modelUsed || "unknown";
  try {
    if (modelUsed) {
      const mm = Object.values(ODOO_MODELS).find((m: any) => m.model === modelUsed);
      if (mm) {
        modelInfo = `${mm.model} (fields: ${((mm.common_fields || []) as string[]).slice(0, 10).join(", ")})`;
      }
    }
  } catch {
    // ignore lookup errors
  }

  const contextPrompt = `You are a business analyst assistant specialized in Odoo ERP data. Produce a concise, professional summary of the query results.

Original Query: "${originalQuery}"
Model Used: ${modelInfo}
Results (JSON): ${JSON.stringify(rawResults, null, 2)}

Instructions:
- Provide key insights and patterns (1-4 sentences).
- Format numeric values as USD where appropriate.
- Mention top items (max 5) and include counts.
- Provide one short actionable recommendation if applicable.
- Keep the response concise and business-friendly.`;

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          { role: "system", content: "You are a business analyst assistant specializing in ERP data interpretation." },
          { role: "user", content: contextPrompt },
        ],
        max_tokens: 700,
        temperature: 0.6,
      }),
    });

    if (!resp.ok) {
      // fallback to basic
      return formatResultsBasic(rawResults, originalQuery, modelUsed);
    }

    const j = await resp.json();
    const content = j?.choices?.[0]?.message?.content;
    if (!content) return formatResultsBasic(rawResults, originalQuery, modelUsed);
    return content.trim();
  } catch {
    return formatResultsBasic(rawResults, originalQuery, modelUsed);
  }
}

export default formatResultsNaturally;