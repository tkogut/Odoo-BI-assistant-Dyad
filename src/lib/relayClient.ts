export type JsonValue = unknown;

const DEFAULT_TIMEOUT = 15000;

async function postJSON(
  url: string,
  apiKey: string,
  body: unknown,
  timeout = DEFAULT_TIMEOUT,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: controller.signal,
  });

  clearTimeout(timer);

  // Attempt to parse JSON body; if parsing fails, throw a generic error
  let parsed: JsonValue | null = null;
  try {
    parsed = await resp.json().catch(() => null);
  } catch {
    parsed = null;
  }

  if (!resp.ok) {
    const message =
      (parsed && typeof parsed === "object" && (parsed as any).error) ||
      (parsed && typeof parsed === "object" && (parsed as any).message) ||
      `Request failed with status ${resp.status}`;
    throw new Error(String(message));
  }

  return parsed;
}

/**
 * Analyze sales between start_date and end_date.
 * Body: { start_date, end_date, limit }
 */
export async function analyzeSales(relayHost: string, apiKey: string, payload: unknown) {
  if (!relayHost) throw new Error("relayHost is required");
  return postJSON(`${relayHost.replace(/\/$/, "")}/api/sales/analyze`, apiKey, payload);
}

/**
 * Search employees.
 * Body: { name, limit }
 */
export async function searchEmployee(relayHost: string, apiKey: string, payload: unknown) {
  if (!relayHost) throw new Error("relayHost is required");
  return postJSON(`${relayHost.replace(/\/$/, "")}/api/search_employee`, apiKey, payload);
}

/**
 * Execute arbitrary method.
 * Body: { model, method, args, kwargs }
 */
export async function executeMethod(relayHost: string, apiKey: string, payload: unknown) {
  if (!relayHost) throw new Error("relayHost is required");
  return postJSON(`${relayHost.replace(/\/$/, "")}/api/execute_method`, apiKey, payload);
}