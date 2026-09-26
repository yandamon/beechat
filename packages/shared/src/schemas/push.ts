import { z } from 'zod';

/** 浏览器 PushSubscription.toJSON() 里我们需要的部分 */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const pushUnsubscribeSchema = z.object({ endpoint: z.url().max(2000) });
export type PushUnsubscribeInput = z.infer<typeof pushUnsubscribeSchema>;
