import { readSchema, type SendMessageAck, sendMessageSchema, typingSchema } from '@beechat/shared';
import type { FastifyBaseLogger } from 'fastify';
import { ZodError } from 'zod';
import type { AppContext } from '../context';
import { AppError } from '../lib/errors';
import { markRead, sendMessage } from '../modules/conversations/messages.service';
import { conversationRoom } from './rooms';

function toAckError(error: unknown, log: FastifyBaseLogger): SendMessageAck {
  if (error instanceof AppError) return { ok: false, code: error.code, message: error.message };
  if (error instanceof ZodError) {
    return { ok: false, code: 'VALIDATION', message: error.issues[0]?.message ?? '消息格式不正确' };
  }
  log.error(error, 'message:send failed');
  return { ok: false, code: 'INTERNAL', message: '发送失败，请稍后再试' };
}

/**
 * 连接建立后的在线状态与全部客户端事件。
 * 房间已在握手中间件里加入完毕，这里的监听器同步注册，不会漏事件。
 */
export function registerRealtimeHandlers(ctx: AppContext) {
  const { io, presence, log } = ctx;

  io.on('connection', (socket) => {
    const { userId } = socket.data;
    presence.connect(userId);
    log.info({ socketId: socket.id, userId }, 'socket connected');

    socket.on('message:send', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => undefined;
      try {
        const input = sendMessageSchema.parse(payload);
        const message = await sendMessage(ctx, userId, input);
        reply({ ok: true, message });
      } catch (error) {
        reply(toAckError(error, log));
      }
    });

    const relayTyping = (payload: unknown, isTyping: boolean) => {
      const parsed = typingSchema.safeParse(payload);
      if (!parsed.success) return;
      const room = conversationRoom(parsed.data.conversationId);
      // 房间成员关系就是会话成员关系，不用再查库
      if (!socket.rooms.has(room)) return;
      socket
        .to(room)
        .emit('typing', { conversationId: parsed.data.conversationId, userId, isTyping });
    };
    socket.on('typing:start', (payload) => relayTyping(payload, true));
    socket.on('typing:stop', (payload) => relayTyping(payload, false));

    socket.on('conversation:read', async (payload) => {
      const parsed = readSchema.safeParse(payload);
      if (!parsed.success) return;
      const { conversationId, messageId } = parsed.data;
      if (!socket.rooms.has(conversationRoom(conversationId))) return;
      try {
        const changed = await markRead(ctx, userId, conversationId, messageId);
        // 推给整个会话：本人其他连接清未读，对方显示“已读”
        if (changed)
          io.to(conversationRoom(conversationId)).emit('conversation:read', {
            conversationId,
            userId,
            messageId,
          });
      } catch (error) {
        log.error(error, 'conversation:read failed');
      }
    });

    socket.on('disconnect', (reason) => {
      presence.disconnect(userId);
      log.info({ socketId: socket.id, userId, reason }, 'socket disconnected');
    });
  });
}
