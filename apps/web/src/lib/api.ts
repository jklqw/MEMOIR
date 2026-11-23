export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

interface ApiResponseEnvelope<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = endpoint.startsWith('/') ? endpoint : `/api/v1/${endpoint}`;

  const defaultHeaders: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.body && typeof options.body === 'string') {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...options,
    credentials: 'include', // Send and receive HttpOnly session cookies
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  });

  const contentType = response.headers.get('content-type');
  let data: ApiResponseEnvelope<T> | undefined;

  if (contentType?.includes('application/json')) {
    data = (await response.json()) as ApiResponseEnvelope<T>;
  }

  if (!response.ok) {
    const rawRecord = data as unknown as Record<string, unknown> | undefined;
    const errorMessage =
      data?.error?.message ||
      (rawRecord && 'message' in rawRecord
        ? String(rawRecord.message)
        : `Request failed with status ${response.status}`);
    const errorCode = data?.error?.code || 'API_ERROR';
    throw new ApiClientError(errorMessage, errorCode, response.status);
  }

  // Handle standard { success: true, data: ... } envelope or raw JSON
  if (data && 'success' in data && data.data !== undefined) {
    return data.data;
  }

  return (data as unknown as T) ?? ({} as T);
}

export const api = {
  get: <T>(endpoint: string, options?: RequestInit) =>
    request<T>(endpoint, { method: 'GET', ...options }),

  post: <T>(endpoint: string, body?: unknown, options?: RequestInit) =>
    request<T>(endpoint, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...options,
    }),

  delete: <T>(endpoint: string, options?: RequestInit) =>
    request<T>(endpoint, { method: 'DELETE', ...options }),
};
