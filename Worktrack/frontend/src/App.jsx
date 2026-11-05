import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './i18n';
import useAuth from './store/authStore';
import { ProtectedRoute, GuestRoute, MainLayout } from './components/layout/Layout';
import LoginPage from './pages/auth/LoginPage';

// Trang tải theo nhu cầu (code-splitting) — NHƯNG tải sẵn trước khi cần:
// React 19 giữ màn "Loading" tối thiểu ~300ms mỗi lần 1 trang lazy chưa tải xong (Suspense throttle).
// lazyPage: khi file trang đã tải xong thì vẽ thẳng, không đi qua Suspense → hết 300ms chờ vô ích.
function lazyPage(load) {
  let mod = null, promise = null;
  const preload = () => (promise ||= load().then(m => (mod = m)));
  const Lazy = lazy(preload);
  const Page = (props) => (mod ? <mod.default {...props} /> : <Lazy {...props} />);
  Page.preload = preload;
  return Page;
}
const BoardPage       = lazyPage(() => import('./pages/board/BoardPage'));
const DailyPage       = lazyPage(() => import('./pages/daily/DailyPage'));
const RequestsPage    = lazyPage(() => import('./pages/requests/RequestsPage'));
const CompletedPage   = lazyPage(() => import('./pages/completed/CompletedPage'));
const DashboardPage   = lazyPage(() => import('./pages/dashboard/DashboardPage'));
const UsersPage       = lazyPage(() => import('./pages/users/UsersPage'));
const ProfilePage     = lazyPage(() => import('./pages/profile/ProfilePage.jsx'));
const ActivityLogPage = lazyPage(() => import('./pages/activity/Activitylogpage'));
const AdminPage       = lazyPage(() => import('./pages/admin/AdminPage'));
const NotFoundPage    = lazyPage(() => import('./pages/NotFoundPage'));

const ROUTE_PAGES = {
  board: BoardPage, daily: DailyPage, requests: RequestsPage, completed: CompletedPage, dashboard: DashboardPage,
  users: UsersPage, profile: ProfilePage, 'activity-log': ActivityLogPage, admin: AdminPage,
};
// 1) Trang đang mở: tải NGAY, song song với /auth/me (không đợi đăng nhập xong mới tải)
ROUTE_PAGES[location.pathname.split('/')[1]]?.preload();
// 2) Các trang còn lại: tải ngầm SAU khi trang đang mở đã lấy xong dữ liệu (đợi 2.5s rồi chờ lúc rảnh)
//    → mạng chậm không bị tranh băng thông với dữ liệu trang chính; bấm menu sau đó là hiện ngay
const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
window.addEventListener('load', () => setTimeout(() => idle(() => {
  Object.values(ROUTE_PAGES).reduce((p, page) => p.then(() => page.preload()).catch(() => {}), Promise.resolve());
}, { timeout: 5000 }), 2500), { once: true });

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
  // /auth/me được gọi sớm trong main.jsx (song song với tải ngôn ngữ / file trang)

  return (
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

                {/* Dashboard — ai cũng xem được; nút Export/Lock ẩn với role khác admin/manager */}
                <Route path="dashboard" element={<DashboardPage />} />

                {/* Lịch sử thay đổi — CHỈ admin/manager, giống Dashboard */}
                <Route element={<ProtectedRoute perms={['log.view']} />}>
                  <Route path="activity-log" element={<ActivityLogPage />} />
                </Route>

                {/* Quản trị — CHỈ Admin: phân quyền + sửa CV toàn quyền */}
                <Route element={<ProtectedRoute roles={['admin']} />}>
                  <Route path="admin" element={<AdminPage />} />
                </Route>

                {/* Users — admin/manager/leader */}
                <Route element={<ProtectedRoute perms={['user.manage', 'user.import', 'group.manage', 'perm.delegate']} />}>
                  <Route path="users" element={<UsersPage />} />
                </Route>
              </Route>
            </Route>

            {/* Route không khớp cái nào ở trên → trang 404 */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
    </BrowserRouter>
  );
}