import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type TestApp, createTestApp } from '../../test/create-test-app';
import { SESSION_COOKIE } from './session.service';

const INVITE_CODE = 'test-invite';
const alice = { username: 'alice', password: 'password123', inviteCode: INVITE_CODE };

describe('auth', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(() => ctx.reset());

  afterAll(() => ctx.close());

  const register = (payload: Record<string, unknown>) =>
    ctx.app.inject({ method: 'POST', url: '/api/auth/register', payload });
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
      const response = await register({ ...alice, username: '  Alice ' });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        user: { username: 'alice', displayName: 'alice', avatarUrl: null },
      });
      expect(response.json().user).not.toHaveProperty('passwordHash');

      const cookie = sessionCookieOf(response);
      expect(cookie).toMatchObject({ httpOnly: true, path: '/' });
      expect(cookie?.value.length).toBeGreaterThan(30);
    });

    it('rejects a wrong invite code', async () => {
      const response = await register({ ...alice, inviteCode: 'nope' });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'INVALID_INVITE_CODE' });
    });

    it('rejects a duplicate username regardless of case', async () => {
      await register(alice);
      const response = await register({ ...alice, username: 'ALICE' });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'USERNAME_TAKEN' });
    });

    it('returns the validation message for an invalid username', async () => {
      const response = await register({ ...alice, username: 'a-b' });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION' });
      expect(response.json().message).toContain('用户名');
    });
  });

  describe('login and me', () => {
    beforeEach(async () => {
      await register(alice);
    });

    it('logs in with the right password and the session works for /me', async () => {
      const response = await login({ username: 'alice', password: alice.password });
      expect(response.statusCode).toBe(200);
      const token = sessionCookieOf(response)?.value;
      expect(token).toBeTruthy();

      const meResponse = await me(token);
      expect(meResponse.statusCode).toBe(200);
      expect(meResponse.json().user.username).toBe('alice');
    });

    it('rejects a wrong password and an unknown user with the same message', async () => {
      const wrongPassword = await login({ username: 'alice', password: 'wrong-password' });
      const unknownUser = await login({ username: 'nobody', password: alice.password });
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
      const first = sessionCookieOf(await register(alice))?.value;
      const second = sessionCookieOf(
        await login({ username: 'alice', password: alice.password }),
      )?.value;

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
      const first = sessionCookieOf(await register(alice))?.value;
      const second = sessionCookieOf(
        await login({ username: 'alice', password: alice.password }),
      )?.value;

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
            payload: { username: 'alice', password: 'password123' },
          });
          expect(response.statusCode).toBe(401);
        }
        const blocked = await limited.app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { username: 'alice', password: 'password123' },
        });
        expect(blocked.statusCode).toBe(429);
        expect(blocked.json()).toMatchObject({ code: 'RATE_LIMITED' });
      } finally {
        await limited.close();
      }
    });
  });
});
