import { randomUUID } from 'node:crypto';
import type { MessageView } from '@beechat/shared';
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

describe('uploads, images and avatars', () => {
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
  const presign = (as: TestUser, body: Record<string, unknown>) =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/uploads/presign',
      cookies: as.cookies,
      payload: body,
    });
  const put = (as: TestUser, key: string, bytes: Buffer, mime = 'image/png') =>
    ctx.app.inject({
      method: 'PUT',
      url: `/api/uploads/local/${key}`,
      cookies: as.cookies,
      headers: { 'content-type': mime },
      payload: bytes,
    });
  const complete = (as: TestUser, key: string) =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/uploads/complete',
      cookies: as.cookies,
      payload: { key },
    });
  const imageRequest = { kind: 'image', mime: 'image/png', size: 1024, width: 640, height: 480 };

  it('uploads an image through the local driver and sends it as a message', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const conversationId = await becomeFriends(ctx, alice, bob);

    const signed = await presign(alice, imageRequest);
    expect(signed.statusCode).toBe(200);
    const { key, uploadUrl, method } = signed.json();
    expect(method).toBe('PUT');
    expect(uploadUrl).toBe(`/api/uploads/local/${key}`);
    expect(key).toMatch(/^image\/\d+\/\d{4}-\d{2}\/[0-9a-f-]+\.png$/);

    expect((await complete(alice, key)).json().code).toBe('UPLOAD_MISSING');

    const bytes = Buffer.alloc(1024, 7);
    expect((await put(alice, key, bytes)).statusCode).toBe(204);
    const done = await complete(alice, key);
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({
      key,
      url: `/uploads/${key}`,
      width: 640,
      height: 480,
      size: 1024,
      mime: 'image/png',
    });

    const served = await ctx.app.inject({ method: 'GET', url: `/uploads/${key}` });
    expect(served.statusCode).toBe(200);
    expect(served.headers['content-type']).toContain('image/png');
    expect(served.rawPayload.length).toBe(1024);

    const aliceSocket = await open(alice);
    const bobSocket = await open(bob);
    const incoming = waitForEvent(bobSocket, 'message:new');
    const ack = await sendMessage(aliceSocket, {
      conversationId,
      clientId: randomUUID(),
      type: 'image',
      attachmentKey: key,
    });
    expect(ack.ok).toBe(true);
    if (!ack.ok) return;
    expect(ack.message.type).toBe('image');
    expect(ack.message.content).toBeNull();
    expect(ack.message.attachment).toMatchObject({
      url: `/uploads/${key}`,
      width: 640,
      height: 480,
    });
    expect((await incoming).attachment?.url).toBe(`/uploads/${key}`);

    const history = await ctx.app.inject({
      method: 'GET',
      url: `/api/conversations/${conversationId}/messages`,
      cookies: bob.cookies,
    });
    const last: MessageView = history.json().messages.at(-1);
    expect(last.type).toBe('image');
    expect(last.attachment?.mime).toBe('image/png');
  });

  it('rejects bad types, oversized files, other people’s keys and unfinished uploads', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const conversationId = await becomeFriends(ctx, alice, bob);

    expect((await presign(alice, { ...imageRequest, mime: 'image/svg+xml' })).statusCode).toBe(400);
    expect((await presign(alice, { ...imageRequest, size: 6 * 1024 * 1024 })).statusCode).toBe(400);
    expect((await presign(alice, { ...imageRequest, width: 5000 })).statusCode).toBe(400);

    const { key } = (await presign(alice, imageRequest)).json();
    expect((await put(bob, key, Buffer.alloc(100))).statusCode).toBe(404);
    const tooBig = await put(alice, key, Buffer.alloc(4096, 1));
    expect(tooBig.json().code).toBe('UPLOAD_SIZE_MISMATCH');

    const aliceSocket = await open(alice);
    const ack = await sendMessage(aliceSocket, {
      conversationId,
      clientId: randomUUID(),
      type: 'image',
      attachmentKey: key,
    });
    expect(ack).toMatchObject({ ok: false, code: 'UPLOAD_MISSING' });
  });

  it('sets and clears the avatar and updates the display name', async () => {
    const alice = await registerUser(ctx, 'alice');
    const signed = await presign(alice, {
      kind: 'avatar',
      mime: 'image/webp',
      size: 512,
      width: 256,
      height: 256,
    });
    const { key } = signed.json();
    expect((await put(alice, key, Buffer.alloc(512, 3), 'image/webp')).statusCode).toBe(204);
    expect((await complete(alice, key)).statusCode).toBe(200);

    const updated = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      cookies: alice.cookies,
      payload: { avatarKey: key, displayName: '爱丽丝' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().user).toMatchObject({
      displayName: '爱丽丝',
      avatarUrl: `/uploads/${key}`,
    });

    const me = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', cookies: alice.cookies });
    expect(me.json().user.avatarUrl).toBe(`/uploads/${key}`);

    const cleared = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      cookies: alice.cookies,
      payload: { avatarKey: null },
    });
    expect(cleared.json().user.avatarUrl).toBeNull();

    const image = (await presign(alice, imageRequest)).json();
    await put(alice, image.key, Buffer.alloc(1024, 1));
    await complete(alice, image.key);
    const wrongKind = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      cookies: alice.cookies,
      payload: { avatarKey: image.key },
    });
    expect(wrongKind.statusCode).toBe(404);

    const emptyName = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      cookies: alice.cookies,
      payload: { displayName: '   ' },
    });
    expect(emptyName.statusCode).toBe(400);
  });
});
