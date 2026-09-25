import { LIMITS, type UploadKind, type UploadedAttachment } from '@beechat/shared';
import { uploadsApi } from '@/lib/api';
import { prepareImage } from '@/lib/image';

/**
 * 压缩、申请直传地址、上传字节、确认完成。
 * 本地驱动时直传地址指向本服务，R2 时指向对象存储，客户端不用区分。
 */
export async function uploadImage(file: File, kind: UploadKind): Promise<UploadedAttachment> {
  const prepared = await prepareImage(
    file,
    kind === 'avatar'
      ? { maxEdge: LIMITS.avatarSize, square: true, quality: 0.9 }
      : { maxEdge: LIMITS.imageMaxEdge },
  );
  const signed = await uploadsApi.presign({
    kind,
    mime: prepared.mime,
    size: prepared.blob.size,
    width: prepared.width,
    height: prepared.height,
  });
  const response = await fetch(signed.uploadUrl, {
    method: signed.method,
    headers: signed.headers,
    body: prepared.blob,
    credentials: 'same-origin',
  });
  if (!response.ok) throw new Error('图片上传失败，请重试');
  return uploadsApi.complete(signed.key);
}
