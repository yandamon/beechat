/** drizzle 会把 pg 的错误包一层放进 cause，这里顺着 cause 找唯一约束冲突（23505） */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current && typeof current === 'object'; depth += 1) {
    if ((current as { code?: unknown }).code === '23505') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
