import type { INVITE_STATUSES } from '../schemas/invites';

export type InviteStatus = (typeof INVITE_STATUSES)[number];

export interface InviteView {
  id: number;
  /** 已经按 XXXX-XXXX-XXXX 分好组 */
  code: string;
  note: string | null;
  status: InviteStatus;
  createdAt: string;
  /** 生成它的管理员；命令行生成的或管理员已注销时为 null */
  createdBy: { id: number; username: string; displayName: string } | null;
  expiresAt: string | null;
  usedAt: string | null;
  /** 用它注册的人；账号已注销时 id 和 displayName 为 null，只剩当时的用户名 */
  usedBy: { id: number | null; username: string; displayName: string | null } | null;
  revokedAt: string | null;
}

export type InviteCounts = Record<InviteStatus, number>;

export interface InviteListResponse {
  invites: InviteView[];
  /** 各状态的总数，不受列表筛选影响 */
  counts: InviteCounts;
}
