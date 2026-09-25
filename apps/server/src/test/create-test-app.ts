import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { type App, buildApp } from '../app';
import { config } from '../config';
import { type Db, createDb, runMigrations } from '../db/client';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle');

/** 清空所有业务表；users 和 conversations 是根，其余表通过级联一起清掉 */
export async function resetDb(db: Db) {
  await db.execute(sql`TRUNCATE TABLE users, conversations RESTART IDENTITY CASCADE`);
}

export interface TestApp {
  app: App;
  db: Db;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

/** 连接 .env.test 指定的测试库、应用迁移并构建应用。默认关闭限流。 */
export interface TestAppOptions {
  rateLimit?: boolean;
  presenceGraceMs?: number;
}

export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const { db, pool } = createDb(config.DATABASE_URL);
  await runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp({
    db,
    rateLimit: options.rateLimit ?? false,
    presenceGraceMs: options.presenceGraceMs,
  });
  return {
    app,
    db,
    reset: () => resetDb(db),
    close: async () => {
      await app.close();
      await pool.end();
    },
  };
}
