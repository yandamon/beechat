import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pushSubscriptions } from '../../db/schema';
import { type TestApp, createTestApp } from '../../test/create-test-app';
import {
  type ClientSocket,
  type TestUser,
  becomeFriends,
  connectAs,
  listen,
  registerUser,
  sendMessage,
  waitForConnect,
} from '../../test/helpers';
import type { PushPayload, PushSender } from './push.service';

const waitFor = async (predicate: () => Promise<boolean> | boolean, timeoutMs = 3000) => {
  const start = Date.now();
  while (!(await predicate())) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 200));

describe('web push', () => {
  let ctx: TestApp;
  let url: string;
  const sockets: ClientSocket[] = [];
  const sent: Array<{ endpoint: string; payload: PushPayload }> = [];
  let failWith: number | null = null;
  const sender: PushSender = async (subscription, payload) => {
    if (failWith !== null)
      throw Object.assign(new Error('push service error'), { statusCode: failWith });
    sent.push({ endpoint: subscription.endpoint, payload });
  };
  const keys = { p256dh: 'p256dh-key', auth: 'auth-secret' };

  beforeAll(async () => {
    // 每个用例都会重置数据库并复用同样的用户 id，在线状态的宽限期要短，否则上个用例的连接会让下个用例的人显得在线
    ctx = await createTestApp({
      presenceGraceMs: 50,
      push: {
        vapid: {
          publicKey: 'test-public-key',
          privateKey: 'test-private-key',
          subject: 'https://example.test',
        },
        sender,
      },
    });
    url = await listen(ctx);
  });
  beforeEach(async () => {
    sent.length = 0;
    failWith = null;
    await ctx.reset();
  });
  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.disconnect();
  });
  afterAll(() => ctx.close());

  const open = async (user: TestUser) => {
    const socket = connectAs(url, user);
    sockets.push(socket);
    await waitForConnect(socket);
    return socket;
  };
  const subscribe = (as: TestUser, payload: Record<string, unknown>) =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/push/subscriptions',
      cookies: as.cookies,
      payload,
    });
  const unsubscribe = (as: TestUser, endpoint: string) =>
    ctx.app.inject({
      method: 'DELETE',
      url: '/api/push/subscriptions',
      cookies: as.cookies,
      payload: { endpoint },
    });
  const text = (conversationId: number, content: string) => ({
    conversationId,
    clientId: randomUUID(),
    type: 'text' as const,
    content,
  });

  it('exposes the public key and keeps one row per device', async () => {
    const alice = await registerUser(ctx, 'alice');
    const key = await ctx.app.inject({ method: 'GET', url: '/api/push/public-key' });
    expect(key.json()).toEqual({ publicKey: 'test-public-key' });

    const endpoint = 'https://push.example/alice-phone';
    expect((await subscribe(alice, { endpoint, keys })).statusCode).toBe(201);
    const renewed = { p256dh: 'new-p256dh', auth: 'new-auth' };
    expect((await subscribe(alice, { endpoint, keys: renewed })).statusCode).toBe(201);
    const rows = await ctx.db.select().from(pushSubscriptions);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: alice.user.id, endpoint, ...renewed });
    expect((await subscribe(alice, { endpoint: 'not-a-url', keys })).statusCode).toBe(400);

    expect((await unsubscribe(alice, endpoint)).statusCode).toBe(200);
    expect(await ctx.db.$count(pushSubscriptions)).toBe(0);

    // 退出所有设备时订阅一起清掉
    await subscribe(alice, { endpoint, keys });
    const logoutAll = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/logout-all',
      cookies: alice.cookies,
    });
    expect(logoutAll.statusCode).toBe(200);
    expect(await ctx.db.$count(pushSubscriptions)).toBe(0);
  });

  it('pushes new messages to offline members, skipping muted and online ones', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const conversationId = await becomeFriends(ctx, alice, bob);
    await subscribe(bob, { endpoint: 'https://push.example/bob', keys });
    const aliceSocket = await open(alice);

    const ack = await sendMessage(aliceSocket, text(conversationId, '晚上吃什么'));
    expect(ack.ok).toBe(true);
    await waitFor(() => sent.length === 1);
    expect(sent[0]).toEqual({
      endpoint: 'https://push.example/bob',
      payload: {
        title: 'alice',
        body: '晚上吃什么',
        url: `/c/${conversationId}`,
        tag: `conversation-${conversationId}`,
      },
    });

    // bob 开了免打扰：不推
    const setMuted = (muted: boolean) =>
      ctx.app.inject({
        method: 'PATCH',
        url: `/api/conversations/${conversationId}/membership`,
        cookies: bob.cookies,
        payload: { muted },
      });
    expect((await setMuted(true)).statusCode).toBe(200);
    await sendMessage(aliceSocket, text(conversationId, '第二条'));
    await settle();
    expect(sent).toHaveLength(1);

    // bob 在线：不推
    await setMuted(false);
    await open(bob);
    await sendMessage(aliceSocket, text(conversationId, '第三条'));
    await settle();
    expect(sent).toHaveLength(1);
  });

  it('removes subscriptions the push service reports as gone', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const conversationId = await becomeFriends(ctx, alice, bob);
    await subscribe(bob, { endpoint: 'https://push.example/bob-old', keys });
    failWith = 410;
    const aliceSocket = await open(alice);
    await sendMessage(aliceSocket, text(conversationId, '还在吗'));
    await waitFor(async () => (await ctx.db.$count(pushSubscriptions)) === 0);
    expect(sent).toHaveLength(0);
  });
});
