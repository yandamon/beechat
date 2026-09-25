import { loginSchema } from '@beechat/shared';
import { type FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useDemoLogin, useLogin } from '@/features/auth/use-auth';
import { t } from '@/i18n/zh-CN';
import { fieldErrorsOf } from '@/lib/forms';

type Field = 'username' | 'password';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useLogin();
  const demo = useDemoLogin();
  const [form, setForm] = useState<Record<Field, string>>({ username: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const update = (field: Field) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = loginSchema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(fieldErrorsOf<Field>(parsed.error));
      return;
    }
    setFieldErrors({});
    try {
      await login.mutateAsync(parsed.data);
      navigate(from, { replace: true });
    } catch {
      /* 服务端错误由 login.error 展示 */
    }
  };

  return (
    <Card className="mx-auto w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t.auth.loginTitle}</CardTitle>
        <CardDescription>{t.auth.loginDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <FormField id="username" label={t.auth.username} error={fieldErrors.username}>
            <Input
              id="username"
              autoComplete="username"
              autoFocus
              value={form.username}
              onChange={update('username')}
            />
          </FormField>
          <FormField id="password" label={t.auth.password} error={fieldErrors.password}>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={update('password')}
            />
          </FormField>
          {login.error ? (
            <p className="text-sm text-destructive" role="alert">
              {login.error.message}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? t.common.submitting : t.auth.loginButton}
          </Button>
        </form>
        <div className="mt-4 space-y-2">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={demo.isPending}
            onClick={() => {
              demo.mutate(undefined, { onSuccess: () => navigate('/', { replace: true }) });
            }}
          >
            {demo.isPending ? t.common.submitting : t.auth.demoButton}
          </Button>
          <p className="text-center text-xs text-muted-foreground">{t.auth.demoHint}</p>
          {demo.error ? (
            <p className="text-center text-sm text-destructive" role="alert">
              {demo.error.message}
            </p>
          ) : null}
        </div>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {t.auth.noAccount}{' '}
          <Link to="/register" className="text-foreground underline underline-offset-4">
            {t.auth.toRegister}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
