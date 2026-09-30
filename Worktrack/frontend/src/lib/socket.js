// lib/socket.js
//
// ⚠️ Nếu WorkTrack đã có sẵn 1 socket client dùng chung ở đâu đó (kiểu như bên
// MobileAudit.tsx / SMC Inventory), hãy dùng lại socket đó thay vì file này,
// chỉ cần đảm bảo có join room `user:{id}` (xem INTEGRATION_NOTES.md) và
// lắng nghe thêm event 'notification:new'.
import { io } from 'socket.io-client';
import { clearApiCache } from '../api/client';

let socket = null;

// Server xác định người dùng từ access token (không tin userId client gửi lên).
// Dùng hàm cho `auth` để mỗi lần reconnect lấy token MỚI NHẤT sau khi refresh.
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
// Lắng nghe 1 sự kiện realtime rồi gọi handler — GỘP các sự kiện dồn dập và
// lệch giờ ngẫu nhiên giữa các máy. Không có bước này, mỗi thay đổi làm TẤT
// CẢ người đang online tải lại cùng 1 lúc (100 người × vài request); duyệt 10
// CV liên tiếp là hàng nghìn request dồn vào server trong 1 giây.
// handler nhận MẢNG payload của các sự kiện đã gộp (để trang tự lọc: có liên quan mình không).
// Trả về hàm hủy đăng ký — dùng thẳng làm cleanup của useEffect.
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
  return () => { s.off(event, listener); clearTimeout(timer); };
}
