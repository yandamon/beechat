import type { ZodError } from 'zod';

/** 把 zod 的校验结果压成“字段名 → 第一条错误信息”，方便表单展示 */
export function fieldErrorsOf<TField extends string>(
  error: ZodError,
): Partial<Record<TField, string>> {
  const errors: Partial<Record<string, string>> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? '');
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors as Partial<Record<TField, string>>;
}
