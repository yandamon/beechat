import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inviteCodes } from '../../db/schema';
import { type TestApp, createTestApp } from '../../test/create-test-app';
import { createInviteCode } from '../../test/helpers';
import { SESSION_COOKIE } from './session.service';

const PASSWORD = 'password123';

describe('auth', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(() => ctx.reset());

  afterAll(() => ctx.close());

  const register = (payload: Record<string, unknown>) =>
    ctx.app.inject({ method: 'POST', url: '/api/auth/register', payload });
  /** 每次注册都要一个没用过的邀请码 */
  const signup = async (overrides: Record<string, unknown> = {}) =>
    register({
      username: 'alice',
      password: PASSWORD,
      inviteCode: await createInviteCode(ctx),
      ...overrides,
    });
  const login = (payload: Record<string, unknown>) =>
    ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload });
  const sessionCookieOf = (response: { cookies: { name: string; value: string }[] }) =>
    response.cookies.find((cookie) => cookie.name === SESSION_COOKIE);
  const me = (token?: string) =>
    ctx.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: token ? { [SESSION_COOKIE]: token } : {},
    });

  describe('register', () => {
    it('creates the user, normalizes the username and sets a session cookie', async () => {
      const response = await signup({ username: '  Alice ' });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        user: { username: 'alice', displayName: 'alice', avatarUrl: null, role: 'user' },
      });
      expect(response.json().user).not.toHaveProperty('passwordHash');

      const cookie = sessionCookieOf(response);
      expect(cookie).toMatchObject({ httpOnly: true, path: '/' });
      expect(cookie?.value.length).toBeGreaterThan(30);
    });

    it('rejects an invite code that does not exist', async () => {
      const response = await signup({ inviteCode: 'nope' });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'INVALID_INVITE_CODE' });
    });

    it('lets an invite code register exactly one account and records who used it', async () => {
      const code = await createInviteCode(ctx);
      const first = await signup({ inviteCode: code });
      expect(first.statusCode).toBe(201);

      const second = await signup({ username: 'bob', inviteCode: code });
      expect(second.statusCode).toBe(403);
      expect(second.json()).toMatchObject({ code: 'INVITE_CODE_USED' });
      expect((await login({ username: 'bob', password: PASSWORD })).statusCode).toBe(401);

      const [row] = await ctx.db.select().from(inviteCodes).where(eq(inviteCodes.code, code));
      expect(row).toMatchObject({ usedBy: first.json().user.id, usedByUsername: 'alice' });
      expect(row?.usedAt).toBeInstanceOf(Date);
    });

    it('accepts the code in lower case and with separators', async () => {
      const code = await createInviteCode(ctx);
      const typed = ` ${code.slice(0, 4)}-${code.slice(4, 8)} ${code.slice(8)} `.toLowerCase();
      expect((await signup({ inviteCode: typed })).statusCode).toBe(201);
    });

    it('rejects revoked and expired codes with their own messages', async () => {
      const revoked = await createInviteCode(ctx, { revokedAt: new Date() });
      const expired = await createInviteCode(ctx, { expiresAt: new Date(Date.now() - 1000) });
      const stillValid = await createInviteCode(ctx, {
        expiresAt: new Date(Date.now() + 60_000),
      });

      expect((await signup({ inviteCode: revoked })).json()).toMatchObject({
        code: 'INVITE_CODE_REVOKED',
      });
      expect((await signup({ inviteCode: expired })).json()).toMatchObject({
        code: 'INVITE_CODE_EXPIRED',
      });
      expect((await signup({ inviteCode: stillValid })).statusCode).toBe(201);
    });

    it('gives the code to only one of two simultaneous registrations', async () => {
      const code = await createInviteCode(ctx);
      const responses = await Promise.all([
        signup({ username: 'alice', inviteCode: code }),
        signup({ username: 'bob', inviteCode: code }),
      ]);
      expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 403]);
      expect(await ctx.db.$count(inviteCodes, eq(inviteCodes.code, code))).toBe(1);
    });

    it('rejects a duplicate username regardless of case and keeps the code unused', async () => {
      await signup();
      const code = await createInviteCode(ctx);
      const response = await signup({ username: 'ALICE', inviteCode: code });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'USERNAME_TAKEN' });

      // 注册没成功，邀请码还能给下一个人用
      expect((await signup({ username: 'bob', inviteCode: code })).statusCode).toBe(201);
    });

    it('returns the validation message for an invalid username', async () => {
      const response = await signup({ username: 'a-b' });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION' });
      expect(response.json().message).toContain('用户名');
    });
  });

  describe('login and me', () => {
    beforeEach(async () => {
      await signup();
    });

    it('logs in with the right password and the session works for /me', async () => {
      const response = await login({ username: 'alice', password: PASSWORD });
      expect(response.statusCode).toBe(200);
      const token = sessionCookieOf(response)?.value;
      expect(token).toBeTruthy();

      const meResponse = await me(token);
      expect(meResponse.statusCode).toBe(200);
      expect(meResponse.json().user).toMatchObject({ username: 'alice', role: 'user' });
    });

    it('rejects a wrong password and an unknown user with the same message', async () => {
      const wrongPassword = await login({ username: 'alice', password: 'wrong-password' });
      const unknownUser = await login({ username: 'nobody', password: PASSWORD });
      expect(wrongPassword.statusCode).toBe(401);
      expect(unknownUser.statusCode).toBe(401);
      expect(wrongPassword.json().message).toBe(unknownUser.json().message);
    });

    it('returns 401 without a session or with a bogus token', async () => {
      expect((await me()).statusCode).toBe(401);
      expect((await me('not-a-real-token')).statusCode).toBe(401);
    });
  });

  describe('logout', () => {
    it('clears the cookie and invalidates only that session', async () => {
      const first = sessionCookieOf(await signup())?.value;
      const second = sessionCookieOf(await login({ username: 'alice', password: PASSWORD }))?.value;

      const response = await ctx.app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        cookies: { [SESSION_COOKIE]: first! },
      });
      expect(response.statusCode).toBe(200);
      expect(sessionCookieOf(response)?.value).toBe('');

      expect((await me(first)).statusCode).toBe(401);
      expect((await me(second)).statusCode).toBe(200);
    });

    it('logout-all invalidates every session of the user', async () => {
      const first = sessionCookieOf(await signup())?.value;
      const second = sessionCookieOf(await login({ username: 'alice', password: PASSWORD }))?.value;

      const response = await ctx.app.inject({
        method: 'POST',
        url: '/api/auth/logout-all',
        cookies: { [SESSION_COOKIE]: first! },
      });
      expect(response.statusCode).toBe(200);
      expect((await me(first)).statusCode).toBe(401);
      expect((await me(second)).statusCode).toBe(401);
    });
  });

  describe('rate limiting', () => {
    it('blocks the sixth login attempt within a minute from the same IP', async () => {
      const limited = await createTestApp({ rateLimit: true });
      try {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const response = await limited.app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: { username: 'alice', password: PASSWORD },
          });
          expect(response.statusCode).toBe(401);
        }
        const blocked = await limited.app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { username: 'alice', password: PASSWORD },
        });
        expect(blocked.statusCode).toBe(429);
        expect(blocked.json()).toMatchObject({ code: 'RATE_LIMITED' });
      } finally {
        await limited.close();
      }
    });
  });
});
