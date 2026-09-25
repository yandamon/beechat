import { randomUUID } from 'node:crypto';
import type { MessageView } from '@beechat/shared';
import { and, eq, ne } from 'drizzle-orm';
import { config } from '../../config';
import type { AppContext } from '../../context';
import { conversationMembers, conversations, messages, users } from '../../db/schema';
import { toMessageView } from '../../lib/views';
import { conversationRoom } from '../../realtime/rooms';

export const BOT_USERNAME = 'beebot';

const GREETINGS = ['你好', 'hi', 'hello', '嗨', '在吗'];
const TIPS = [
  '左上角的“新建群聊”可以把好友拉进一个群，群主还能改名和移出成员。',
  '输入框左边有表情和图片按钮，粘贴截图也能直接发出去。',
  '两分钟内发错的消息，把鼠标移上去点撤回就行。',
  '右上角点自己的名字可以换头像、改显示名，或者一键退出所有设备。',
  '侧栏的铃铛可以打开桌面通知，切到别的标签页也不会漏消息。',
  '试试在另一个浏览器里再登录一次，未读和已读会在两边同步。',
];

let tipCursor = 0;

function pickReply(incoming: MessageView): string {
  if (incoming.type === 'image') return '收到你的图片了 📷 图片会在浏览器里压缩后再上传。';
  const text = (incoming.content ?? '').trim().toLowerCase();
  if (GREETINGS.some((word) => text.includes(word))) {
    return '你好呀 👋 我是小蜜蜂助手，一个会自动回复的演示账号。想了解什么功能可以随便问。';
  }
  if (text.includes('谢谢')) return '不客气 😊';
  const tip = TIPS[tipCursor % TIPS.length] ?? TIPS[0];
  tipCursor += 1;
  return `收到：“${incoming.content?.slice(0, 40) ?? ''}”。顺便提一句，${tip}`;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 演示账号的助手会在私聊里自动回复：先显示“正在输入”，一秒后发回一条消息。
 * 只对私聊对象是助手的会话生效，完全不影响真实用户之间的聊天。
 */
export function maybeReplyAsBot(ctx: AppContext, incoming: MessageView) {
  if (!config.DEMO_ENABLED || incoming.senderId === null) return;
  void (async () => {
    try {
      const { db, io } = ctx;
      const [conversation] = await db
        .select({ type: conversations.type })
        .from(conversations)
        .where(eq(conversations.id, incoming.conversationId))
        .limit(1);
      if (conversation?.type !== 'direct') return;

      const [bot] = await db
        .select({ id: users.id })
        .from(conversationMembers)
        .innerJoin(users, eq(users.id, conversationMembers.userId))
        .where(
          and(
            eq(conversationMembers.conversationId, incoming.conversationId),
            ne(conversationMembers.userId, incoming.senderId ?? 0),
            eq(users.username, BOT_USERNAME),
          ),
        )
        .limit(1);
      if (!bot) return;

      const room = conversationRoom(incoming.conversationId);
      io.to(room).emit('typing', {
        conversationId: incoming.conversationId,
        userId: bot.id,
        isTyping: true,
      });
      await delay(1_000);

      const [reply] = await db
        .insert(messages)
        .values({
          conversationId: incoming.conversationId,
          senderId: bot.id,
          type: 'text',
          content: pickReply(incoming),
          clientId: randomUUID(),
        })
        .returning();
      if (!reply) return;
      await db
        .update(conversations)
        .set({ lastMessageAt: reply.createdAt })
        .where(eq(conversations.id, incoming.conversationId));
      await db
        .update(conversationMembers)
        .set({ lastReadMessageId: reply.id })
        .where(
          and(
            eq(conversationMembers.conversationId, incoming.conversationId),
            eq(conversationMembers.userId, bot.id),
          ),
        );
      io.to(room).emit('message:new', toMessageView(reply));
    } catch (error) {
      ctx.log.error(error, 'demo bot reply failed');
    }
  })();
}
