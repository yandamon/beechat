import { ALLOWED_IMAGE_TYPES, LIMITS, completeUploadSchema, presignUploadSchema } from '@beechat/shared';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { uploads } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { requireAuth } from '../../plugins/auth';
import { LocalStorageDriver } from '../../storage/local';
import { completeUpload, findOwnedUpload, presignUpload } from './uploads.service';

const wildcardParams = z.object({ '*': z.string().min(1).max(200) });

const perUser = {
  keyGenerator: (request: { auth?: { user: { id: number } }; ip: string }) =>
    request.auth ? `user:${request.auth.user.id}` : request.ip,
};

export const uploadsRoutes: FastifyPluginAsyncZod = async (app) => {
  // 图片字节直接进 Buffer，只有本地驱动的直传接口会用到
  app.addContentTypeParser(
    [...ALLOWED_IMAGE_TYPES],
    { parseAs: 'buffer', bodyLimit: LIMITS.imageBytes.max + 64 * 1024 },
    (_request, body, done) => done(null, body),
  );

  app.post(
    '/presign',
    {
      preHandler: app.authenticate,
      config: { rateLimit: { max: 10, timeWindow: '1 minute', ...perUser } },
      schema: { body: presignUploadSchema },
    },
    async (request) => {
      const { user } = requireAuth(request);
      return presignUpload(app.ctx, user.id, request.body);
    },
  );

  app.post(
    '/complete',
    { preHandler: app.authenticate, schema: { body: completeUploadSchema } },
    async (request) => {
      const { user } = requireAuth(request);
      return completeUpload(app.ctx, user.id, request.body.key);
    },
  );

  // 本地驱动的“直传”：浏览器把字节 PUT 到这里，写进磁盘
  app.put(
    '/local/*',
    {
      preHandler: app.authenticate,
      bodyLimit: LIMITS.imageBytes.max + 64 * 1024,
      schema: { params: wildcardParams },
    },
    async (request, reply) => {
      const { user } = requireAuth(request);
      const storage = app.ctx.storage;
      if (!(storage instanceof LocalStorageDriver)) {
        throw new AppError(404, '当前不是本地存储', 'NOT_LOCAL_STORAGE');
      }
      const key = request.params['*'];
      const upload = await findOwnedUpload(app.db, key, user.id);
      if (!upload) throw new AppError(404, '上传记录不存在', 'UPLOAD_NOT_FOUND');
      if (upload.completedAt) throw new AppError(409, '这个文件已经上传过了', 'UPLOAD_DONE');
      const body = request.body;
      if (!Buffer.isBuffer(body)) throw new AppError(400, '请直接上传图片字节', 'INVALID_BODY');
      if (body.length > upload.size * 1.1 + 1024) {
        throw new AppError(400, '文件比登记的大小大', 'UPLOAD_SIZE_MISMATCH');
      }
      await storage.write(key, body);
      await app.db.update(uploads).set({ size: body.length }).where(eq(uploads.key, key));
      return reply.code(204).send();
    },
  );
};
