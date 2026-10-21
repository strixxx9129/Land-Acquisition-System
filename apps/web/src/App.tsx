import { lazy, Suspense, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { PermissionCode } from '@lams/shared';
import { AppShell } from './components/AppShell';
import { Loading } from './components/ErrorNotice';
import { ServerBanner } from './components/ServerBanner';
import { ApiError } from './lib/api';
import { AuthProvider, useAuth } from './lib/auth';
import { CasesPage } from './pages/CasesPage';
import { HomePage } from './pages/HomePage';
import { InboxPage } from './pages/InboxPage';
import { LoginPage } from './pages/LoginPage';
import { SettingsPage } from './pages/SettingsPage';

// Leaflet-heavy pages load on demand, keeping the sign-in page light on slow connections.
const MapPage = lazy(() => import('./pages/MapPage').then((m) => ({ default: m.MapPage })));
const CaseDetailPage = lazy(() => import('./pages/CaseDetailPage').then((m) => ({ default: m.CaseDetailPage })));
import { NewProposalPage } from './pages/NewProposalPage';
import { RolesPage } from './pages/RolesPage';
import { UsersPage } from './pages/UsersPage';
import { WorkflowsPage } from './pages/WorkflowsPage';
import { WorkflowVersionPage } from './pages/WorkflowVersionPage';

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
  return <Suspense fallback={<Loading />}>{children}</Suspense>;
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
              <Route path="inbox" element={<RequireAuth permission="case.read"><InboxPage /></RequireAuth>} />
              <Route path="cases" element={<RequireAuth permission="case.read"><CasesPage /></RequireAuth>} />
              <Route path="cases/new" element={<RequireAuth permission="case.create"><NewProposalPage /></RequireAuth>} />
              <Route path="cases/:id" element={<RequireAuth permission="case.read"><CaseDetailPage /></RequireAuth>} />
              <Route path="map" element={<RequireAuth permission="parcel.read"><MapPage /></RequireAuth>} />
              <Route path="admin/settings" element={<RequireAuth permission="workflow.config.manage"><SettingsPage /></RequireAuth>} />
              <Route path="admin/workflows" element={<RequireAuth permission="workflow.config.manage"><WorkflowsPage /></RequireAuth>} />
              <Route path="admin/workflows/:code/:version" element={<RequireAuth permission="workflow.config.manage"><WorkflowVersionPage /></RequireAuth>} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
