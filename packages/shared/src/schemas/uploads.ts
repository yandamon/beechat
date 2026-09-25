import { z } from 'zod';
import { ALLOWED_IMAGE_TYPES, LIMITS } from '../constants';

export const uploadKindSchema = z.enum(['image', 'avatar']);
export type UploadKind = z.infer<typeof uploadKindSchema>;

/** 申请直传地址：客户端先压缩，再把类型、大小、尺寸报给服务端校验 */
export const presignUploadSchema = z
  .object({
    kind: uploadKindSchema,
    mime: z.enum(ALLOWED_IMAGE_TYPES, { error: '只支持 jpeg、png、webp、gif 图片' }),
    size: z
      .number()
      .int()
      .positive()
      .max(LIMITS.imageBytes.max, `图片最大 ${LIMITS.imageBytes.max / 1024 / 1024} MB`),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .superRefine((value, ctx) => {
    const maxEdge = value.kind === 'avatar' ? LIMITS.avatarSize : LIMITS.imageMaxEdge;
    if (value.width > maxEdge || value.height > maxEdge) {
      ctx.addIssue({
        code: 'custom',
        message: `图片边长不能超过 ${maxEdge} 像素`,
        path: ['width'],
      });
    }
  });
export type PresignUploadInput = z.infer<typeof presignUploadSchema>;

export const completeUploadSchema = z.object({ key: z.string().min(1).max(200) });
export type CompleteUploadInput = z.infer<typeof completeUploadSchema>;

export const uploadKeyParamSchema = z.object({ key: z.string().min(1).max(200) });

export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, '显示名不能为空')
    .max(LIMITS.displayName.max, `显示名最多 ${LIMITS.displayName.max} 字`)
    .optional(),
  /** 传 null 表示清除头像 */
  avatarKey: z.string().min(1).max(200).nullable().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
