import {
  createFriendRequestSchema,
  requestIdParamSchema,
  userIdParamSchema,
} from '@beechat/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { requireAuth } from '../../plugins/auth';
import {
  createFriendRequest,
  listFriendRequests,
  listFriends,
  removeFriend,
  respondFriendRequest,
} from './friends.service';

export const friendsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/', { preHandler: app.authenticate }, async (request) => {
    const { user } = requireAuth(request);
    return { friends: await listFriends(app.ctx, user.id) };
  });

  app.delete(
    '/:userId',
    { preHandler: app.authenticate, schema: { params: userIdParamSchema } },
    async (request) => {
      const { user } = requireAuth(request);
      await removeFriend(app.ctx, user.id, request.params.userId);
      return { ok: true };
    },
  );

  app.get('/requests', { preHandler: app.authenticate }, async (request) => {
    const { user } = requireAuth(request);
    return listFriendRequests(app.ctx, user.id);
  });

  app.post(
    '/requests',
    { preHandler: app.authenticate, schema: { body: createFriendRequestSchema } },
    async (request, reply) => {
      const { user } = requireAuth(request);
      const friendRequest = await createFriendRequest(app.ctx, user, request.body);
      return reply.code(201).send({ request: friendRequest });
    },
  );

  app.post(
    '/requests/:id/accept',
    { preHandler: app.authenticate, schema: { params: requestIdParamSchema } },
    async (request) => {
      const { user } = requireAuth(request);
      return { request: await respondFriendRequest(app.ctx, user, request.params.id, true) };
    },
  );

  app.post(
    '/requests/:id/reject',
    { preHandler: app.authenticate, schema: { params: requestIdParamSchema } },
    async (request) => {
      const { user } = requireAuth(request);
      return { request: await respondFriendRequest(app.ctx, user, request.params.id, false) };
    },
  );
};
