import { loginSchema, registerSchema } from '@beechat/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { requireAuth } from '../../plugins/auth';
import { assertInviteCode, authenticateUser, registerUser, toPublicUser } from './auth.service';
import { clearSessionCookie, deleteSession, deleteUserSessions } from './session.service';

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/register',
    {
      config: { rateLimit: { max: 3, timeWindow: '1 hour' } },
      schema: { body: registerSchema },
    },
    async (request, reply) => {
      assertInviteCode(request.body.inviteCode);
      const user = await registerUser(app.db, request.body);
      await app.startSession(reply, user.id, request.headers['user-agent']);
      return reply.code(201).send({ user: toPublicUser(user) });
    },
  );

  app.post(
    '/login',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: { body: loginSchema },
    },
    async (request, reply) => {
      const user = await authenticateUser(app.db, request.body.username, request.body.password);
      await app.startSession(reply, user.id, request.headers['user-agent']);
      return { user: toPublicUser(user) };
    },
  );

  app.post('/logout', { preHandler: app.authenticate }, async (request, reply) => {
    const { sessionId } = requireAuth(request);
    await deleteSession(app.db, sessionId);
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.post('/logout-all', { preHandler: app.authenticate }, async (request, reply) => {
    const { user } = requireAuth(request);
    await deleteUserSessions(app.db, user.id);
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get('/me', { preHandler: app.authenticate }, async (request) => ({
    user: toPublicUser(requireAuth(request).user),
  }));
};
