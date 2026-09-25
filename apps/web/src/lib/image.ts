import { ALLOWED_IMAGE_TYPES, type AllowedImageType, LIMITS } from '@beechat/shared';

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
  mime: AllowedImageType;
}

export interface PrepareOptions {
  /** 最长边，超过则等比缩小 */
  maxEdge: number;
  /** 居中裁成正方形，头像用 */
  square?: boolean;
  quality?: number;
}

const supportsWebp = (() => {
  try {
    return document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
})();

function isAllowed(mime: string): mime is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(mime);
}

async function toBlob(canvas: HTMLCanvasElement, mime: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('无法处理这张图片'))),
      mime,
      quality,
    );
  });
}

/**
 * 在浏览器里把图片缩到合适大小再上传：
 * 照片转成 webp（不支持时 jpeg），带透明的 png 也交给 webp；
 * gif 在尺寸和大小都合规时原样上传，避免丢掉动画。
 */
export async function prepareImage(file: File, options: PrepareOptions): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    let { width, height } = bitmap;
    let sx = 0;
    let sy = 0;
    let sw = width;
    let sh = height;

    if (file.type === 'image/gif' && !options.square) {
      if (
        file.size <= LIMITS.imageBytes.max &&
        width <= options.maxEdge &&
        height <= options.maxEdge
      ) {
        return { blob: file, width, height, mime: 'image/gif' };
      }
    }

    if (options.square) {
      const side = Math.min(width, height);
      sx = Math.floor((width - side) / 2);
      sy = Math.floor((height - side) / 2);
      sw = side;
      sh = side;
      width = side;
      height = side;
    }

    const scale = Math.min(1, options.maxEdge / Math.max(width, height));
    const outWidth = Math.max(1, Math.round(width * scale));
    const outHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = outWidth;
    canvas.height = outHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法处理这张图片');
    context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, outWidth, outHeight);

    const mime: AllowedImageType = supportsWebp
      ? 'image/webp'
      : file.type === 'image/png'
        ? 'image/png'
        : 'image/jpeg';
    let blob = await toBlob(canvas, mime, options.quality ?? 0.85);
    if (blob.size > LIMITS.imageBytes.max) blob = await toBlob(canvas, mime, 0.6);
    if (blob.size > LIMITS.imageBytes.max) throw new Error('图片太大，请换一张');
    if (!isAllowed(blob.type)) throw new Error('浏览器不支持这种图片格式');
    return { blob, width: outWidth, height: outHeight, mime: blob.type };
  } finally {
    bitmap.close();
  }
}
