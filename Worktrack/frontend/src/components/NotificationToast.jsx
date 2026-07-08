// components/NotificationToast.jsx
import { useEffect } from 'react';
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

function toastText(n, t) {
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

// Đặt component này 1 lần duy nhất ở root layout (vd trong MainLayout, cạnh <Outlet/>)
export default function NotificationToast() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast, dismissToast, markRead } = useNotificationStore();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(dismissToast, 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  const handleClick = () => {
    markRead(toast.id);
    dismissToast();
    if (toast.link) navigate(toast.link);
  };

  return (
    <div
      onClick={handleClick}
      style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 300,
        width: 320, maxWidth: 'calc(100vw - 32px)',
        background: '#1e2a3a', color: '#fff', borderRadius: 12,
        padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start',
        boxShadow: '0 10px 32px rgba(0,0,0,.28)', cursor: 'pointer',
        animation: 'ntToastIn .2s ease-out',
      }}
    >
      <style>{`@keyframes ntToastIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }`}</style>
      <span style={{ fontSize: 18, flexShrink: 0 }}>{TYPE_ICON[toast.type] || '🔔'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#7a9bbf', marginBottom: 3 }}>{t('notif_title')}</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.4 }}>{toastText(toast, t)}</div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); dismissToast(); }}
        style={{ background: 'none', border: 'none', color: '#9db8d2', fontSize: 16, cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}
      >×</button>
    </div>
  );
}