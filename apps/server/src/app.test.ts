import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './test/create-test-app';

describe('GET /api/health', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('reports ok with a reachable database', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', name: 'beechat', db: 'ok' });
  });
});
