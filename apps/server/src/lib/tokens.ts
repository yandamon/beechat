import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 256 位随机令牌，base64url 编码，放在 Cookie 里 */
export const generateToken = () => randomBytes(32).toString('base64url');

/** 数据库只存令牌的 sha256，泄露数据库也拿不到可用令牌 */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** 常数时间比较，用于邀请码等不希望通过响应时间泄露信息的场景 */
export function safeEqual(a: string, b: string) {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
