// store/notificationStore.js
//
// Theo đúng pattern authStore (zustand) đang dùng trong project.
import { create } from 'zustand';
import api from '../api/client';
import { getSocket, disconnectSocket } from '../lib/socket';

const useNotificationStore = create((set, get) => ({
  items: [],
  unreadCount: 0,
  loading: false,
  toast: null,       // thông báo mới nhất đang hiện toast realtime
  connected: false,

  fetch: async () => {
    set({ loading: true });
    try {
      const { data } = await api.get('/notifications');
      set({ items: data.data, loading: false });
    } catch (e) {
      set({ loading: false });
    }
  },

  fetchUnreadCount: async () => {
    try {
      const { data } = await api.get('/notifications/unread-count');
      set({ unreadCount: data.data.count });
    } catch (e) {
      /* ignore */
    }
  },

  markRead: async (id) => {
    const wasUnread = get().items.find((n) => n.id === id && !n.is_read);
    set((s) => ({
      items: s.items.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)),
      unreadCount: wasUnread ? Math.max(0, s.unreadCount - 1) : s.unreadCount,
    }));
    try {
      await api.post(`/notifications/${id}/read`);
    } catch (e) {
      /* ignore — UI đã optimistic update, không cần rollback phức tạp cho tính năng nhỏ này */
    }
  },

  markAllRead: async () => {
    set((s) => ({ items: s.items.map((n) => ({ ...n, is_read: 1 })), unreadCount: 0 }));
    try {
      await api.post('/notifications/read-all');
    } catch (e) {
      /* ignore */
    }
  },

  // Gọi 1 lần sau khi login thành công (vd trong App.jsx hoặc MainLayout)
  connect: (userId) => {
    if (get().connected) return;
    const socket = getSocket(userId);

    socket.on('notification:new', (notification) => {
      set((s) => ({
        items: [notification, ...s.items].slice(0, 50),
        unreadCount: s.unreadCount + 1,
        toast: notification,
      }));
    });

    set({ connected: true });
  },

  disconnect: () => {
    disconnectSocket();
    set({ connected: false });
  },

  dismissToast: () => set({ toast: null }),
}));

export default useNotificationStore;