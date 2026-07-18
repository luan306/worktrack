import { useState, useEffect } from 'react';
import { NavLink, useNavigate, Outlet, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useAuthStore from '../../store/authStore';
import useNotificationStore from '../../store/notificationStore';
import NotificationBell from '../NotificationBell';
import NotificationToast from '../NotificationToast';

const NAV = [
  { to: '/board',     icon: '🗂',  key: 'nav_board' },
  { to: '/daily',     icon: '📋',  key: 'nav_daily' },
  { to: '/requests',  icon: '📨',  key: 'nav_requests' },
  { to: '/completed', icon: '✅',  key: 'nav_completed' },
  { divider: true },
  { to: '/', icon: '📊',  key: 'nav_dashboard', roles: ['admin','manager'] },
  { to: '/users',     icon: '👥',  key: 'nav_users',  roles: ['admin','manager','leader'] },
  { to: '/profile',  icon: '⚙️', key: 'nav_settings' },
];

// Các mục hiển thị ở thanh điều hướng dưới cùng trên mobile (không gian hẹp nên chỉ chọn lọc)
const MOBILE_NAV = [
  { to: '/board',     icon: '🗂',  key: 'nav_board_short' },
  { to: '/daily',     icon: '📋',  key: 'nav_daily_short' },
  { to: '/requests',  icon: '📨',  key: 'nav_requests_short' },
  { to: '/completed', icon: '✅',  key: 'nav_completed_short' },
  { to: '/profile',  icon: '⚙️', key: 'nav_settings_short' },
];

const SIDEBAR_STORAGE_KEY = 'wt_sidebar_collapsed';

// Icon mũi tên gập — xoay 180° khi thu gọn, chuyển động mượt bằng CSS transition
function ChevronIcon({ collapsed }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={`w-3.5 h-3.5 transition-transform duration-300 ease-out ${collapsed ? 'rotate-180' : ''}`}
      aria-hidden="true"
    >
      <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Tooltip nhỏ hiện bên phải icon khi sidebar đang thu gọn (chỉ render khi cần)
function CollapsedTooltip({ children }) {
  return (
    <span
      className="pointer-events-none absolute left-full top-1/2 z-30 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-[#0f1a26] px-2.5 py-1.5 text-[11px] font-medium text-white opacity-0 shadow-lg shadow-black/30 ring-1 ring-white/10 transition-all duration-150 group-hover:opacity-100 group-hover:ml-2"
    >
      {children}
      <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#0f1a26]" />
    </span>
  );
}

export default function Sidebar({ collapsed, onToggle }) {
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const initials = user?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'U';

  return (
    <aside
      className={`relative hidden md:flex flex-shrink-0 flex-col h-full bg-[#1e2a3a] transition-[width] duration-300 ease-in-out ${
        collapsed ? 'w-[68px]' : 'w-[200px]'
      }`}
    >
      {/* Nút thu gọn / mở rộng — nổi trên đường viền phải của sidebar */}
      <button
        onClick={onToggle}
        title={collapsed ? t('sidebar_expand') : t('sidebar_collapse')}
        aria-label={collapsed ? t('sidebar_expand') : t('sidebar_collapse')}
        className="absolute -right-3 top-6 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-[#3a5170] bg-[#1e2a3a] text-[#9db8d2] shadow-md transition-all duration-200 hover:border-[#3a7bd5] hover:bg-[#3a7bd5] hover:text-white hover:shadow-[0_0_0_4px_rgba(58,123,213,0.18)] active:scale-90"
      >
        <ChevronIcon collapsed={collapsed} />
      </button>

      {/* Logo */}
      <div className={`flex items-center border-b border-[#2d3f52] transition-all duration-300 ${collapsed ? 'justify-center px-2 py-[18px]' : 'px-4 py-[18px]'}`}>
        {collapsed ? (
          <div className="text-lg text-white">⚙</div>
        ) : (
          <div className="min-w-0">
            <div className="whitespace-nowrap text-sm font-bold text-white">⚙ WorkTrack</div>
            <div className="mt-0.5 whitespace-nowrap text-[10px] text-[#7a9bbf]">{t('sidebar_tagline')}</div>
          </div>
        )}
      </div>

      {/* User — bấm vào để đổi mật khẩu / chỉnh hồ sơ (trang Cài đặt) */}
      <div className={`flex items-center gap-2 border-b border-[#2d3f52] transition-all duration-300 ${collapsed ? 'justify-center px-2 py-3' : 'px-[14px] py-2.5'}`}>
        <div className="group relative min-w-0 flex-1">
          <NavLink
            to="/profile"
            title={t('nav_settings')}
            className="group/profile flex min-w-0 items-center gap-2 rounded-md transition-colors hover:bg-[#2d3f52]/60"
          >
            <div
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
              style={{ background: user?.avatar_color || '#3a7bd5' }}
            >
              {initials}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-white group-hover/profile:underline">{user?.full_name}</div>
                <div className="text-[10px] capitalize text-[#7a9bbf]">{user?.role}</div>
              </div>
            )}
          </NavLink>
          {collapsed && <CollapsedTooltip>{t('nav_settings')}</CollapsedTooltip>}
        </div>
        <NotificationBell />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2.5">
        {NAV.map((item, i) => {
          if (item.divider) return <div key={i} className="mx-3 my-1.5 border-t border-[#2d3f52]" />;
          if (item.roles && !item.roles.includes(user?.role)) return null;
          return (
            <div key={item.to} className="group relative">
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 border-l-[3px] py-2.5 text-xs transition-colors whitespace-nowrap ${
                    collapsed ? 'justify-center px-0' : 'px-4'
                  } ${
                    isActive
                      ? 'border-[#3a7bd5] bg-[#2d3f52] text-white'
                      : 'border-transparent text-[#9db8d2] hover:bg-[#2d3f52] hover:text-white'
                  }`
                }
              >
                <span className="flex-shrink-0 text-base">{item.icon}</span>
                {!collapsed && <span>{t(item.key)}</span>}
              </NavLink>
              {collapsed && <CollapsedTooltip>{t(item.key)}</CollapsedTooltip>}
            </div>
          );
        })}
      </nav>

      {/* Logout */}
      <div className={`border-t border-[#2d3f52] transition-all duration-300 ${collapsed ? 'p-2' : 'p-3'}`}>
        <div className="group relative">
          <button
            onClick={() => logout().then(() => navigate('/login'))}
            className={`flex w-full items-center gap-2 rounded-lg py-2 text-xs text-[#9db8d2] transition-colors hover:bg-[#2d3f52] hover:text-white ${
              collapsed ? 'justify-center px-0' : 'px-3'
            }`}
          >
            <span>🚪</span>
            {!collapsed && <span>{t('logout')}</span>}
          </button>
          {collapsed && <CollapsedTooltip>{t('logout')}</CollapsedTooltip>}
        </div>
      </div>
    </aside>
  );
}

// Thanh điều hướng dưới cùng — chỉ hiện trên mobile/tablet nhỏ (< md)
function MobileNav() {
  const { t } = useTranslation();
  return (
    <nav
      className="flex flex-shrink-0 border-t border-[#2d3f52] bg-[#1e2a3a] md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {MOBILE_NAV.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 border-t-2 py-2 transition-colors ${
              isActive ? 'border-[#3a7bd5] bg-[#2d3f52] text-white' : 'border-transparent text-[#7a9bbf]'
            }`
          }
        >
          <span className="text-lg leading-none">{item.icon}</span>
          <span className="max-w-full truncate px-0.5 text-[9px] font-medium">{t(item.key)}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function MainLayout() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1'; }
    catch { return false; }
  });

  const { user } = useAuthStore();
  const { connect, disconnect } = useNotificationStore();

  // Kết nối socket 1 lần khi có user đăng nhập, ngắt khi rời layout (logout/unmount)
  useEffect(() => {
    if (!user?.id) return;
    connect(user.id);
    return () => disconnect();
  }, [user?.id]);

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? '1' : '0'); } catch {}
      return next;
    });
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden md:flex-row">
      <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
      <MobileNav />
      <NotificationToast />
    </div>
  );
}

export function ProtectedRoute({ roles = [] }) {
  const { t } = useTranslation();
  const { authenticated, loading, user } = useAuthStore();

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-[#f0f2f5] px-4">
      <div className="flex max-w-[92vw] flex-col items-center gap-3 rounded-2xl bg-white p-8 shadow-xl">
        <div className="animate-spin text-4xl">⚙️</div>
        <div className="text-sm text-gray-400">{t('loading')}</div>
      </div>
    </div>
  );

  if (!authenticated) { window.location.href = '/login'; return null; }
  if (roles.length && !roles.includes(user?.role)) { window.location.href = '/board'; return null; }
  return <Outlet />;
}

// Ngược lại với ProtectedRoute: chặn user ĐÃ đăng nhập vào lại /login,
// tự động đưa về trang chính (dùng Navigate của react-router thay vì
// window.location.href để không phải reload cả trang).
export function GuestRoute() {
  const { t } = useTranslation();
  const { authenticated, loading } = useAuthStore();

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-[#f0f2f5] px-4">
      <div className="flex max-w-[92vw] flex-col items-center gap-3 rounded-2xl bg-white p-8 shadow-xl">
        <div className="animate-spin text-4xl">⚙️</div>
        <div className="text-sm text-gray-400">{t('loading')}</div>
      </div>
    </div>
  );

  if (authenticated) return <Navigate to="/" replace />;
  return <Outlet />;
}
