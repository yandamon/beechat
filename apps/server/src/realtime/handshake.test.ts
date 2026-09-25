import { io as connect } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type TestApp, createTestApp } from '../test/create-test-app';
import { connectAs, listen, registerUser, waitForConnect } from '../test/helpers';

describe('realtime handshake', () => {
  let ctx: TestApp;
  let url: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ctx.reset();
    url = await listen(ctx);
  });

  afterAll(() => ctx.close());

  it('accepts a socket carrying a valid session cookie', async () => {
    const user = await registerUser(ctx, 'handshake_ok');
    const socket = connectAs(url, user);
    await waitForConnect(socket);
    expect(socket.connected).toBe(true);
    socket.disconnect();
  });

  it('rejects a socket without a session', async () => {
    const socket = connect(url, { transports: ['websocket'], reconnection: false });
    const error = await new Promise<Error>((resolve, reject) => {
      socket.once('connect_error', resolve);
      socket.once('connect', () => reject(new Error('expected the connection to be rejected')));
    });
    expect(error.message).toBe('unauthorized');
    socket.disconnect();
  });
});
