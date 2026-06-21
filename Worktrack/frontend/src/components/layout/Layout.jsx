import api from '../../api/client';
import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useAuth from '../../store/authStore';

const NAV = [
  { to:'/board',     icon:'🗂',  label:'Bảng công việc' },
  { to:'/daily',     icon:'📋', label:'CV Hằng ngày' },
  { to:'/requests',  icon:'📨', label:'CV Yêu cầu',   badge: true },
  { to:'/completed', icon:'✅', label:'CV Hoàn thành' },
  null,
  { to:'/dashboard', icon:'📊', label:'Dashboard',     roles:['admin','manager'] },
  { to:'/users',     icon:'👥', label:'Quản lý User',  roles:['admin'] },
  { to:'/settings',  icon:'⚙️', label:'Cài đặt' },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const initials = user?.full_name?.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() || 'U';

  return (
    <div className="w-[200px] bg-[#1e2a3a] flex-shrink-0 flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-[18px] border-b border-[#2d3f52]">
        <div className="text-white text-sm font-bold">⚙ WorkTrack</div>
        <div className="text-[#7a9bbf] text-[10px] mt-0.5">Quản lý công việc nội bộ</div>
      </div>

      {/* User */}
      <div className="px-[14px] py-2.5 border-b border-[#2d3f52] flex items-center gap-2">
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
          style={{ background: user?.avatar_color || '#3a7bd5' }}>
          {initials}
        </div>
        <div>
          <div className="text-white text-xs font-semibold truncate max-w-[130px]">{user?.full_name}</div>
          <div className="text-[#7a9bbf] text-[10px] capitalize">{user?.role}</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2.5 overflow-y-auto">
        {NAV.map((item, i) => {
          if (!item) return <div key={i} className="border-t border-[#2d3f52] my-1.5" />;
          if (item.roles && !item.roles.includes(user?.role)) return null;
          return (
            <NavLink key={item.to} to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-4 py-2.5 text-xs border-l-[3px] transition-colors ${
                  isActive
                    ? 'bg-[#2d3f52] text-white border-[#3a7bd5]'
                    : 'text-[#9db8d2] border-transparent hover:bg-[#2d3f52] hover:text-white'
                }`
              }
              onMouseEnter={() => {
                // Prefetch data khi hover
                if (item.to === '/board') api.prefetch('/groups');
                if (item.to === '/daily') api.prefetch('/groups');
                if (item.to === '/dashboard') api.prefetch('/dashboard/scores?view=week');
              }}>
              <span>{item.icon}</span>
              <span className="flex-1">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-[#2d3f52]">
        <button onClick={() => logout().then(() => navigate('/login'))}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#9db8d2] hover:text-white hover:bg-[#2d3f52] rounded-lg transition-colors">
          🚪 Đăng xuất
        </button>
      </div>
    </div>
  );
}

export function MainLayout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}

export function ProtectedRoute({ roles=[] }) {
  const { authenticated, loading, user } = useAuth();
  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-[#f0f2f5]">
      <div className="bg-white rounded-2xl shadow-xl p-8 flex flex-col items-center gap-3">
        <div className="text-4xl animate-spin">⚙️</div>
        <div className="text-sm text-gray-400">Loading...</div>
      </div>
    </div>
  );
  if (!authenticated) { window.location.href='/login'; return null; }
  if (roles.length && !roles.includes(user?.role)) { window.location.href='/'; return null; }
  return <Outlet />;
}