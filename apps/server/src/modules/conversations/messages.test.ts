import { randomUUID } from 'node:crypto';
import type { ConversationView, MessageView } from '@beechat/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type TestApp, createTestApp } from '../../test/create-test-app';
import {
  type ClientSocket,
  type TestUser,
  becomeFriends,
  connectAs,
  expectNoEvent,
  listen,
  registerUser,
  sendMessage,
  waitForConnect,
  waitForEvent,
} from '../../test/helpers';

describe('messages and realtime', () => {
  let ctx: TestApp;
  let url: string;
  const sockets: ClientSocket[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
    url = await listen(ctx);
  });
  beforeEach(() => ctx.reset());
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
  const text = (conversationId: number, content: string) => ({
    conversationId,
    clientId: randomUUID(),
    type: 'text' as const,
    content,
  });
  const listConversations = async (as: TestUser): Promise<ConversationView[]> =>
    (await ctx.app.inject({ method: 'GET', url: '/api/conversations', cookies: as.cookies })).json()
      .conversations;
  const history = async (as: TestUser, conversationId: number, query = '') =>
    (
      await ctx.app.inject({
        method: 'GET',
        url: `/api/conversations/${conversationId}/messages${query}`,
        cookies: as.cookies,
      })
    ).json() as { messages: MessageView[]; hasMore: boolean };

  it('sends with an ack, broadcasts to the peer and is idempotent by clientId', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const conversationId = await becomeFriends(ctx, alice, bob);
    const aliceSocket = await open(alice);
    const bobSocket = await open(bob);

    const incoming = waitForEvent(bobSocket, 'message:new');
    const payload = text(conversationId, '你好');
    const ack = await sendMessage(aliceSocket, payload);
    expect(ack.ok).toBe(true);
    if (!ack.ok) return;
    expect(ack.message).toMatchObject({ content: '你好', senderId: alice.user.id, type: 'text' });
    expect((await incoming).id).toBe(ack.message.id);

    const retry = await sendMessage(aliceSocket, payload);
    expect(retry.ok && retry.message.id).toBe(ack.message.id);
    const page = await history(bob, conversationId);
    expect(page.messages.map((message) => message.type)).toEqual(['system', 'text']);
  });

  it('rejects sending to a conversation the user is not part of', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const carol = await registerUser(ctx, 'carol');
    const conversationId = await becomeFriends(ctx, alice, bob);
    const carolSocket = await open(carol);
    const ack = await sendMessage(carolSocket, text(conversationId, '偷听'));
    expect(ack).toMatchObject({ ok: false, code: 'NOT_A_MEMBER' });
  });

  it('lists conversations with the last message and per-member unread counts, and read sync clears them', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const conversationId = await becomeFriends(ctx, alice, bob);
    const aliceSocket = await open(alice);
    await sendMessage(aliceSocket, text(conversationId, '第一条'));
    const last = await sendMessage(aliceSocket, text(conversationId, '第二条'));
    if (!last.ok) throw new Error(last.message);

    const [aliceView] = await listConversations(alice);
    expect(aliceView).toMatchObject({
      unreadCount: 0,
      lastMessage: { content: '第二条' },
      peer: { username: 'bob' },
    });
    const [bobView] = await listConversations(bob);
    // 系统消息加两条文本
    expect(bobView?.unreadCount).toBe(3);

    const bobSocket = await open(bob);
    const bobSecondTab = await open(bob);
    const synced = waitForEvent(bobSecondTab, 'conversation:read');
    bobSocket.emit('conversation:read', { conversationId, messageId: last.message.id });
    expect(await synced).toEqual({
      conversationId,
      userId: bob.user.id,
      messageId: last.message.id,
    });
    const [bobAfter] = await listConversations(bob);
    expect(bobAfter).toMatchObject({ unreadCount: 0, lastReadMessageId: last.message.id });
  });

  it('paginates history with before and after cursors', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const conversationId = await becomeFriends(ctx, alice, bob);
    const aliceSocket = await open(alice);
    const sent: MessageView[] = [];
    for (const content of ['一', '二', '三']) {
      const ack = await sendMessage(aliceSocket, text(conversationId, content));
      if (!ack.ok) throw new Error(ack.message);
      sent.push(ack.message);
    }

    const latest = await history(bob, conversationId, '?limit=2');
    expect(latest.messages.map((message) => message.content)).toEqual(['二', '三']);
    expect(latest.hasMore).toBe(true);

    const earlier = await history(bob, conversationId, `?limit=2&before=${sent[1]?.id}`);
    expect(earlier.messages.map((message) => message.type)).toEqual(['system', 'text']);
    expect(earlier.messages[1]?.content).toBe('一');
    expect(earlier.hasMore).toBe(false);

    const missed = await history(bob, conversationId, `?after=${sent[0]?.id}`);
    expect(missed.messages.map((message) => message.content)).toEqual(['二', '三']);
    expect(missed.hasMore).toBe(false);
  });

  it('relays typing to the other member but not back to the sender', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const conversationId = await becomeFriends(ctx, alice, bob);
    const aliceSocket = await open(alice);
    const bobSocket = await open(bob);

    const typing = waitForEvent(bobSocket, 'typing');
    aliceSocket.emit('typing:start', { conversationId });
    expect(await typing).toEqual({ conversationId, userId: alice.user.id, isTyping: true });
    await expectNoEvent(aliceSocket, 'typing');
  });

  it('broadcasts presence to friends on connect and after the grace period on disconnect', async () => {
    const local = await createTestApp({ presenceGraceMs: 100 });
    const localUrl = await listen(local);
    try {
      await local.reset();
      const alice = await registerUser(local, 'alice');
      const bob = await registerUser(local, 'bob');
      await becomeFriends(local, alice, bob);
      const bobSocket = connectAs(localUrl, bob);
      await waitForConnect(bobSocket);

      const online = waitForEvent(bobSocket, 'presence');
      const aliceSocket = connectAs(localUrl, alice);
      await waitForConnect(aliceSocket);
      expect(await online).toEqual({ userId: alice.user.id, online: true, lastSeenAt: null });

      const offline = waitForEvent(bobSocket, 'presence', 2000);
      aliceSocket.disconnect();
      const event = await offline;
      expect(event).toMatchObject({ userId: alice.user.id, online: false });
      expect(event.lastSeenAt).toBeTypeOf('string');

      const friends = await local.app.inject({
        method: 'GET',
        url: '/api/friends',
        cookies: bob.cookies,
      });
      expect(friends.json().friends[0]).toMatchObject({ username: 'alice', online: false });
      bobSocket.disconnect();
    } finally {
      await local.close();
    }
  });
});
