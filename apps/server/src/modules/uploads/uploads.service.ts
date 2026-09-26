import { randomUUID } from 'node:crypto';
import type { PresignUploadInput, PresignedUpload, UploadedAttachment } from '@beechat/shared';
import { and, eq } from 'drizzle-orm';
import type { AppContext } from '../../context';
import type { DbLike } from '../../db/client';
import { type Upload, uploads } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { publicUrlFor } from '../../storage';
import { isSafeKey } from '../../storage/local';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** 键名按类型、用户、年月分目录，便于以后清理 */
function buildKey(kind: string, userId: number, mime: string) {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${kind}/${userId}/${now.getUTCFullYear()}-${month}/${randomUUID()}.${EXTENSIONS[mime] ?? 'bin'}`;
}

/** 登记一次上传并签发直传地址 */
export async function presignUpload(
  ctx: AppContext,
  ownerId: number,
  input: PresignUploadInput,
): Promise<PresignedUpload> {
  const key = buildKey(input.kind, ownerId, input.mime);
  await ctx.db.insert(uploads).values({
    key,
    ownerId,
    kind: input.kind,
    mime: input.mime,
    size: input.size,
    width: input.width,
    height: input.height,
  });
  const signed = await ctx.storage.presignUpload({ key, mime: input.mime, size: input.size });
  return { key, ...signed };
}

export async function findOwnedUpload(
  db: DbLike,
  key: string,
  ownerId: number,
): Promise<Upload | null> {
  if (!isSafeKey(key)) return null;
  const [row] = await db
    .select()
    .from(uploads)
    .where(and(eq(uploads.key, key), eq(uploads.ownerId, ownerId)))
    .limit(1);
  return row ?? null;
}

export function toAttachment(upload: Upload): UploadedAttachment {
  return {
    key: upload.key,
    url: publicUrlFor(upload.key),
    width: upload.width ?? 0,
    height: upload.height ?? 0,
    size: upload.size,
    mime: upload.mime,
  };
}

/** 客户端传完后调用：确认对象真的存在且大小合理，再标记完成 */
export async function completeUpload(
  ctx: AppContext,
  ownerId: number,
  key: string,
): Promise<UploadedAttachment> {
  const upload = await findOwnedUpload(ctx.db, key, ownerId);
  if (!upload) throw new AppError(404, '上传记录不存在', 'UPLOAD_NOT_FOUND');
  if (upload.completedAt) return toAttachment(upload);

  const stored = await ctx.storage.head(key);
  if (!stored) throw new AppError(409, '文件还没有上传完成', 'UPLOAD_MISSING');
  // 允许压缩后略有出入，但不能明显超过登记时声明的大小
  if (stored.size > upload.size * 1.1 + 1024) {
    await ctx.storage.delete(key);
    await ctx.db.delete(uploads).where(eq(uploads.key, key));
    throw new AppError(400, '文件比登记的大小大', 'UPLOAD_SIZE_MISMATCH');
  }

  const [updated] = await ctx.db
    .update(uploads)
    .set({ completedAt: new Date(), size: stored.size })
    .where(eq(uploads.key, key))
    .returning();
  return toAttachment(updated ?? upload);
}

/** 校验某个 key 是当前用户已完成的指定类型上传，供发图片和设头像使用 */
export async function requireCompletedUpload(
  db: DbLike,
  key: string,
  ownerId: number,
  kind: Upload['kind'],
): Promise<Upload> {
  const upload = await findOwnedUpload(db, key, ownerId);
  if (!upload || upload.kind !== kind) throw new AppError(404, '上传记录不存在', 'UPLOAD_NOT_FOUND');
  if (!upload.completedAt) throw new AppError(409, '文件还没有上传完成', 'UPLOAD_MISSING');
  return upload;
}
