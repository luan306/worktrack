// Thông báo nổi trong app (thay cho alert() của trình duyệt) — gọi từ bất kỳ đâu:
//   import { toast } from '../components/AppToast';
//   toast({ kind: 'info' | 'success' | 'warning' | 'error', title, rows: [[nhãn, giá trị], …], note, action: { label, onClick } })
// Vẽ 1 lần trong Layout: <AppToaster />
import { useEffect, useState } from 'react';

let push = null;
const queue = [];
export function toast(t) {
  const item = { id: Date.now() + Math.random(), kind: 'info', duration: 9000, ...t };
  if (push) push(item); else queue.push(item);
}

const KIND = {
  info:    { icon: '📨', color: '#3654ff', soft: 'var(--wt-tint-primary)' },
  success: { icon: '✅', color: '#17b26a', soft: 'var(--wt-tint-success)' },
  warning: { icon: '⚠️', color: '#f59e0b', soft: 'var(--wt-tint-warning)' },
  error:   { icon: '❌', color: '#e5384d', soft: 'var(--wt-tint-danger)' },
};

function Toast({ t, onClose }) {
  const k = KIND[t.kind] || KIND.info;
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (hover || !t.duration) return undefined;
    const h = setTimeout(onClose, t.duration);
    return () => clearTimeout(h);
  }, [hover, t.duration, onClose]);
  return (
    <div role="status" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ width: 'min(380px, calc(100vw - 24px))', background: 'var(--wt-surface)', borderRadius: 14, overflow: 'hidden',
        border: '1px solid var(--wt-line)', borderLeft: `4px solid ${k.color}`, boxShadow: '0 18px 40px rgba(15,23,41,.22)',
        animation: 'wtToastIn .22s ease-out', pointerEvents: 'auto' }}>
      <div style={{ display: 'flex', gap: 10, padding: '12px 12px 10px 14px', alignItems: 'flex-start' }}>
        <span style={{ width: 32, height: 32, borderRadius: 10, background: k.soft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>{t.icon || k.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--wt-ink)', lineHeight: 1.35 }}>{t.title}</div>
          {t.text && <div style={{ fontSize: 12, color: 'var(--wt-text-2)', marginTop: 3, lineHeight: 1.5 }}>{t.text}</div>}
          {t.rows?.length > 0 && (
            <div style={{ marginTop: 7, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 10, rowGap: 4, fontSize: 12 }}>
              {t.rows.map(([label, value], i) => [
                <span key={i + 'l'} style={{ color: 'var(--wt-text-3)', whiteSpace: 'nowrap' }}>{label}</span>,
                <span key={i + 'v'} style={{ color: 'var(--wt-ink)', fontWeight: 600, overflowWrap: 'anywhere' }}>{value}</span>,
              ])}
            </div>
          )}
          {t.note && <div style={{ fontSize: 11.5, color: 'var(--wt-text-3)', marginTop: 8, lineHeight: 1.5 }}>{t.note}</div>}
          {t.action && (
            <button onClick={() => { t.action.onClick?.(); onClose(); }}
              style={{ marginTop: 9, padding: '5px 11px', borderRadius: 8, border: `1.5px solid ${k.color}55`, background: k.soft, color: k.color, fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              {t.action.label}
            </button>
          )}
        </div>
        <button onClick={onClose} aria-label="Đóng" style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: 'var(--wt-surface-3)', color: 'var(--wt-text-2)', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>×</button>
      </div>
      {t.duration > 0 && !hover && <div style={{ height: 3, background: k.color, opacity: .35, animation: `wtToastBar ${t.duration}ms linear forwards` }} />}
    </div>
  );
}

export function AppToaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    push = (it) => setItems(list => [...list.slice(-3), it]);
    queue.splice(0).forEach(push);
    return () => { push = null; };
  }, []);
  const close = (id) => setItems(list => list.filter(x => x.id !== id));
  if (!items.length) return null;
  return (
    <div style={{ position: 'fixed', top: 14, right: 14, zIndex: 500, display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'none' }}>
      <style>{`@keyframes wtToastIn { from { opacity: 0; transform: translateY(-8px) scale(.98); } to { opacity: 1; transform: none; } }
        @keyframes wtToastBar { from { width: 100%; } to { width: 0; } }`}</style>
      {items.map(t => <Toast key={t.id} t={t} onClose={() => close(t.id)} />)}
    </div>
  );
}
