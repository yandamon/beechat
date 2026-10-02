import type { CreateInvitesInput, InviteStatus } from '@beechat/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';

export type InviteFilter = InviteStatus | 'all';

const INVITES_KEY = ['admin', 'invites'] as const;

/** 后台的邀请码列表。响应里带各状态的总数，切换筛选时沿用上一份数据，标签上的数字不会闪。 */
export function useInvites(filter: InviteFilter) {
  return useQuery({
    queryKey: [...INVITES_KEY, filter],
    queryFn: () => adminApi.listInvites(filter === 'all' ? undefined : filter),
    placeholderData: keepPreviousData,
  });
}

function useInvalidateInvites() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: INVITES_KEY });
}

export function useCreateInvites() {
  const invalidate = useInvalidateInvites();
  return useMutation({
    mutationFn: (input: CreateInvitesInput) => adminApi.createInvites(input),
    onSuccess: invalidate,
  });
}

export function useRevokeInvite() {
  const invalidate = useInvalidateInvites();
  return useMutation({
    mutationFn: (id: number) => adminApi.revokeInvite(id),
    onSuccess: invalidate,
  });
}
