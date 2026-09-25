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

describe('friends', () => {
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
  const request = (from: TestUser, to: TestUser, message?: string) =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/friends/requests',
      cookies: from.cookies,
      payload: { userId: to.user.id, message },
    });
  const search = (as: TestUser, q: string) =>
    ctx.app.inject({ method: 'GET', url: `/api/users/search?q=${q}`, cookies: as.cookies });

  it('search returns each match with my relation to them', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const carol = await registerUser(ctx, 'carol_b');
    await becomeFriends(ctx, alice, bob);
    expect((await request(alice, carol)).statusCode).toBe(201);

    const asAlice = await search(alice, 'b');
    expect(asAlice.statusCode).toBe(200);
    const relations = Object.fromEntries(
      asAlice
        .json()
        .users.map((user: { username: string; relation: string }) => [
          user.username,
          user.relation,
        ]),
    );
    expect(relations).toEqual({ bob: 'friend', carol_b: 'pending_outgoing' });

    expect((await search(carol, 'alice')).json().users[0].relation).toBe('pending_incoming');
    expect((await search(carol, 'carol')).json().users[0].relation).toBe('self');
  });

  it('notifies the recipient and accepting creates the friendship, a conversation and a system message', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const bobSocket = await open(bob);
    const aliceSocket = await open(alice);

    const requestEvent = waitForEvent(bobSocket, 'friend:request');
    const created = await request(alice, bob, '我是 alice');
    expect(created.statusCode).toBe(201);
    expect(created.json().request.status).toBe('pending');
    const event = await requestEvent;
    expect(event.from.username).toBe('alice');
    expect(event.message).toBe('我是 alice');

    const pending = await ctx.app.inject({
      method: 'GET',
      url: '/api/friends/requests',
      cookies: bob.cookies,
    });
    expect(pending.json().incoming.map((entry: { id: number }) => entry.id)).toEqual([
      created.json().request.id,
    ]);
    expect(pending.json().outgoing).toEqual([]);

    const acceptedEvent = waitForEvent(aliceSocket, 'friend:accepted');
    const conversationEvent = waitForEvent(aliceSocket, 'conversation:updated');
    const accepted = await ctx.app.inject({
      method: 'POST',
      url: `/api/friends/requests/${created.json().request.id}/accept`,
      cookies: bob.cookies,
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().request.status).toBe('accepted');

    const friend = await acceptedEvent;
    expect(friend.username).toBe('bob');
    expect(friend.online).toBe(true);
    expect(friend.conversationId).toBeTypeOf('number');

    const conversation = await conversationEvent;
    expect(conversation.type).toBe('direct');
    expect(conversation.peer?.username).toBe('bob');
    expect(conversation.peer?.online).toBe(true);
    expect(conversation.lastMessage?.type).toBe('system');
    expect(conversation.unreadCount).toBe(1);

    const aliceFriends = await ctx.app.inject({
      method: 'GET',
      url: '/api/friends',
      cookies: alice.cookies,
    });
    expect(
      aliceFriends.json().friends.map((entry: { username: string }) => entry.username),
    ).toEqual(['bob']);
    const bobFriends = await ctx.app.inject({
      method: 'GET',
      url: '/api/friends',
      cookies: bob.cookies,
    });
    expect(bobFriends.json().friends[0]).toMatchObject({
      username: 'alice',
      conversationId: friend.conversationId,
    });
  });

  it('rejects self, duplicate, reverse and already-friends requests', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');

    expect((await request(alice, alice)).json().code).toBe('SELF_REQUEST');
    expect((await request(alice, bob)).statusCode).toBe(201);
    expect((await request(alice, bob)).json().code).toBe('REQUEST_PENDING');
    expect((await request(bob, alice)).json().code).toBe('REQUEST_INCOMING');

    await becomeFriends(ctx, bob, alice).catch(() => undefined);
    const pending = await ctx.app.inject({
      method: 'GET',
      url: '/api/friends/requests',
      cookies: bob.cookies,
    });
    const id = pending.json().incoming[0].id;
    await ctx.app.inject({
      method: 'POST',
      url: `/api/friends/requests/${id}/accept`,
      cookies: bob.cookies,
    });
    expect((await request(alice, bob)).json().code).toBe('ALREADY_FRIENDS');
  });

  it('rejecting leaves no friendship and clears the pending list', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const created = await request(alice, bob);
    const rejected = await ctx.app.inject({
      method: 'POST',
      url: `/api/friends/requests/${created.json().request.id}/reject`,
      cookies: bob.cookies,
    });
    expect(rejected.json().request.status).toBe('rejected');

    const friends = await ctx.app.inject({
      method: 'GET',
      url: '/api/friends',
      cookies: alice.cookies,
    });
    expect(friends.json().friends).toEqual([]);
    const pending = await ctx.app.inject({
      method: 'GET',
      url: '/api/friends/requests',
      cookies: bob.cookies,
    });
    expect(pending.json().incoming).toEqual([]);
    // 被拒后可以再次申请
    expect((await request(alice, bob)).statusCode).toBe(201);
  });

  it('removing a friend keeps the conversation but blocks new messages', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const conversationId = await becomeFriends(ctx, alice, bob);
    const bobSocket = await open(bob);

    const removedEvent = waitForEvent(bobSocket, 'friend:removed');
    const removed = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/friends/${bob.user.id}`,
      cookies: alice.cookies,
    });
    expect(removed.statusCode).toBe(200);
    expect(await removedEvent).toEqual({ userId: alice.user.id });

    const conversations = await ctx.app.inject({
      method: 'GET',
      url: '/api/conversations',
      cookies: alice.cookies,
    });
    expect(conversations.json().conversations).toHaveLength(1);

    const aliceSocket = await open(alice);
    const ack = await sendMessage(aliceSocket, {
      conversationId,
      clientId: randomUUID(),
      type: 'text',
      content: '还在吗',
    });
    expect(ack).toMatchObject({ ok: false, code: 'NOT_FRIENDS' });
  });
});
