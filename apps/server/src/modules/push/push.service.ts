import type { MessageView, PushSubscriptionInput } from '@beechat/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import webPush from 'web-push';
import type { Db } from '../../db/client';
import { conversationMembers, conversations, pushSubscriptions, users } from '../../db/schema';
import type { PresenceService } from '../../realtime/presence';

export interface PushPayload {
  title: string;
  body: string;
  /** 点击通知打开的页面 */
  url: string;
  /** 同一会话只保留最新一条通知 */
  tag: string;
}

/** 真正把通知交给浏览器推送服务的函数；测试里换成假的 */
export type PushSender = (
  subscription: PushSubscriptionInput,
  payload: PushPayload,
) => Promise<void>;

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  /** mailto: 或 https: 地址，推送服务出问题时联系用 */
  subject: string;
}

export interface PushServiceOptions {
  db: Db;
  presence: PresenceService;
  log: FastifyBaseLogger;
  /** 没配密钥就整体关闭，接口返回 publicKey: null */
  vapid?: VapidKeys;
  sender?: PushSender;
}

const BODY_MAX = 100;

/**
 * Web 推送：用户开启桌面通知后把这台设备的订阅存下来，
 * 新消息到达时给不在线、没开免打扰的成员推送；推送服务说订阅失效就删掉。
 */
export class PushService {
  readonly publicKey: string | null;
  private readonly sender: PushSender | null;

  constructor(private readonly options: PushServiceOptions) {
    const { vapid, sender } = options;
    this.publicKey = vapid?.publicKey ?? null;
    if (sender) {
      this.sender = sender;
    } else if (vapid) {
      webPush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
      this.sender = async (subscription, payload) => {
        await webPush.sendNotification(subscription, JSON.stringify(payload), { TTL: 60 * 60 });
      };
    } else {
      this.sender = null;
    }
  }

  get enabled() {
    return this.sender !== null && this.publicKey !== null;
  }

  /** 同一个 endpoint 只保留一行；换账号登录同一台设备时改归属 */
  async subscribe(userId: number, input: PushSubscriptionInput, userAgent: string | null) {
    const values = {
      userId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent,
    };
    await this.options.db
      .insert(pushSubscriptions)
      .values(values)
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values });
  }

  async unsubscribe(userId: number, endpoint: string) {
    await this.options.db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
  }

  /** 退出所有设备时一起清掉，免得已退出的设备还收到推送 */
  async removeAllForUser(userId: number) {
    await this.options.db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  }

  /** 新消息：给不在线、没开免打扰的成员推送。失败只记日志，不影响发送。 */
  async notifyNewMessage(view: MessageView) {
    const sender = this.sender;
    if (!sender || this.publicKey === null) return;
    const { db, presence, log } = this.options;
    try {
      const members = await db
        .select({ userId: conversationMembers.userId, muted: conversationMembers.muted })
        .from(conversationMembers)
        .where(eq(conversationMembers.conversationId, view.conversationId));
      const recipients = members
        .filter(
          (member) =>
            member.userId !== view.senderId && !member.muted && !presence.isOnline(member.userId),
        )
        .map((member) => member.userId);
      if (recipients.length === 0) return;
      const subscriptions = await db
        .select()
        .from(pushSubscriptions)
        .where(inArray(pushSubscriptions.userId, recipients));
      if (subscriptions.length === 0) return;

      const [conversation] = await db
        .select({ type: conversations.type, name: conversations.name })
        .from(conversations)
        .where(eq(conversations.id, view.conversationId))
        .limit(1);
      let senderName = '小蜜蜂';
      if (view.senderId !== null) {
        const [row] = await db
          .select({ displayName: users.displayName })
          .from(users)
          .where(eq(users.id, view.senderId))
          .limit(1);
        if (row) senderName = row.displayName;
      }
      const title =
        conversation?.type === 'group'
          ? `${senderName} · ${conversation.name ?? '群聊'}`
          : senderName;
      const text = view.type === 'image' ? '[图片]' : (view.content ?? '');
      const payload: PushPayload = {
        title,
        body: text.length > BODY_MAX ? `${text.slice(0, BODY_MAX)}…` : text,
        url: `/c/${view.conversationId}`,
        tag: `conversation-${view.conversationId}`,
      };

      await Promise.all(
        subscriptions.map(async (subscription) => {
          try {
            await sender(
              {
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth },
              },
              payload,
            );
          } catch (error) {
            const statusCode = (error as { statusCode?: number }).statusCode;
            // 404/410：订阅已经失效，删掉；其它错误下次再试
            if (statusCode === 404 || statusCode === 410) {
              await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id));
              return;
            }
            log.warn({ err: error, endpoint: subscription.endpoint }, 'push delivery failed');
          }
        }),
      );
    } catch (error) {
      log.error({ err: error }, 'push notify failed');
    }
  }
}
