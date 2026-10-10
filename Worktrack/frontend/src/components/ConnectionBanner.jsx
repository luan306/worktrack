// Thanh báo MẤT KẾT NỐI nổi phía trên màn hình
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../api/client';
import { getSocket } from '../lib/socket';

const SERVER_GRACE_MS = 4000; // socket rớt chớp nhoáng (đổi wifi, server khởi động lại nhanh) thì không báo
const BACK_SHOW_MS = 3000;

export default function ConnectionBanner() {
  const { t } = useTranslation();
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  const [serverDown, setServerDown] = useState(false);
  const [back, setBack] = useState(false); // vừa nối lại → hiện lời báo ngắn

  useEffect(() => {
    const s = getSocket();
    let graceTimer = null, backTimer = null, wasDown = !navigator.onLine;
    const showBack = () => {
      if (!wasDown) return;
      wasDown = false;
      setBack(true);
      clearTimeout(backTimer);
      backTimer = setTimeout(() => setBack(false), BACK_SHOW_MS);
    };
    const onOffline = () => { wasDown = true; setBack(false); setOffline(true); };
    const onOnline = () => { setOffline(false); if (s.connected) showBack(); };
    const onDisconnect = () => {
      clearTimeout(graceTimer);
      graceTimer = setTimeout(() => { wasDown = true; setBack(false); setServerDown(true); }, SERVER_GRACE_MS);
    };
    // Máy chủ TỪ CHỐI phiên (token hết hạn sau khi máy ngủ lâu...) không phải là mất kết nối
    let lastRenew = 0;
    const onConnectError = (err) => {
      if (err?.type === 'TransportError' || err?.message === 'timeout') return onDisconnect();
      clearTimeout(graceTimer); // tới được máy chủ rồi → không phải mất kết nối
      if (Date.now() - lastRenew > 30000) { lastRenew = Date.now(); api.get('/auth/me', { cache: false }).catch(() => {}); }
    };
    const onConnect = () => { clearTimeout(graceTimer); setServerDown(false); if (navigator.onLine) showBack(); };

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    s.on('disconnect', onDisconnect);
    s.on('connect_error', onConnectError);
    s.on('connect', onConnect);
    if (!s.connected) onDisconnect(); // mở trang lúc máy chủ đang không tới được
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      s.off('disconnect', onDisconnect);
      s.off('connect_error', onConnectError);
      s.off('connect', onConnect);
      clearTimeout(graceTimer); clearTimeout(backTimer);
    };
  }, []);

  const down = offline || serverDown;
  if (!down && !back) return null;
  const look = down
    ? { bg: '#b42318', icon: offline ? '📡' : '🔌',
        text: offline ? t('conn_offline', 'Mất kết nối mạng — đang chờ có mạng lại…') : t('conn_server', 'Mất kết nối tới máy chủ — đang thử kết nối lại…') }
    : { bg: '#067647', icon: '✅', text: t('conn_back', 'Đã kết nối lại') };
  return (
    <div role="status" aria-live="polite" style={{
      position: 'fixed', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, maxWidth: 'calc(100vw - 24px)',
      display: 'flex', alignItems: 'center', gap: 9, padding: '9px 16px', borderRadius: 999,
      background: look.bg, color: '#fff', fontSize: 13, fontWeight: 700, lineHeight: 1.35,
      boxShadow: '0 8px 24px rgba(15,23,41,.28)', fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    }}>
      <span style={{ fontSize: 15 }}>{look.icon}</span>
      <span>{look.text}</span>
      {down && <span className="wt-conn-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', flexShrink: 0 }} />}
      <style>{`
        @keyframes wtConnPulse { 0%,100% { opacity: 1; } 50% { opacity: .25; } }
        .wt-conn-dot { animation: wtConnPulse 1.2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .wt-conn-dot { animation: none; } }
      `}</style>
    </div>
  );
}
