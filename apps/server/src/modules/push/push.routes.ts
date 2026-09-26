import { pushSubscriptionSchema, pushUnsubscribeSchema } from '@beechat/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { AppError } from '../../lib/errors';
import { requireAuth } from '../../plugins/auth';

export const pushRoutes: FastifyPluginAsyncZod = async (app) => {
  /** 没配 VAPID 密钥时返回 null，前端据此跳过订阅 */
  app.get('/public-key', async () => ({ publicKey: app.ctx.push.publicKey }));

  app.post(
    '/subscriptions',
    { preHandler: app.authenticate, schema: { body: pushSubscriptionSchema } },
    async (request, reply) => {
      const { user } = requireAuth(request);
      if (!app.ctx.push.enabled) throw new AppError(503, '服务器未开启推送', 'PUSH_DISABLED');
      await app.ctx.push.subscribe(user.id, request.body, request.headers['user-agent'] ?? null);
      return reply.code(201).send({ ok: true });
    },
  );

  app.delete(
    '/subscriptions',
    { preHandler: app.authenticate, schema: { body: pushUnsubscribeSchema } },
    async (request) => {
      const { user } = requireAuth(request);
      await app.ctx.push.unsubscribe(user.id, request.body.endpoint);
      return { ok: true };
    },
  );
};
