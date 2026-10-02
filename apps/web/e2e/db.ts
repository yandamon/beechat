import { randomInt } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/** 没有环境变量时从服务端的 .env.test 读连接串，和后端保持同一个测试库 */
export function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = fileURLToPath(new URL('../../server/.env.test', import.meta.url));
  if (!existsSync(envFile)) throw new Error('缺少 DATABASE_URL，也找不到 apps/server/.env.test');
  const line = readFileSync(envFile, 'utf8')
    .split('\n')
    .find((entry) => entry.startsWith('DATABASE_URL='));
  if (!line) throw new Error('.env.test 里没有 DATABASE_URL');
  return line.slice('DATABASE_URL='.length).trim();
}

async function withClient<T>(run: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

/** 和 packages/shared 里的 INVITE_CODE_ALPHABET 保持一致 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/**
 * 直接往测试库里放一个没用过的邀请码，返回带连字符的展示形式。
 * 每个邀请码只能注册一个账号，所以测试里每注册一个用户都要先要一个新的。
 */
export async function mintInviteCode(): Promise<string> {
  let code = '';
  for (let index = 0; index < 12; index += 1) code += ALPHABET.charAt(randomInt(ALPHABET.length));
  await withClient((client) => client.query('insert into invite_codes (code) values ($1)', [code]));
  return code.match(/.{4}/g)?.join('-') ?? code;
}

/** 把一个已注册的用户设成管理员；页面要刷新一次才会看到后台入口 */
export async function makeAdmin(username: string) {
  await withClient((client) =>
    client.query("update users set role = 'admin' where username = $1", [username]),
  );
}

/** 清空测试库。users 和 conversations 是根，其余表通过级联一起清掉。 */
export async function truncateAll() {
  await withClient(async (client) => {
    const { rows } = await client.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' and tablename in ('users', 'conversations', 'app_settings', 'invite_codes')",
    );
    if (rows.length === 0) return;
    const tables = rows.map((row) => `"${row.tablename}"`).join(', ');
    await client.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
  });
}
