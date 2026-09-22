import { describe, expect, it } from 'vitest';
import { buildApp } from './app';

describe('GET /api/health', () => {
  it('reports ok', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', name: 'beechat' });
    await app.close();
  });
});
