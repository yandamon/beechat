export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiInit = Omit<RequestInit, 'headers'> & { headers?: Record<string, string> };

/** 同源 JSON 请求封装。Cookie 会随请求自动带上。 */
export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const { headers, ...rest } = init;
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...rest,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      /* 响应不是 JSON 时沿用状态文本 */
    }
    throw new ApiError(response.status, message);
  }

  return (await response.json()) as T;
}

export interface Health {
  status: 'ok';
  name: string;
  env: string;
  time: string;
}

export const fetchHealth = () => api<Health>('/api/health');
