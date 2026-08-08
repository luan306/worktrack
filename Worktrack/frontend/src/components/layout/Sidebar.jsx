import { NavLink, useNavigate, Outlet, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import useAuthStore from '../../store/authStore';
import useNotificationStore from '../../store/notificationStore';
import NotificationBell from '../../components/NotificationBell';
import NotificationToast from '../../components/NotificationToast';

/* ============================================================
   Cùng ngôn ngữ thiết kế "control-panel" với BoardPage:
   nền tối, chip icon màu theo từng khu vực chức năng (như đèn
   trạng thái trên bảng điều khiển), badge vai trò kiểu thẻ nhân
   viên nhà máy, chấm "đang hoạt động" nhấp nháy nhẹ.
   ============================================================ */
const NAV = [
  { to: '/board',     icon: '🗂',  tkey: 'nav_board',     color: '#3654ff' },
  { to: '/daily',     icon: '📋',  tkey: 'nav_daily',     color: '#14b8c4' },
  { to: '/requests',  icon: '📨',  tkey: 'requests',      color: '#f59e0b' },
  { to: '/completed', icon: '✅',  tkey: 'nav_completed', color: '#17b26a' },
  { divider: true },
  // Leader KHÔNG được xem Dashboard — chỉ admin/manager
  { to: '/dashboard', icon: '📊',  tkey: 'dash_title', roles: ['admin','manager'], color: '#8b5cf6' },
  // Leader vào đây để tạo tài khoản user
  { to: '/users',     icon: '👥',  tkey: 'nav_users',  roles: ['admin','manager','leader'], color: '#ec4899' },
  { to: '/settings',  icon: '⚙️', tkey: 'settings', color: '#6b7280' },
];

function NavIcon({ icon, color, active }) {
  return (
    <span
      className="flex items-center justify-center w-7 h-7 rounded-[8px] text-[13px] flex-shrink-0 transition-all duration-200"
      style={{
        background: active ? `linear-gradient(135deg, ${color}, ${color}cc)` : `${color}1f`,
        boxShadow: active ? `0 2px 9px ${color}66` : 'none',
      }}
    >
      <span style={{ filter: active ? 'none' : 'saturate(0.7) opacity(0.85)' }}>{icon}</span>
    </span>
  );
}

export default function Sidebar() {
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const initials = user?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'U';
  const avatarColor = user?.avatar_color || '#3654ff';

  return (
    <aside className="wt-sidebar relative w-[212px] bg-[#0b1220] flex-shrink-0 flex flex-col h-full overflow-hidden">
      <style>{`
        .wt-sidebar { font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
        .wt-sidebar .wt-mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace; }
        .wt-sidebar .wt-nav::-webkit-scrollbar { width: 5px; }
        .wt-sidebar .wt-nav::-webkit-scrollbar-thumb { background: rgba(255,255,255,.08); border-radius: 8px; }
        .wt-sidebar .wt-nav::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.16); }
        .wt-sidebar .wt-navlink { position: relative; }
        .wt-sidebar .wt-navlink:focus-visible { outline: none; box-shadow: 0 0 0 2px #0b1220, 0 0 0 4px rgba(54,84,255,.65); }
        @keyframes wtPulse { 0%,100%{ opacity:1; transform:scale(1); } 50%{ opacity:.45; transform:scale(.85); } }
        .wt-sidebar .wt-live-dot { animation: wtPulse 2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .wt-sidebar .wt-live-dot { animation: none; } }
      `}</style>

      {/* Dải sáng cạnh viền — điểm nhấn "đèn báo" của bảng điều khiển */}
      <div className="absolute top-0 right-0 w-px h-full bg-gradient-to-b from-transparent via-[#3654ff]/50 to-transparent pointer-events-none" />

      {/* Logo */}
      <div className="px-4 pt-5 pb-4 border-b border-white/[0.06] flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-[9px] flex items-center justify-center text-[15px] flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #3654ff, #2440d6)', boxShadow: '0 3px 10px rgba(54,84,255,.35)' }}
          >
            ⚙
          </div>
          <div className="min-w-0">
            <div className="text-white text-[13.5px] font-bold tracking-tight leading-none truncate">WorkTrack</div>
            <div className="wt-mono text-[#5c7091] text-[9px] mt-1.5 uppercase tracking-[0.14em] truncate">{t('sidebar_tagline')}</div>
          </div>
        </div>
      </div>

      {/* User — kiểu thẻ nhân viên */}
      <div className="mx-2.5 mt-3 mb-1.5 p-2.5 rounded-xl bg-white/[0.035] border border-white/[0.07] flex items-center gap-2.5 flex-shrink-0">
        <div className="relative flex-shrink-0">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold ring-2 ring-white/10"
            style={{ background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}cc)` }}
          >
            {initials}
          </div>
          <span
            className="wt-live-dot absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#17b26a] ring-2 ring-[#0b1220]"
            title={t('online') || 'Đang hoạt động'}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-white text-[12px] font-semibold truncate leading-tight">{user?.full_name}</div>
          <span className="wt-mono inline-block mt-1 px-1.5 py-[1px] rounded text-[8.5px] font-bold uppercase tracking-wider text-[#93a7c4] bg-white/[0.06] border border-white/[0.09]">
            {user?.role}
          </span>
        </div>
        <NotificationBell />
      </div>

      {/* Nav */}
      <nav className="wt-nav flex-1 py-2 overflow-y-auto min-h-0">
        {NAV.map((item, i) => {
          if (item.divider) return (
            <div key={i} className="flex items-center gap-2 mx-4 my-2.5">
              <div className="flex-1 h-px bg-white/[0.07]" />
              <span className="w-1 h-1 rounded-full bg-white/[0.12]" />
              <div className="flex-1 h-px bg-white/[0.07]" />
            </div>
          );
          if (item.roles && !item.roles.includes(user?.role)) return null;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `wt-navlink group flex items-center gap-2.5 mx-2.5 my-0.5 pl-2.5 pr-3 py-2 rounded-lg text-[12.5px] font-medium transition-colors duration-150 ${
                  isActive ? 'text-white' : 'text-[#8093b0] hover:text-white hover:bg-white/[0.05]'
                }`
              }
              style={({ isActive }) =>
                isActive
                  ? { background: `linear-gradient(90deg, ${item.color}22, transparent 85%)`, boxShadow: `inset 3px 0 0 0 ${item.color}` }
                  : undefined
              }
            >
              {({ isActive }) => (
                <>
                  <NavIcon icon={item.icon} color={item.color} active={isActive} />
                  <span className="truncate">{t(item.tkey)}</span>
                  {isActive && (
                    <span
                      className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: item.color, boxShadow: `0 0 6px ${item.color}` }}
                    />
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-2.5 border-t border-white/[0.06] flex-shrink-0">
        <button
          onClick={() => logout().then(() => navigate('/login'))}
          className="wt-navlink w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[12px] font-medium text-[#8093b0] hover:text-white hover:bg-[#e5384d]/[0.12] transition-colors duration-150"
        >
          <span className="flex items-center justify-center w-7 h-7 rounded-[8px] text-[13px] flex-shrink-0 bg-white/[0.05]">🚪</span>
          {t('logout')}
        </button>
      </div>
    </aside>
  );
}

export function MainLayout() {
  const { user } = useAuthStore();
  const { connect, disconnect } = useNotificationStore();

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

// Route guard dùng trong file khai báo <Routes> (App.jsx hoặc tương tự), ví dụ:
//   <Route element={<ProtectedRoute roles={['admin','manager']} />}>
//     <Route path="/dashboard" element={<DashboardPage/>} />
//   </Route>
export function ProtectedRoute({ roles = [] }) {
  const { t } = useTranslation();
  const { authenticated, loading, user } = useAuthStore();

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-[#eef1f8]">
      <div className="bg-white rounded-2xl shadow-[0_20px_50px_rgba(15,23,41,.12)] border border-[#e6e9f2] p-8 flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg animate-spin" style={{ background: 'linear-gradient(135deg, #3654ff, #2440d6)' }}>
          <span className="text-white">⚙️</span>
        </div>
        <div className="text-[12.5px] text-[#6b7280] font-medium">{t('loading')}</div>
      </div>
    </div>
  );

  if (!authenticated) { window.location.href = '/login'; return null; }
  // Sai quyền → khóa hẳn, đưa về 404 thay vì redirect về /board
  if (roles.length && !roles.includes(user?.role)) {
    return <Navigate to="/404" replace />;
  }
  return <Outlet />;
}