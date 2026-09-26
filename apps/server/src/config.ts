import { existsSync } from 'node:fs';
import { z } from 'zod';

// 本地开发从 .env 读取，测试从 .env.test 读取；已存在的环境变量优先级更高，线上由平台注入。
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url({ error: '缺少 DATABASE_URL，请参考 .env.example' }),
  INVITE_CODE: z.string().min(1, '缺少 INVITE_CODE，请参考 .env.example'),
  /** 图片存储：local 存本地磁盘（开发或临时用），r2 存 Cloudflare R2 */
  STORAGE_DRIVER: z.enum(['local', 'r2']).default('local'),
  UPLOADS_DIR: z.string().default('./uploads'),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_URL: z.url().optional(),
  /** Web 推送的 VAPID 密钥对与联系方式；三项都填才启用推送 */
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z
    .string()
    .regex(/^(mailto:|https:\/\/)/, 'VAPID_SUBJECT 必须是 mailto: 或 https:// 开头')
    .optional(),
  /** 限流开关；端到端测试里关掉 */
  RATE_LIMIT: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  /** 是否开放演示账号一键登录 */
  DEMO_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

export type Config = z.infer<typeof envSchema>;

export const config: Config = envSchema
  .superRefine((value, ctx) => {
    const vapid = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] as const;
    if (vapid.some((key) => value[key]) && !vapid.every((key) => value[key])) {
      ctx.addIssue({
        code: 'custom',
        message: '推送要同时设置 VAPID_PUBLIC_KEY、VAPID_PRIVATE_KEY、VAPID_SUBJECT',
        path: ['VAPID_SUBJECT'],
      });
    }
    if (value.STORAGE_DRIVER !== 'r2') return;
    for (const key of [
      'R2_ACCOUNT_ID',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_BUCKET',
      'R2_PUBLIC_URL',
    ] as const) {
      if (!value[key])
        ctx.addIssue({
          code: 'custom',
          message: `STORAGE_DRIVER=r2 时必须设置 ${key}`,
          path: [key],
        });
    }
  })
  .parse(process.env);
