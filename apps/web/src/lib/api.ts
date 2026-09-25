import type {
  AddMembersInput,
  AuthResponse,
  ConversationView,
  CreateGroupConversationInput,
  CreateFriendRequestInput,
  FriendRequestView,
  FriendRequestsView,
  FriendView,
  LoginInput,
  MessagePage,
  RegisterInput,
  UserSearchResult,
} from '@beechat/shared';

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
  demo: () => api<AuthResponse>('/api/auth/demo', { method: 'POST' }),
  logout: () => api<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  logoutAll: () => api<{ ok: true }>('/api/auth/logout-all', { method: 'POST' }),
};

export const friendsApi = {
  search: (q: string) =>
    api<{ users: UserSearchResult[] }>(`/api/users/search?q=${encodeURIComponent(q)}`),
  list: () => api<{ friends: FriendView[] }>('/api/friends'),
  requests: () => api<FriendRequestsView>('/api/friends/requests'),
  sendRequest: (body: CreateFriendRequestInput) =>
    api<{ request: FriendRequestView }>('/api/friends/requests', { method: 'POST', body }),
  accept: (id: number) =>
    api<{ request: FriendRequestView }>(`/api/friends/requests/${id}/accept`, { method: 'POST' }),
  reject: (id: number) =>
    api<{ request: FriendRequestView }>(`/api/friends/requests/${id}/reject`, { method: 'POST' }),
  remove: (userId: number) => api<{ ok: true }>(`/api/friends/${userId}`, { method: 'DELETE' }),
};

export interface MessagesParams {
  before?: number;
  after?: number;
  limit?: number;
}

export const chatApi = {
  conversations: () => api<{ conversations: ConversationView[] }>('/api/conversations'),
  conversation: (id: number) => api<{ conversation: ConversationView }>(`/api/conversations/${id}`),
  openDirect: (userId: number) =>
    api<{ conversation: ConversationView }>('/api/conversations', {
      method: 'POST',
      body: { type: 'direct', userId },
    }),
  createGroup: (body: Omit<CreateGroupConversationInput, 'type'>) =>
    api<{ conversation: ConversationView }>('/api/conversations', {
      method: 'POST',
      body: { type: 'group', ...body },
    }),
  rename: (id: number, name: string) =>
    api<{ conversation: ConversationView }>(`/api/conversations/${id}`, {
      method: 'PATCH',
      body: { name },
    }),
  addMembers: (id: number, body: AddMembersInput) =>
    api<{ conversation: ConversationView }>(`/api/conversations/${id}/members`, {
      method: 'POST',
      body,
    }),
  removeMember: (id: number, userId: number) =>
    api<{ ok: true }>(`/api/conversations/${id}/members/${userId}`, { method: 'DELETE' }),
  messages: (id: number, params: MessagesParams) => {
    const search = new URLSearchParams();
    if (params.before !== undefined) search.set('before', String(params.before));
    if (params.after !== undefined) search.set('after', String(params.after));
    if (params.limit !== undefined) search.set('limit', String(params.limit));
    const query = search.toString();
    return api<MessagePage>(`/api/conversations/${id}/messages${query ? `?${query}` : ''}`);
  },
};
