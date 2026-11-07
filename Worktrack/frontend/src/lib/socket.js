// lib/socket.js — MỘT kết nối Socket.IO dùng chung cho cả app (máy chủ: backend/src/realtime/)
import { io } from 'socket.io-client';
import { clearApiCache } from '../api/client';

let socket = null;
let idleFlag = false; // đang "treo" (lib/presence) — gửi kèm khi nối lại để máy chủ biết ngay
export const setSocketIdle = (v) => { idleFlag = !!v; };

// Server xác định người dùng từ access token.
// Luôn dùng MỘT kết nối duy nhất cho cả app: nhiều nơi gắn listener vào nó (chuông thông báo, CV đang mở,
// "… đang nhắn"). Trước đây nếu kết nối bị máy chủ từ chối (token hết hạn lúc máy chủ khởi động lại…)
// thì lần gọi sau tạo kết nối MỚI → listener cũ nằm trên kết nối chết → mất realtime tới khi F5.
export function getSocket() {
  if (socket) {
    if (!socket.connected && !socket.active) socket.connect(); // bị từ chối trước đó → nối lại chính nó
    return socket;
  }

  const base = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace('/api', '');
  const s = io(base, {
    auth: (cb) => cb({ token: localStorage.getItem('access_token'), idle: idleFlag }), // đọc token MỚI NHẤT mỗi lần nối
    transports: ['websocket', 'polling'], // fallback về polling nếu websocket bị chặn
    reconnection: true,
  });
  // Máy chủ từ chối phiên (token vừa hết hạn, app sẽ tự lấy token mới qua API) → socket.io KHÔNG tự thử lại
  // → tự thử lại, giãn dần 3s → 60s để không dồn dập máy chủ
  let delay = 3000, retry = null;
  s.on('connect_error', () => {
    if (s.active) return; // lỗi mạng: socket.io tự thử lại
    clearTimeout(retry);
    retry = setTimeout(() => { if (socket === s && !s.connected && !s.active) s.connect(); }, delay + Math.random() * 1000);
    delay = Math.min(delay * 2, 60000);
  });
  s.on('connect', () => { delay = 3000; clearTimeout(retry); });
  socket = s;
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
