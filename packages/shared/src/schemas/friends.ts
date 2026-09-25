import { z } from 'zod';
import { LIMITS } from '../constants';

export const searchUsersQuerySchema = z.object({
  q: z.string().trim().min(1, '请输入用户名').max(LIMITS.username.max),
});

export const createFriendRequestSchema = z.object({
  userId: z.number().int().positive(),
  message: z
    .string()
    .trim()
    .max(LIMITS.friendRequestMessage.max, `验证消息最多 ${LIMITS.friendRequestMessage.max} 字`)
    .optional(),
});
export type CreateFriendRequestInput = z.infer<typeof createFriendRequestSchema>;

export const requestIdParamSchema = z.object({ id: z.coerce.number().int().positive() });
export const userIdParamSchema = z.object({ userId: z.coerce.number().int().positive() });
