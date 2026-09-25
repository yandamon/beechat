import type { AddressInfo } from 'node:net';
import type {
  ClientToServerEvents,
  FriendView,
  PublicUser,
  SendMessageAck,
  SendMessagePayload,
  ServerToClientEvents,
} from '@beechat/shared';
import { type Socket, io as connect } from 'socket.io-client';
import { expect } from 'vitest';
import { SESSION_COOKIE } from '../modules/auth/session.service';
import type { TestApp } from './create-test-app';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface TestUser {
  user: PublicUser;
  token: string;
  cookies: Record<string, string>;
}

export async function registerUser(ctx: TestApp, username: string): Promise<TestUser> {
  const response = await ctx.app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username, password: 'password123', inviteCode: 'test-invite' },
  });
  expect(response.statusCode).toBe(201);
  const token = response.cookies.find((cookie) => cookie.name === SESSION_COOKIE)?.value;
  if (!token) throw new Error('register did not set a session cookie');
  return { user: response.json().user, token, cookies: { [SESSION_COOKIE]: token } };
}

export async function listen(ctx: TestApp): Promise<string> {
  await ctx.app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = ctx.app.server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

export function connectAs(url: string, user: TestUser): ClientSocket {
  return connect(url, {
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: { cookie: `${SESSION_COOKIE}=${user.token}` },
  });
}

export function waitForConnect(socket: ClientSocket) {
  return new Promise<void>((resolve, reject) => {
    if (socket.connected) {
      resolve();
      return;
    }
    socket.once('connect', () => resolve());
    socket.once('connect_error', (error) => reject(error));
  });
}

export function waitForEvent<E extends keyof ServerToClientEvents>(
  socket: ClientSocket,
  event: E,
  timeoutMs = 3000,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
    const handler = (payload: Parameters<ServerToClientEvents[E]>[0]) => {
      clearTimeout(timer);
      resolve(payload);
    };
    socket.once(event, handler as never);
  });
}

/** 断言在一段时间内没有收到某个事件 */
export async function expectNoEvent(
  socket: ClientSocket,
  event: keyof ServerToClientEvents,
  waitMs = 300,
) {
  let received = false;
  const handler = () => {
    received = true;
  };
  socket.on(event, handler as never);
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  socket.off(event, handler as never);
  expect(received).toBe(false);
}

export function sendMessage(socket: ClientSocket, payload: SendMessagePayload) {
  return new Promise<SendMessageAck>((resolve) => socket.emit('message:send', payload, resolve));
}

/** 走完整的申请与接受流程，返回两人之间的私聊会话 ID */
export async function becomeFriends(
  ctx: TestApp,
  requester: TestUser,
  recipient: TestUser,
): Promise<number> {
  const created = await ctx.app.inject({
    method: 'POST',
    url: '/api/friends/requests',
    cookies: requester.cookies,
    payload: { userId: recipient.user.id },
  });
  expect(created.statusCode).toBe(201);
  const accepted = await ctx.app.inject({
    method: 'POST',
    url: `/api/friends/requests/${created.json().request.id}/accept`,
    cookies: recipient.cookies,
  });
  expect(accepted.statusCode).toBe(200);
  const friends = await ctx.app.inject({
    method: 'GET',
    url: '/api/friends',
    cookies: requester.cookies,
  });
  const friend = (friends.json().friends as FriendView[]).find(
    (entry) => entry.id === recipient.user.id,
  );
  if (!friend?.conversationId) throw new Error('friendship did not create a conversation');
  return friend.conversationId;
}
