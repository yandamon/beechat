import { createReportSchema } from '@beechat/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { requireAuth } from '../../plugins/auth';
import { createReport } from './reports.service';

export const reportsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/',
    {
      preHandler: app.authenticate,
      schema: { body: createReportSchema },
      config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
    },
    async (request, reply) => {
      const { user } = requireAuth(request);
      const report = await createReport(app.ctx, user.id, request.body);
      return reply.code(201).send({ report });
    },
  );
};
