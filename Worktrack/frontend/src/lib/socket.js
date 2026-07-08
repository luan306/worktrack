// lib/socket.js
//
// ⚠️ Nếu WorkTrack đã có sẵn 1 socket client dùng chung ở đâu đó (kiểu như bên
// MobileAudit.tsx / SMC Inventory), hãy dùng lại socket đó thay vì file này,
// chỉ cần đảm bảo có join room `user:{id}` (xem INTEGRATION_NOTES.md) và
// lắng nghe thêm event 'notification:new'.
import { io } from 'socket.io-client';

let socket = null;

export function getSocket(userId) {
  if (socket?.connected || socket?.active) return socket;

  const base = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace('/api', '');
  socket = io(base, {
    auth: { userId },
    transports: ['websocket', 'polling'], // fallback về polling nếu websocket bị chặn
    reconnection: true,
  });

  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}