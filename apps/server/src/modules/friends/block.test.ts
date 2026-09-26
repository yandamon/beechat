import { randomUUID } from 'node:crypto';
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

describe('blocking', () => {
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
  const block = (as: TestUser, userId: number) =>
    ctx.app.inject({ method: 'POST', url: `/api/friends/${userId}/block`, cookies: as.cookies });
  const unblock = (as: TestUser, userId: number) =>
    ctx.app.inject({ method: 'DELETE', url: `/api/friends/${userId}/block`, cookies: as.cookies });
  const request = (from: TestUser, to: TestUser) =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/friends/requests',
      cookies: from.cookies,
      payload: { userId: to.user.id },
    });

  it('blocking ends the friendship, stops messages and requests, and unblocking allows a new request', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const conversationId = await becomeFriends(ctx, alice, bob);
    const bobSocket = await open(bob);
    const aliceSocket = await open(alice);

    const removedForBob = waitForEvent(bobSocket, 'friend:removed');
    expect((await block(alice, bob.user.id)).statusCode).toBe(200);
    expect(await removedForBob).toEqual({ userId: alice.user.id });

    const blocked = await ctx.app.inject({
      method: 'GET',
      url: '/api/friends/blocked',
      cookies: alice.cookies,
    });
    expect(blocked.json().blocked.map((entry: { username: string }) => entry.username)).toEqual([
      'bob',
    ]);
    const friendsOfBob = await ctx.app.inject({
      method: 'GET',
      url: '/api/friends',
      cookies: bob.cookies,
    });
    expect(friendsOfBob.json().friends).toEqual([]);

    // 双方都不能再发消息
    const text = (content: string) => ({
      conversationId,
      clientId: randomUUID(),
      type: 'text' as const,
      content,
    });
    expect(await sendMessage(bobSocket, text('在吗'))).toMatchObject({
      ok: false,
      code: 'NOT_FRIENDS',
    });
    expect(await sendMessage(aliceSocket, text('…'))).toMatchObject({
      ok: false,
      code: 'NOT_FRIENDS',
    });

    // 被拉黑的一方申请被拒，拉黑的一方要先解除
    expect((await request(bob, alice)).json().code).toBe('BLOCKED');
    expect((await request(alice, bob)).json().code).toBe('BLOCKED_BY_ME');

    const search = await ctx.app.inject({
      method: 'GET',
      url: '/api/users/search?q=bob',
      cookies: alice.cookies,
    });
    expect(search.json().users[0].relation).toBe('blocked');
    const reverse = await ctx.app.inject({
      method: 'GET',
      url: '/api/users/search?q=alice',
      cookies: bob.cookies,
    });
    expect(reverse.json().users[0].relation).toBe('none');

    expect((await unblock(alice, bob.user.id)).statusCode).toBe(200);
    expect((await unblock(alice, bob.user.id)).statusCode).toBe(404);
    expect((await request(bob, alice)).statusCode).toBe(201);
  });
});
