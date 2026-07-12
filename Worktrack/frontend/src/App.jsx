import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './i18n';
import useAuth from './store/authStore';
import { ProtectedRoute, GuestRoute, MainLayout } from './components/layout/Layout';
import LoginPage from './pages/auth/LoginPage';

const BoardPage     = lazy(() => import('./pages/board/BoardPage'));
const DailyPage     = lazy(() => import('./pages/daily/DailyPage'));
const RequestsPage  = lazy(() => import('./pages/requests/RequestsPage'));
const CompletedPage = lazy(() => import('./pages/completed/CompletedPage'));
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));
const UsersPage     = lazy(() => import('./pages/users/UsersPage'));
const ProfilePage = lazy(() => import('./pages/profile/ProfilePage.jsx'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

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
            {/* GuestRoute chặn user đã đăng nhập vào lại /login */}
            <Route element={<GuestRoute />}>
              <Route path="/login" element={<LoginPage />} />
            </Route>

            <Route element={<ProtectedRoute />}>
              <Route element={<MainLayout />}>
                {/* Redirect theo role */}
                <Route index element={<HomeRedirect />} />

                {/* Các trang không giới hạn role — ai đăng nhập cũng vào được */}
                <Route path="board"     element={<BoardPage />} />
                <Route path="daily"     element={<DailyPage />} />
                <Route path="requests"  element={<RequestsPage />} />
                <Route path="completed" element={<CompletedPage />} />
                <Route path="profile"   element={<ProfilePage />} />

                {/* Dashboard — CHỈ admin/manager, leader gõ URL cũng bị chặn về 404 */}
                <Route element={<ProtectedRoute roles={['admin', 'manager']} />}>
                  <Route path="dashboard" element={<DashboardPage />} />
                </Route>

                {/* Users — admin/manager/leader */}
                <Route element={<ProtectedRoute roles={['admin', 'manager', 'leader']} />}>
                  <Route path="users" element={<UsersPage />} />
                </Route>
              </Route>
            </Route>

            {/* Route không khớp cái nào ở trên → trang 404 */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}