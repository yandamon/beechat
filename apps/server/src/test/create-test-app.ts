import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type App, buildApp } from '../app';
import { config } from '../config';
import { createDb, runMigrations } from '../db/client';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle');

/** 连接 .env.test 指定的测试库、应用迁移并构建应用。用完调用 close()。 */
export async function createTestApp(): Promise<{ app: App; close: () => Promise<void> }> {
  const { db, pool } = createDb(config.DATABASE_URL);
  await runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp({ db });
  return {
    app,
    close: async () => {
      await app.close();
      await pool.end();
    },
  };
}
