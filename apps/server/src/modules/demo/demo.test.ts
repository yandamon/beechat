import { randomUUID } from 'node:crypto';
import type { ConversationView, MessageView } from '@beechat/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appSettings } from '../../db/schema';
import { type TestApp, createTestApp } from '../../test/create-test-app';
import { connectAs, sendMessage, waitForConnect, waitForEvent } from '../../test/helpers';
import { SESSION_COOKIE } from '../auth/session.service';

describe('demo account', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(() => ctx.reset());
  afterAll(() => ctx.close());

  const loginDemo = () => ctx.app.inject({ method: 'POST', url: '/api/auth/demo' });
  const cookieOf = (response: { cookies: { name: string; value: string }[] }) =>
    response.cookies.find((cookie) => cookie.name === SESSION_COOKIE)?.value ?? '';

  it('logs in as the demo user with seeded friends, a bot chat and a group with unread messages', async () => {
    const response = await loginDemo();
    expect(response.statusCode).toBe(200);
    expect(response.json().user).toMatchObject({ username: 'demo', displayName: '演示访客' });
    const cookies = { [SESSION_COOKIE]: cookieOf(response) };

    const friends = await ctx.app.inject({ method: 'GET', url: '/api/friends', cookies });
    expect(friends.json().friends.map((friend: { username: string }) => friend.username)).toEqual(
      expect.arrayContaining(['beebot', 'xiaoya', 'laowang']),
    );

    const conversations = await ctx.app.inject({
      method: 'GET',
      url: '/api/conversations',
      cookies,
    });
    const list: ConversationView[] = conversations.json().conversations;
    expect(list).toHaveLength(2);
    const group = list.find((entry) => entry.type === 'group');
    const direct = list.find((entry) => entry.type === 'direct');
    expect(group).toMatchObject({ name: '小蜜蜂交流群', unreadCount: 2 });
    expect(group?.members).toHaveLength(4);
    expect(direct).toMatchObject({ unreadCount: 0 });
    expect(direct?.peer?.username).toBe('beebot');
    expect(direct?.lastMessage?.content).toContain('新建群聊');
  });

  it('reuses the seeded data within a day and rebuilds it once it is stale', async () => {
    const first = await loginDemo();
    const firstId = first.json().user.id;
    const firstCookies = { [SESSION_COOKIE]: cookieOf(first) };

    const second = await loginDemo();
    expect(second.json().user.id).toBe(firstId);

    // 把上次重置时间改成两天前，下一次登录应当重建所有演示数据
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    await ctx.db
      .update(appSettings)
      .set({ value: twoDaysAgo })
      .where(eq(appSettings.key, 'demo_seeded_at'));

    const third = await loginDemo();
    expect(third.statusCode).toBe(200);
    expect(third.json().user.id).not.toBe(firstId);

    // 旧的演示会话随用户一起被删掉
    const stale = await ctx.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: firstCookies,
    });
    expect(stale.statusCode).toBe(401);

    const conversations = await ctx.app.inject({
      method: 'GET',
      url: '/api/conversations',
      cookies: { [SESSION_COOKIE]: cookieOf(third) },
    });
    expect(conversations.json().conversations).toHaveLength(2);
  });
});

describe('demo assistant', () => {
  it('replies in the demo direct chat after showing typing', async () => {
    const ctx = await createTestApp();
    await ctx.reset();
    await ctx.app.listen({ port: 0, host: '127.0.0.1' });
    try {
      const login = await ctx.app.inject({ method: 'POST', url: '/api/auth/demo' });
      const token = login.cookies.find((cookie) => cookie.name === SESSION_COOKIE)?.value ?? '';
      const conversations = await ctx.app.inject({
        method: 'GET',
        url: '/api/conversations',
        cookies: { [SESSION_COOKIE]: token },
      });
      const direct: ConversationView = conversations
        .json()
        .conversations.find((entry: ConversationView) => entry.type === 'direct');

      const { port } = ctx.app.server.address() as { port: number };
      const socket = connectAs(`http://127.0.0.1:${port}`, {
        user: login.json().user,
        token,
        cookies: { [SESSION_COOKIE]: token },
      });
      await waitForConnect(socket);

      const typing = waitForEvent(socket, 'typing');
      const replyPromise = new Promise<MessageView>((resolve) => {
        socket.on('message:new', (message) => {
          if (message.senderId === direct.peer?.id) resolve(message);
        });
      });
      const ack = await sendMessage(socket, {
        conversationId: direct.id,
        clientId: randomUUID(),
        type: 'text',
        content: '你好',
      });
      expect(ack.ok).toBe(true);
      expect((await typing).userId).toBe(direct.peer?.id);
      const reply = await replyPromise;
      expect(reply.content).toContain('小蜜蜂助手');
      socket.disconnect();
    } finally {
      await ctx.close();
    }
  });
});
