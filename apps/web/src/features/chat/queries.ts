import { LIMITS } from '@beechat/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { chatApi, friendsApi } from '@/lib/api';
import { queryKeys, removeConversation, upsertConversation } from './cache';

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
    void queryClient.invalidateQueries({ queryKey: ['users', 'search'] });
  };
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

export function useRenameGroup(conversationId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => (await chatApi.rename(conversationId, name)).conversation,
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
