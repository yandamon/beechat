import { describe, expect, it } from 'vitest';
import { usernameSchema } from './auth';

describe('usernameSchema', () => {
  it('accepts lowercase letters, digits and underscores', () => {
    expect(usernameSchema.parse('bee_01')).toBe('bee_01');
  });

  it('normalizes surrounding whitespace and case', () => {
    expect(usernameSchema.parse('  BeeChat ')).toBe('beechat');
  });

  it.each(['ab', 'a'.repeat(21), 'bee-chat', '小蜜蜂', ''])('rejects %j', (value) => {
    expect(usernameSchema.safeParse(value).success).toBe(false);
  });
});
