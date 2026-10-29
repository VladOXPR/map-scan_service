import type {
  ApiEnvelope,
  BatteryResponse,
  MapboxTokenResponse,
  StationsResponse,
} from "../types";

export class ApiError extends Error {
  status: number;
  /** Machine-readable refusal code from cuub-api (e.g. SUBSCRIPTION_REQUIRED). */
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ApiRequestOptions = Omit<RequestInit, "body" | "method"> & {
  token?: string | null;
  body?: unknown;
};

export interface ApiResult<T> {
  data: T;
  count?: number;
  message?: string;
}

type Envelope<T> = ApiEnvelope<T> & { code?: string };

async function parseEnvelope<T>(path: string, response: Response): Promise<Envelope<T>> {
  const text = await response.text();
  try {
    return text ? (JSON.parse(text) as Envelope<T>) : { success: false };
  } catch {
    throw new ApiError(`Invalid JSON from ${path} (${response.status})`, response.status);
  }
}

export interface CuubApiClient {
  get<T>(path: string, options?: ApiRequestOptions): Promise<ApiResult<T>>;
  post<T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "body">): Promise<ApiResult<T>>;
  put<T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "body">): Promise<ApiResult<T>>;
  patch<T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "body">): Promise<ApiResult<T>>;
  delete<T>(path: string, options?: Omit<ApiRequestOptions, "body">): Promise<ApiResult<T>>;
}

/** One finished request; `status` 0 means the network failed before a response. */
export interface ApiRequestInfo {
  method: HttpMethod;
  path: string;
  status: number;
  latencyMs: number;
  ok: boolean;
  errorCode?: string;
}

/** cuub-api envelope client: `{ success, data }` or `{ success: false, error }`. */
export function createApiClient(config: {
  baseUrl: () => string;
  observe?: (info: ApiRequestInfo) => void;
}): CuubApiClient {
  function observe(info: ApiRequestInfo): void {
    try {
      config.observe?.(info);
    } catch {
      // Observers are diagnostics only.
    }
  }

  async function request<T>(
    method: HttpMethod,
    path: string,
    options: ApiRequestOptions = {}
  ): Promise<ApiResult<T>> {
    const { token, body, headers, ...rest } = options;
    const url = `${config.baseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetch(url, {
        ...rest,
        method,
        headers: {
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...((headers as Record<string, string> | undefined) ?? {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      observe({ method, path, status: 0, latencyMs: Date.now() - startedAt, ok: false });
      throw error;
    }

    let json: Envelope<T>;
    try {
      json = await parseEnvelope<T>(path, response);
    } catch (error) {
      observe({ method, path, status: response.status, latencyMs: Date.now() - startedAt, ok: false });
      throw error;
    }
    const ok = response.ok && Boolean(json.success);
    observe({
      method,
      path,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      ok,
      errorCode: ok ? undefined : json.code,
    });
    if (!ok) {
      throw new ApiError(
        json.error || json.message || `Request failed (${response.status})`,
        response.status,
        json.code
      );
    }
    return { data: json.data as T, count: json.count, message: json.message };
  }

  return {
    get: (path, options) => request("GET", path, options),
    post: (path, body, options) => request("POST", path, { ...options, body }),
    put: (path, body, options) => request("PUT", path, { ...options, body }),
    patch: (path, body, options) => request("PATCH", path, { ...options, body }),
    delete: (path, options) => request("DELETE", path, options),
  };
}

export function isAuthFailure(error: unknown): boolean {
  // 404: hard-deleted account — an old JWT can no longer resolve /app/me
  return (
    error instanceof ApiError &&
    (error.status === 401 || error.status === 403 || error.status === 404)
  );
}

export interface CuubClientConfig {
  baseUrl?: string;
}

/** The website's own Next.js API routes (/api/*), used by its client components. */
export class CuubClient {
  private baseUrl: string;

  constructor(config: CuubClientConfig = {}) {
    this.baseUrl = (config.baseUrl ?? "").replace(/\/$/, "");
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  async getMapboxToken(): Promise<string | null> {
    const res = await fetch(this.url("/api/mapbox-token"));
    const data = (await res.json()) as MapboxTokenResponse;
    if ("token" in data && data.token) return data.token;
    return null;
  }

  async getStations(): Promise<StationsResponse> {
    const res = await fetch(this.url("/api/stations"));
    return (await res.json()) as StationsResponse;
  }

  async getBattery(stickerId: string): Promise<BatteryResponse> {
    const res = await fetch(this.url(`/api/battery/${encodeURIComponent(stickerId)}`));
    return (await res.json()) as BatteryResponse;
  }

  async createScanRecord(
    stickerId: string,
    manufactureId: string,
    stickerType: string = "type one"
  ): Promise<BatteryResponse> {
    const res = await fetch(this.url(`/api/battery/${encodeURIComponent(stickerId)}`), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        manufacture_id: manufactureId,
        sticker_type: stickerType,
      },
      body: JSON.stringify({}),
    });
    return (await res.json()) as BatteryResponse;
  }

  async patchBatterySizl(stickerId: string, manufactureId: string): Promise<BatteryResponse> {
    const res = await fetch(this.url(`/api/battery/${encodeURIComponent(stickerId)}`), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        manufacture_id: manufactureId,
      },
      body: JSON.stringify({ sizl: true }),
    });
    return (await res.json()) as BatteryResponse;
  }

  /** Record Get App / App Store tap (server proxies to POST /battery/:id/app). */
  async recordAppTap(stickerId: string): Promise<BatteryResponse> {
    const res = await fetch(this.url(`/api/battery/${encodeURIComponent(stickerId)}/app`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app: true }),
      keepalive: true,
    });
    return (await res.json()) as BatteryResponse;
  }
}
