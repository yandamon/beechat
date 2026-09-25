import type { SendMessageAck } from '@beechat/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { socket } from '@/lib/socket';
import {
  type LocalMessage,
  appendMessage,
  applyMessageToConversations,
  markMessageFailed,
} from './cache';

/**
 * 发送文本消息：先乐观地插入本地列表，再通过 socket 发送并等待确认；
 * 确认后用服务端版本替换，失败则标记为失败可重试。
 */
export function useSendMessage(conversationId: number, meId: number) {
  const queryClient = useQueryClient();

  const transmit = useCallback(
    (message: LocalMessage) => {
      socket.emit(
        'message:send',
        {
          conversationId,
          clientId: message.clientId,
          type: 'text',
          content: message.content ?? '',
        },
        (ack: SendMessageAck) => {
          if (ack.ok) {
            appendMessage(queryClient, ack.message);
            applyMessageToConversations(queryClient, ack.message, { meId, isActive: true });
          } else {
            markMessageFailed(queryClient, conversationId, message.clientId);
          }
        },
      );
    },
    [conversationId, meId, queryClient],
  );

  const send = useCallback(
    (content: string) => {
      const optimistic: LocalMessage = {
        // 负数 id 表示尚未落库，服务端确认后会被替换
        id: -Date.now(),
        conversationId,
        senderId: meId,
        type: 'text',
        content,
        attachment: null,
        clientId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        deletedAt: null,
        pending: true,
      };
      appendMessage(queryClient, optimistic);
      applyMessageToConversations(queryClient, optimistic, { meId, isActive: true });
      transmit(optimistic);
    },
    [conversationId, meId, queryClient, transmit],
  );

  /** 重试沿用原来的 clientId，服务端按它去重，不会发出两条 */
  const retry = useCallback(
    (message: LocalMessage) => {
      appendMessage(queryClient, { ...message, pending: true, failed: false });
      transmit(message);
    },
    [queryClient, transmit],
  );

  return { send, retry };
}
