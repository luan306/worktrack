import { useState, useEffect } from 'react';
import { NavLink, useNavigate, Outlet, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useAuthStore from '../../store/authStore';
import useNotificationStore from '../../store/notificationStore';
import NotificationBell from '../NotificationBell';
import NotificationToast from '../NotificationToast';

/* ============================================================
   Ngôn ngữ thiết kế "control-panel": nền tối, mỗi mục nav có
   một màu đèn báo riêng, thẻ người dùng kiểu thẻ nhân viên nhà
   máy, dải sáng viền cạnh. Đồng bộ với BoardPage.
   ============================================================ */
const NAV = [
  { to: '/board',        icon: '🗂',  key: 'nav_board',        color: '#3654ff' },
  { to: '/daily',        icon: '📋',  key: 'nav_daily',        color: '#14b8c4' },
  { to: '/requests',     icon: '📨',  key: 'nav_requests',     color: '#f59e0b' },
  { to: '/completed',    icon: '✅',  key: 'nav_completed',    color: '#17b26a' },
  { divider: true },
  { to: '/dashboard',    icon: '📊',  key: 'nav_dashboard',    roles: ['admin','manager'], color: '#8b5cf6' },
  { to: '/activity-log', icon: '📜',  key: 'nav_activity_log', roles: ['admin','manager'], color: '#64748b' },
  { to: '/users',        icon: '👥',  key: 'nav_users',        roles: ['admin','manager','leader'], color: '#ec4899' },
  { to: '/profile',      icon: '⚙️', key: 'nav_settings',     color: '#6b7280' },
];

// Các mục hiển thị ở thanh điều hướng dưới cùng trên mobile (không gian hẹp nên chỉ chọn lọc)
const MOBILE_NAV = [
  { to: '/board',     icon: '🗂',  key: 'nav_board_short',     color: '#3654ff' },
  { to: '/daily',     icon: '📋',  key: 'nav_daily_short',     color: '#14b8c4' },
  { to: '/requests',  icon: '📨',  key: 'nav_requests_short',  color: '#f59e0b' },
  { to: '/completed', icon: '✅',  key: 'nav_completed_short', color: '#17b26a' },
  { to: '/profile',   icon: '⚙️', key: 'nav_settings_short',  color: '#6b7280' },
];

const SIDEBAR_STORAGE_KEY = 'wt_sidebar_collapsed';
const INK = '#0b1220';

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
function CollapsedTooltip({ children, accent = '#3654ff' }) {
  return (
    <span
      className="pointer-events-none absolute left-full top-1/2 z-30 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-[#0f1a2e] px-2.5 py-1.5 text-[11px] font-medium text-white opacity-0 shadow-lg shadow-black/30 ring-1 ring-white/10 transition-all duration-150 group-hover:opacity-100 group-hover:ml-2"
    >
      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: accent, boxShadow: `0 0 5px ${accent}` }} />
      {children}
      <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#0f1a2e]" />
    </span>
  );
}

// Chip icon màu — giống "đèn trạng thái" trên bảng điều khiển, sáng lên khi active
function NavIcon({ icon, color, active, size = 28 }) {
  return (
    <span
      className="flex flex-shrink-0 items-center justify-center rounded-[8px] text-[13px] transition-all duration-200"
      style={{
        width: size, height: size,
        background: active ? `linear-gradient(135deg, ${color}, ${color}cc)` : `${color}1f`,
        boxShadow: active ? `0 2px 9px ${color}66` : 'none',
      }}
    >
      <span style={{ filter: active ? 'none' : 'saturate(0.7) opacity(0.85)' }}>{icon}</span>
    </span>
  );
}

export default function Sidebar({ collapsed, onToggle }) {
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const { disconnect } = useNotificationStore();
  const navigate = useNavigate();
  const initials = user?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'U';
  const avatarColor = user?.avatar_color || '#3654ff';

  return (
    <aside
      className={`wt-sidebar relative hidden md:flex flex-shrink-0 flex-col h-full bg-[#0b1220] transition-[width] duration-300 ease-in-out overflow-hidden ${
        collapsed ? 'w-[68px]' : 'w-[212px]'
      }`}
    >
      <style>{`
        .wt-sidebar { font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
        .wt-sidebar .wt-mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace; }
        .wt-sidebar .wt-nav::-webkit-scrollbar { width: 5px; }
        .wt-sidebar .wt-nav::-webkit-scrollbar-thumb { background: rgba(255,255,255,.08); border-radius: 8px; }
        .wt-sidebar .wt-nav::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.16); }
        .wt-sidebar a:focus-visible, .wt-sidebar button:focus-visible { outline: none; box-shadow: 0 0 0 2px #0b1220, 0 0 0 4px rgba(54,84,255,.65); border-radius: 8px; }
        @keyframes wtPulse { 0%,100%{ opacity:1; transform:scale(1); } 50%{ opacity:.45; transform:scale(.85); } }
        .wt-sidebar .wt-live-dot { animation: wtPulse 2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .wt-sidebar .wt-live-dot { animation: none; }
          .wt-sidebar, .wt-sidebar * { transition-duration: .001ms !important; }
        }
      `}</style>

      {/* Dải sáng cạnh viền — điểm nhấn "đèn báo" của bảng điều khiển */}
      <div className="pointer-events-none absolute top-0 right-0 h-full w-px bg-gradient-to-b from-transparent via-[#3654ff]/50 to-transparent" />

      {/* Nút thu gọn / mở rộng — nổi trên đường viền phải của sidebar */}
      <button
        onClick={onToggle}
        title={collapsed ? t('sidebar_expand') : t('sidebar_collapse')}
        aria-label={collapsed ? t('sidebar_expand') : t('sidebar_collapse')}
        className="absolute -right-3 top-6 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-[#111b2e] text-[#8093b0] shadow-md transition-all duration-200 hover:border-[#3654ff]/60 hover:bg-[#3654ff] hover:text-white hover:shadow-[0_0_0_4px_rgba(54,84,255,0.22)] active:scale-90"
      >
        <ChevronIcon collapsed={collapsed} />
      </button>

      {/* Logo */}
      <div className={`flex flex-shrink-0 items-center border-b border-white/[0.06] transition-all duration-300 ${collapsed ? 'justify-center px-2 py-4' : 'px-4 pt-5 pb-4'}`}>
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[9px] text-[15px]"
          style={{ background: 'linear-gradient(135deg, #3654ff, #2440d6)', boxShadow: '0 3px 10px rgba(54,84,255,.35)' }}
        >
          ⚙
        </div>
        {!collapsed && (
          <div className="min-w-0 ml-2.5">
            <div className="truncate text-[13.5px] font-bold leading-none tracking-tight text-white">WorkTrack</div>
            <div className="wt-mono mt-1.5 truncate text-[9px] uppercase tracking-[0.14em] text-[#5c7091]">{t('sidebar_tagline')}</div>
          </div>
        )}
      </div>

      {/* User — thẻ nhân viên, bấm vào để đổi mật khẩu / chỉnh hồ sơ */}
      <div className={`flex-shrink-0 border-b border-white/[0.06] transition-all duration-300 ${collapsed ? 'px-2 py-3' : 'px-2.5 py-2.5'}`}>
        <div className={`flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.035] ${collapsed ? 'justify-center p-1.5' : 'p-2'}`}>
          <div className="group relative min-w-0 flex-1">
            <NavLink
              to="/profile"
              title={t('nav_settings')}
              className={`group/profile flex min-w-0 items-center gap-2.5 rounded-lg transition-colors hover:bg-white/[0.05] ${collapsed ? 'justify-center p-0.5' : 'p-0.5'}`}
            >
              <div className="relative flex-shrink-0">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold text-white ring-2 ring-white/10"
                  style={{ background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}cc)` }}
                >
                  {initials}
                </div>
                <span className="wt-live-dot absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#17b26a] ring-2 ring-[#0b1220]" />
              </div>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-semibold leading-tight text-white group-hover/profile:underline">{user?.full_name}</div>
                  <span className="wt-mono mt-1 inline-block truncate rounded border border-white/[0.09] bg-white/[0.06] px-1.5 py-[1px] text-[8.5px] font-bold uppercase tracking-wider text-[#93a7c4]">
                    {user?.role}
                  </span>
                </div>
              )}
            </NavLink>
            {collapsed && <CollapsedTooltip accent={avatarColor}>{user?.full_name}</CollapsedTooltip>}
          </div>
          {!collapsed && <NotificationBell />}
        </div>
      </div>

      {/* Nav */}
      <nav className="wt-nav min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-2">
        {NAV.map((item, i) => {
          if (item.divider) return (
            <div key={i} className={`flex items-center gap-2 my-2.5 ${collapsed ? 'mx-3' : 'mx-4'}`}>
              <div className="h-px flex-1 bg-white/[0.07]" />
              {!collapsed && <span className="h-1 w-1 rounded-full bg-white/[0.12]" />}
              <div className="h-px flex-1 bg-white/[0.07]" />
            </div>
          );
          if (item.roles && !item.roles.includes(user?.role)) return null;
          return (
            <div key={item.to} className="group relative mx-2.5 my-0.5">
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 whitespace-nowrap rounded-lg py-2 text-[12.5px] font-medium transition-colors duration-150 ${
                    collapsed ? 'justify-center px-0' : 'pl-2.5 pr-3'
                  } ${isActive ? 'text-white' : 'text-[#8093b0] hover:bg-white/[0.05] hover:text-white'}`
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
                    {!collapsed && <span className="truncate">{t(item.key)}</span>}
                    {!collapsed && isActive && (
                      <span className="ml-auto h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: item.color, boxShadow: `0 0 6px ${item.color}` }} />
                    )}
                  </>
                )}
              </NavLink>
              {collapsed && <CollapsedTooltip accent={item.color}>{t(item.key)}</CollapsedTooltip>}
            </div>
          );
        })}
      </nav>

      {/* Logout */}
      <div className={`flex-shrink-0 border-t border-white/[0.06] transition-all duration-300 ${collapsed ? 'p-2' : 'p-2.5'}`}>
        <div className="group relative">
          <button
            onClick={() => { disconnect(); logout().then(() => navigate('/login')); }}
            className={`flex w-full items-center gap-2.5 rounded-lg py-2.5 text-[12px] font-medium text-[#8093b0] transition-colors duration-150 hover:bg-[#e5384d]/[0.12] hover:text-white ${
              collapsed ? 'justify-center px-0' : 'px-3'
            }`}
          >
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[8px] bg-white/[0.05] text-[13px]">🚪</span>
            {!collapsed && <span>{t('logout')}</span>}
          </button>
          {collapsed && <CollapsedTooltip accent="#e5384d">{t('logout')}</CollapsedTooltip>}
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
      className="wt-mobile-nav flex flex-shrink-0 border-t border-white/[0.06] bg-[#0b1220] md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)', fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}
    >
      {MOBILE_NAV.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `flex min-w-0 flex-1 flex-col items-center justify-center gap-1 border-t-2 py-2 transition-colors duration-150 ${
              isActive ? 'text-white' : 'border-transparent text-[#6b7d99]'
            }`
          }
          style={({ isActive }) => (isActive ? { borderTopColor: item.color } : undefined)}
        >
          {({ isActive }) => (
            <>
              <NavIcon icon={item.icon} color={item.color} active={isActive} size={24} />
              <span className="max-w-full truncate px-0.5 text-[9px] font-medium">{t(item.key)}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function LoadingScreen({ label }) {
  return (
    <div className="flex h-screen items-center justify-center bg-[#eef1f8] px-4">
      <div className="flex max-w-[92vw] flex-col items-center gap-3 rounded-2xl border border-[#e6e9f2] bg-white p-8 shadow-[0_20px_50px_rgba(15,23,41,.12)]">
        <div className="flex h-10 w-10 animate-spin items-center justify-center rounded-xl text-lg" style={{ background: 'linear-gradient(135deg, #3654ff, #2440d6)' }}>
          <span className="text-white">⚙️</span>
        </div>
        <div className="text-[12.5px] font-medium text-[#6b7280]">{label}</div>
      </div>
    </div>
  );
}

export function MainLayout() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1'; }
    catch { return false; }
  });

  const { user } = useAuthStore();
  const { connect, disconnect } = useNotificationStore();

  // ⚠️ KHÔNG disconnect() trong cleanup của effect này — socket dùng CHUNG
  // cho cả app, và effect này bị React 19 chạy 2 lần trong dev (double-invoke
  // effects) khiến trước đây cứ disconnect() rồi connect() lại liên tục →
  // lỗi "WebSocket closed before connection is established" lặp vô hạn.
  // connect() tự có guard "nếu đã kết nối thì return" nên gọi lại nhiều lần
  // vô hại — chỉ cần disconnect() đúng 1 lần lúc logout thật sự (xem nút
  // Đăng xuất bên dưới).
  useEffect(() => {
    if (!user?.id) return;
    connect(user.id);
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

  if (loading) return <LoadingScreen label={t('loading')} />;

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

  if (loading) return <LoadingScreen label={t('loading')} />;

  if (authenticated) return <Navigate to="/" replace />;
  return <Outlet />;
}