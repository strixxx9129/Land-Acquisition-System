import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { PermissionCode } from '@lams/shared';
import { AppShell } from './components/AppShell';
import { Loading } from './components/ErrorNotice';
import { ServerBanner } from './components/ServerBanner';
import { ApiError } from './lib/api';
import { AuthProvider, useAuth } from './lib/auth';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { RolesPage } from './pages/RolesPage';
import { UsersPage } from './pages/UsersPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Cold starts are already retried inside api(); don't retry real 4xx answers.
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 1,
    },
  },
});

function RequireAuth({ children, permission }: { children: ReactNode; permission?: PermissionCode }) {
  const { user, loading, can } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (permission && !can(permission)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="py-12 text-center">
      <h1 className="text-2xl font-semibold">{t('errors.notFound')}</h1>
      <Link to="/" className="mt-4 inline-block text-brand-600 underline">
        {t('errors.back')}
      </Link>
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <ServerBanner />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route index element={<HomePage />} />
              <Route
                path="users"
                element={
                  <RequireAuth permission="admin.users.read">
                    <UsersPage />
                  </RequireAuth>
                }
              />
              <Route
                path="admin/roles"
                element={
                  <RequireAuth permission="admin.roles.manage">
                    <RolesPage />
                  </RequireAuth>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
