import { randomUUID } from 'node:crypto';
import type { ConversationView, MessageView } from '@beechat/shared';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { messages } from '../../db/schema';
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
  waitForEvent,
} from '../../test/helpers';

describe('read receipts and recall', () => {
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
  const recall = (as: TestUser, conversationId: number, messageId: number) =>
    ctx.app.inject({
      method: 'POST',
      url: `/api/conversations/${conversationId}/messages/${messageId}/recall`,
      cookies: as.cookies,
    });

  it('tells the sender when the peer has read, and exposes the peer read position', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const conversationId = await becomeFriends(ctx, alice, bob);
    const aliceSocket = await open(alice);
    const bobSocket = await open(bob);

    const sent = await sendMessage(aliceSocket, text(conversationId, '看到了吗'));
    if (!sent.ok) throw new Error(sent.message);

    const readByPeer = waitForEvent(aliceSocket, 'conversation:read');
    bobSocket.emit('conversation:read', { conversationId, messageId: sent.message.id });
    expect(await readByPeer).toEqual({
      conversationId,
      userId: bob.user.id,
      messageId: sent.message.id,
    });

    const list = await ctx.app.inject({
      method: 'GET',
      url: '/api/conversations',
      cookies: alice.cookies,
    });
    const [view]: ConversationView[] = list.json().conversations;
    expect(view?.peerLastReadMessageId).toBe(sent.message.id);
  });

  it('recalls a fresh own message for everyone, but not others’ or old messages', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const conversationId = await becomeFriends(ctx, alice, bob);
    const aliceSocket = await open(alice);
    const bobSocket = await open(bob);

    const sent = await sendMessage(aliceSocket, text(conversationId, '发错了'));
    if (!sent.ok) throw new Error(sent.message);

    const updated = waitForEvent(bobSocket, 'message:updated');
    const recalled = await recall(alice, conversationId, sent.message.id);
    expect(recalled.statusCode).toBe(200);
    expect(recalled.json().message).toMatchObject({ id: sent.message.id, content: null });
    expect(recalled.json().message.deletedAt).toBeTypeOf('string');
    expect((await updated).content).toBeNull();

    const history = await ctx.app.inject({
      method: 'GET',
      url: `/api/conversations/${conversationId}/messages`,
      cookies: bob.cookies,
    });
    const last: MessageView = history.json().messages.at(-1);
    expect(last).toMatchObject({ id: sent.message.id, content: null });
    expect(last.deletedAt).toBeTypeOf('string');

    const list = await ctx.app.inject({
      method: 'GET',
      url: '/api/conversations',
      cookies: bob.cookies,
    });
    const [view]: ConversationView[] = list.json().conversations;
    expect(view?.lastMessage?.id).toBe(sent.message.id);
    expect(view?.unreadCount).toBe(1);

    const bobsTry = await sendMessage(bobSocket, text(conversationId, '我的'));
    if (!bobsTry.ok) throw new Error(bobsTry.message);
    expect((await recall(alice, conversationId, bobsTry.message.id)).json().code).toBe(
      'NOT_SENDER',
    );

    await ctx.db
      .update(messages)
      .set({ createdAt: new Date(Date.now() - 3 * 60_000) })
      .where(eq(messages.id, bobsTry.message.id));
    expect((await recall(bob, conversationId, bobsTry.message.id)).json().code).toBe(
      'RECALL_WINDOW_PASSED',
    );
  });
});
