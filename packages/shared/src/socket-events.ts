import type { ConversationView, MessageView, ReactionSummary } from './types/chat';
import type { FriendRequestView, FriendView } from './types/friends';

/** 在线状态变化，只推给该用户的好友 */
export interface PresenceEvent {
  userId: number;
  online: boolean;
  lastSeenAt: string | null;
}

/** 正在输入，只推给同一会话的其他成员，不落库 */
export interface TypingEvent {
  conversationId: number;
  userId: number;
  isTyping: boolean;
}

/** 某人把某会话读到了某条消息；推给会话全部成员：本人其他连接同步未读，对方用来显示“已读” */
export interface ReadEvent {
  conversationId: number;
  userId: number;
  messageId: number;
}

export type SendMessagePayload =
  | {
      conversationId: number;
      /** 客户端生成的 UUID，重试时复用即可去重 */
      clientId: string;
      type: 'text';
      content: string;
      replyToId?: number;
    }
  | {
      conversationId: number;
      clientId: string;
      type: 'image';
      /** 上传完成后拿到的 key */
      attachmentKey: string;
      replyToId?: number;
    };

export type SendMessageAck =
  { ok: true; message: MessageView } | { ok: false; code: string; message: string };

/** 客户端 → 服务端 */
export interface ClientToServerEvents {
  'message:send': (payload: SendMessagePayload, ack: (result: SendMessageAck) => void) => void;
  'typing:start': (payload: { conversationId: number }) => void;
  'typing:stop': (payload: { conversationId: number }) => void;
  'conversation:read': (payload: { conversationId: number; messageId: number }) => void;
}

/** 服务端 → 客户端 */
export interface ServerToClientEvents {
  'message:new': (message: MessageView) => void;
  /** 消息被撤回等变更，整条消息视图重新下发 */
  'message:updated': (message: MessageView) => void;
  /** 某条消息的回应汇总变了 */
  'message:reactions': (event: {
    conversationId: number;
    messageId: number;
    reactions: ReactionSummary[];
  }) => void;
  typing: (event: TypingEvent) => void;
  presence: (event: PresenceEvent) => void;
  'conversation:updated': (conversation: ConversationView) => void;
  /** 被移出群聊或群被解散，客户端应从列表移除 */
  'conversation:removed': (event: { conversationId: number }) => void;
  'conversation:read': (event: ReadEvent) => void;
  'friend:request': (request: FriendRequestView) => void;
  'friend:accepted': (friend: FriendView) => void;
  'friend:removed': (event: { userId: number }) => void;
}
