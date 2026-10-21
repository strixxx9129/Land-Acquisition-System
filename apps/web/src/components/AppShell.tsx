import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { PermissionCode } from '@lams/shared';
import { useAuth } from '../lib/auth';
import { useText } from '../lib/useText';
import { LanguageSwitcher } from './LanguageSwitcher';

interface NavItem {
  to: string;
  label: string;
  permission?: PermissionCode;
}

const NAV: NavItem[] = [
  { to: '/', label: 'nav.home' },
  { to: '/inbox', label: 'nav.inbox', permission: 'case.transition' },
  { to: '/cases', label: 'nav.cases', permission: 'case.read' },
  { to: '/cases/new', label: 'nav.newProposal', permission: 'case.create' },
  { to: '/users', label: 'nav.users', permission: 'admin.users.read' },
  { to: '/admin/roles', label: 'nav.roles', permission: 'admin.roles.manage' },
  { to: '/admin/workflows', label: 'nav.workflows', permission: 'workflow.config.manage' },
];

export function AppShell() {
  const { t } = useTranslation();
  const { user, logout, can } = useAuth();
  const text = useText();
  const items = NAV.filter((n) => !n.permission || can(n.permission));

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        {t('app.skip')}
      </a>
      <header className="bg-brand-700 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold sm:text-lg">{t('app.name')}</p>
            <p className="truncate text-xs text-brand-100">{t('app.dept')}</p>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            {user && (
              <div className="hidden text-right text-xs leading-tight sm:block">
                <p className="font-semibold">{user.name}</p>
                <p className="text-brand-100">
                  {text(user.role.name)} · {text(user.scopeLabel)}
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-md border border-white/40 px-3 py-1.5 text-sm hover:bg-white/10"
            >
              {t('common.signOut')}
            </button>
          </div>
        </div>
        <nav aria-label={t('nav.main')} className="bg-brand-800">
          <ul className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2">
            {items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/' || item.to === '/cases'}
                  className={({ isActive }) =>
                    `block whitespace-nowrap border-b-3 px-3 py-2.5 text-sm ${isActive ? 'border-accent-400 font-semibold text-white' : 'border-transparent text-brand-100 hover:text-white'}`
                  }
                >
                  {t(item.label)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <p className="bg-amber-100 px-4 py-1 text-center text-xs text-warn">{t('app.synthetic')}</p>
      <main id="main" className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
