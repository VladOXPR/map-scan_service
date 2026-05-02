const CUUB_API_BASE = process.env.CUUB_API_BASE || "https://api.cuub.tech";

interface ProxyOptions {
  path: string;
  method: "GET" | "POST" | "PATCH";
  headers?: Record<string, string>;
  body?: string;
}

export async function proxyCuub({ path, method, headers, body }: ProxyOptions) {
  const url = `${CUUB_API_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      ...(headers ?? {}),
    },
    body,
    cache: "no-store",
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (err) {
    return {
      status: 500,
      payload: { success: false, error: "Failed to parse API response" },
    };
  }
  return { status: res.status, payload: json };
}
