/**
 * Lightweight client to communicate with the MCP Odoo relay server.
 *
 * - Provides a request() helper that adds the API key header, enforces a timeout,
 *   parses JSON and throws for non-OK responses.
 * - Exposes convenience functions for the endpoints used by the UI.
 *
 * Note: This file intentionally throws on network / HTTP errors so UI components
 * can show toasts / debug information as needed.
 */

export type RelayResult = any;

const DEFAULT_TIMEOUT = 15000; // 15s

async function request(
  relayHost: string,
  apiKey: string,
  path: string,
  body?: unknown,
  timeout = DEFAULT_TIMEOUT,
): Promise<RelayResult> {
  if (!relayHost) {
    throw new Error("Missing relayHost");
  }
  if (!apiKey) {
    throw new Error("Missing API key");
  }

  const url = `${relayHost.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
  };

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    // Try to parse JSON; if parsing fails we'll still handle it
    let result: any = null;
    try {
      result = await resp.json();
    } catch {
      // leave result as null
    }

    if (!resp.ok) {
      const message = result?.error || result?.message || `Request failed with status ${resp.status}`;
      const err: any = new Error(message);
      err.status = resp.status;
      err.result = result;
      throw err;
    }

    return result;
  } catch (err) {
    // Re-throw so UI can catch and show toasts; include cause where possible
    if ((err as any)?.name === "AbortError") {
      throw new Error("Request timed out");
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}

export async function executeMethod(
  relayHost: string,
  apiKey: string,
  model: string,
  method: string,
  args: any,
  kwargs: any,
) {
  return request(relayHost, apiKey, "/api/execute_method", {
    model,
    method,
    args,
    kwargs,
  });
}

export async function searchEmployee(
  relayHost: string,
  apiKey: string,
  name: string,
  limit: number,
) {
  return request(relayHost, apiKey, "/api/search_employee", { name, limit });
}

export async function analyzeSales(
  relayHost: string,
  apiKey: string,
  start_date: string,
  end_date: string,
  limit: number,
) {
  return request(relayHost, apiKey, "/api/sales/analyze", {
    start_date,
    end_date,
    limit,
  });
}