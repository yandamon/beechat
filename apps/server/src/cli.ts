/**
 * 运维用的小命令，直接连 DATABASE_URL 指向的数据库（本地读 .env，线上用 `railway run` 注入变量）。
 *
 *   pnpm --filter @beechat/server admin:grant <用户名>     设为管理员
 *   pnpm --filter @beechat/server admin:revoke <用户名>    撤销管理员
 *   pnpm --filter @beechat/server invite:create [数量] [备注]
 *       生成邀请码并打印出来。全新的数据库里还没有管理员，第一批邀请码靠它。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIMITS } from '@beechat/shared';
import { config } from './config';
import { createDb, runMigrations } from './db/client';
import { setUserRole } from './modules/admin/admins.service';
import { createInvites } from './modules/invites/invites.service';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle');

const USAGE = `用法：
  admin:grant <用户名>
  admin:revoke <用户名>
  invite:create [数量] [备注]`;

async function main(): Promise<number> {
  const [command, ...args] = process.argv.slice(2);
  if (!command) {
    console.error(USAGE);
    return 1;
  }

  const { db, pool } = createDb(config.DATABASE_URL);
  try {
    // 全新的库上先建表，和服务启动时做的是同一件事
    await runMigrations(db, MIGRATIONS_DIR);

    switch (command) {
      case 'admin:grant':
      case 'admin:revoke': {
        const username = args[0]?.trim().toLowerCase();
        if (!username) {
          console.error(USAGE);
          return 1;
        }
        const role = command === 'admin:grant' ? 'admin' : 'user';
        if (!(await setUserRole(db, username, role))) {
          console.error(`没有找到用户 ${username}`);
          return 1;
        }
        console.log(role === 'admin' ? `${username} 现在是管理员` : `${username} 不再是管理员`);
        return 0;
      }
      case 'invite:create': {
        const count = args[0] === undefined ? 1 : Number(args[0]);
        if (!Number.isInteger(count) || count < 1 || count > LIMITS.inviteBatch.max) {
          console.error(`数量要在 1 到 ${LIMITS.inviteBatch.max} 之间`);
          return 1;
        }
        const note = args.slice(1).join(' ').trim();
        const invites = await createInvites(db, null, {
          count,
          note: note.length > 0 ? note.slice(0, LIMITS.inviteNote.max) : undefined,
        });
        for (const invite of invites) console.log(invite.code);
        return 0;
      }
      default:
        console.error(`不认识的命令：${command}\n${USAGE}`);
        return 1;
    }
  } finally {
    await pool.end();
  }
}

process.exitCode = await main();
