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
  waitForConnect,
  waitForEvent,
} from '../../test/helpers';
import { SESSION_COOKIE } from './session.service';

describe('account deletion', () => {
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
  const deleteMe = (as: TestUser, password: string) =>
    ctx.app.inject({
      method: 'DELETE',
      url: '/api/auth/me',
      cookies: as.cookies,
      payload: { password },
    });

  it('requires the right password and refuses demo accounts', async () => {
    const alice = await registerUser(ctx, 'alice');
    expect((await deleteMe(alice, 'wrong-password')).json().code).toBe('INVALID_PASSWORD');

    const demo = await ctx.app.inject({ method: 'POST', url: '/api/auth/demo' });
    const token = demo.cookies.find((cookie) => cookie.name === SESSION_COOKIE)?.value ?? '';
    const refused = await ctx.app.inject({
      method: 'DELETE',
      url: '/api/auth/me',
      cookies: { [SESSION_COOKIE]: token },
      payload: { password: 'password123' },
    });
    expect(refused.json().code).toBe('DEMO_PROTECTED');
  });

  it('removes the user, their direct chats and group memberships', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const carol = await registerUser(ctx, 'carol');
    const directId = await becomeFriends(ctx, alice, bob);
    await becomeFriends(ctx, alice, carol);
    const group: ConversationView = (
      await ctx.app.inject({
        method: 'POST',
        url: '/api/conversations',
        cookies: alice.cookies,
        payload: { type: 'group', name: '接力', memberIds: [bob.user.id, carol.user.id] },
      })
    ).json().conversation;

    const bobSocket = await open(bob);
    const removed = waitForEvent(bobSocket, 'conversation:removed');

    const deleted = await deleteMe(alice, 'password123');
    expect(deleted.statusCode).toBe(200);
    expect(await removed).toEqual({ conversationId: directId });

    const me = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', cookies: alice.cookies });
    expect(me.statusCode).toBe(401);

    const bobConversations: ConversationView[] = (
      await ctx.app.inject({ method: 'GET', url: '/api/conversations', cookies: bob.cookies })
    ).json().conversations;
    expect(bobConversations.map((entry) => entry.id)).not.toContain(directId);
    const groupForBob = bobConversations.find((entry) => entry.id === group.id);
    expect(groupForBob?.members).toHaveLength(2);
    expect(groupForBob?.members.find((member) => member.id === bob.user.id)?.role).toBe('owner');

    const search = await ctx.app.inject({
      method: 'GET',
      url: '/api/users/search?q=alice',
      cookies: bob.cookies,
    });
    expect(search.json().users).toEqual([]);
  });
});
