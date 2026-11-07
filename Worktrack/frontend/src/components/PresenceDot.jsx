// Chấm trạng thái ở góc avatar: 🟢 online · 🟡 treo · ⚪ offline (dữ liệu: lib/presence.js)
//   <PresenceDot userId={u.id} />                         đặt trong khung position:relative có sẵn
//   <WithPresence userId={u.id}>…avatar…</WithPresence>   tự bọc avatar
import i18n from '../i18n';
import { usePresenceOf } from '../lib/presence';

const LOOK = {
  online:  { color: '#17b26a', key: 'presence_online',  def: 'Đang online' },
  idle:    { color: '#f59e0b', key: 'presence_idle',    def: 'Đang treo (không thao tác)' },
  offline: { color: '#98a2b3', key: 'presence_offline', def: 'Offline' },
};

// ring: màu viền quanh chấm (trùng màu nền phía sau để chấm "cắt" vào avatar)
export function PresenceDot({ userId, size = 10, ring = 'var(--wt-surface)', className, style }) {
  const status = usePresenceOf(userId);
  const l = LOOK[status];
  return (
    <span className={className} title={i18n.t(l.key, { defaultValue: l.def })} aria-label={i18n.t(l.key, { defaultValue: l.def })}
      style={{ position: 'absolute', right: -1, bottom: -1, width: size, height: size, borderRadius: '50%',
        background: l.color, boxShadow: `0 0 0 2px ${ring}`, transition: 'background .3s', ...style }} />
  );
}

export function WithPresence({ userId, size, ring, children }) {
  if (!userId) return children;
  return (
    // height cố định: nằm trong hàng flex (khung chat) thì KHÔNG bị kéo cao theo tin nhắn → chấm luôn ở góc avatar
    <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0, height: 'fit-content', lineHeight: 0 }}>
      {children}
      <PresenceDot userId={userId} size={size} ring={ring} />
    </span>
  );
}
