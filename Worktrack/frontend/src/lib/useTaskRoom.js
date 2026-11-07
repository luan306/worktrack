// 💬 Realtime cho khung chi tiết 1 CV đang mở (máy chủ: backend/src/realtime/taskRooms.js)
//
//   const { typerNames, typingInput, stopTyping } = useTaskRoom(taskId, myId, { onChanged, onDeleted });
//
//   - onChanged(): CV đổi (người khác sửa / nhắn tin mới) → tải lại ngầm. Gom nhiều sự kiện sát nhau thành 1 lần tải.
//   - onDeleted(): CV bị xóa → đóng khung
//   - typerNames : tên những người KHÁC đang gõ trong khung chat
//   - typingInput(text) gọi mỗi lần ô chat đổi · stopTyping() khi gửi tin
import { useEffect, useRef, useState } from 'react';
import { getSocket } from './socket';
import { clearApiCache } from '../api/client';

const TYPING_SEND_EVERY = 2500; // báo "đang gõ" tối đa 1 lần / 2,5s
const TYPING_IDLE = 6000;       // ngừng gõ 6s → báo thôi. KHÔNG tắt khi ô chat mất focus: người dùng hay bấm
                                // sang cửa sổ khác để xem → chữ tắt mất trước khi kịp thấy
const TYPING_EXPIRE = 9000;     // phòng hờ không nhận được "thôi gõ" (rớt mạng) → tự ẩn
const RELOAD_WAIT = 300;        // gom các sự kiện đổi sát nhau (vd lưu nhiều trường) thành 1 lần tải lại

export default function useTaskRoom(taskId, myId, { onChanged, onDeleted } = {}) {
  const [typers, setTypers] = useState({}); // userId → { name, until }
  // luôn gọi bản callback mới nhất mà không phải đăng ký lại socket mỗi lần render
  const cb = useRef({ onChanged, onDeleted });
  useEffect(() => { cb.current = { onChanged, onDeleted }; });
  const sentAt = useRef(0), idleTimer = useRef(null);

  useEffect(() => {
    if (!myId || !taskId) return undefined;
    const s = getSocket();
    let reloadTimer = null;
    const reload = () => {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => { clearApiCache(); cb.current.onChanged?.(); }, RELOAD_WAIT);
    };

    const watch = () => s.emit('task:watch', taskId);
    const onUpdated = (p) => {
      if (p?.taskId !== taskId) return;
      if (p.action === 'deleted') cb.current.onDeleted?.(); else reload();
    };
    // tin của chính mình: sendComment đã tự tải lại
    const onComment = (p) => { if (p?.taskId === taskId && p.userId !== myId) reload(); };
    const onTyping = (p) => {
      if (p?.taskId !== taskId || p.userId === myId) return;
      setTypers((m) => {
        if (!p.typing && !m[p.userId]) return m;
        const n = { ...m };
        if (p.typing) n[p.userId] = { name: p.name, until: Date.now() + TYPING_EXPIRE }; else delete n[p.userId];
        return n;
      });
    };
    const sweep = setInterval(() => setTypers((m) => {
      const now = Date.now(), old = Object.keys(m).filter((k) => m[k].until < now);
      if (!old.length) return m;
      const n = { ...m }; old.forEach((k) => delete n[k]); return n;
    }), 2000);

    watch();
    s.on('connect', watch); // nối lại sau rớt mạng / máy chủ khởi động lại → vào lại phòng
    s.on('requests:updated', onUpdated);
    s.on('task:comment', onComment);
    s.on('task:typing', onTyping);
    return () => {
      s.emit('task:unwatch', taskId);
      s.off('connect', watch);
      s.off('requests:updated', onUpdated);
      s.off('task:comment', onComment);
      s.off('task:typing', onTyping);
      clearInterval(sweep); clearTimeout(reloadTimer); clearTimeout(idleTimer.current);
      sentAt.current = 0;
      setTypers({});
    };
  }, [taskId, myId]);

  const stopTyping = () => {
    clearTimeout(idleTimer.current);
    if (!sentAt.current) return;
    getSocket().emit('task:typing', { taskId, typing: false });
    sentAt.current = 0;
  };
  const typingInput = (text) => {
    if (!text.trim()) return stopTyping();
    if (Date.now() - sentAt.current > TYPING_SEND_EVERY) {
      getSocket().emit('task:typing', { taskId, typing: true });
      sentAt.current = Date.now();
    }
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(stopTyping, TYPING_IDLE);
    return undefined;
  };

  return { typerNames: Object.values(typers).map((x) => x.name), typingInput, stopTyping };
}
