import type { AddressInfo } from 'node:net';
import { type Socket, io as connect } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from './modules/auth/session.service';
import { type TestApp, createTestApp } from './test/create-test-app';

function waitForConnect(socket: Socket) {
  return new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (error) => reject(error));
  });
}

function waitForConnectError(socket: Socket) {
  return new Promise<Error>((resolve, reject) => {
    socket.once('connect_error', (error) => resolve(error));
    socket.once('connect', () => reject(new Error('expected the connection to be rejected')));
  });
}

describe('realtime handshake', () => {
  let ctx: TestApp;
  let url: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
    await ctx.reset();
    await ctx.app.listen({ port: 0, host: '127.0.0.1' });
    const address = ctx.app.server.address() as AddressInfo;
    url = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    await ctx.close();
  });

  it('accepts a socket carrying a valid session cookie', async () => {
    const registered = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'bob', password: 'password123', inviteCode: 'test-invite' },
    });
    const token = registered.cookies.find((cookie) => cookie.name === SESSION_COOKIE)?.value;
    expect(token).toBeTruthy();

    const socket = connect(url, {
      transports: ['websocket'],
      extraHeaders: { cookie: `${SESSION_COOKIE}=${token}` },
    });
    sockets.push(socket);
    await waitForConnect(socket);
    expect(socket.connected).toBe(true);
  });

  it('rejects a socket without a session', async () => {
    const socket = connect(url, { transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    const error = await waitForConnectError(socket);
    expect(error.message).toBe('unauthorized');
  });
});
