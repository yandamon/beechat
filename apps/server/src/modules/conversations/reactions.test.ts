import { randomUUID } from 'node:crypto';
import type { MessageView } from '@beechat/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

describe('message reactions', () => {
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
  const react = (as: TestUser, conversationId: number, messageId: number, emoji: string) =>
    ctx.app.inject({
      method: 'POST',
      url: `/api/conversations/${conversationId}/messages/${messageId}/reactions`,
      cookies: as.cookies,
      payload: { emoji },
    });

  it('toggles reactions, merges them per emoji and broadcasts the summary', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const conversationId = await becomeFriends(ctx, alice, bob);
    const aliceSocket = await open(alice);
    const bobSocket = await open(bob);

    const sent = await sendMessage(aliceSocket, {
      conversationId,
      clientId: randomUUID(),
      type: 'text',
      content: '今晚吃火锅？',
    });
    if (!sent.ok) throw new Error(sent.message);
    const messageId = sent.message.id;

    const broadcast = waitForEvent(aliceSocket, 'message:reactions');
    const first = await react(bob, conversationId, messageId, '👍');
    expect(first.statusCode).toBe(200);
    expect(first.json().reactions).toEqual([{ emoji: '👍', count: 1, userIds: [bob.user.id] }]);
    expect(await broadcast).toEqual({
      conversationId,
      messageId,
      reactions: [{ emoji: '👍', count: 1, userIds: [bob.user.id] }],
    });

    const second = await react(alice, conversationId, messageId, '👍');
    expect(second.json().reactions).toEqual([
      { emoji: '👍', count: 2, userIds: [bob.user.id, alice.user.id] },
    ]);
    const heart = await react(alice, conversationId, messageId, '❤️');
    expect(heart.json().reactions.map((entry: { emoji: string }) => entry.emoji)).toEqual([
      '👍',
      '❤️',
    ]);

    const removed = await react(bob, conversationId, messageId, '👍');
    expect(removed.json().reactions).toEqual([
      { emoji: '👍', count: 1, userIds: [alice.user.id] },
      { emoji: '❤️', count: 1, userIds: [alice.user.id] },
    ]);

    const history = await ctx.app.inject({
      method: 'GET',
      url: `/api/conversations/${conversationId}/messages`,
      cookies: bob.cookies,
    });
    const last: MessageView = history.json().messages.at(-1);
    expect(last.reactions).toHaveLength(2);

    expect((await react(bob, conversationId, messageId, '🐝')).statusCode).toBe(400);
    void bobSocket;
  });
});
