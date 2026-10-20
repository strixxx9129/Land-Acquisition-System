import { useTranslation } from 'react-i18next';
import { PERMISSIONS } from '@lams/shared';
import { useAuth } from '../lib/auth';
import { useText } from '../lib/useText';

const ROADMAP = ['m1', 'm2', 'm3', 'm4', 'm5'] as const;

export function HomePage() {
  const { t } = useTranslation();
  const text = useText();
  const { user } = useAuth();
  if (!user) return null;
  const granted = PERMISSIONS.filter((p) => user.permissions.includes(p.code));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('home.welcome', { name: user.name })}</h1>

      <dl className="grid gap-4 sm:grid-cols-3">
        {[
          [t('home.role'), text(user.role.name)],
          [t('home.jurisdiction'), text(user.scopeLabel)],
          [t('home.level'), t(`scope.${user.scope.level}`)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-line bg-surface p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</dt>
            <dd className="mt-1 text-lg font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="perms" className="rounded-lg border border-line bg-surface p-5">
        <h2 id="perms" className="font-semibold">
          {t('home.permissions')}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{t('home.permissionsHint')}</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {granted.map((p) => (
            <li key={p.code} className="rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-700">
              {text(p.label)}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="roadmap" className="rounded-lg border border-dashed border-line bg-surface p-5">
        <h2 id="roadmap" className="font-semibold">
          {t('home.roadmap')}
        </h2>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink-muted">
          {ROADMAP.map((k) => (
            <li key={k}>{t(`home.${k}`)}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}
