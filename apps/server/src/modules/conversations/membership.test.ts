import type { ConversationView } from '@beechat/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type TestApp, createTestApp } from '../../test/create-test-app';
import { type TestUser, becomeFriends, registerUser } from '../../test/helpers';

describe('pinned and muted conversations', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(() => ctx.reset());
  afterAll(() => ctx.close());

  const list = async (as: TestUser): Promise<ConversationView[]> =>
    (await ctx.app.inject({ method: 'GET', url: '/api/conversations', cookies: as.cookies })).json()
      .conversations;
  const patchMembership = (as: TestUser, id: number, body: Record<string, boolean>) =>
    ctx.app.inject({
      method: 'PATCH',
      url: `/api/conversations/${id}/membership`,
      cookies: as.cookies,
      payload: body,
    });

  it('pins a conversation to the top and remembers mute, per member only', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const carol = await registerUser(ctx, 'carol');
    const withBob = await becomeFriends(ctx, alice, bob);
    const withCarol = await becomeFriends(ctx, alice, carol);

    // 最近有消息的排前面：carol 的会话更新
    expect((await list(alice)).map((entry) => entry.id)).toEqual([withCarol, withBob]);

    const pinned = await patchMembership(alice, withBob, { pinned: true, muted: true });
    expect(pinned.statusCode).toBe(200);
    expect(pinned.json().conversation).toMatchObject({ id: withBob, pinned: true, muted: true });

    expect((await list(alice)).map((entry) => entry.id)).toEqual([withBob, withCarol]);
    // bob 那边不受影响
    expect((await list(bob))[0]).toMatchObject({ id: withBob, pinned: false, muted: false });

    const unpinned = await patchMembership(alice, withBob, { pinned: false });
    expect(unpinned.json().conversation).toMatchObject({ pinned: false, muted: true });
    expect((await list(alice)).map((entry) => entry.id)).toEqual([withCarol, withBob]);

    const empty = await patchMembership(alice, withBob, {});
    expect(empty.statusCode).toBe(400);
    const notMember = await patchMembership(carol, withBob, { pinned: true });
    expect(notMember.statusCode).toBe(403);
  });
});
