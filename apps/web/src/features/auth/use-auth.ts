import type { LoginInput, PublicUser, RegisterInput, UpdateProfileInput } from '@beechat/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, authApi, usersApi } from '@/lib/api';
import { disconnectSocket } from '@/stores/connection';

export const ME_QUERY_KEY = ['me'] as const;

/** 未登录不是错误，而是 null，这样守卫组件不用区分“出错”和“没登录” */
async function fetchMe(): Promise<PublicUser | null> {
  try {
    return (await authApi.me()).user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export function useMe() {
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: fetchMe,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: ({ user }) => queryClient.setQueryData(ME_QUERY_KEY, user),
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) => authApi.register(input),
    onSuccess: ({ user }) => queryClient.setQueryData(ME_QUERY_KEY, user),
  });
}

/** 演示账号一键登录 */
export function useDemoLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.demo(),
    onSuccess: ({ user }) => queryClient.setQueryData(ME_QUERY_KEY, user),
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => usersApi.updateProfile(input),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(ME_QUERY_KEY, user);
      // 群成员列表和好友列表里也有我的名字和头像
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['friends'] });
    },
  });
}

function useClearSession() {
  const queryClient = useQueryClient();
  return () => {
    disconnectSocket();
    // 先把“当前用户”置空，所有订阅它的组件（包括路由守卫）都会收到通知并跳转；
    // 不能用 queryClient.clear()：它会把查询对象整个移除，已挂载的订阅会失联
    queryClient.setQueryData(ME_QUERY_KEY, null);
    // 再丢掉上一个账号的其他缓存，避免下一个账号看到残留数据
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== ME_QUERY_KEY[0] });
  };
}

export function useDeleteAccount() {
  const clearSession = useClearSession();
  return useMutation({
    mutationFn: (password: string) => authApi.deleteAccount(password),
    onSuccess: clearSession,
  });
}

export function useLogoutAll() {
  const clearSession = useClearSession();
  return useMutation({ mutationFn: () => authApi.logoutAll(), onSuccess: clearSession });
}

export function useLogout() {
  const clearSession = useClearSession();
  return useMutation({ mutationFn: () => authApi.logout(), onSuccess: clearSession });
}
