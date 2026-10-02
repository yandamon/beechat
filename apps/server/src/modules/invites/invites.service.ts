import { randomInt } from 'node:crypto';
import {
  type CreateInvitesInput,
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  type InviteCounts,
  type InviteListResponse,
  type InviteStatus,
  type InviteView,
  formatInviteCode,
} from '@beechat/shared';
import { type SQL, and, desc, eq, gt, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbLike } from '../../db/client';
import { type InviteCode, inviteCodes, users } from '../../db/schema';
import { isUniqueViolation } from '../../lib/db-errors';
import { AppError } from '../../lib/errors';

const DAY_MS = 24 * 60 * 60 * 1000;
/** 列表一次最多返回这么多条，最新的在前；真到这个量级再做分页 */
const LIST_LIMIT = 500;

const creator = alias(users, 'invite_creator');
const redeemer = alias(users, 'invite_redeemer');

/** 12 位随机码，约 59 位熵；注册接口有限流，猜是猜不出来的 */
export function generateInviteCode(): string {
  let code = '';
  for (let index = 0; index < INVITE_CODE_LENGTH; index += 1) {
    code += INVITE_CODE_ALPHABET.charAt(randomInt(INVITE_CODE_ALPHABET.length));
  }
  return code;
}

type InviteTimes = Pick<InviteCode, 'usedAt' | 'revokedAt' | 'expiresAt'>;

export function inviteStatusOf(invite: InviteTimes, now = new Date()): InviteStatus {
  if (invite.usedAt) return 'used';
  if (invite.revokedAt) return 'revoked';
  if (invite.expiresAt && invite.expiresAt <= now) return 'expired';
  return 'unused';
}

/** 和 inviteStatusOf 同一套规则，写成查询条件 */
function statusCondition(status: InviteStatus, now: Date): SQL | undefined {
  const notUsed = isNull(inviteCodes.usedAt);
  const notRevoked = isNull(inviteCodes.revokedAt);
  switch (status) {
    case 'used':
      return isNotNull(inviteCodes.usedAt);
    case 'revoked':
      return and(notUsed, isNotNull(inviteCodes.revokedAt));
    case 'expired':
      return and(notUsed, notRevoked, lte(inviteCodes.expiresAt, now));
    case 'unused':
      return and(
        notUsed,
        notRevoked,
        or(isNull(inviteCodes.expiresAt), gt(inviteCodes.expiresAt, now)),
      );
  }
}

interface InviteRow {
  invite: InviteCode;
  creator: { id: number; username: string; displayName: string } | null;
  redeemer: { id: number; username: string; displayName: string } | null;
}

function toInviteView({ invite, creator: createdBy, redeemer: usedBy }: InviteRow): InviteView {
  return {
    id: invite.id,
    code: formatInviteCode(invite.code),
    note: invite.note,
    status: inviteStatusOf(invite),
    createdAt: invite.createdAt.toISOString(),
    createdBy,
    expiresAt: invite.expiresAt?.toISOString() ?? null,
    usedAt: invite.usedAt?.toISOString() ?? null,
    usedBy: invite.usedAt
      ? {
          id: usedBy?.id ?? null,
          // 账号注销后关联被置空，用注册时记下的用户名
          username: usedBy?.username ?? invite.usedByUsername ?? '',
          displayName: usedBy?.displayName ?? null,
        }
      : null,
    revokedAt: invite.revokedAt?.toISOString() ?? null,
  };
}

function selectInvites(db: DbLike) {
  return db
    .select({
      invite: inviteCodes,
      creator: { id: creator.id, username: creator.username, displayName: creator.displayName },
      redeemer: {
        id: redeemer.id,
        username: redeemer.username,
        displayName: redeemer.displayName,
      },
    })
    .from(inviteCodes)
    .leftJoin(creator, eq(creator.id, inviteCodes.createdBy))
    .leftJoin(redeemer, eq(redeemer.id, inviteCodes.usedBy));
}

async function countInvites(db: DbLike, now: Date): Promise<InviteCounts> {
  const count = (status: InviteStatus) =>
    sql<number>`count(*) filter (where ${statusCondition(status, now)})`.mapWith(Number);
  const [row] = await db
    .select({
      unused: count('unused'),
      used: count('used'),
      revoked: count('revoked'),
      expired: count('expired'),
    })
    .from(inviteCodes);
  return row ?? { unused: 0, used: 0, revoked: 0, expired: 0 };
}

export async function listInvites(db: DbLike, status?: InviteStatus): Promise<InviteListResponse> {
  const now = new Date();
  const rows = await selectInvites(db)
    .where(status ? statusCondition(status, now) : undefined)
    .orderBy(desc(inviteCodes.id))
    .limit(LIST_LIMIT);
  return { invites: rows.map(toInviteView), counts: await countInvites(db, now) };
}

async function getInviteView(db: DbLike, id: number): Promise<InviteView | null> {
  const [row] = await selectInvites(db).where(eq(inviteCodes.id, id)).limit(1);
  return row ? toInviteView(row) : null;
}

/**
 * 生成一批邀请码。createdBy 传 null 表示命令行生成的（还没有管理员时的第一批）。
 * 返回值按生成顺序排列。
 */
export async function createInvites(
  db: DbLike,
  createdBy: number | null,
  input: CreateInvitesInput,
): Promise<InviteView[]> {
  const note = input.note?.length ? input.note : null;
  const expiresAt =
    input.expiresInDays !== undefined ? new Date(Date.now() + input.expiresInDays * DAY_MS) : null;
  const build = () =>
    Array.from({ length: input.count }, () => ({
      code: generateInviteCode(),
      note,
      createdBy,
      expiresAt,
    }));

  let inserted: { id: number }[];
  try {
    inserted = await db.insert(inviteCodes).values(build()).returning({ id: inviteCodes.id });
  } catch (error) {
    // 撞码的概率微乎其微，真撞上了整批重来一次
    if (!isUniqueViolation(error)) throw error;
    inserted = await db.insert(inviteCodes).values(build()).returning({ id: inviteCodes.id });
  }

  const views: InviteView[] = [];
  for (const { id } of inserted) {
    const view = await getInviteView(db, id);
    if (view) views.push(view);
  }
  return views;
}

/** 作废一个还没用过的邀请码；已经作废的再作废一次不报错 */
export async function revokeInvite(db: DbLike, id: number): Promise<InviteView> {
  const [existing] = await db.select().from(inviteCodes).where(eq(inviteCodes.id, id)).limit(1);
  if (!existing) throw new AppError(404, '邀请码不存在', 'INVITE_NOT_FOUND');
  if (existing.usedAt) throw new AppError(400, '已经用过的邀请码不能作废', 'INVITE_ALREADY_USED');
  if (!existing.revokedAt) {
    // 条件里带上“还没用过”：和注册抢同一个码时，谁先更新到这一行算谁的
    await db
      .update(inviteCodes)
      .set({ revokedAt: new Date() })
      .where(and(eq(inviteCodes.id, id), isNull(inviteCodes.usedAt)));
  }
  const view = await getInviteView(db, id);
  if (!view) throw new AppError(404, '邀请码不存在', 'INVITE_NOT_FOUND');
  if (view.status === 'used') {
    throw new AppError(400, '已经用过的邀请码不能作废', 'INVITE_ALREADY_USED');
  }
  return view;
}

/** 这个码现在为什么不能用；能用时返回 null。给用户的提示要分清是填错了还是码已经失效。 */
async function inviteProblem(db: DbLike, code: string, now: Date): Promise<AppError | null> {
  const [existing] = await db.select().from(inviteCodes).where(eq(inviteCodes.code, code)).limit(1);
  if (!existing) return new AppError(403, '邀请码不正确', 'INVALID_INVITE_CODE');
  switch (inviteStatusOf(existing, now)) {
    case 'used':
      return new AppError(403, '邀请码已被使用', 'INVITE_CODE_USED');
    case 'revoked':
      return new AppError(403, '邀请码已作废', 'INVITE_CODE_REVOKED');
    case 'expired':
      return new AppError(403, '邀请码已过期', 'INVITE_CODE_EXPIRED');
    case 'unused':
      return null;
  }
}

/**
 * 注册流程一开始先看一眼邀请码能不能用，不能用就直接拒绝，省得白算一次密码哈希。
 * 这一步不加锁，真正的占用在 claimInvite 里。
 */
export async function assertInviteUsable(db: DbLike, code: string) {
  const problem = await inviteProblem(db, code, new Date());
  if (problem) throw problem;
}

/**
 * 注册时占用邀请码，必须在创建用户的同一个事务里调用。
 * 条件更新是原子的：两个人同时用同一个码，只有一个能更新到这一行，另一个拿到“已被使用”。
 * 事务回滚（比如用户名重复）时占用也一起撤销。返回邀请码的 id，创建用户后再填 usedBy。
 */
export async function claimInvite(tx: DbLike, code: string, username: string): Promise<number> {
  const now = new Date();
  const [claimed] = await tx
    .update(inviteCodes)
    .set({ usedAt: now, usedByUsername: username })
    .where(and(eq(inviteCodes.code, code), statusCondition('unused', now)))
    .returning({ id: inviteCodes.id });
  if (claimed) return claimed.id;
  // 没占到：刚才检查时还能用，说明这一瞬间被别人用掉、作废或者过期了
  throw (
    (await inviteProblem(tx, code, now)) ?? new AppError(403, '邀请码已被使用', 'INVITE_CODE_USED')
  );
}

export async function attachInviteUser(tx: DbLike, inviteId: number, userId: number) {
  await tx.update(inviteCodes).set({ usedBy: userId }).where(eq(inviteCodes.id, inviteId));
}
