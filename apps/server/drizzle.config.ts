import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit 不会自动读 .env，这里按 NODE_ENV 手动加载
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
