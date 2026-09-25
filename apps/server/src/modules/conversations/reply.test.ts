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
} from '../../test/helpers';

describe('quoted replies', () => {
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

  it('attaches a preview of the quoted message and hydrates it in history', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const conversationId = await becomeFriends(ctx, alice, bob);
    const aliceSocket = await open(alice);
    const bobSocket = await open(bob);

    const original = await sendMessage(aliceSocket, {
      conversationId,
      clientId: randomUUID(),
      type: 'text',
      content: '周末去哪玩？',
    });
    if (!original.ok) throw new Error(original.message);

    const reply = await sendMessage(bobSocket, {
      conversationId,
      clientId: randomUUID(),
      type: 'text',
      content: '爬山吧',
      replyToId: original.message.id,
    });
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    expect(reply.message.replyTo).toEqual({
      id: original.message.id,
      senderId: alice.user.id,
      type: 'text',
      content: '周末去哪玩？',
      deleted: false,
    });

    const history = await ctx.app.inject({
      method: 'GET',
      url: `/api/conversations/${conversationId}/messages`,
      cookies: alice.cookies,
    });
    const last: MessageView = history.json().messages.at(-1);
    expect(last.replyTo?.id).toBe(original.message.id);
    expect(last.replyTo?.content).toBe('周末去哪玩？');
  });

  it('rejects quoting a message from another conversation', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const carol = await registerUser(ctx, 'carol');
    const withBob = await becomeFriends(ctx, alice, bob);
    const withCarol = await becomeFriends(ctx, alice, carol);
    const aliceSocket = await open(alice);

    const elsewhere = await sendMessage(aliceSocket, {
      conversationId: withCarol,
      clientId: randomUUID(),
      type: 'text',
      content: '这是另一边的消息',
    });
    if (!elsewhere.ok) throw new Error(elsewhere.message);

    const ack = await sendMessage(aliceSocket, {
      conversationId: withBob,
      clientId: randomUUID(),
      type: 'text',
      content: '引用错地方',
      replyToId: elsewhere.message.id,
    });
    expect(ack).toMatchObject({ ok: false, code: 'REPLY_NOT_FOUND' });
  });
});
