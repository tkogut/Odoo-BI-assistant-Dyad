/**
 * formatResultsNaturally.ts
 *
 * Provide a business-friendly summary for raw Odoo RPC results.
 * If an OpenAI key is provided, call the API to produce a polished summary;
 * otherwise use a deterministic basic formatter.
 */

export async function formatResultsBasic(results: any, query: string, model?: string): Promise<string> {
  if (!results || (Array.isArray(results) && results.length === 0)) {
    return `No results found for "${query}".`;
  }

  if (Array.isArray(results)) {
    // Revenue/turnover results
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

    // Inventory results
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

    // Employee or generic object results
    return `Found ${results.length} results:\n\n${results
      .slice(0, 10)
      .map((item: any, i: number) => {
        const name = item.name ?? item.display_name ?? `Item ${item.id ?? i + 1}`;
        const extra =
          item.department_id && Array.isArray(item.department_id) ? ` (${item.department_id[1]})` : item.email ? ` — ${item.email}` : "";
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
  rawResults: any,
  modelUsed?: string,
): Promise<string> {
  if (!openaiKey) {
    return formatResultsBasic(rawResults, originalQuery, modelUsed);
  }

  const contextPrompt = `You are a business analyst assistant specialized in Odoo ERP data. Produce a concise, professional summary of the query results.

Original Query: "${originalQuery}"
Model Used: ${modelUsed || "unknown"}
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
      // Fall back to basic formatting
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