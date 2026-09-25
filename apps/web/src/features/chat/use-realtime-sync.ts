import type {
  ConversationView,
  MessageView,
  PresenceEvent,
  ReadEvent,
  TypingEvent,
} from '@beechat/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { socket } from '@/lib/socket';
import {
  appendMessage,
  applyMessageToConversations,
  markConversationRead,
  queryKeys,
  removeConversation,
  setUserOnline,
  upsertConversation,
} from './cache';
import { useActiveConversationStore, useTypingStore } from './stores';

/** 把服务端推送的事件落到查询缓存和本地状态里；登录后挂一次即可 */
export function useRealtimeSync(meId: number) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    const onMessage = (message: MessageView) => {
      const active = useActiveConversationStore.getState().conversationId;
      const isActive = active === message.conversationId && document.visibilityState === 'visible';
      appendMessage(queryClient, message);
      applyMessageToConversations(queryClient, message, { meId, isActive });
      if (message.senderId !== null && message.senderId !== meId) {
        useTypingStore.getState().clear(message.conversationId, message.senderId);
      }
      // 正开着这个会话且页面可见，直接上报已读
      if (isActive && message.senderId !== meId) {
        socket.emit('conversation:read', {
          conversationId: message.conversationId,
          messageId: message.id,
        });
        markConversationRead(queryClient, message.conversationId, message.id);
      }
    };
    const onTyping = (event: TypingEvent) => {
      if (event.userId !== meId) useTypingStore.getState().apply(event);
    };
    const onPresence = (event: PresenceEvent) =>
      setUserOnline(queryClient, event.userId, event.online, event.lastSeenAt);
    const onConversationUpdated = (conversation: ConversationView) =>
      upsertConversation(queryClient, conversation);
    const onConversationRemoved = ({ conversationId }: { conversationId: number }) => {
      removeConversation(queryClient, conversationId);
      if (useActiveConversationStore.getState().conversationId === conversationId) {
        void navigate('/');
      }
    };
    const onRead = (event: ReadEvent) => {
      if (event.userId === meId) {
        markConversationRead(queryClient, event.conversationId, event.messageId);
      }
    };
    const onFriendRequest = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.friendRequests });
      void queryClient.invalidateQueries({ queryKey: ['users', 'search'] });
    };
    const onFriendAccepted = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.friends });
      void queryClient.invalidateQueries({ queryKey: queryKeys.friendRequests });
      void queryClient.invalidateQueries({ queryKey: ['users', 'search'] });
    };
    const onFriendRemoved = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.friends });
      void queryClient.invalidateQueries({ queryKey: ['users', 'search'] });
    };
    // 断线期间可能漏掉消息，重连后把会话与消息统一重新拉一遍
    const onReconnect = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      void queryClient.invalidateQueries({ queryKey: queryKeys.allMessages });
      void queryClient.invalidateQueries({ queryKey: queryKeys.friends });
    };

    socket.on('message:new', onMessage);
    socket.on('typing', onTyping);
    socket.on('presence', onPresence);
    socket.on('conversation:updated', onConversationUpdated);
    socket.on('conversation:removed', onConversationRemoved);
    socket.on('conversation:read', onRead);
    socket.on('friend:request', onFriendRequest);
    socket.on('friend:accepted', onFriendAccepted);
    socket.on('friend:removed', onFriendRemoved);
    socket.io.on('reconnect', onReconnect);

    return () => {
      socket.off('message:new', onMessage);
      socket.off('typing', onTyping);
      socket.off('presence', onPresence);
      socket.off('conversation:updated', onConversationUpdated);
      socket.off('conversation:removed', onConversationRemoved);
      socket.off('conversation:read', onRead);
      socket.off('friend:request', onFriendRequest);
      socket.off('friend:accepted', onFriendAccepted);
      socket.off('friend:removed', onFriendRemoved);
      socket.io.off('reconnect', onReconnect);
    };
  }, [queryClient, meId, navigate]);
}
