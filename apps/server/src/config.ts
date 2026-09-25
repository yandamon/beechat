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
  /** 是否开放演示账号一键登录 */
  DEMO_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

export type Config = z.infer<typeof envSchema>;

export const config: Config = envSchema.parse(process.env);
