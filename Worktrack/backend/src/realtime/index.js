// Realtime (Socket.IO) — mọi kết nối socket đi qua đây.
//   - Xác thực bằng access token (handshake.auth.token)
//   - Phòng `user:<id>`  : thông báo riêng cho từng người (notificationService)
//   - presence.js        : 🟢 online / 🟡 treo / ⚪ offline
//   - taskRooms.js       : 💬 "… đang nhắn" + tin nhắn mới trong CV đang mở
// Sự kiện phát cho mọi người (requests:updated, permissions:changed…) vẫn gọi io.emit từ controller qua req.app.get('io').
const { Server } = require('socket.io');
const { verifyAccessToken } = require('../middleware/auth');
const { createPresence } = require('./presence');
const taskRooms = require('./taskRooms');

function setupRealtime(server) {
  const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  io.use(async (socket, next) => {
    try {
      const user = await verifyAccessToken(socket.handshake.auth?.token);
      socket.data.userId = user.id;
      socket.data.name = user.full_name || user.username;
      next();
    } catch (e) {
      next(new Error(e.status ? e.message : 'Server error'));
    }
  });

  const presence = createPresence(io);

  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.userId}`);
    presence.attach(socket);
    taskRooms.attach(socket);
    // Không log từng lần kết nối / ngắt: hàng trăm người × mỗi lần mở tab, rớt mạng → log phình vô hạn
  });

  return io;
}

module.exports = { setupRealtime };
