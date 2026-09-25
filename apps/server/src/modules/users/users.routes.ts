import { searchUsersQuerySchema, updateProfileSchema } from '@beechat/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { requireAuth } from '../../plugins/auth';
import { toPublicUser } from '../../lib/views';
import { searchUsers, updateProfile } from './users.service';

export const usersRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/search',
    { preHandler: app.authenticate, schema: { querystring: searchUsersQuerySchema } },
    async (request) => {
      const { user } = requireAuth(request);
      return { users: await searchUsers(app.ctx, user.id, request.query.q) };
    },
  );

  app.patch(
    '/me',
    { preHandler: app.authenticate, schema: { body: updateProfileSchema } },
    async (request) => {
      const { user } = requireAuth(request);
      return { user: toPublicUser(await updateProfile(app.ctx, user, request.body)) };
    },
  );
};
