import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

/** 业务错误：带 HTTP 状态码和给用户看的中文消息 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const unauthorized = () => new AppError(401, '请先登录', 'UNAUTHORIZED');

/** 所有错误统一返回 { message, code }，5xx 不暴露细节 */
export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ message: error.message, code: error.code });
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      const issues = error.validation.map((issue) => ({
        path: issue.instancePath.replace(/^\//, '').replaceAll('/', '.'),
        message: issue.message ?? '格式不正确',
      }));
      return reply.code(400).send({
        message: issues[0]?.message ?? '请求参数不合法',
        code: 'VALIDATION',
        issues,
      });
    }

    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) {
      request.log.error(error, 'unhandled error');
      return reply
        .code(statusCode)
        .send({ message: '服务器开小差了，请稍后再试', code: 'INTERNAL' });
    }
    return reply.code(statusCode).send({ message: error.message, code: error.code ?? 'ERROR' });
  });
}
