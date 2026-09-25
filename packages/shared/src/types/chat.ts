import type { PublicUser } from './user';

export type ConversationType = 'direct' | 'group';
export type MessageType = 'text' | 'image' | 'system';
export type MemberRole = 'owner' | 'member';

export interface AttachmentView {
  url: string;
  width: number;
  height: number;
  size: number;
  mime: string;
}

/** 被引用消息的摘要，正文最多保留 80 字 */
export interface ReplyPreview {
  id: number;
  senderId: number | null;
  type: MessageType;
  content: string | null;
  deleted: boolean;
}

export interface MessageView {
  id: number;
  conversationId: number;
  /** 系统消息为 null */
  senderId: number | null;
  type: MessageType;
  content: string | null;
  attachment: AttachmentView | null;
  /** 引用的消息；没有引用为 null */
  replyTo: ReplyPreview | null;
  /** 客户端生成的幂等键 */
  clientId: string;
  createdAt: string;
  deletedAt: string | null;
}

/** 私聊对方，带当前在线状态 */
export interface PeerView extends PublicUser {
  online: boolean;
}

export interface ConversationMemberView extends PublicUser {
  role: MemberRole;
  joinedAt: string;
}

export interface ConversationView {
  id: number;
  type: ConversationType;
  /** 群名；私聊为 null，界面显示对方的名字 */
  name: string | null;
  avatarUrl: string | null;
  /** 私聊时是对方；群聊为 null */
  peer: PeerView | null;
  members: ConversationMemberView[];
  lastMessage: MessageView | null;
  lastMessageAt: string | null;
  /** 别人发的、在我已读位置之后的消息数 */
  unreadCount: number;
  lastReadMessageId: number | null;
  /** 私聊里对方读到的位置，用于“已读”标记；群聊为 null */
  peerLastReadMessageId: number | null;
  /** 我对这个会话的设置：置顶排在最前，免打扰不计未读也不通知 */
  pinned: boolean;
  muted: boolean;
  createdAt: string;
}

/** 历史消息分页：messages 按 id 升序，hasMore 表示更早的方向还有 */
export interface MessagePage {
  messages: MessageView[];
  hasMore: boolean;
}
