import { existsSync } from 'node:fs';
import { z } from 'zod';

// 本地开发从 .env 读取；已存在的环境变量优先级更高，线上由平台注入。
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Config = z.infer<typeof envSchema>;

export const config: Config = envSchema.parse(process.env);
