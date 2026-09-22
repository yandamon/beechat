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
} as const;

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];
