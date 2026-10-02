// Công việc hằng ngày — nút, ô nhập, khung lỗi và các kiểu panel chi tiết dùng chung
import { C, FONT_SANS } from './shared';

// Tablet: panel chi tiết trượt đè lên bên phải thay vì chen ngang làm bảng bị hẹp
export const OverlayPanel = ({ onClose, children, width = 460 }) => (
  <>
    <div onClick={onClose} className="wl-fade" style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(15,23,41,.28)' }} />
    <div className="wl-sheet" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, zIndex: 31, width: `min(${width}px, 92%)`, display: 'flex', flexDirection: 'column', background: C.surface, boxShadow: '-12px 0 32px rgba(15,23,41,.18)' }}>{children}</div>
  </>
);
export const DetailDock = ({ isMobile, isNarrow, width = 460, onClose, children }) =>
  isMobile ? <MobileSheet>{children}</MobileSheet>
  : isNarrow ? <OverlayPanel onClose={onClose} width={width}>{children}</OverlayPanel>
  : <div className="wl-sheet" style={{ flex: `0 0 min(${width}px, 42%)`, borderLeft: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', minHeight: 0, background: C.surface, boxShadow: '-6px 0 18px rgba(15,23,41,.06)' }}>{children}</div>;
export const MobileSheet = ({ children }) => (
  <div className="wl-sheet" style={{ position: 'fixed', inset: 0, zIndex: 450, display: 'flex', flexDirection: 'column', background: C.surface, paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>{children}</div>
);

/* ---------------- nút & ô nhập dùng chung ---------------- */
export const Btn = ({ children, onClick, kind = 'ghost', disabled, small, title, style }) => {
  const k = {
    primary: { background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`, color: '#fff', border: 'none', boxShadow: `0 3px 10px ${C.primary}4d` },
    danger:  { background: C.dangerSoft, color: C.danger, border: `1px solid ${C.danger}33` },
    ghost:   { background: 'var(--wt-surface)', color: C.sub, border: `1.5px solid ${C.line}` },
    violet:  { background: `linear-gradient(135deg, ${C.violet}, #7c3aed)`, color: '#fff', border: 'none', boxShadow: `0 2px 8px ${C.violet}55` },
  }[kind];
  return (
    <button onClick={onClick} disabled={disabled} title={title} className="wl-btn" style={{
      ...k, padding: small ? '4px 9px' : '8px 14px', borderRadius: 9, fontSize: small ? 11 : 12.5, fontWeight: 700,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .55 : 1, fontFamily: FONT_SANS, whiteSpace: 'nowrap', ...style,
    }}>{children}</button>
  );
};
export const SectionTitle = ({ icon, children, right }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 800, color: C.sub, textTransform: 'uppercase', letterSpacing: .5, margin: '4px 0 8px' }}>
    <span>{icon}</span><span style={{ flex: 1 }}>{children}</span>{right}
  </div>
);
export const ErrBox = ({ children }) => children ? <div style={{ fontSize: 12.5, color: C.danger, background: C.dangerSoft, padding: '8px 11px', borderRadius: 9 }}>⚠ {children}</div> : null;
