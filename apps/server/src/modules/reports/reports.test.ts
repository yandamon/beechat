import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { reports } from '../../db/schema';
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

describe('reports', () => {
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

  const report = (as: TestUser, payload: Record<string, unknown>) =>
    ctx.app.inject({ method: 'POST', url: '/api/reports', cookies: as.cookies, payload });
  const say = async (as: TestUser, conversationId: number, content: string) => {
    const socket = connectAs(url, as);
    sockets.push(socket);
    await waitForConnect(socket);
    const ack = await sendMessage(socket, {
      conversationId,
      clientId: randomUUID(),
      type: 'text',
      content,
    });
    if (!ack.ok) throw new Error(`send failed: ${ack.code}`);
    return ack.message;
  };

  it('records a report about a message with a snapshot and ignores duplicates', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const conversationId = await becomeFriends(ctx, alice, bob);
    const message = await say(bob, conversationId, '加我微信有好货');

    const first = await report(alice, {
      targetUserId: bob.user.id,
      messageId: message.id,
      reason: 'spam',
      detail: '广告',
    });
    expect(first.statusCode).toBe(201);
    const { id } = first.json().report;
    const [row] = await ctx.app.ctx.db.select().from(reports).where(eq(reports.id, id));
    expect(row).toMatchObject({
      reporterId: alice.user.id,
      targetUserId: bob.user.id,
      messageId: message.id,
      reason: 'spam',
      detail: '广告',
      snapshot: '加我微信有好货',
    });

    const again = await report(alice, {
      targetUserId: bob.user.id,
      messageId: message.id,
      reason: 'other',
    });
    expect(again.statusCode).toBe(201);
    expect(again.json().report.id).toBe(id);
    expect(await ctx.app.ctx.db.$count(reports)).toBe(1);
  });

  it('validates the target, the message and the reporter', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const carol = await registerUser(ctx, 'carol');
    const conversationId = await becomeFriends(ctx, alice, bob);
    const message = await say(alice, conversationId, '你好');

    expect((await report(alice, { targetUserId: alice.user.id, reason: 'spam' })).json().code).toBe(
      'SELF_REPORT',
    );
    expect((await report(alice, { targetUserId: 9999, reason: 'spam' })).statusCode).toBe(404);
    expect((await report(alice, { targetUserId: bob.user.id, reason: 'nope' })).statusCode).toBe(
      400,
    );

    // 消息确实是 alice 发的：可以；说成是 carol 发的：不行
    const valid = await report(bob, {
      targetUserId: alice.user.id,
      messageId: message.id,
      reason: 'harassment',
    });
    expect(valid.statusCode).toBe(201);
    const mismatch = await report(bob, {
      targetUserId: carol.user.id,
      messageId: message.id,
      reason: 'harassment',
    });
    expect(mismatch.json().code).toBe('MESSAGE_SENDER_MISMATCH');

    // carol 不在这个会话里，看不到也举报不了这条消息
    const outsider = await report(carol, {
      targetUserId: alice.user.id,
      messageId: message.id,
      reason: 'harassment',
    });
    expect([403, 404]).toContain(outsider.statusCode);
    const missing = await report(carol, {
      targetUserId: alice.user.id,
      messageId: 424242,
      reason: 'harassment',
    });
    expect(missing.statusCode).toBe(404);

    // 不带消息，直接举报一个用户
    expect((await report(carol, { targetUserId: alice.user.id, reason: 'other' })).statusCode).toBe(
      201,
    );
  });
});
