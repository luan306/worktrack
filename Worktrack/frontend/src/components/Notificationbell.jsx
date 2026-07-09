// components/NotificationBell.jsx
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useNotificationStore from '../store/notificationStore';

const STATUS_TKEY = {
  pending: 'req_status_pending', assigned: 'req_status_pending',
  in_progress: 'req_status_in_progress', scoring: 'req_status_scoring',
  reviewing: 'req_status_reviewing', done: 'req_status_done', cancelled: 'req_status_cancelled',
};

const TYPE_ICON = {
  request_assigned: '📨', request_status_changed: '🔄',
  request_commented: '💬', request_scored: '⭐', request_claimed: '🙋',
};

function NotificationText({ n, t }) {
  const p = n.payload || {};
  const actor = p.actorName || '—';
  const title = p.title || '';
  switch (n.type) {
    case 'request_assigned':       return t('notif_assigned', { actor, title });
    case 'request_status_changed': return t('notif_status_changed', { actor, title, status: t(STATUS_TKEY[p.status] || p.status) });
    case 'request_commented':      return t('notif_commented', { actor, title });
    case 'request_scored':         return t('notif_scored', { actor, title, score: p.score });
    case 'request_claimed':        return t('notif_claimed', { actor, title });
    default:                       return title;
  }
}

const fmtAgo = (iso, locale) => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '·';
  if (m < 60) return `${m}p`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return new Date(iso).toLocaleDateString(locale);
};

export default function NotificationBell() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { items, unreadCount, fetch, fetchUnreadCount, markRead, markAllRead } = useNotificationStore();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null); // { top, left } tính từ bounding rect của nút chuông
  const btnRef = useRef();
  const panelRef = useRef();

  useEffect(() => { fetchUnreadCount(); }, []);

  // Đóng dropdown khi click ra ngoài — phải check cả nút chuông lẫn panel
  // (panel giờ render qua portal, không còn là con DOM của nút nữa)
  useEffect(() => {
    const onClick = (e) => {
      if (btnRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Đóng khi cuộn trang hoặc resize để tránh dropdown "lơ lửng" sai vị trí
  // Lưu ý: sự kiện 'scroll' không bubble, nhưng vẫn được bắt ở capture phase
  // trên mọi ancestor kể cả window. Vì vậy nếu không loại trừ, việc cuộn
  // bên trong chính panel (danh sách thông báo có overflowY: auto) cũng sẽ
  // kích hoạt listener này và đóng dropdown ngay lập tức — đây chính là lỗi
  // "lăn chuột" mà bạn gặp phải.
  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    if (next && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const panelWidth = 320;
      // Căn phải theo nút, nhưng không để tràn ra khỏi mép trái màn hình
      const left = Math.max(8, Math.min(r.left, window.innerWidth - panelWidth - 8));
      setPos({ top: r.bottom + 8, left });
    }
    setOpen(next);
    if (next) fetch();
  };

  const handleClick = (n) => {
    if (!n.is_read) markRead(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <>
      <button ref={btnRef} onClick={toggle}
        style={{ position: 'relative', width: 34, height: 34, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9db8d2', fontSize: 17, flexShrink: 0 }}>
        🔔
        {unreadCount > 0 && (
          <span style={{ position: 'absolute', top: 2, right: 2, minWidth: 15, height: 15, borderRadius: 8, background: '#e74c3c', color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && pos && createPortal(
        <div ref={panelRef} style={{ position: 'fixed', top: pos.top, left: pos.left, width: 320, maxWidth: 'calc(100vw - 16px)', background: '#fff', borderRadius: 12, border: '1.5px solid #e8eaed', boxShadow: '0 10px 32px rgba(0,0,0,.18)', zIndex: 1000, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #e8eaed', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1e2a3a', flex: 1 }}>{t('notif_title')}</div>
            {unreadCount > 0 && (
              <button onClick={markAllRead} style={{ fontSize: 11, color: '#3a7bd5', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                {t('notif_mark_all_read')}
              </button>
            )}
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {!items.length && (
              <div style={{ padding: 28, textAlign: 'center', color: '#bbb', fontSize: 12 }}>{t('notif_empty')}</div>
            )}
            {items.map((n) => (
              <div key={n.id} onClick={() => handleClick(n)}
                style={{ padding: '10px 14px', display: 'flex', gap: 10, cursor: 'pointer', borderBottom: '1px solid #f5f6f8', background: n.is_read ? 'transparent' : '#eef3ff' }}
                onMouseEnter={e => e.currentTarget.style.background = n.is_read ? '#f7f8fb' : '#e5edff'}
                onMouseLeave={e => e.currentTarget.style.background = n.is_read ? 'transparent' : '#eef3ff'}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{TYPE_ICON[n.type] || '🔔'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#333', lineHeight: 1.4 }}><NotificationText n={n} t={t} /></div>
                  <div style={{ fontSize: 10, color: '#aaa', marginTop: 3 }}>{fmtAgo(n.created_at, i18n.language)}</div>
                </div>
                {!n.is_read && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#3a7bd5', flexShrink: 0, marginTop: 4 }} />}
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}