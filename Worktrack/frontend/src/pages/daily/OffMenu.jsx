// Nút "🌴 Hôm nay nghỉ (n)" trên thanh công cụ — bấm để sổ danh sách người nghỉ của ngày đang mở.
// Dạng menu để dù vài chục người nghỉ cũng chỉ chiếm 1 nút, không đẩy lịch xuống.
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { C, FONT_SANS, initialsOf, offLabel } from './shared';

const MENU_W = 300;

export default function OffMenu({ people, label }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const box = useRef(null);
  const n = people.length;

  // Đóng khi bấm ra ngoài hoặc nhấn Esc
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const toggle = () => {
    // Menu mở về phía còn chỗ: nút nằm sát mép phải thì canh phải, không thì canh trái
    const left = box.current?.getBoundingClientRect().left ?? 0;
    setAlignRight(left + MENU_W > window.innerWidth - 12);
    setOpen(v => !v);
  };

  return (
    <div ref={box} style={{ position: 'relative', fontFamily: FONT_SANS }}>
      <button onClick={toggle} disabled={!n} title={label} aria-haspopup="true" aria-expanded={open} className="wl-btn" style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, whiteSpace: 'nowrap', fontFamily: FONT_SANS, fontSize: 12.5, fontWeight: 800,
        cursor: n ? 'pointer' : 'default', color: n ? C.teal : C.faint, background: n ? C.tealSoft : 'var(--wt-surface)', border: `1.5px solid ${n ? `${C.teal}55` : C.line}`,
      }}>
        🌴 {label}
        {n ? <span style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 10, background: C.teal, color: '#fff', fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
          : <span style={{ fontWeight: 600 }}>· {t('wl_team_off_none', 'Không ai nghỉ')}</span>}
        {n > 0 && <span style={{ fontSize: 10, transform: open ? 'rotate(180deg)' : 'none' }}>▼</span>}
      </button>

      {open && n > 0 && (
        <div role="menu" className="wl-scroll" style={{
          position: 'absolute', top: 'calc(100% + 6px)', [alignRight ? 'right' : 'left']: 0, zIndex: 60, width: MENU_W, maxWidth: 'calc(100vw - 24px)', maxHeight: 'min(360px, 60vh)', overflowY: 'auto',
          padding: 6, borderRadius: 14, background: 'var(--wt-surface)', border: `1px solid ${C.line}`, boxShadow: '0 16px 40px rgba(15,23,41,.2)',
        }}>
          <div style={{ padding: '6px 8px 8px', fontSize: 11, fontWeight: 800, letterSpacing: .5, textTransform: 'uppercase', color: C.faint }}>{label} ({n})</div>
          {people.map(o => (
            <div key={o.user_id} role="menuitem" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 10 }}>
              <span style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: o.avatar_color || C.teal, color: '#fff', fontSize: 12, fontWeight: 800 }}>{initialsOf(o.full_name)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.full_name}</div>
                {o.reason && <div style={{ fontSize: 11.5, color: C.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.reason}</div>}
              </div>
              <span style={{ fontSize: 11, fontWeight: 800, color: C.teal, whiteSpace: 'nowrap' }}>{offLabel(t, o.kind)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
