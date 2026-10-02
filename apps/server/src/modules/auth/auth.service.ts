import { hash, verify } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { config } from '../../config';
import type { Db } from '../../db/client';
import { type User, users } from '../../db/schema';
import { isUniqueViolation } from '../../lib/db-errors';
import { AppError } from '../../lib/errors';
import { assertInviteUsable, attachInviteUser, claimInvite } from '../invites/invites.service';

/**
 * 注册。每个邀请码只能注册一个账号：
 * 占用邀请码和创建用户在同一个事务里，要么都成功要么都不发生，
 * 所以用户名重复时邀请码不会被白白用掉，两个人抢同一个码也只有一个能成功。
 */
export async function registerUser(
  db: Db,
  input: { username: string; password: string; inviteCode: string },
): Promise<User> {
  await assertInviteUsable(db, input.inviteCode);
  const passwordHash = await hash(input.password);
  // ADMIN_USERNAMES 里列出的用户名一注册就是管理员，不用等下次重启
  const role = config.ADMIN_USERNAMES.includes(input.username) ? 'admin' : 'user';
  try {
    return await db.transaction(async (tx) => {
      const inviteId = await claimInvite(tx, input.inviteCode, input.username);
      const [user] = await tx
        .insert(users)
        .values({ username: input.username, displayName: input.username, passwordHash, role })
        .returning();
      if (!user) throw new Error('insert returned no row');
      await attachInviteUser(tx, inviteId, user.id);
      return user;
    });
  } catch (error) {
    // 依赖唯一索引而不是先查后插，两个并发注册也不会都成功
    if (isUniqueViolation(error)) throw new AppError(409, '用户名已被使用', 'USERNAME_TAKEN');
    throw error;
  }
}

let dummyHashPromise: Promise<string> | undefined;
const dummyHash = () => (dummyHashPromise ??= hash('beechat-dummy-password'));

export async function authenticateUser(db: Db, username: string, password: string): Promise<User> {
  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  // 用户不存在时也跑一次校验，避免通过响应时间探测用户名是否存在
  const valid = await verify(user?.passwordHash ?? (await dummyHash()), password);
  if (!user || !valid) {
    throw new AppError(401, '用户名或密码错误', 'INVALID_CREDENTIALS');
  }
  return user;
}
