"use client";

import { ChatMessage } from "./MessageBubble";

export type RelayResult = {
  ok: boolean;
  status?: number;
  parsed?: any | null;
  text?: string | null;
  error?: string;
};

/** Generic POST helper that tries to parse JSON and returns a normalized result. */
export async function postToRelay(url: string, payload: any, apiKey?: string, timeoutMs = 30000): Promise<RelayResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "X-API-Key": apiKey } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const text = await resp.text().catch(() => "");
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    return { ok: resp.ok, status: resp.status, parsed, text };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  } finally {
    clearTimeout(timeout);
  }
}

/** Preferred endpoint: POST /api/search_employee (supports optional department). */
export async function postSearchEmployee(relayHost: string, apiKey?: string, name?: string, limit = 20, dept?: string) {
  const url = `${relayHost.replace(/\/$/, "")}/api/search_employee`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const body: any = { limit };
    if (name) body.name = name;
    if (dept) body.department = dept;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "X-API-Key": apiKey } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const json = await resp.json().catch(() => null);
    return { ok: resp.ok, parsed: json, status: resp.status, text: json ? JSON.stringify(json) : null };
  } catch (err: any) {
    clearTimeout(timeout);
    return { ok: false, error: err?.message || String(err) };
  }
}

/** Format employee array into readable summary text. */
export function formatEmployeeSummary(results: any[]) {
  if (!results || results.length === 0) {
    return "No matching employees were found.";
  }
  const lines = results.slice(0, 50).map((r: any) => {
    const dept = r.department_id ? ` (${r.department_id[1]})` : "";
    const email = r.work_email ? ` — ${r.work_email}` : "";
    const phone = r.work_phone ? ` — ${r.work_phone}` : "";
    return `• ${r.name}${dept}${email}${phone}`;
  });
  return `Found ${results.length} employee(s):\n` + lines.join("\n");
}

/** Fallback employee search via execute_method (hr.employee search_read by name). */
export async function runFallbackEmployeeSearch(relayHost: string, apiKey: string | undefined, userMessage: string) {
  const url = `${relayHost.replace(/\/$/, "")}/api/execute_method`;
  const payload = {
    model: "hr.employee",
    method: "search_read",
    args: [[["name", "ilike", userMessage]]],
    kwargs: { fields: ["name", "work_email", "work_phone", "department_id"], limit: 10 },
  };

  const res = await postToRelay(url, payload, apiKey, 15000);
  if (res.ok && res.parsed && res.parsed.success) {
    return formatEmployeeSummary(res.parsed.result);
  }

  if (res.parsed && Array.isArray(res.parsed)) {
    return formatEmployeeSummary(res.parsed);
  }
  if (res.text) {
    return `Fallback employee search attempted but relay returned non-JSON response: ${res.text.slice(0, 500)}`;
  }
  return `Fallback employee search failed (HTTP ${res.status}).`;
}

/** OpenAI fallback (caller provides openaiKey) */
export async function callOpenAIFallback(openaiKey: string | undefined, userMessageText: string, historyMessages: ChatMessage[]) {
  if (!openaiKey) throw new Error("No OpenAI API key provided");
  const url = "https://api.openai.com/v1/chat/completions";
  const messagesPayload = [
    {
      role: "system",
      content:
        "You are an Odoo BI assistant. If the relay does not provide the ai.assistant model, try to answer concisely based on the user's question and, when appropriate, indicate that this response was generated via an external LLM fallback.",
    },
    ...historyMessages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessageText },
  ];
  const body = {
    model: "gpt-3.5-turbo",
    messages: messagesPayload,
    temperature: 0.2,
    max_tokens: 800,
    n: 1,
  };

  const resp = await fetch(url, {
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
  return content as string;
}