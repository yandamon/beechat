import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * 数据表定义。列名在 TS 里写 camelCase，drizzle 的 casing: 'snake_case' 会映射成数据库里的 snake_case。
 * 改动后运行 `pnpm db:generate` 生成迁移，服务启动时自动应用。
 * 表结构的说明见 docs/DESIGN.md 第 6 节。
 */

export const friendRequestStatus = pgEnum('friend_request_status', [
  'pending',
  'accepted',
  'rejected',
]);
export const friendshipStatus = pgEnum('friendship_status', ['friend', 'blocked']);
export const conversationType = pgEnum('conversation_type', ['direct', 'group']);
export const memberRole = pgEnum('member_role', ['owner', 'member']);
export const messageType = pgEnum('message_type', ['text', 'image', 'system']);
export const uploadKind = pgEnum('upload_kind', ['image', 'avatar']);

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  'users',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    /** 已归一化为小写，唯一 */
    username: text().notNull(),
    displayName: text().notNull(),
    passwordHash: text().notNull(),
    avatarKey: text(),
    lastSeenAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('users_username_idx').on(t.username)],
);

export const sessions = pgTable(
  'sessions',
  {
    /** 随机令牌的 sha256，原始令牌只存在于 Cookie 里 */
    id: text().primaryKey(),
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    userAgent: text(),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);

export const friendRequests = pgTable(
  'friend_requests',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    fromUserId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    toUserId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    message: text(),
    status: friendRequestStatus().notNull().default('pending'),
    respondedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('friend_requests_to_user_id_status_idx').on(t.toUserId, t.status),
    // 同一方向同一时刻只允许一条待处理申请
    uniqueIndex('friend_requests_pending_idx')
      .on(t.fromUserId, t.toUserId)
      .where(sql`status = 'pending'`),
  ],
);

/** 每对好友两行（A→B、B→A），方便按方向查询，也让拉黑可以是单向的 */
export const friendships = pgTable(
  'friendships',
  {
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    friendId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: friendshipStatus().notNull().default('friend'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.friendId] }),
    index('friendships_friend_id_idx').on(t.friendId),
  ],
);

export const conversations = pgTable(
  'conversations',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    type: conversationType().notNull(),
    /** 仅群聊有名字 */
    name: text(),
    /** 仅群聊有群主；群主注销后由应用层转让 */
    ownerId: integer().references(() => users.id, { onDelete: 'set null' }),
    avatarKey: text(),
    /** 一对一会话的唯一键：`${minUserId}:${maxUserId}`，保证两人之间只有一个会话 */
    directKey: text(),
    lastMessageAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('conversations_direct_key_idx').on(t.directKey)],
);

export const conversationMembers = pgTable(
  'conversation_members',
  {
    conversationId: integer()
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRole().notNull().default('member'),
    /** 已读到的消息 ID，未读数 = 此后消息数 */
    lastReadMessageId: bigint({ mode: 'number' }),
    /** 置顶：会话列表排最前 */
    pinned: boolean().notNull().default(false),
    /** 免打扰：不计未读、不发通知 */
    muted: boolean().notNull().default(false),
    joinedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.userId] }),
    index('conversation_members_user_id_idx').on(t.userId),
  ],
);

export interface AttachmentMeta {
  width: number;
  height: number;
  size: number;
  mime: string;
}

export const messages = pgTable(
  'messages',
  {
    /** 自增，用作排序与分页游标 */
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    conversationId: integer()
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    /** 系统消息没有发送者 */
    senderId: integer().references(() => users.id, { onDelete: 'cascade' }),
    type: messageType().notNull().default('text'),
    content: text(),
    attachmentKey: text(),
    attachmentMeta: jsonb().$type<AttachmentMeta>(),
    /** 引用的消息；被引用的消息删除后置空 */
    replyToId: bigint({ mode: 'number' }).references((): AnyPgColumn => messages.id, {
      onDelete: 'set null',
    }),
    /** 客户端生成的幂等键，重试不会产生重复消息 */
    clientId: uuid().notNull(),
    deletedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('messages_conversation_id_id_idx').on(t.conversationId, t.id),
    uniqueIndex('messages_sender_client_id_idx').on(t.senderId, t.clientId),
  ],
);

/** 追踪对象存储里的文件，便于清理未完成或已无引用的上传 */
export const uploads = pgTable(
  'uploads',
  {
    key: text().primaryKey(),
    ownerId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: uploadKind().notNull().default('image'),
    mime: text().notNull(),
    size: integer().notNull(),
    width: integer(),
    height: integer(),
    completedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('uploads_owner_id_idx').on(t.ownerId)],
);

/** 消息回应：同一个人对同一条消息的同一个表情只有一行 */
export const messageReactions = pgTable(
  'message_reactions',
  {
    messageId: bigint({ mode: 'number' })
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.messageId, t.userId, t.emoji] }),
    index('message_reactions_message_id_idx').on(t.messageId),
  ],
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type FriendRequest = typeof friendRequests.$inferSelect;
export type Friendship = typeof friendships.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type ConversationMember = typeof conversationMembers.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Upload = typeof uploads.$inferSelect;

/** 应用级键值设置，例如演示数据上次重置的时间 */
export const appSettings = pgTable('app_settings', {
  key: text().primaryKey(),
  value: text().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export type AppSetting = typeof appSettings.$inferSelect;
