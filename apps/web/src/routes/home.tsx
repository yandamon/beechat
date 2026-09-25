import { useQuery } from '@tanstack/react-query';
import { useMe } from '@/features/auth/use-auth';
import { t } from '@/i18n/zh-CN';
import { fetchHealth } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useConnectionStore } from '@/stores/connection';

export function HomePage() {
  const me = useMe();
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, refetchInterval: 15_000 });
  const status = useConnectionStore((state) => state.status);

  const serverLabel = health.isPending
    ? t.status.checking
    : health.isError
      ? t.status.error
      : t.status.ok;

  const databaseLabel = health.isPending
    ? t.status.checking
    : health.data?.db === 'ok'
      ? t.status.ok
      : t.status.error;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {me.data ? t.home.greeting(me.data.displayName) : t.appName}
        </h1>
        <p className="text-muted-foreground">{t.home.placeholder}</p>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">{t.status.title}</h2>
        <dl className="divide-y divide-border rounded-xl border border-border">
          <StatusRow label={t.status.server} value={serverLabel} ok={health.isSuccess} />
          <StatusRow
            label={t.status.database}
            value={databaseLabel}
            ok={health.data?.db === 'ok'}
          />
          <StatusRow label={t.status.realtime} value={t.status[status]} ok={status === 'online'} />
        </dl>
      </div>
    </section>
  );
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <dt className="text-sm">{label}</dt>
      <dd className="flex items-center gap-2 text-sm">
        <span
          aria-hidden
          className={cn('size-2 rounded-full', ok ? 'bg-emerald-500' : 'bg-amber-500')}
        />
        {value}
      </dd>
    </div>
  );
}
