import {
  conversationIdParamSchema,
  createDirectConversationSchema,
  messagesQuerySchema,
} from '@beechat/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { AppError } from '../../lib/errors';
import { requireAuth } from '../../plugins/auth';
import {
  assertMember,
  getConversationView,
  getConversationViews,
  openDirectConversation,
} from './conversations.service';
import { getMessages } from './messages.service';

export const conversationsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/', { preHandler: app.authenticate }, async (request) => {
    const { user } = requireAuth(request);
    return { conversations: await getConversationViews(app.ctx, user.id) };
  });

  app.post(
    '/',
    { preHandler: app.authenticate, schema: { body: createDirectConversationSchema } },
    async (request, reply) => {
      const { user } = requireAuth(request);
      const conversation = await openDirectConversation(app.ctx, user, request.body.userId);
      return reply.code(201).send({ conversation });
    },
  );

  app.get(
    '/:id',
    { preHandler: app.authenticate, schema: { params: conversationIdParamSchema } },
    async (request) => {
      const { user } = requireAuth(request);
      await assertMember(app.ctx.db, request.params.id, user.id);
      const conversation = await getConversationView(app.ctx, user.id, request.params.id);
      if (!conversation) throw new AppError(404, '会话不存在', 'CONVERSATION_NOT_FOUND');
      return { conversation };
    },
  );

  app.get(
    '/:id/messages',
    {
      preHandler: app.authenticate,
      schema: { params: conversationIdParamSchema, querystring: messagesQuerySchema },
    },
    async (request) => {
      const { user } = requireAuth(request);
      return getMessages(app.ctx, user.id, request.params.id, request.query);
    },
  );
};
