// 💬 Phòng của từng CV: chỉ những người đang MỞ CV đó (khung chi tiết) mới ở trong phòng `task:<id>`.
// Dùng cho "… đang nhắn" và tin nhắn mới — gửi đúng người cần, không phát cho cả công ty.
//
// Sự kiện:
//   client → server  'task:watch'   (taskId)              mở khung chi tiết CV
//   client → server  'task:unwatch' (taskId)              đóng khung
//   client → server  'task:typing'  { taskId, typing }    đang gõ / thôi gõ (client tự gom ~1 lần / 2,5s)
//   server → phòng   'task:typing'  { taskId, userId, name, typing }
//   server → phòng   'task:comment' { taskId, id, userId } có tin nhắn mới (requests.controller → addComment)
//
// Không ghi DB. Xem CV không cần quyền riêng (GET /requests/:id cũng vậy) nên vào phòng chỉ cần đã đăng nhập.

const MAX_ROOMS_PER_SOCKET = 5;  // 1 tab thường chỉ mở 1 CV — chặn mở phòng vô hạn
const TYPING_MAX_PER_10S = 20;   // client chỉ gửi ~4 lần / 10s; vượt quá → bỏ qua (chống spam)

const roomOf = (id) => {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? `task:${n}` : null;
};
const taskIdOf = (room) => Number(room.slice(5));
const isTaskRoom = (room) => room.startsWith('task:');

function attach(socket) {
  const { userId } = socket.data;
  const say = (room, typing) =>
    socket.to(room).emit('task:typing', { taskId: taskIdOf(room), userId, name: socket.data.name, typing });

  socket.on('task:watch', (id) => {
    const room = roomOf(id);
    if (!room || socket.rooms.has(room)) return;
    const mine = [...socket.rooms].filter(isTaskRoom);
    if (mine.length >= MAX_ROOMS_PER_SOCKET) { say(mine[0], false); socket.leave(mine[0]); }
    socket.join(room);
  });

  socket.on('task:unwatch', (id) => {
    const room = roomOf(id);
    if (room && socket.rooms.has(room)) { say(room, false); socket.leave(room); }
  });

  let windowStart = 0, count = 0;
  socket.on('task:typing', (p) => {
    const room = roomOf(p?.taskId);
    if (!room || !socket.rooms.has(room)) return;
    const now = Date.now();
    if (now - windowStart > 10000) { windowStart = now; count = 0; }
    if (++count > TYPING_MAX_PER_10S && p.typing) return; // "thôi gõ" luôn cho qua
    say(room, !!p.typing);
  });

  // tắt tab / rớt mạng giữa lúc đang gõ → người khác thôi thấy "đang nhắn"
  socket.on('disconnecting', () => {
    for (const r of socket.rooms) if (isTaskRoom(r)) say(r, false);
  });
}

// Có tin nhắn mới trong CV → báo người đang mở CV đó tải tin + tắt "đang nhắn" của người gửi
function emitComment(io, taskId, { id, userId }) {
  const room = roomOf(taskId);
  if (!io || !room) return;
  io.to(room).emit('task:typing', { taskId: taskIdOf(room), userId, typing: false });
  io.to(room).emit('task:comment', { taskId: taskIdOf(room), id, userId });
}

module.exports = { attach, emitComment };
