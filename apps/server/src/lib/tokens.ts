import { createHash, randomBytes } from 'node:crypto';

/** 256 位随机令牌，base64url 编码，放在 Cookie 里 */
export const generateToken = () => randomBytes(32).toString('base64url');

/** 数据库只存令牌的 sha256，泄露数据库也拿不到可用令牌 */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
