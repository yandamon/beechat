/** 对外暴露的用户信息，绝不包含密码哈希等敏感字段 */
export interface PublicUser {
  id: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
}

export type UserRole = 'user' | 'admin';

/** 当前登录用户自己的信息：比别人能看到的多一个角色，前端靠它决定显不显示后台入口 */
export interface CurrentUser extends PublicUser {
  role: UserRole;
}

export interface AuthResponse {
  user: CurrentUser;
}
