import type { InviteListResponse, InviteView } from '@beechat/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type TestApp, createTestApp } from '../../test/create-test-app';
import { type TestUser, createInviteCode, registerUser } from '../../test/helpers';
import { promoteAdmins } from '../admin/admins.service';

describe('invite codes (admin)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(() => ctx.reset());
  afterAll(() => ctx.close());

  const list = (as: TestUser, status?: string) =>
    ctx.app.inject({
      method: 'GET',
      url: status ? `/api/admin/invites?status=${status}` : '/api/admin/invites',
      cookies: as.cookies,
    });
  const create = (as: TestUser, payload: Record<string, unknown>) =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/admin/invites',
      cookies: as.cookies,
      payload,
    });
  const revoke = (as: TestUser, id: number) =>
    ctx.app.inject({
      method: 'POST',
      url: `/api/admin/invites/${id}/revoke`,
      cookies: as.cookies,
    });
  const signup = (username: string, inviteCode: string) =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username, password: 'password123', inviteCode },
    });

  it('is closed to everyone but admins, before any validation runs', async () => {
    const bob = await registerUser(ctx, 'bob');
    expect((await ctx.app.inject({ method: 'GET', url: '/api/admin/invites' })).statusCode).toBe(
      401,
    );
    expect((await list(bob)).statusCode).toBe(403);
    // 参数是错的，但普通用户看到的仍然是“没权限”而不是校验错误
    const forbidden = await create(bob, { count: 0 });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json()).toMatchObject({ code: 'FORBIDDEN' });
    expect((await revoke(bob, 1)).statusCode).toBe(403);
  });

  it('creates a batch of formatted, unique codes and lists them newest first with counts', async () => {
    const admin = await registerUser(ctx, 'root', { admin: true });
    const response = await create(admin, { count: 3, note: '  闲鱼订单 123  ', expiresInDays: 7 });
    expect(response.statusCode).toBe(201);
    const created: InviteView[] = response.json().invites;
    expect(created).toHaveLength(3);
    expect(new Set(created.map((invite) => invite.code)).size).toBe(3);
    for (const invite of created) {
      expect(invite.code).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
      expect(invite).toMatchObject({
        status: 'unused',
        note: '闲鱼订单 123',
        createdBy: { id: admin.user.id, username: 'root' },
        usedBy: null,
      });
      const days = (new Date(invite.expiresAt!).getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(6.9);
      expect(days).toBeLessThan(7.1);
    }

    const listed: InviteListResponse = (await list(admin)).json();
    // 管理员自己注册用掉的那个排在最后
    expect(listed.invites.map((invite) => invite.id).slice(0, 3)).toEqual(
      created.map((invite) => invite.id).reverse(),
    );
    expect(listed.counts).toEqual({ unused: 3, used: 1, revoked: 0, expired: 0 });

    expect((await create(admin, { count: 0 })).statusCode).toBe(400);
    expect((await create(admin, { count: 101 })).statusCode).toBe(400);
    expect((await create(admin, { count: 1, note: 'x'.repeat(101) })).statusCode).toBe(400);
  });

  it('shows who used a code, and keeps the username after that account is deleted', async () => {
    const admin = await registerUser(ctx, 'root', { admin: true });
    const [invite]: InviteView[] = (await create(admin, { count: 1 })).json().invites;
    const registered = await signup('carol', invite!.code);
    expect(registered.statusCode).toBe(201);
    const carolId: number = registered.json().user.id;
    const cookie = registered.cookies.find((entry) => entry.name === 'beechat_session')!;

    const used: InviteListResponse = (await list(admin, 'used')).json();
    expect(used.invites.find((entry) => entry.id === invite!.id)).toMatchObject({
      status: 'used',
      usedBy: { id: carolId, username: 'carol', displayName: 'carol' },
    });

    const deleted = await ctx.app.inject({
      method: 'DELETE',
      url: '/api/auth/me',
      cookies: { beechat_session: cookie.value },
      payload: { password: 'password123' },
    });
    expect(deleted.statusCode).toBe(200);
    const after: InviteListResponse = (await list(admin, 'used')).json();
    expect(after.invites.find((entry) => entry.id === invite!.id)).toMatchObject({
      status: 'used',
      usedBy: { id: null, username: 'carol', displayName: null },
    });
  });

  it('revokes unused codes only, and a revoked code cannot register', async () => {
    const admin = await registerUser(ctx, 'root', { admin: true });
    const [first, second]: InviteView[] = (await create(admin, { count: 2 })).json().invites;

    const revoked = await revoke(admin, first!.id);
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().invite).toMatchObject({ id: first!.id, status: 'revoked' });
    // 再作废一次不报错
    expect((await revoke(admin, first!.id)).statusCode).toBe(200);
    expect((await signup('dave', first!.code)).json()).toMatchObject({
      code: 'INVITE_CODE_REVOKED',
    });

    expect((await signup('erin', second!.code)).statusCode).toBe(201);
    const used = await revoke(admin, second!.id);
    expect(used.statusCode).toBe(400);
    expect(used.json()).toMatchObject({ code: 'INVITE_ALREADY_USED' });

    expect((await revoke(admin, 99999)).statusCode).toBe(404);
  });

  it('filters by status and counts every status', async () => {
    const admin = await registerUser(ctx, 'root', { admin: true });
    await createInviteCode(ctx, { note: 'fresh' });
    await createInviteCode(ctx, { note: 'gone', revokedAt: new Date() });
    await createInviteCode(ctx, { note: 'late', expiresAt: new Date(Date.now() - 1000) });

    const notes = async (status: string) =>
      ((await list(admin, status)).json() as InviteListResponse).invites.map(
        (invite) => invite.note,
      );
    expect(await notes('unused')).toEqual(['fresh']);
    expect(await notes('revoked')).toEqual(['gone']);
    expect(await notes('expired')).toEqual(['late']);
    expect(await notes('used')).toEqual([null]);

    const all: InviteListResponse = (await list(admin)).json();
    expect(all.invites).toHaveLength(4);
    expect(all.counts).toEqual({ unused: 1, used: 1, revoked: 1, expired: 1 });
    expect((await list(admin, 'bogus')).statusCode).toBe(400);
  });

  it('promotes the usernames listed in ADMIN_USERNAMES and ignores unknown ones', async () => {
    const carol = await registerUser(ctx, 'carol');
    expect((await list(carol)).statusCode).toBe(403);

    expect(await promoteAdmins(ctx.db, ['carol', 'ghost'])).toEqual(['carol']);
    // 已经是管理员的不会重复算
    expect(await promoteAdmins(ctx.db, ['carol'])).toEqual([]);

    // 角色每次请求都从库里读，不用重新登录
    expect((await list(carol)).statusCode).toBe(200);
    const me = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', cookies: carol.cookies });
    expect(me.json().user.role).toBe('admin');
  });
});
