import type { ReplyPreview, SendMessageAck, SendMessagePayload } from '@beechat/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { socket } from '@/lib/socket';
import {
  type LocalMessage,
  appendMessage,
  applyMessageToConversations,
  markMessageFailed,
} from './cache';
import { uploadImage } from './upload';

/** 还没发成功的图片文件，按 clientId 记着以便重试时重新上传 */
const pendingImageFiles = new Map<string, File>();

/**
 * 发送消息：先乐观地插入本地列表，再通过 socket 发送并等待确认；
 * 确认后用服务端版本替换，失败则标记为失败可重试。
 * 图片先在浏览器里压缩并直传，再把上传 key 发给服务端。
 */
export function useSendMessage(conversationId: number, meId: number) {
  const queryClient = useQueryClient();

  const transmit = useCallback(
    (payload: SendMessagePayload) => {
      socket.emit('message:send', payload, (ack: SendMessageAck) => {
        if (ack.ok) {
          appendMessage(queryClient, ack.message);
          applyMessageToConversations(queryClient, ack.message, { meId, isActive: true });
          pendingImageFiles.delete(payload.clientId);
        } else {
          markMessageFailed(queryClient, conversationId, payload.clientId);
        }
      });
    },
    [conversationId, meId, queryClient],
  );

  const insertOptimistic = useCallback(
    (message: LocalMessage) => {
      appendMessage(queryClient, message);
      applyMessageToConversations(queryClient, message, { meId, isActive: true });
    },
    [meId, queryClient],
  );

  const send = useCallback(
    (content: string, replyTo: ReplyPreview | null = null) => {
      const clientId = crypto.randomUUID();
      insertOptimistic({
        // 负数 id 表示尚未落库，服务端确认后会被替换
        id: -Date.now(),
        conversationId,
        senderId: meId,
        type: 'text',
        content,
        attachment: null,
        replyTo,
        reactions: [],
        clientId,
        createdAt: new Date().toISOString(),
        deletedAt: null,
        pending: true,
      });
      transmit({
        conversationId,
        clientId,
        type: 'text',
        content,
        ...(replyTo ? { replyToId: replyTo.id } : {}),
      });
    },
    [conversationId, meId, insertOptimistic, transmit],
  );

  const uploadAndTransmit = useCallback(
    async (clientId: string, file: File) => {
      try {
        const uploaded = await uploadImage(file, 'image');
        transmit({ conversationId, clientId, type: 'image', attachmentKey: uploaded.key });
      } catch {
        markMessageFailed(queryClient, conversationId, clientId);
      }
    },
    [conversationId, queryClient, transmit],
  );

  const sendImage = useCallback(
    (file: File) => {
      const clientId = crypto.randomUUID();
      pendingImageFiles.set(clientId, file);
      insertOptimistic({
        id: -Date.now(),
        conversationId,
        senderId: meId,
        type: 'image',
        content: null,
        // 先用本地预览，服务端确认后换成真正的地址
        attachment: {
          url: URL.createObjectURL(file),
          width: 0,
          height: 0,
          size: file.size,
          mime: file.type,
        },
        replyTo: null,
        reactions: [],
        clientId,
        createdAt: new Date().toISOString(),
        deletedAt: null,
        pending: true,
      });
      void uploadAndTransmit(clientId, file);
    },
    [conversationId, meId, insertOptimistic, uploadAndTransmit],
  );

  /** 重试沿用原来的 clientId，服务端按它去重，不会发出两条 */
  const retry = useCallback(
    (message: LocalMessage) => {
      appendMessage(queryClient, { ...message, pending: true, failed: false });
      if (message.type === 'image') {
        const file = pendingImageFiles.get(message.clientId);
        if (file) void uploadAndTransmit(message.clientId, file);
        else markMessageFailed(queryClient, conversationId, message.clientId);
        return;
      }
      transmit({
        conversationId,
        clientId: message.clientId,
        type: 'text',
        content: message.content ?? '',
        ...(message.replyTo ? { replyToId: message.replyTo.id } : {}),
      });
    },
    [conversationId, queryClient, transmit, uploadAndTransmit],
  );

  return { send, sendImage, retry };
}
