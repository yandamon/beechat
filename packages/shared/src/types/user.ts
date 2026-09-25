/** 对外暴露的用户信息，绝不包含密码哈希等敏感字段 */
export interface PublicUser {
  id: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface AuthResponse {
  user: PublicUser;
}
