// lib/socket.js ⚠️ Nếu WorkTrack đã có sẵn 1 socket client dùng chung ở đâu đó
import { io } from 'socket.io-client';
import { clearApiCache } from '../api/client';

let socket = null;

// Server xác định người dùng từ access token
export function getSocket() {
  if (socket?.connected || socket?.active) return socket;

  const base = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace('/api', '');
  socket = io(base, {
    auth: (cb) => cb({ token: localStorage.getItem('access_token') }),
    transports: ['websocket', 'polling'], // fallback về polling nếu websocket bị chặn
    reconnection: true,
  });

  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
// Lắng nghe 1 sự kiện realtime rồi gọi handler
export function onRealtime(event, handler, { wait = 400, jitter = 1200 } = {}) {
  const s = getSocket();
  let timer = null, batch = [];
  const listener = (payload) => {
    batch.push(payload);
    if (timer) return; // đã hẹn tải lại → gộp luôn sự kiện này
    timer = setTimeout(() => {
      const events = batch; batch = []; timer = null;
      clearApiCache(); // dữ liệu đã đổi → bỏ cache GET cũ
      handler(events);
    }, wait + Math.random() * jitter);
  };
  s.on(event, listener);
  // Nối lại được sau khi rớt mạng / máy chủ khởi động lại
  const onReconnect = () => listener(undefined);
  s.io.on('reconnect', onReconnect);
  return () => { s.off(event, listener); s.io.off('reconnect', onReconnect); clearTimeout(timer); };
}
