import type { TypingEvent } from '@beechat/shared';
import { create } from 'zustand';

/** 当前打开的会话；实时事件用它判断新消息要不要算未读 */
interface ActiveConversationState {
  conversationId: number | null;
  set: (conversationId: number | null) => void;
}

export const useActiveConversationStore = create<ActiveConversationState>((set) => ({
  conversationId: null,
  set: (conversationId) => set({ conversationId }),
}));

/** 正在输入：会话 → 用户 → 过期时间；对方停止或超时后清掉 */
const TYPING_TTL_MS = 6_000;

interface TypingState {
  typing: Record<number, Record<number, number>>;
  apply: (event: TypingEvent) => void;
  clear: (conversationId: number, userId: number) => void;
}

export const useTypingStore = create<TypingState>((set, get) => ({
  typing: {},
  apply: (event) => {
    if (!event.isTyping) {
      get().clear(event.conversationId, event.userId);
      return;
    }
    const expiresAt = Date.now() + TYPING_TTL_MS;
    set((state) => ({
      typing: {
        ...state.typing,
        [event.conversationId]: {
          ...state.typing[event.conversationId],
          [event.userId]: expiresAt,
        },
      },
    }));
    setTimeout(() => {
      const current = get().typing[event.conversationId]?.[event.userId];
      if (current === expiresAt) get().clear(event.conversationId, event.userId);
    }, TYPING_TTL_MS);
  },
  clear: (conversationId, userId) =>
    set((state) => {
      const conversation = state.typing[conversationId];
      if (!conversation || !(userId in conversation)) return state;
      const rest = { ...conversation };
      delete rest[userId];
      return { typing: { ...state.typing, [conversationId]: rest } };
    }),
}));

/** 某个会话里正在输入的用户 id 列表 */
export function useTypingUsers(conversationId: number): number[] {
  const entries = useTypingStore((state) => state.typing[conversationId]);
  if (!entries) return [];
  const now = Date.now();
  return Object.entries(entries)
    .filter(([, expiresAt]) => expiresAt > now)
    .map(([userId]) => Number(userId));
}
