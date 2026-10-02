import { describe, expect, it } from 'vitest';
import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  formatInviteCode,
  normalizeInviteCode,
} from './invites';
import { registerSchema } from './schemas/auth';
import { createInvitesSchema } from './schemas/invites';

describe('invite codes', () => {
  it('normalizes what people type: case, spaces and dashes do not matter', () => {
    expect(normalizeInviteCode(' 8qnm-ahjp sddt ')).toBe('8QNMAHJPSDDT');
    expect(normalizeInviteCode('8QNMAHJPSDDT')).toBe('8QNMAHJPSDDT');
  });

  it('formats a stored code in groups of four and survives a round trip', () => {
    expect(formatInviteCode('8QNMAHJPSDDT')).toBe('8QNM-AHJP-SDDT');
    expect(normalizeInviteCode(formatInviteCode('8QNMAHJPSDDT'))).toBe('8QNMAHJPSDDT');
  });

  it('leaves out the characters that are easy to misread', () => {
    expect(INVITE_CODE_LENGTH).toBe(12);
    for (const char of '01ILO') expect(INVITE_CODE_ALPHABET).not.toContain(char);
  });

  it('registerSchema hands the normalized code to the server', () => {
    const parsed = registerSchema.parse({
      username: 'alice',
      password: 'password123',
      inviteCode: ' 8qnm-ahjp-sddt ',
    });
    expect(parsed.inviteCode).toBe('8QNMAHJPSDDT');
    expect(
      registerSchema.safeParse({ username: 'alice', password: 'password123', inviteCode: '  ' })
        .success,
    ).toBe(false);
  });

  it('createInvitesSchema bounds the batch size and trims the note', () => {
    expect(createInvitesSchema.parse({ count: 3, note: ' 订单 1 ' })).toEqual({
      count: 3,
      note: '订单 1',
    });
    expect(createInvitesSchema.safeParse({ count: 0 }).success).toBe(false);
    expect(createInvitesSchema.safeParse({ count: 101 }).success).toBe(false);
    expect(createInvitesSchema.safeParse({ count: 1.5 }).success).toBe(false);
    expect(createInvitesSchema.safeParse({ count: Number.NaN }).success).toBe(false);
    expect(createInvitesSchema.safeParse({ count: 1, expiresInDays: 0 }).success).toBe(false);
  });
});
