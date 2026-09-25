import type { AuthResponse, LoginInput, RegisterInput } from '@beechat/shared';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiInit = Omit<RequestInit, 'headers' | 'body'> & {
  headers?: Record<string, string>;
  /** 会被 JSON 序列化；没有 body 的请求不带 Content-Type */
  body?: unknown;
};

/** 同源 JSON 请求封装。Cookie 会随请求自动带上。 */
export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const { headers, body, ...rest } = init;
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...rest,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let message = response.statusText || '请求失败';
    let code: string | undefined;
    try {
      const payload = (await response.json()) as { message?: string; code?: string };
      if (payload.message) message = payload.message;
      code = payload.code;
    } catch {
      /* 响应不是 JSON 时沿用状态文本 */
    }
    throw new ApiError(response.status, message, code);
  }

  return (await response.json()) as T;
}

export interface Health {
  status: 'ok' | 'degraded';
  name: string;
  env: string;
  db: 'ok' | 'error';
  time: string;
}

export const fetchHealth = () => api<Health>('/api/health');

export const authApi = {
  me: () => api<AuthResponse>('/api/auth/me'),
  login: (body: LoginInput) => api<AuthResponse>('/api/auth/login', { method: 'POST', body }),
  register: (body: RegisterInput) =>
    api<AuthResponse>('/api/auth/register', { method: 'POST', body }),
  logout: () => api<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  logoutAll: () => api<{ ok: true }>('/api/auth/logout-all', { method: 'POST' }),
};
