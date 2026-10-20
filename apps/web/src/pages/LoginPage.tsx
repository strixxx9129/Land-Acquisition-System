import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { DemoAccount } from '@lams/shared';
import { ErrorNotice } from '../components/ErrorNotice';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useText } from '../lib/useText';

interface DemoAccounts {
  password: string;
  accounts: DemoAccount[];
}

export function LoginPage() {
  const { t } = useTranslation();
  const text = useText();
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // 404 when demo mode is off; then the panel simply doesn't render.
  const demo = useQuery({ queryKey: ['demo-accounts'], queryFn: () => api<DemoAccounts>('/auth/demo-accounts'), retry: false, staleTime: Infinity });

  if (user) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/'} replace />;

  const submit = async (e?: FormEvent, override?: { email: string; password: string }) => {
    e?.preventDefault();
    const creds = override ?? { email, password };
    setPending(true);
    setError(null);
    try {
      await login(creds.email, creds.password);
      navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="bg-brand-700 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <div className="min-w-0">
            <p className="text-lg font-semibold">{t('app.name')}</p>
            <p className="text-xs text-brand-100">{t('app.dept')}</p>
          </div>
          <LanguageSwitcher />
        </div>
      </header>
      <p className="bg-amber-100 px-4 py-1 text-center text-xs text-warn">{t('app.synthetic')}</p>

      <main id="main" className="mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-[minmax(0,22rem)_1fr]">
        <section aria-labelledby="signin" className="rounded-lg border border-line bg-surface p-6 shadow-sm">
          <h1 id="signin" className="text-xl font-semibold">
            {t('login.title')}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">{t('login.subtitle')}</p>
          <form onSubmit={(e) => void submit(e)} className="mt-5 space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="block text-sm font-medium">
                {t('login.email')}
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-line px-3 py-2"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium">
                {t('login.password')}
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-line px-3 py-2"
              />
            </div>
            {error != null && <ErrorNotice error={error} />}
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-md bg-brand-700 px-4 py-2.5 font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
            >
              {pending ? t('login.submitting') : t('login.submit')}
            </button>
          </form>
        </section>

        {demo.data && (
          <section aria-labelledby="demo" className="rounded-lg border border-line bg-surface p-6 shadow-sm">
            <h2 id="demo" className="text-lg font-semibold">
              {t('login.demoTitle')}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">{t('login.demoHint')}</p>
            <p className="mt-3 text-sm">
              {t('login.demoPassword')}: <code className="rounded bg-brand-50 px-1.5 py-0.5 font-mono">{demo.data.password}</code>
            </p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {demo.data.accounts.map((a) => (
                <li key={a.email}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void submit(undefined, { email: a.email, password: demo.data.password })}
                    className="w-full rounded-md border border-line px-3 py-2 text-left hover:border-brand-600 hover:bg-brand-50 disabled:opacity-60"
                  >
                    <span className="block text-sm font-semibold">{text(a.roleName)}</span>
                    <span className="block text-xs text-ink-muted">{text(a.scopeLabel)}</span>
                    <span className="block truncate text-xs text-ink-muted">{a.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
