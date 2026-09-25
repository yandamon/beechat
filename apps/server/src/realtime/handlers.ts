import { readSchema, type SendMessageAck, sendMessageSchema, typingSchema } from '@beechat/shared';
import type { FastifyBaseLogger } from 'fastify';
import { ZodError } from 'zod';
import type { AppContext } from '../context';
import { AppError } from '../lib/errors';
import { listUserConversationIds } from '../modules/conversations/conversations.service';
import { markRead, sendMessage } from '../modules/conversations/messages.service';
import { conversationRoom, userRoom } from './rooms';

function toAckError(error: unknown, log: FastifyBaseLogger): SendMessageAck {
  if (error instanceof AppError) return { ok: false, code: error.code, message: error.message };
  if (error instanceof ZodError) {
    return { ok: false, code: 'VALIDATION', message: error.issues[0]?.message ?? '消息格式不正确' };
  }
  log.error(error, 'message:send failed');
  return { ok: false, code: 'INTERNAL', message: '发送失败，请稍后再试' };
}

/** 连接建立后的房间加入、在线状态与全部客户端事件 */
export function registerRealtimeHandlers(ctx: AppContext) {
  const { io, db, presence, log } = ctx;

  io.on('connection', (socket) => {
    const { userId } = socket.data;
    let joined = false;

    // 监听器必须同步注册，否则加入房间期间客户端发来的事件会丢失；
    // 每个处理函数先等房间就绪再干活
    const ready = (async () => {
      await socket.join(userRoom(userId));
      const conversationIds = await listUserConversationIds(db, userId);
      await socket.join(conversationIds.map(conversationRoom));
      joined = true;
      presence.connect(userId);
      log.info({ socketId: socket.id, userId }, 'socket connected');
    })().catch((error) => {
      log.error(error, 'failed to join rooms');
      socket.disconnect(true);
    });

    socket.on('message:send', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => undefined;
      await ready;
      try {
        const input = sendMessageSchema.parse(payload);
        const message = await sendMessage(ctx, userId, input);
        reply({ ok: true, message });
      } catch (error) {
        reply(toAckError(error, log));
      }
    });

    const relayTyping = async (payload: unknown, isTyping: boolean) => {
      await ready;
      const parsed = typingSchema.safeParse(payload);
      if (!parsed.success) return;
      const room = conversationRoom(parsed.data.conversationId);
      // 房间成员关系就是会话成员关系，不用再查库
      if (!socket.rooms.has(room)) return;
      socket
        .to(room)
        .emit('typing', { conversationId: parsed.data.conversationId, userId, isTyping });
    };
    socket.on('typing:start', (payload) => void relayTyping(payload, true));
    socket.on('typing:stop', (payload) => void relayTyping(payload, false));

    socket.on('conversation:read', async (payload) => {
      await ready;
      const parsed = readSchema.safeParse(payload);
      if (!parsed.success) return;
      const { conversationId, messageId } = parsed.data;
      if (!socket.rooms.has(conversationRoom(conversationId))) return;
      try {
        const changed = await markRead(ctx, userId, conversationId, messageId);
        // 同步给本人的其他连接，让别的标签页也清掉未读
        if (changed)
          io.to(userRoom(userId)).emit('conversation:read', { conversationId, userId, messageId });
      } catch (error) {
        log.error(error, 'conversation:read failed');
      }
    });

    socket.on('disconnect', async (reason) => {
      await ready;
      if (joined) presence.disconnect(userId);
      log.info({ socketId: socket.id, userId, reason }, 'socket disconnected');
    });
  });
}
