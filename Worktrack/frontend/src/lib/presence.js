// 🟢 Trạng thái online của mọi người: online (đang dùng) · idle (mở web nhưng treo) · offline
// (máy chủ: backend/src/realtime/presence.js)
//   - Bật 1 lần trong Layout: usePresenceTracker(user?.id)
//   - Lấy trạng thái 1 người: usePresenceOf(userId)
//   - Vẽ chấm: components/PresenceDot.jsx
import { useEffect } from 'react';
import { create } from 'zustand';
import { getSocket, setSocketIdle } from './socket';

const IDLE_AFTER = 5 * 60 * 1000; // 5 phút không đụng chuột / bàn phím → "treo"

export const usePresence = create((set) => ({
  map: {},       // userId → 'online' | 'idle' (không có = offline)
  selfDown: false, // mất kết nối tới máy chủ → không biết ai online, chấm của mình chuyển xám
  setAll: (map) => set({ map }),
  setOne: (userId, status) => set((s) => {
    const map = { ...s.map };
    if (status === 'offline') delete map[userId]; else map[userId] = status;
    return { map };
  }),
  setSelfDown: (selfDown) => set({ selfDown }),
}));

export function usePresenceTracker(userId) {
  useEffect(() => {
    if (!userId) return undefined;
    const s = getSocket();
    const st = usePresence.getState();
    const snapshot = () => s.emit('presence:get', (map) => usePresence.getState().setAll(map || {}));
    const onConnect = () => { st.setSelfDown(false); snapshot(); };
    const onDisconnect = () => st.setSelfDown(true);
    const onPresence = (p) => p && usePresence.getState().setOne(p.userId, p.status);
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('presence', onPresence);
    if (s.connected) snapshot(); else st.setSelfDown(true);

    // Dò "treo": có thao tác → đang dùng; 5 phút im lặng → treo
    let idle = false, timer = null, last = 0;
    const goIdle = () => { idle = true; setSocketIdle(true); if (s.connected) s.emit('presence:idle', true); };
    const activity = () => {
      const now = Date.now();
      if (!idle && now - last < 5000) return; // gom: mousemove bắn rất dày
      last = now;
      if (idle) { idle = false; setSocketIdle(false); if (s.connected) s.emit('presence:idle', false); }
      clearTimeout(timer);
      timer = setTimeout(goIdle, IDLE_AFTER);
    };
    const onVisible = () => { if (document.visibilityState === 'visible') activity(); };
    const EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'];
    EVENTS.forEach((e) => window.addEventListener(e, activity, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', onVisible);
    activity();
    return () => {
      s.off('connect', onConnect); s.off('disconnect', onDisconnect); s.off('presence', onPresence);
      EVENTS.forEach((e) => window.removeEventListener(e, activity, { capture: true }));
      document.removeEventListener('visibilitychange', onVisible);
      clearTimeout(timer); setSocketIdle(false);
    };
  }, [userId]);
}

export function usePresenceOf(userId) {
  return usePresence((s) => (s.selfDown ? 'offline' : s.map[userId] || 'offline'));
}

