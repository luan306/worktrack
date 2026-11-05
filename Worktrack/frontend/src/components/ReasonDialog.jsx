// Khung bắt buộc nhập LÝ DO trước khi lưu thay đổi quan trọng (sửa CV, phân quyền) → ghi vào Nhật ký hoạt động
//   const [dialog, ask] = useReasonDialog();  …  const reason = await ask('Tiêu đề', ['dòng thay đổi', …]); if (!reason) return;
//   nhớ vẽ {dialog} trong component
import { useState, useEffect, useCallback } from 'react';

const C = {
  ink: 'var(--wt-ink)', sub: 'var(--wt-text-2)', faint: 'var(--wt-text-3)', mute: 'var(--wt-text-4)',
  surface: 'var(--wt-surface)', surface2: 'var(--wt-surface-2)', line: 'var(--wt-line)',
  primary: '#3654ff', primaryDeep: '#2440d6', warning: '#f59e0b', danger: '#e5384d',
};
const FL = { fontSize: 10.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4, display: 'block' };
const FI = { width: '100%', padding: '7px 9px', border: `1.5px solid ${C.line}`, borderRadius: 8, fontSize: 12.5, outline: 'none', background: C.surface, color: C.ink, fontFamily: 'inherit', boxSizing: 'border-box' };
const card = { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden', flexShrink: 0 };
const btn = (primary) => ({
  padding: '7px 14px', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
  ...(primary ? { border: 'none', background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`, color: '#fff' } : { border: `1.5px solid ${C.line}`, background: C.surface, color: C.sub }),
});
const REASON_MIN = 5;
const REASON_HINTS = ['Sửa sai dữ liệu nhập nhầm', 'Theo yêu cầu của Manager', 'Lỗi hệ thống ghi sai giờ', 'Nhân viên báo nộp đúng hạn nhưng bị ghi trễ', 'Thay đổi phân công', 'Hỗ trợ Leader trong nhóm'];

export function useReasonDialog() {
  const [st, setSt] = useState(null); // { title, lines, resolve }
  const ask = useCallback((title, lines = []) => new Promise(resolve => setSt({ title, lines, resolve })), []);
  const close = (v) => { st?.resolve(v); setSt(null); };
  return [st && <ReasonDialog title={st.title} lines={st.lines} onCancel={() => close(null)} onOk={(r) => close(r)} />, ask];
}

function ReasonDialog({ title, lines, onCancel, onOk }) {
  const [r, setR] = useState('');
  const len = r.trim().length;
  const okay = len >= REASON_MIN;
  const submit = () => okay && onOk(r.trim());
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onCancel]);
  return (
    <div onMouseDown={e => e.target === e.currentTarget && onCancel()}
      style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(15,23,41,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ ...card, width: 'min(560px, 100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(15,23,41,.3)' }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.line}`, fontWeight: 800, color: C.ink, fontSize: 14 }}>📝 {title}</div>
        <div style={{ padding: '14px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {lines.length > 0 && (
            <div style={{ background: C.surface2, borderRadius: 10, padding: '10px 12px', fontSize: 12, color: C.sub, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
              {lines.map((l, i) => <div key={i} style={{ overflowWrap: 'anywhere' }}>• {l}</div>)}
            </div>
          )}
          <div>
            <label style={FL}>Lý do thay đổi <span style={{ color: C.danger }}>*</span></label>
            <textarea autoFocus value={r} maxLength={500} onChange={e => setR(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } }}
              placeholder="VD: Nhân viên nộp lúc 16:30 nhưng hệ thống ghi lệch giờ — sửa lại theo yêu cầu của anh B"
              style={{ ...FI, minHeight: 90, resize: 'vertical', borderColor: r && !okay ? C.warning : undefined }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: okay ? C.mute : C.warning, marginTop: 4 }}>
              <span>{okay ? 'Lý do sẽ được ghi vào Nhật ký hoạt động' : `Nhập ít nhất ${REASON_MIN} ký tự`}</span><span>{r.length}/500</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {REASON_HINTS.map(h => (
              <button key={h} type="button" onClick={() => setR(x => (x.trim() ? `${x.trim()}. ${h}` : h))}
                style={{ padding: '4px 10px', borderRadius: 20, border: `1px solid ${C.line}`, background: C.surface, color: C.sub, fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' }}>＋ {h}</button>
            ))}
          </div>
        </div>
        <div style={{ padding: '12px 18px', borderTop: `1px solid ${C.line}`, display: 'flex', gap: 8, justifyContent: 'flex-end', background: C.surface2 }}>
          <button style={btn(false)} onClick={onCancel}>Hủy</button>
          <button style={{ ...btn(true), opacity: okay ? 1 : 0.5, cursor: okay ? 'pointer' : 'not-allowed' }} disabled={!okay} onClick={submit}>💾 Xác nhận lưu</button>
        </div>
      </div>
    </div>
  );
}

