"use client";

import { ChatMessage } from "./MessageBubble";

/** RelayResult type for normalized POST responses */
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
    return "I couldn't find any matching employees.";
  }

  // If just one employee, produce a single-sentence description.
  if (results.length === 1) {
    const e = results[0];
    const parts: string[] = [];
    if (e.name) parts.push(e.name);
    if (Array.isArray(e.department_id) && e.department_id[1]) parts.push(`department ${e.department_id[1]}`);
    if (e.job_title) parts.push(e.job_title);
    if (e.work_email) parts.push(`email ${e.work_email}`);
    if (e.work_phone) parts.push(`phone ${e.work_phone}`);
    const sentence = parts.length > 0 ? parts.join(", ") : "Employee record found.";
    return `I found 1 employee: ${sentence}.`;
  }

  // Multiple employees: brief sentence plus up to 10 lines
  const lines = results.slice(0, 10).map((r: any) => {
    const name = r.name ?? "Unknown";
    const dept = Array.isArray(r.department_id) && r.department_id[1] ? ` (${r.department_id[1]})` : "";
    const email = r.work_email ? ` — ${r.work_email}` : "";
    const phone = r.work_phone ? ` — ${r.work_phone}` : "";
    return `${name}${dept}${email}${phone}`;
  });

  const suffix = results.length > 10 ? ` and ${results.length - 10} more` : "";
  return `I found ${results.length} employees${suffix}: \n• ${lines.join("\n• ")}`;
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

/** Summarize employee list using OpenAI (falls back to formatEmployeeSummary on error) */
export async function summarizeEmployeesWithAI(openaiKey: string | undefined, employees: any[]) {
  try {
    if (!openaiKey) throw new Error("No OpenAI API key provided");
    if (!employees || employees.length === 0) {
      return "I couldn't find any matching employees.";
    }

    const lines = employees.slice(0, 50).map((e: any) => {
      const dept = Array.isArray(e.department_id) && e.department_id[1] ? e.department_id[1] : null;
      const email = e.work_email ?? null;
      const phone = e.work_phone ?? null;
      const job = e.job_title ?? null;
      const details = [e.name, dept ? `dept: ${dept}` : null, job ? `job: ${job}` : null, email ? `email: ${email}` : null, phone ? `phone: ${phone}` : null]
        .filter(Boolean)
        .join(" | ");
      return `- ${details}`;
    }).join("\n");

    const prompt = `You are a helpful assistant. Here is a list of employees (up to 50):\n${lines}\n\nPlease produce a concise, human-friendly summary paragraph (1-3 sentences) describing who they are and any notable shared attributes (department, job title), and mention the total count. Keep it short.`;

    const content = await callOpenAIFallback(openaiKey, prompt, []);
    // Some responses may include extraneous whitespace; trim.
    return content.trim();
  } catch {
    // On any failure, fallback to the local formatter
    try {
      return formatEmployeeSummary(employees);
    } catch {
      return "I couldn't summarize the employee list.";
    }
  }
}

/**
 * Heuristics to detect whether a returned array likely contains employee records
 * (hr.employee) or partner/company records (res.partner). These are intentionally
 * conservative to avoid misclassifying employees as customers.
 */

export function isEmployeeLike(results: any): boolean {
  if (!Array.isArray(results) || results.length === 0) return false;
  // If a high percentage of items contain department_id, work_email, work_phone, or job_title, it's employee-like
  const sample = results.slice(0, 10);
  let score = 0;
  for (const item of sample) {
    if (!item || typeof item !== "object") continue;
    if (item.department_id !== undefined) score += 3;
    if (item.work_email !== undefined) score += 2;
    if (item.work_phone !== undefined) score += 1;
    if (item.job_title !== undefined) score += 2;
    // small penalty if object has 'is_company' or 'vat' (indicates partner)
    if (item.is_company || item.vat) score -= 3;
  }
  // threshold chosen to prefer avoiding false positives
  return score >= 4;
}

export function isPartnerLike(results: any): boolean {
  if (!Array.isArray(results) || results.length === 0) return false;
  const sample = results.slice(0, 10);
  let score = 0;
  for (const item of sample) {
    if (!item || typeof item !== "object") continue;
    if (item.is_company) score += 3;
    if (item.total_invoiced !== undefined || item.amount_total !== undefined) score += 3;
    if (item.customer_rank !== undefined || item.supplier_rank !== undefined) score += 2;
    if (item.vat || item.website) score += 1;
    // penalize presence of department_id or job_title
    if (item.department_id || item.job_title) score -= 3;
  }
  return score >= 3;
}

export default {
  postToRelay,
  postSearchEmployee,
  formatEmployeeSummary,
  runFallbackEmployeeSearch,
  callOpenAIFallback,
  summarizeEmployeesWithAI,
  isEmployeeLike,
  isPartnerLike,
};