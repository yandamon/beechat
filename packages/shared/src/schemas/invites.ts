import { z } from 'zod';
import { LIMITS } from '../constants';

/**
 * 邀请码的四种状态，由“用没用过、作没作废、过没过期”推出来，优先级从前到后：
 * used 已使用、revoked 已作废、expired 已过期、unused 还能用。
 */
export const INVITE_STATUSES = ['unused', 'used', 'revoked', 'expired'] as const;

/** 管理员生成一批邀请码 */
export const createInvitesSchema = z.object({
  count: z
    .number({ error: '请输入数量' })
    .int('数量要是整数')
    .min(1, '至少生成 1 个')
    .max(LIMITS.inviteBatch.max, `一次最多生成 ${LIMITS.inviteBatch.max} 个`),
  /** 给自己看的备注，比如卖给了谁、哪一单 */
  note: z
    .string()
    .trim()
    .max(LIMITS.inviteNote.max, `备注最多 ${LIMITS.inviteNote.max} 字`)
    .optional(),
  /** 多少天后过期；不传就是不过期 */
  expiresInDays: z.number().int().min(1).max(LIMITS.inviteExpiryDays.max).optional(),
});
export type CreateInvitesInput = z.infer<typeof createInvitesSchema>;

export const listInvitesQuerySchema = z.object({
  status: z.enum(INVITE_STATUSES).optional(),
});

export const inviteIdParamSchema = z.object({ id: z.coerce.number().int().positive() });
