import { hash, verify } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { config } from '../../config';
import type { Db } from '../../db/client';
import { type User, users } from '../../db/schema';
import { isUniqueViolation } from '../../lib/db-errors';
import { AppError } from '../../lib/errors';
import { safeEqual } from '../../lib/tokens';
import { toPublicUser } from '../../lib/views';

export { toPublicUser };

export function assertInviteCode(code: string) {
  if (!safeEqual(code, config.INVITE_CODE)) {
    throw new AppError(403, '邀请码不正确', 'INVALID_INVITE_CODE');
  }
}

export async function registerUser(
  db: Db,
  input: { username: string; password: string },
): Promise<User> {
  const passwordHash = await hash(input.password);
  try {
    const [user] = await db
      .insert(users)
      .values({ username: input.username, displayName: input.username, passwordHash })
      .returning();
    if (!user) throw new Error('insert returned no row');
    return user;
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
