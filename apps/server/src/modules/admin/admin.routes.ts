import { createInvitesSchema, inviteIdParamSchema, listInvitesQuerySchema } from '@beechat/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { requireAuth } from '../../plugins/auth';
import { createInvites, listInvites, revokeInvite } from '../invites/invites.service';

/**
 * 后台接口，全部需要管理员。目前只有邀请码；用户管理、举报处理以后也放在这个前缀下。
 * 权限检查挂在 onRequest 上，比参数校验更早：没权限的人连“参数哪里不对”都看不到。
 */
export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.requireAdmin);

  app.get('/invites', { schema: { querystring: listInvitesQuerySchema } }, async (request) =>
    listInvites(app.db, request.query.status),
  );

  app.post('/invites', { schema: { body: createInvitesSchema } }, async (request, reply) => {
    const { user } = requireAuth(request);
    const invites = await createInvites(app.db, user.id, request.body);
    request.log.info({ adminId: user.id, count: invites.length }, 'invite codes created');
    return reply.code(201).send({ invites });
  });

  app.post('/invites/:id/revoke', { schema: { params: inviteIdParamSchema } }, async (request) => {
    const { user } = requireAuth(request);
    const invite = await revokeInvite(app.db, request.params.id);
    request.log.info({ adminId: user.id, inviteId: invite.id }, 'invite code revoked');
    return { invite };
  });
};
