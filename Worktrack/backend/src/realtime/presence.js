// 🟢 Trạng thái online của mọi người — chỉ giữ trong bộ nhớ (không ghi DB)
//
//   online  : có ít nhất 1 tab đang được dùng
//   idle    : còn mở web nhưng mọi tab đều "treo" (client tự báo sau 5 phút không thao tác — frontend/src/lib/presence.jsx)
//   offline : không còn tab nào
//
// Sự kiện:
//   client → server  'presence:idle' (bool)         tab này đang treo / dùng lại
//   client → server  'presence:get'  (ack)          ảnh chụp { userId: 'online' | 'idle' } (offline không gửi)
//   server → mọi người 'presence' { userId, status } chỉ khi trạng thái 1 người THẬT SỰ đổi
//
// Khởi động lại máy chủ → mất sạch, nhưng các tab tự nối lại và báo lại ngay (handshake.auth.idle).

// Ngắt kết nối → chờ một chút mới báo offline: F5 / chuyển trang / rớt wifi thoáng qua sẽ nối lại ngay,
// không làm chấm của người đó nhấp nháy xám–xanh trên máy cả công ty.
const OFFLINE_GRACE_MS = 8000;

function createPresence(io) {
  const tabs = new Map();      // userId → Map(socketId → idle?)
  const announced = new Map(); // userId → trạng thái đã báo gần nhất (để chỉ báo khi đổi)
  const pending = new Map();   // userId → hẹn giờ báo offline

  const statusOf = (uid) => {
    const t = tabs.get(uid);
    if (!t?.size) return 'offline';
    for (const idle of t.values()) if (!idle) return 'online';
    return 'idle';
  };

  const announce = (uid) => {
    const status = statusOf(uid);
    if ((announced.get(uid) || 'offline') === status) return;
    if (status === 'offline') announced.delete(uid); else announced.set(uid, status);
    io.emit('presence', { userId: uid, status });
  };

  const update = (uid) => {
    clearTimeout(pending.get(uid));
    pending.delete(uid);
    if (statusOf(uid) !== 'offline') return announce(uid);
    pending.set(uid, setTimeout(() => { pending.delete(uid); announce(uid); }, OFFLINE_GRACE_MS));
  };

  const set = (uid, sid, idle) => {
    if (!tabs.has(uid)) tabs.set(uid, new Map());
    tabs.get(uid).set(sid, !!idle);
    update(uid);
  };
  const remove = (uid, sid) => {
    const t = tabs.get(uid);
    if (!t) return;
    t.delete(sid);
    if (!t.size) tabs.delete(uid);
    update(uid);
  };

  // Ảnh chụp theo trạng thái ĐÃ BÁO (khớp với những gì mọi người đang thấy, kể cả lúc đang chờ offline)
  const snapshot = () => Object.fromEntries(announced);

  function attach(socket) {
    const { userId } = socket.data;
    set(userId, socket.id, socket.handshake.auth?.idle);
    socket.on('presence:idle', (idle) => set(userId, socket.id, idle));
    socket.on('presence:get', (cb) => { if (typeof cb === 'function') cb(snapshot()); });
    socket.on('disconnect', () => remove(userId, socket.id));
  }

  return { attach, statusOf, snapshot };
}

module.exports = { createPresence, OFFLINE_GRACE_MS };
