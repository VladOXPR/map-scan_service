import { getApiBaseUrl } from './config';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type Envelope<T> = {
  success: boolean;
  data?: T;
  count?: number;
  error?: string;
  message?: string;
};

type ApiRequestOptions = Omit<RequestInit, 'body' | 'method'> & {
  token?: string | null;
  body?: unknown;
};

async function parseEnvelope<T>(
  path: string,
  response: Response,
): Promise<Envelope<T>> {
  const text = await response.text();
  try {
    return text ? (JSON.parse(text) as Envelope<T>) : { success: false };
  } catch {
    throw new ApiError(
      `Invalid JSON from ${path} (${response.status})`,
      response.status,
    );
  }
}

async function apiRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  options: ApiRequestOptions = {},
): Promise<{ data: T; count?: number; message?: string }> {
  const { token, body, headers, ...rest } = options;
  const url = `${getApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;

  const response = await fetch(url, {
    ...rest,
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers ?? {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json = await parseEnvelope<T>(path, response);

  if (!response.ok || !json.success) {
    throw new ApiError(
      json.error || json.message || `Request failed (${response.status})`,
      response.status,
    );
  }

  return { data: json.data as T, count: json.count, message: json.message };
}

export function apiGet<T>(path: string, options?: ApiRequestOptions) {
  return apiRequest<T>('GET', path, options);
}

export function apiPost<T>(
  path: string,
  body?: unknown,
  options?: Omit<ApiRequestOptions, 'body'>,
) {
  return apiRequest<T>('POST', path, { ...options, body });
}

export function apiPut<T>(
  path: string,
  body?: unknown,
  options?: Omit<ApiRequestOptions, 'body'>,
) {
  return apiRequest<T>('PUT', path, { ...options, body });
}

export function apiDelete<T>(
  path: string,
  options?: Omit<ApiRequestOptions, 'body'>,
) {
  return apiRequest<T>('DELETE', path, options);
}

export function isAuthFailure(error: unknown): boolean {
  // 404: hard-deleted account — old JWT can no longer resolve /app/me
  return (
    error instanceof ApiError &&
    (error.status === 401 || error.status === 403 || error.status === 404)
  );
}
