import { randomUUID } from 'node:crypto';
import type { ConversationView } from '@beechat/shared';
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

describe('groups', () => {
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
  const createGroup = (as: TestUser, name: string, memberIds: number[]) =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/conversations',
      cookies: as.cookies,
      payload: { type: 'group', name, memberIds },
    });
  const getConversation = async (as: TestUser, id: number) =>
    ctx.app.inject({ method: 'GET', url: `/api/conversations/${id}`, cookies: as.cookies });
  const text = (conversationId: number, content: string) => ({
    conversationId,
    clientId: randomUUID(),
    type: 'text' as const,
    content,
  });

  it('creates a group with the creator as owner, notifies members and lets any member post', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const carol = await registerUser(ctx, 'carol');
    await becomeFriends(ctx, alice, bob);
    await becomeFriends(ctx, alice, carol);
    const bobSocket = await open(bob);

    const updated = waitForEvent(bobSocket, 'conversation:updated');
    const response = await createGroup(alice, '周末小队', [bob.user.id, carol.user.id]);
    expect(response.statusCode).toBe(201);
    const group: ConversationView = response.json().conversation;
    expect(group).toMatchObject({ type: 'group', name: '周末小队', peer: null, unreadCount: 0 });
    expect(group.members).toHaveLength(3);
    expect(group.members.find((member) => member.id === alice.user.id)?.role).toBe('owner');

    const event = await updated;
    expect(event.id).toBe(group.id);
    expect(event.unreadCount).toBe(1);
    expect(event.lastMessage?.type).toBe('system');
    expect(event.lastMessage?.content).toContain('创建了群聊');

    // bob 和 carol 不是好友，但在群里可以发消息
    const carolSocket = await open(carol);
    const incoming = waitForEvent(carolSocket, 'message:new');
    const ack = await sendMessage(bobSocket, text(group.id, '大家好'));
    expect(ack.ok).toBe(true);
    expect((await incoming).content).toBe('大家好');
  });

  it('refuses non-friends and validates the member list', async () => {
    const alice = await registerUser(ctx, 'alice');
    const dave = await registerUser(ctx, 'dave');
    const notFriends = await createGroup(alice, '陌生人', [dave.user.id]);
    expect(notFriends.statusCode).toBe(403);
    expect(notFriends.json().code).toBe('NOT_FRIENDS');
    const empty = await createGroup(alice, '空群', []);
    expect(empty.statusCode).toBe(400);
    const selfOnly = await createGroup(alice, '自己', [alice.user.id]);
    expect(selfOnly.json().code).toBe('NO_MEMBERS');
  });

  it('only the owner can rename, and the rename is broadcast with a system message', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    await becomeFriends(ctx, alice, bob);
    const group: ConversationView = (await createGroup(alice, '旧名字', [bob.user.id])).json()
      .conversation;
    const bobSocket = await open(bob);

    const forbidden = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/conversations/${group.id}`,
      cookies: bob.cookies,
      payload: { name: '偷偷改' },
    });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().code).toBe('NOT_OWNER');

    const updated = waitForEvent(bobSocket, 'conversation:updated');
    const renamed = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/conversations/${group.id}`,
      cookies: alice.cookies,
      payload: { name: '新名字' },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().conversation.name).toBe('新名字');
    const event = await updated;
    expect(event.name).toBe('新名字');
    expect(event.lastMessage?.content).toContain('新名字');
  });

  it('members invite their own friends; kicked members lose access and are told', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const carol = await registerUser(ctx, 'carol');
    await becomeFriends(ctx, alice, bob);
    await becomeFriends(ctx, bob, carol);
    const group: ConversationView = (await createGroup(alice, '小队', [bob.user.id])).json()
      .conversation;
    const carolSocket = await open(carol);

    // alice 和 carol 不是好友，alice 不能拉她；bob 可以
    const byAlice = await ctx.app.inject({
      method: 'POST',
      url: `/api/conversations/${group.id}/members`,
      cookies: alice.cookies,
      payload: { userIds: [carol.user.id] },
    });
    expect(byAlice.json().code).toBe('NOT_FRIENDS');

    const joined = waitForEvent(carolSocket, 'conversation:updated');
    const byBob = await ctx.app.inject({
      method: 'POST',
      url: `/api/conversations/${group.id}/members`,
      cookies: bob.cookies,
      payload: { userIds: [carol.user.id] },
    });
    expect(byBob.statusCode).toBe(200);
    expect(byBob.json().conversation.members).toHaveLength(3);
    expect((await joined).members).toHaveLength(3);

    const bobKick = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/conversations/${group.id}/members/${carol.user.id}`,
      cookies: bob.cookies,
    });
    expect(bobKick.json().code).toBe('NOT_OWNER');

    const removed = waitForEvent(carolSocket, 'conversation:removed');
    const aliceKick = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/conversations/${group.id}/members/${carol.user.id}`,
      cookies: alice.cookies,
    });
    expect(aliceKick.statusCode).toBe(200);
    expect(await removed).toEqual({ conversationId: group.id });

    const ack = await sendMessage(carolSocket, text(group.id, '还在吗'));
    expect(ack).toMatchObject({ ok: false, code: 'NOT_A_MEMBER' });
    const list = await ctx.app.inject({
      method: 'GET',
      url: '/api/conversations',
      cookies: carol.cookies,
    });
    expect(list.json().conversations.map((entry: ConversationView) => entry.id)).not.toContain(
      group.id,
    );
  });

  it('leaving hands ownership to the earliest member and the last one out dissolves the group', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const carol = await registerUser(ctx, 'carol');
    await becomeFriends(ctx, alice, bob);
    await becomeFriends(ctx, alice, carol);
    const group: ConversationView = (
      await createGroup(alice, '接力', [bob.user.id, carol.user.id])
    ).json().conversation;
    const leave = (as: TestUser) =>
      ctx.app.inject({
        method: 'DELETE',
        url: `/api/conversations/${group.id}/members/${as.user.id}`,
        cookies: as.cookies,
      });

    expect((await leave(alice)).statusCode).toBe(200);
    const afterAlice: ConversationView = (await getConversation(bob, group.id)).json().conversation;
    expect(afterAlice.members).toHaveLength(2);
    expect(afterAlice.members.find((member) => member.id === bob.user.id)?.role).toBe('owner');
    expect(afterAlice.lastMessage?.content).toContain('群主已转让给 bob');

    expect((await leave(bob)).statusCode).toBe(200);
    const afterBob: ConversationView = (await getConversation(carol, group.id)).json().conversation;
    expect(afterBob.members.find((member) => member.id === carol.user.id)?.role).toBe('owner');

    expect((await leave(carol)).statusCode).toBe(200);
    const gone = await getConversation(carol, group.id);
    expect([403, 404]).toContain(gone.statusCode);
  });
});

describe('group avatar', () => {
  it('lets the owner set and clear the group avatar', async () => {
    const ctx = await createTestApp();
    await ctx.reset();
    try {
      const alice = await registerUser(ctx, 'alice');
      const bob = await registerUser(ctx, 'bob');
      await becomeFriends(ctx, alice, bob);
      const group: ConversationView = (
        await ctx.app.inject({
          method: 'POST',
          url: '/api/conversations',
          cookies: alice.cookies,
          payload: { type: 'group', name: '有头像的群', memberIds: [bob.user.id] },
        })
      ).json().conversation;

      const signed = await ctx.app.inject({
        method: 'POST',
        url: '/api/uploads/presign',
        cookies: alice.cookies,
        payload: { kind: 'avatar', mime: 'image/webp', size: 256, width: 256, height: 256 },
      });
      const { key } = signed.json();
      await ctx.app.inject({
        method: 'PUT',
        url: `/api/uploads/local/${key}`,
        cookies: alice.cookies,
        headers: { 'content-type': 'image/webp' },
        payload: Buffer.alloc(256, 9),
      });
      await ctx.app.inject({
        method: 'POST',
        url: '/api/uploads/complete',
        cookies: alice.cookies,
        payload: { key },
      });

      const byBob = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/conversations/${group.id}`,
        cookies: bob.cookies,
        payload: { avatarKey: key },
      });
      expect(byBob.statusCode).toBe(403);

      const updated = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/conversations/${group.id}`,
        cookies: alice.cookies,
        payload: { avatarKey: key },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json().conversation.avatarUrl).toBe(`/uploads/${key}`);
      expect(updated.json().conversation.lastMessage.content).toContain('更新了群头像');

      const cleared = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/conversations/${group.id}`,
        cookies: alice.cookies,
        payload: { avatarKey: null },
      });
      expect(cleared.json().conversation.avatarUrl).toBeNull();
    } finally {
      await ctx.close();
    }
  });
});
