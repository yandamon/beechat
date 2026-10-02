import { and, eq, inArray, ne } from 'drizzle-orm';
import type { DbLike } from '../../db/client';
import { users } from '../../db/schema';

/**
 * 把 ADMIN_USERNAMES 里列出的账号设成管理员，服务启动时调用。
 * 只升不降：从环境变量里删掉名字不会撤销权限，撤销用命令行的 admin:revoke。
 * 返回这次新升上来的用户名，名单里还没注册的会被忽略（注册时再生效）。
 */
export async function promoteAdmins(db: DbLike, usernames: string[]): Promise<string[]> {
  if (usernames.length === 0) return [];
  const promoted = await db
    .update(users)
    .set({ role: 'admin' })
    .where(and(inArray(users.username, usernames), ne(users.role, 'admin')))
    .returning({ username: users.username });
  return promoted.map((row) => row.username);
}

/** 命令行用：按用户名设置角色；用户不存在时返回 false */
export async function setUserRole(
  db: DbLike,
  username: string,
  role: 'user' | 'admin',
): Promise<boolean> {
  const updated = await db
    .update(users)
    .set({ role })
    .where(eq(users.username, username))
    .returning({ id: users.id });
  return updated.length > 0;
}
