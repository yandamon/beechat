import { z } from 'zod';
import { LIMITS, REPORT_REASONS } from '../constants';

export const createReportSchema = z.object({
  /** 被举报的用户 */
  targetUserId: z.number().int().positive(),
  /** 具体到某条消息时传；必须是该用户发的，且举报人在那个会话里 */
  messageId: z.number().int().positive().optional(),
  reason: z.enum(REPORT_REASONS),
  detail: z
    .string()
    .trim()
    .max(LIMITS.reportDetail.max, `补充说明最多 ${LIMITS.reportDetail.max} 字`)
    .optional(),
});
export type CreateReportInput = z.infer<typeof createReportSchema>;
