"use client";

export async function interpretWithOpenAI(openaiKey: string | undefined, userText: string) {
  if (!openaiKey) {
    throw new Error("No OpenAI API key provided");
  }

  const systemPrompt = `
You are a translator from natural language to a JSON-RPC payload for an Odoo-style relay.
Only output valid JSON (no extra text). The JSON must contain the keys:
  - "model" (string)
  - "method" (string)
  - "args" (array)
  - "kwargs" (object)

Example:
Q: List recent sales orders this month.
A: {"model":"sale.order","method":"search_read","args":[[["date_order",">=","2025-09-01"]]],"kwargs":{"fields":["id","name","amount_total"]}}

If you cannot map the query to a specific model/method, return an object with an "error" key explaining why: {"error":"explanation"}
`;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userText },
  ];

  const body = {
    model: "gpt-3.5-turbo",
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

  // Attempt to extract JSON object from assistant text (strip surrounding triple-backticks etc.)
  let jsonText = content.trim();

  // Remove code fences if present
  if (jsonText.startsWith("```")) {
    const fenceEnd = jsonText.lastIndexOf("```");
    if (fenceEnd > 3) {
      jsonText = jsonText.slice(jsonText.indexOf("\n") + 1, fenceEnd).trim();
    }
  }

  // Find first { and last } to grab JSON object if assistant added commentary
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

  // If assistant explicitly returned error object, forward that as rejection
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
    throw new Error("Parsed JSON missing required keys or wrong types (expect: model:string, method:string, args:array, kwargs:object).");
  }

  return {
    model: parsed.model,
    method: parsed.method,
    args: parsed.args,
    kwargs: parsed.kwargs,
  };
}

export default interpretWithOpenAI;