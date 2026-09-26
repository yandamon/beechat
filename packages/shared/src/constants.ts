/**
 * 各类上限与常量，前后端共用。
 * 改动这里的值请同步更新 docs/DESIGN.md 的“微观默认值”一节。
 */
export const LIMITS = {
  username: { min: 3, max: 20 },
  password: { min: 8, max: 128 },
  displayName: { max: 30 },
  friendRequestMessage: { max: 100 },
  groupName: { max: 30 },
  groupMembers: { max: 200 },
  messageText: { max: 2000 },
  imageBytes: { max: 5 * 1024 * 1024 },
  imageMaxEdge: 1920,
  avatarSize: 256,
  historyPageSize: 50,
  sessionDays: 30,
  presenceGraceMs: 10_000,
  /** 发出后多久之内可以撤回 */
  recallWindowMs: 2 * 60_000,
  /** 举报时的补充说明 */
  reportDetail: { max: 500 },
} as const;

/** 消息回应可用的表情，固定一小组，避免存任意字符串 */
export const ALLOWED_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉'] as const;
export type Reaction = (typeof ALLOWED_REACTIONS)[number];

/** 举报原因，固定几类，便于以后统计 */
export const REPORT_REASONS = ['harassment', 'spam', 'inappropriate', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];
