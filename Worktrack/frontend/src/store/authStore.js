import { create } from 'zustand';
import api from '../api/client';

const useAuth = create((set, get) => ({
  user: null,
  loading: true,
  authenticated: false,

  login: async (username, password) => {
    const { data } = await api.post('/auth/login', { username, password });
    const { access_token, refresh_token, user } = data.data;
    localStorage.setItem('access_token', access_token);
    localStorage.setItem('refresh_token', refresh_token);
    set({ user, authenticated: true });
    return user;
  },

  logout: async () => {
    try {
      await api.post('/auth/logout', { refresh_token: localStorage.getItem('refresh_token') });
    } catch (_) {}
    localStorage.clear();
    set({ user: null, authenticated: false });
  },

  fetchMe: async () => {
    try {
      if (!localStorage.getItem('access_token')) return set({ loading: false });
      const { data } = await api.get('/auth/me');
      set({ user: data.data, authenticated: true, loading: false });
    } catch {
      localStorage.clear();
      set({ user: null, authenticated: false, loading: false });
    }
  },

  // Quyền theo trang Phân quyền (Admin luôn có hết) — server vẫn kiểm tra lại
  hasPerm: (...keys) => {
    const user = get().user;
    if (!user) return false;
    return user.role === 'admin' || keys.some(k => user.permissions?.includes(k));
  },
  // Admin vừa đổi phân quyền → tải lại quyền của mình (không dùng cache 30s của api.get)
  refreshMe: async () => {
    try {
      const { data } = await api.get('/auth/me', { cache: false });
      set({ user: data.data });
    } catch { /* giữ nguyên */ }
  },

  can: (...roles) => {
    const user = get().user;
    if (!user) return false;
    return roles.includes(user.role);
  },

  isLeaderOf: (gid) => {
    const user = get().user;
    if (!user) return false;
    return user.groups?.some(g => g.id === gid && g.is_leader) || false;
  },
}));

export default useAuth;