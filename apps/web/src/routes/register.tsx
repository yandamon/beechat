import { formatInviteCode, normalizeInviteCode, registerSchema } from '@beechat/shared';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useRegister } from '@/features/auth/use-auth';
import { t } from '@/i18n/zh-CN';
import { fieldErrorsOf } from '@/lib/forms';
import { useIsMouse } from '@/lib/use-pointer';

type Field = 'username' | 'password' | 'inviteCode';

export function RegisterPage() {
  const navigate = useNavigate();
  const register = useRegister();
  const isMouse = useIsMouse();
  const [searchParams] = useSearchParams();
  // 从邀请链接（/register?code=…）进来时邀请码已经填好
  const [form, setForm] = useState<Record<Field, string>>(() => ({
    username: '',
    password: '',
    inviteCode: formatInviteCode(normalizeInviteCode(searchParams.get('code') ?? '')),
  }));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});

  const update = (field: Field) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = registerSchema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(fieldErrorsOf<Field>(parsed.error));
      return;
    }
    setFieldErrors({});
    try {
      await register.mutateAsync(parsed.data);
      navigate('/', { replace: true });
    } catch {
      /* 服务端错误由 register.error 展示 */
    }
  };

  return (
    <Card className="mx-auto w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t.auth.registerTitle}</CardTitle>
        <CardDescription>{t.auth.registerDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <FormField
            id="username"
            label={t.auth.username}
            hint={t.auth.usernameHint}
            error={fieldErrors.username}
          >
            <Input
              id="username"
              autoComplete="username"
              // 手机键盘默认会把首字母大写、自动纠错，用户名不需要
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              // 手机上不自动聚焦，免得一进页面键盘就弹出来挡住一半
              autoFocus={isMouse}
              value={form.username}
              onChange={update('username')}
            />
          </FormField>
          <FormField
            id="password"
            label={t.auth.password}
            hint={t.auth.passwordHint}
            error={fieldErrors.password}
          >
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              enterKeyHint="next"
              value={form.password}
              onChange={update('password')}
            />
          </FormField>
          <FormField
            id="inviteCode"
            label={t.auth.inviteCode}
            hint={t.auth.inviteCodeHint}
            error={fieldErrors.inviteCode}
          >
            <Input
              id="inviteCode"
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              value={form.inviteCode}
              onChange={update('inviteCode')}
            />
          </FormField>
          {register.error ? (
            <p className="text-sm text-destructive" role="alert">
              {register.error.message}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={register.isPending}>
            {register.isPending ? t.common.submitting : t.auth.registerButton}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {t.auth.haveAccount}{' '}
          <Link to="/login" className="text-foreground underline underline-offset-4">
            {t.auth.toLogin}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
