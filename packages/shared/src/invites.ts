/** 邀请码用到的字符：去掉了容易看错的 0 和 O、1 和 I 和 L */
export const INVITE_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const INVITE_CODE_LENGTH = 12;

/** 用户输入的邀请码：去掉空格和连字符，转大写。数据库里存的就是这个形式。 */
export function normalizeInviteCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

/** 展示用：每 4 位一组，中间加连字符，方便抄写和口述 */
export function formatInviteCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code;
}
