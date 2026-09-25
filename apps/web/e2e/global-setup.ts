import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/** 没有环境变量时从服务端的 .env.test 读连接串，和后端保持同一个测试库 */
function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = fileURLToPath(new URL('../../server/.env.test', import.meta.url));
  if (!existsSync(envFile)) throw new Error('缺少 DATABASE_URL，也找不到 apps/server/.env.test');
  const line = readFileSync(envFile, 'utf8')
    .split('\n')
    .find((entry) => entry.startsWith('DATABASE_URL='));
  if (!line) throw new Error('.env.test 里没有 DATABASE_URL');
  return line.slice('DATABASE_URL='.length).trim();
}

/** 每次跑端到端测试前清空测试库，保证用户名和数据都是干净的 */
export default async function globalSetup() {
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' and tablename in ('users', 'conversations', 'app_settings')",
    );
    if (rows.length > 0) {
      const tables = rows.map((row) => `"${row.tablename}"`).join(', ');
      await client.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await client.end();
  }
}
