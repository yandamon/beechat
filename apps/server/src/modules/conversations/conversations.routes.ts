import {
  addMembersSchema,
  conversationIdParamSchema,
  createConversationSchema,
  memberParamsSchema,
  messageParamsSchema,
  messagesQuerySchema,
  updateConversationSchema,
  updateMembershipSchema,
} from '@beechat/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { requireAuth } from '../../plugins/auth';
import {
  assertMember,
  getConversationViews,
  openDirectConversation,
  requireConversationView,
  updateMembership,
} from './conversations.service';
import { addMembers, createGroup, removeMember, renameGroup } from './groups.service';
import { getMessages, recallMessage } from './messages.service';

export const conversationsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/', { preHandler: app.authenticate }, async (request) => {
    const { user } = requireAuth(request);
    return { conversations: await getConversationViews(app.ctx, user.id) };
  });

  app.post(
    '/',
    { preHandler: app.authenticate, schema: { body: createConversationSchema } },
    async (request, reply) => {
      const { user } = requireAuth(request);
      const conversation =
        request.body.type === 'direct'
          ? await openDirectConversation(app.ctx, user, request.body.userId)
          : await createGroup(app.ctx, user, request.body);
      return reply.code(201).send({ conversation });
    },
  );

  app.get(
    '/:id',
    { preHandler: app.authenticate, schema: { params: conversationIdParamSchema } },
    async (request) => {
      const { user } = requireAuth(request);
      await assertMember(app.ctx.db, request.params.id, user.id);
      return { conversation: await requireConversationView(app.ctx, user.id, request.params.id) };
    },
  );

  app.patch(
    '/:id',
    {
      preHandler: app.authenticate,
      schema: { params: conversationIdParamSchema, body: updateConversationSchema },
    },
    async (request) => {
      const { user } = requireAuth(request);
      return {
        conversation: await renameGroup(app.ctx, user, request.params.id, request.body.name),
      };
    },
  );

  app.patch(
    '/:id/membership',
    {
      preHandler: app.authenticate,
      schema: { params: conversationIdParamSchema, body: updateMembershipSchema },
    },
    async (request) => {
      const { user } = requireAuth(request);
      return {
        conversation: await updateMembership(app.ctx, user.id, request.params.id, request.body),
      };
    },
  );

  app.post(
    '/:id/members',
    {
      preHandler: app.authenticate,
      schema: { params: conversationIdParamSchema, body: addMembersSchema },
    },
    async (request) => {
      const { user } = requireAuth(request);
      return {
        conversation: await addMembers(app.ctx, user, request.params.id, request.body.userIds),
      };
    },
  );

  app.delete(
    '/:id/members/:userId',
    { preHandler: app.authenticate, schema: { params: memberParamsSchema } },
    async (request) => {
      const { user } = requireAuth(request);
      await removeMember(app.ctx, user, request.params.id, request.params.userId);
      return { ok: true };
    },
  );

  app.post(
    '/:id/messages/:messageId/recall',
    { preHandler: app.authenticate, schema: { params: messageParamsSchema } },
    async (request) => {
      const { user } = requireAuth(request);
      return {
        message: await recallMessage(app.ctx, user.id, request.params.id, request.params.messageId),
      };
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
