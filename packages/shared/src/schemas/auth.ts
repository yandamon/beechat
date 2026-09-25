import { z } from 'zod';
import { LIMITS } from '../constants';

/** 用户名：3 到 20 位小写字母、数字、下划线；输入会先去空格并转小写。 */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(LIMITS.username.min, `用户名至少 ${LIMITS.username.min} 个字符`)
  .max(LIMITS.username.max, `用户名最多 ${LIMITS.username.max} 个字符`)
  .regex(/^[a-z0-9_]+$/, '用户名只能包含小写字母、数字和下划线');

export const passwordSchema = z
  .string()
  .min(LIMITS.password.min, `密码至少 ${LIMITS.password.min} 个字符`)
  .max(LIMITS.password.max, `密码最多 ${LIMITS.password.max} 个字符`);

export const registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  inviteCode: z.string().trim().min(1, '请输入邀请码'),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});
export type LoginInput = z.infer<typeof loginSchema>;

/** 注销账号需要再输一次密码 */
export const deleteAccountSchema = z.object({ password: passwordSchema });
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
