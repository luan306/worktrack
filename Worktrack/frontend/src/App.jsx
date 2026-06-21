import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './i18n';
import useAuth from './store/authStore';
import { ProtectedRoute, MainLayout } from './components/layout/Layout';
import LoginPage from './pages/auth/LoginPage';

const BoardPage     = lazy(() => import('./pages/board/BoardPage'));
const DailyPage     = lazy(() => import('./pages/daily/DailyPage'));
const RequestsPage  = lazy(() => import('./pages/requests/RequestsPage'));
const CompletedPage = lazy(() => import('./pages/completed/CompletedPage'));
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));
const UsersPage     = lazy(() => import('./pages/users/UsersPage'));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } }
});

const Loader = () => (
  <div className="flex-1 flex items-center justify-center bg-[#f0f2f5]">
    <div className="bg-white rounded-2xl shadow-xl p-8 flex flex-col items-center gap-3">
      <div className="text-4xl animate-spin">⚙️</div>
      <div className="text-sm text-gray-400">Loading...</div>
    </div>
  </div>
);

// Redirect trang chủ theo role
function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <Loader />;
  if (['admin', 'manager'].includes(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Navigate to="/board" replace />;
}

export default function App() {
  const fetchMe = useAuth(s => s.fetchMe);
  useEffect(() => { fetchMe(); }, [fetchMe]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<Loader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<MainLayout />}>
                {/* Redirect theo role */}
                <Route index element={<HomeRedirect />} />

                <Route path="board"     element={<BoardPage />} />
                <Route path="daily"     element={<DailyPage />} />
                <Route path="requests"  element={<RequestsPage />} />
                <Route path="completed" element={<CompletedPage />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="users"     element={<UsersPage />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}