import { randomBytes, randomUUID } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { eq, inArray, sql } from 'drizzle-orm';
import { config } from '../../config';
import type { AppContext } from '../../context';
import type { Tx } from '../../db/client';
import {
  appSettings,
  conversationMembers,
  conversations,
  friendships,
  messages,
  type User,
  users,
} from '../../db/schema';
import { AppError } from '../../lib/errors';
import { getOrCreateDirectConversation } from '../conversations/conversations.service';

export const DEMO_USERNAME = 'demo';
/** 演示数据涉及的全部账号，重置时整体删掉重建 */
const DEMO_CAST = ['demo', 'beebot', 'xiaoya', 'laowang'];
const SEEDED_AT_KEY = 'demo_seeded_at';
const RESET_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** pg 咨询锁的键，保证并发登录时只有一个连接在重置 */
const DEMO_LOCK_ID = 7_431_001;

/**
 * 演示账号一键登录：数据超过一天就先重置再登录。
 * 演示账号之间的会话与消息由 resetDemoData 造出来，任何人都不知道它们的密码。
 */
export async function loginDemo(ctx: AppContext): Promise<User> {
  if (!config.DEMO_ENABLED) throw new AppError(404, '演示账号未开放', 'DEMO_DISABLED');
  return ctx.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${DEMO_LOCK_ID})`);
    const [setting] = await tx
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, SEEDED_AT_KEY))
      .limit(1);
    const seededAt = setting ? Date.parse(setting.value) : Number.NaN;
    const [existing] = await tx
      .select()
      .from(users)
      .where(eq(users.username, DEMO_USERNAME))
      .limit(1);
    const fresh =
      existing !== undefined &&
      Number.isFinite(seededAt) &&
      Date.now() - seededAt < RESET_INTERVAL_MS;
    return fresh ? existing : resetDemoData(tx);
  });
}

interface SeedMessage {
  sender: User | null;
  content: string;
  at: number;
}

async function insertMessages(tx: Tx, conversationId: number, list: SeedMessage[]) {
  const rows = await tx
    .insert(messages)
    .values(
      list.map((entry) => ({
        conversationId,
        senderId: entry.sender?.id ?? null,
        type: entry.sender ? ('text' as const) : ('system' as const),
        content: entry.content,
        clientId: randomUUID(),
        createdAt: new Date(entry.at),
      })),
    )
    .returning();
  const last = list[list.length - 1];
  if (last) {
    await tx
      .update(conversations)
      .set({ lastMessageAt: new Date(last.at) })
      .where(eq(conversations.id, conversationId));
  }
  return rows;
}

async function markRead(tx: Tx, conversationId: number, userId: number, messageId: number) {
  await tx
    .update(conversationMembers)
    .set({ lastReadMessageId: messageId })
    .where(
      sql`${conversationMembers.conversationId} = ${conversationId} and ${conversationMembers.userId} = ${userId}`,
    );
}

/** 删掉演示账号及其会话（级联清空成员、消息、会话记录），再重新造一份 */
export async function resetDemoData(tx: Tx): Promise<User> {
  const oldCast = await tx
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.username, DEMO_CAST));
  if (oldCast.length > 0) {
    const oldIds = oldCast.map((row) => row.id);
    const oldConversations = await tx
      .select({ conversationId: conversationMembers.conversationId })
      .from(conversationMembers)
      .where(inArray(conversationMembers.userId, oldIds));
    const conversationIds = [...new Set(oldConversations.map((row) => row.conversationId))];
    if (conversationIds.length > 0) {
      await tx.delete(conversations).where(inArray(conversations.id, conversationIds));
    }
    await tx.delete(users).where(inArray(users.id, oldIds));
  }

  // 随机密码，谁也不能用密码登录这些账号，只能走演示入口
  const passwordHash = await hash(randomBytes(24).toString('base64url'));
  const inserted = await tx
    .insert(users)
    .values([
      { username: 'demo', displayName: '演示访客', passwordHash },
      { username: 'beebot', displayName: '小蜜蜂助手', passwordHash },
      { username: 'xiaoya', displayName: '小雅', passwordHash },
      { username: 'laowang', displayName: '老王', passwordHash },
    ])
    .returning();
  const byName = new Map(inserted.map((user) => [user.username, user]));
  const demo = byName.get('demo');
  const bot = byName.get('beebot');
  const xiaoya = byName.get('xiaoya');
  const laowang = byName.get('laowang');
  if (!demo || !bot || !xiaoya || !laowang) throw new Error('demo users were not created');

  const friendsOfDemo = [bot, xiaoya, laowang];
  await tx.insert(friendships).values(
    friendsOfDemo.flatMap((friend) => [
      { userId: demo.id, friendId: friend.id },
      { userId: friend.id, friendId: demo.id },
    ]),
  );

  const minute = 60 * 1000;
  const now = Date.now();

  const direct = await getOrCreateDirectConversation(tx, demo.id, bot.id);
  const directMessages = await insertMessages(tx, direct.id, [
    { sender: bot, content: '你好，我是小蜜蜂助手 👋 欢迎来试用。', at: now - 90 * minute },
    {
      sender: bot,
      content: '这是一个演示账号，数据每天会自动重置，随便试。',
      at: now - 89 * minute,
    },
    { sender: demo, content: '好的，我先看看。', at: now - 80 * minute },
    {
      sender: bot,
      content: '左边是会话列表，试试在这里给我发一条消息；右上角可以切换深色模式。',
      at: now - 79 * minute,
    },
    {
      sender: bot,
      content: '想拉人进群点左上角的“新建群聊”，想加好友去“好友”页按用户名搜索。',
      at: now - 78 * minute,
    },
  ]);
  const lastDirect = directMessages[directMessages.length - 1];
  if (lastDirect) await markRead(tx, direct.id, demo.id, lastDirect.id);

  const [group] = await tx
    .insert(conversations)
    .values({ type: 'group', name: '小蜜蜂交流群', ownerId: bot.id })
    .returning();
  if (!group) throw new Error('demo group was not created');
  await tx.insert(conversationMembers).values([
    { conversationId: group.id, userId: bot.id, role: 'owner' as const },
    { conversationId: group.id, userId: demo.id },
    { conversationId: group.id, userId: xiaoya.id },
    { conversationId: group.id, userId: laowang.id },
  ]);
  const groupMessages = await insertMessages(tx, group.id, [
    { sender: null, content: '小蜜蜂助手 创建了群聊', at: now - 40 * minute },
    { sender: xiaoya, content: '大家好呀 🌸', at: now - 30 * minute },
    { sender: laowang, content: '这周末谁有空？一起去爬山 🏔️', at: now - 12 * minute },
    { sender: xiaoya, content: '我可以！几点出发？', at: now - 6 * minute },
    { sender: bot, content: '演示访客也一起来吧，在群里回一句试试。', at: now - 2 * minute },
  ]);
  // 群里留两条未读，让访客一进来就能看到角标
  const readUpTo = groupMessages[2];
  if (readUpTo) await markRead(tx, group.id, demo.id, readUpTo.id);

  const seededAt = new Date();
  await tx
    .insert(appSettings)
    .values({ key: SEEDED_AT_KEY, value: seededAt.toISOString(), updatedAt: seededAt })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: seededAt.toISOString(), updatedAt: seededAt },
    });

  return demo;
}
