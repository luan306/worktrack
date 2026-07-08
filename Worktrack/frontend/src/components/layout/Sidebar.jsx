import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import useAuthStore from '../../store/authStore';
import useNotificationStore from '../../store/notificationStore';
import NotificationBell from '../../components/NotificationBell';
import NotificationToast from '../../components/NotificationToast';

const NAV = [
  { to: '/board',     icon: '🗂',  tkey: 'nav_board' },
  { to: '/daily',     icon: '📋',  tkey: 'nav_daily' },
  { to: '/requests',  icon: '📨',  tkey: 'requests' },
  { to: '/completed', icon: '✅',  tkey: 'nav_completed' },
  { divider: true },
  { to: '/dashboard', icon: '📊',  tkey: 'dash_title', roles: ['admin','manager','leader'] },
  { to: '/users',     icon: '👥',  tkey: 'nav_users',  roles: ['admin'] },
  { to: '/settings',  icon: '⚙️', tkey: 'settings' },
];

export default function Sidebar() {
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const initials = user?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'U';

  return (
    <aside className="w-[200px] bg-[#1e2a3a] flex-shrink-0 flex flex-col h-full">

      {/* Logo */}
      <div className="px-4 py-[18px] border-b border-[#2d3f52]">
        <div className="text-white text-sm font-bold">⚙ WorkTrack</div>
        <div className="text-[#7a9bbf] text-[10px] mt-0.5">{t('sidebar_tagline')}</div>
      </div>

      {/* User */}
      <div className="px-[14px] py-2.5 border-b border-[#2d3f52] flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
          style={{ background: user?.avatar_color || '#3a7bd5' }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-white text-xs font-semibold truncate">{user?.full_name}</div>
          <div className="text-[#7a9bbf] text-[10px] capitalize">{user?.role}</div>
        </div>
        <NotificationBell />
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2.5 overflow-y-auto">
        {NAV.map((item, i) => {
          if (item.divider) return <div key={i} className="border-t border-[#2d3f52] my-1.5" />;
          if (item.roles && !item.roles.includes(user?.role)) return null;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-4 py-2.5 text-xs border-l-[3px] transition-colors ${
                  isActive
                    ? 'bg-[#2d3f52] text-white border-[#3a7bd5]'
                    : 'text-[#9db8d2] border-transparent hover:bg-[#2d3f52] hover:text-white'
                }`
              }
            >
              <span>{item.icon}</span>
              <span>{t(item.tkey)}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-[#2d3f52]">
        <button
          onClick={() => logout().then(() => navigate('/login'))}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#9db8d2] hover:text-white hover:bg-[#2d3f52] rounded-lg transition-colors"
        >
          🚪 {t('logout')}
        </button>
      </div>
    </aside>
  );
}

export function MainLayout() {
  const { user } = useAuthStore();
  const { connect, disconnect } = useNotificationStore();

  // Kết nối socket 1 lần khi có user đăng nhập, ngắt khi rời layout (logout/unmount)
  useEffect(() => {
    if (!user?.id) return;
    connect(user.id);
    return () => disconnect();
  }, [user?.id]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden flex flex-col">
        <Outlet />
      </main>
      <NotificationToast />
    </div>
  );
}

export function ProtectedRoute({ roles = [] }) {
  const { t } = useTranslation();
  const { authenticated, loading, user } = useAuthStore();

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-[#f0f2f5]">
      <div className="bg-white rounded-2xl shadow-xl p-8 flex flex-col items-center gap-3">
        <div className="text-4xl animate-spin">⚙️</div>
        <div className="text-sm text-gray-400">{t('loading')}</div>
      </div>
    </div>
  );

  if (!authenticated) { window.location.href = '/login'; return null; }
  if (roles.length && !roles.includes(user?.role)) { window.location.href = '/board'; return null; }
  return <Outlet />;
}