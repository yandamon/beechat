import { type CreateReportInput, LIMITS } from '@beechat/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { chatApi, friendsApi, reportsApi } from '@/lib/api';
import {
  applyReactions,
  queryKeys,
  removeConversation,
  replaceMessage,
  upsertConversation,
} from './cache';

export function useConversations() {
  return useQuery({
    queryKey: queryKeys.conversations,
    queryFn: async () => (await chatApi.conversations()).conversations,
  });
}

export function useMessages(conversationId: number) {
  return useInfiniteQuery({
    queryKey: queryKeys.messages(conversationId),
    queryFn: ({ pageParam }) =>
      chatApi.messages(conversationId, { before: pageParam, limit: LIMITS.historyPageSize }),
    initialPageParam: undefined as number | undefined,
    // “下一页”是更早的消息，游标是当前最早一条的 id
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.messages[0]?.id : undefined),
    // 实时事件负责保鲜，重连时统一重新拉取
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useFriends() {
  return useQuery({
    queryKey: queryKeys.friends,
    queryFn: async () => (await friendsApi.list()).friends,
  });
}

export function useFriendRequests() {
  return useQuery({ queryKey: queryKeys.friendRequests, queryFn: friendsApi.requests });
}

export function useSearchUsers(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: queryKeys.userSearch(trimmed),
    queryFn: async () => (await friendsApi.search(trimmed)).users,
    enabled: trimmed.length > 0,
    staleTime: 10_000,
  });
}

function useInvalidateFriends() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.friends });
    void queryClient.invalidateQueries({ queryKey: queryKeys.friendRequests });
    void queryClient.invalidateQueries({ queryKey: queryKeys.blocked });
    void queryClient.invalidateQueries({ queryKey: ['users', 'search'] });
  };
}

export function useBlocked() {
  return useQuery({
    queryKey: queryKeys.blocked,
    queryFn: async () => (await friendsApi.blocked()).blocked,
  });
}

export function useBlockUser() {
  const invalidate = useInvalidateFriends();
  return useMutation({
    mutationFn: (userId: number) => friendsApi.block(userId),
    onSuccess: invalidate,
  });
}

export function useUnblockUser() {
  const invalidate = useInvalidateFriends();
  return useMutation({
    mutationFn: (userId: number) => friendsApi.unblock(userId),
    onSuccess: invalidate,
  });
}

export function useSendFriendRequest() {
  const invalidate = useInvalidateFriends();
  return useMutation({
    mutationFn: (input: { userId: number; message?: string }) => friendsApi.sendRequest(input),
    onSuccess: invalidate,
  });
}

export function useRespondFriendRequest() {
  const invalidate = useInvalidateFriends();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, accept }: { id: number; accept: boolean }) =>
      accept ? friendsApi.accept(id) : friendsApi.reject(id),
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}

export function useRemoveFriend() {
  const invalidate = useInvalidateFriends();
  return useMutation({
    mutationFn: (userId: number) => friendsApi.remove(userId),
    onSuccess: invalidate,
  });
}

/** 和某个好友开始聊天：拿到会话后写进列表并跳过去 */
export function useOpenConversation() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async (userId: number) => (await chatApi.openDirect(userId)).conversation,
    onSuccess: (conversation) => {
      upsertConversation(queryClient, conversation);
      void navigate(`/c/${conversation.id}`);
    },
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async (input: { name: string; memberIds: number[] }) =>
      (await chatApi.createGroup(input)).conversation,
    onSuccess: (conversation) => {
      upsertConversation(queryClient, conversation);
      void navigate(`/c/${conversation.id}`);
    },
  });
}

/** 群主改群名或群头像 */
export function useUpdateGroup(conversationId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name?: string; avatarKey?: string | null }) =>
      (await chatApi.updateConversation(conversationId, input)).conversation,
    onSuccess: (conversation) => upsertConversation(queryClient, conversation),
  });
}

export function useAddMembers(conversationId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userIds: number[]) =>
      (await chatApi.addMembers(conversationId, { userIds })).conversation,
    onSuccess: (conversation) => upsertConversation(queryClient, conversation),
  });
}

/** 移出成员或自己退群；退群后回到会话列表 */
export function useRemoveMember(conversationId: number, meId: number) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (userId: number) => chatApi.removeMember(conversationId, userId),
    onSuccess: (_result, userId) => {
      if (userId === meId) {
        removeConversation(queryClient, conversationId);
        void navigate('/');
      }
    },
  });
}

/** 撤回自己的消息；服务端同时会广播 message:updated，这里先本地替换一次 */
export function useRecallMessage(conversationId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (messageId: number) =>
      (await chatApi.recall(conversationId, messageId)).message,
    onSuccess: (message) => replaceMessage(queryClient, message),
  });
}

/** 置顶或免打扰，只影响自己 */
export function useUpdateMembership(conversationId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { pinned?: boolean; muted?: boolean }) =>
      (await chatApi.updateMembership(conversationId, input)).conversation,
    onSuccess: (conversation) => upsertConversation(queryClient, conversation),
  });
}

/** 点一下加回应，再点取消；服务端同时会广播，这里先本地更新 */
export function useToggleReaction(conversationId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: number; emoji: string }) =>
      (await chatApi.toggleReaction(conversationId, messageId, emoji)).reactions,
    onSuccess: (reactions, { messageId }) =>
      applyReactions(queryClient, conversationId, messageId, reactions),
  });
}

/** 举报用户或消息：只是记录，不影响任何本地状态 */
export function useReport() {
  return useMutation({ mutationFn: (input: CreateReportInput) => reportsApi.create(input) });
}
