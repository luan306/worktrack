import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api, { downloadFile } from '../../api/client';
import useMaxWidth from '../../lib/useMediaQuery';
import useAuth from '../../store/authStore';
import { onRealtime } from '../../lib/socket';

/* ============================================================
   GHI CHÚ CÔNG VIỆC HẰNG NGÀY
   - Bảng lịch tuần T2–T6 xếp ngang (công ty nghỉ T7, CN), mỗi cột là 1 ngày.
   - Bấm 1 ngày → bên phải trượt ra ghi chú: nhân viên liệt kê từng việc đã làm.
   - Leader của nhóm / Manager / Admin chấm điểm CẢ NGÀY (0–10) ngay trong
     khung bên phải; SỬA điểm bắt buộc ghi lý do, lịch sử sửa điểm hiện rõ.
   - Ngày đã chấm bị khóa: nhân viên không thêm/sửa/xóa việc được nữa.
   ============================================================ */
const C = {
  ink: 'var(--wt-ink)', sub: 'var(--wt-text-2)', faint: 'var(--wt-text-3)', surface: 'var(--wt-surface)', canvas: 'var(--wt-canvas)',
  line: 'var(--wt-line)', lineSoft: 'var(--wt-surface-3)',
  primary: '#3654ff', primaryDeep: '#2440d6', primarySoft: 'var(--wt-tint-primary)',
  success: '#17b26a', successSoft: 'var(--wt-tint-success)', warning: '#f59e0b', warningSoft: 'var(--wt-tint-warning)',
  danger: '#e5384d', dangerSoft: 'var(--wt-tint-danger)', violet: '#8b5cf6', violetSoft: 'var(--wt-tint-violet)',
  note: 'var(--wt-surface-2)', noteLine: 'var(--wt-line)', board: 'var(--wt-surface-2)', teal: '#0d9488', tealSoft: 'var(--wt-tint-teal)',
};
const FONT_SANS = "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/* ---------------- tiện ích ---------------- */
// Tablet: panel chi tiết trượt đè lên bên phải thay vì chen ngang làm bảng bị hẹp
const OverlayPanel = ({ onClose, children, width = 460 }) => (
  <>
    <div onClick={onClose} className="wl-fade" style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(15,23,41,.28)' }} />
    <div className="wl-sheet" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, zIndex: 31, width: `min(${width}px, 92%)`, display: 'flex', flexDirection: 'column', background: C.surface, boxShadow: '-12px 0 32px rgba(15,23,41,.18)' }}>{children}</div>
  </>
);
const DetailDock = ({ isMobile, isNarrow, width = 460, onClose, children }) =>
  isMobile ? <MobileSheet>{children}</MobileSheet>
  : isNarrow ? <OverlayPanel onClose={onClose} width={width}>{children}</OverlayPanel>
  : <div className="wl-sheet" style={{ flex: `0 0 min(${width}px, 42%)`, borderLeft: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', minHeight: 0, background: C.surface, boxShadow: '-6px 0 18px rgba(15,23,41,.06)' }}>{children}</div>;
const MobileSheet = ({ children }) => (
  <div className="wl-sheet" style={{ position: 'fixed', inset: 0, zIndex: 450, display: 'flex', flexDirection: 'column', background: C.surface, paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>{children}</div>
);
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return ymd(d); };
const dmy = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
const scoreColor = (v, max) => (v >= max * .8 ? C.success : v >= max * .5 ? C.warning : C.danger);
const initialsOf = (name) => ((name || '?').trim().split(/\s+/).slice(-1)[0][0] || '?').toUpperCase();
const OFF_KINDS = ['full', 'am', 'pm'];
const idLine = (u) => [u?.username && `MSNV ${u.username}`, u?.group_names].filter(Boolean).join(' · ');
const offLabel = (t, kind) => ({ full: t('wl_off_full', 'Nghỉ cả ngày'), am: t('wl_off_am', 'Nghỉ buổi sáng'), pm: t('wl_off_pm', 'Nghỉ buổi chiều') })[kind];
const offShort = (t, kind) => ({ am: t('wl_off_am_s', 'buổi sáng'), pm: t('wl_off_pm_s', 'buổi chiều') })[kind];

// Tên thứ theo getDay() (0 = CN): short = "T2", full = "Thứ 2"
const weekdayNames = (t) => ({
  short: [t('wl_sun', 'CN'), t('wl_mon', 'T2'), t('wl_tue', 'T3'), t('wl_wed', 'T4'), t('wl_thu', 'T5'), t('wl_fri', 'T6'), t('wl_sat', 'T7')],
  full: [t('wl_sun_full', 'Chủ nhật'), t('wl_mon_full', 'Thứ 2'), t('wl_tue_full', 'Thứ 3'), t('wl_wed_full', 'Thứ 4'), t('wl_thu_full', 'Thứ 5'), t('wl_fri_full', 'Thứ 6'), t('wl_sat_full', 'Thứ 7')],
});
const wdOf = (d) => new Date(`${d}T00:00:00`).getDay();

/* ---------------- nút & ô nhập dùng chung ---------------- */
const Btn = ({ children, onClick, kind = 'ghost', disabled, small, title, style }) => {
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
const inputStyle = {
  width: '100%', padding: '9px 11px', borderRadius: 9, border: `1.5px solid ${C.line}`, outline: 'none',
  fontSize: 13, fontFamily: FONT_SANS, color: C.ink, background: 'var(--wt-surface)', boxSizing: 'border-box',
};
const SectionTitle = ({ icon, children, right }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 800, color: C.sub, textTransform: 'uppercase', letterSpacing: .5, margin: '4px 0 8px' }}>
    <span>{icon}</span><span style={{ flex: 1 }}>{children}</span>{right}
  </div>
);
const ErrBox = ({ children }) => children ? <div style={{ fontSize: 12.5, color: C.danger, background: C.dangerSoft, padding: '8px 11px', borderRadius: 9 }}>⚠ {children}</div> : null;

/* ---------------- 1 dòng công việc trong ghi chú ---------------- */
function TaskItem({ idx, entry, editable, onChanged }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(entry.title);
  const [desc, setDesc] = useState(entry.description || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    if (!title.trim()) return setErr(t('wl_err_title', 'Vui lòng nhập công việc'));
    setBusy(true);
    try { await api.put(`/worklog/entries/${entry.id}`, { work_date: entry.work_date, title, description: desc }); setEditing(false); onChanged(); }
    catch (e) { setErr(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm(t('wl_confirm_delete', 'Xóa công việc này?'))) return;
    try { await api.delete(`/worklog/entries/${entry.id}`); onChanged(); }
    catch (e) { setErr(e.response?.data?.message || e.message); }
  };

  if (editing) {
    return (
      <div style={{ padding: 10, borderRadius: 10, background: 'var(--wt-surface)', border: `1.5px solid ${C.primary}55`, display: 'flex', flexDirection: 'column', gap: 7 }}>
        <input autoFocus value={title} maxLength={200} onChange={e => { setTitle(e.target.value); setErr(''); }} onKeyDown={e => e.key === 'Enter' && save()} style={inputStyle} />
        <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder={t('wl_desc_ph', 'Chi tiết / kết quả (không bắt buộc)')} style={{ ...inputStyle, resize: 'vertical', fontSize: 12.5 }} />
        <ErrBox>{err}</ErrBox>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <Btn small onClick={() => { setEditing(false); setTitle(entry.title); setDesc(entry.description || ''); setErr(''); }} disabled={busy}>{t('cancel', 'Hủy')}</Btn>
          <Btn small kind="primary" onClick={save} disabled={busy}>{busy ? '...' : t('save', 'Lưu')}</Btn>
        </div>
      </div>
    );
  }
  return (
    <div className="wl-task" style={{ display: 'flex', gap: 10, padding: '9px 4px', borderBottom: `1px dashed ${C.noteLine}`, alignItems: 'flex-start' }}>
      <span style={{ width: 22, height: 22, borderRadius: '50%', background: C.primarySoft, color: C.primary, fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: FONT_MONO }}>{idx}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, lineHeight: 1.45, wordBreak: 'break-word' }}>{entry.title}</div>
        {entry.description && <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.5, whiteSpace: 'pre-wrap', marginTop: 2 }}>{entry.description}</div>}
        <ErrBox>{err}</ErrBox>
      </div>
      {editable && (
        <div className="wl-task-actions" style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button onClick={() => setEditing(true)} title={t('edit', 'Sửa')} className="wl-icon-btn">✏️</button>
          <button onClick={remove} title={t('delete', 'Xóa')} className="wl-icon-btn">🗑</button>
        </div>
      )}
    </div>
  );
}

/* ---------------- ô thêm công việc mới ---------------- */
function AddTask({ date, onAdded }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [showDesc, setShowDesc] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const add = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api.post('/worklog/entries', { work_date: date, title, description: desc });
      setTitle(''); setDesc(''); setShowDesc(false); setErr(''); onAdded();
    } catch (e) { setErr(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={title} maxLength={200} onChange={e => { setTitle(e.target.value); setErr(''); }} onKeyDown={e => e.key === 'Enter' && !showDesc && add()}
          placeholder={`＋ ${t('wl_add_ph', 'Thêm công việc đã làm... (Enter để lưu)')}`} className="wl-add-input"
          style={{ ...inputStyle, background: 'var(--wt-surface)', borderStyle: 'dashed' }} />
        <Btn small onClick={() => setShowDesc(v => !v)} title={t('wl_add_detail', 'Thêm chi tiết')} style={{ padding: '0 10px' }}>📝</Btn>
        <Btn small kind="primary" onClick={add} disabled={busy || !title.trim()} style={{ padding: '0 14px' }}>{busy ? '...' : t('wl_add_btn', 'Thêm')}</Btn>
      </div>
      {showDesc && <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder={t('wl_desc_ph', 'Chi tiết / kết quả (không bắt buộc)')} style={{ ...inputStyle, resize: 'vertical', fontSize: 12.5 }} />}
      <ErrBox>{err}</ErrBox>
    </div>
  );
}

/* ---------------- khung chấm / sửa điểm ---------------- */
function ScoreBox({ member, date, score, maxScore, canScore, scorable, onSaved }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const [comment, setComment] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const isEdit = !!score;
  const open = () => { setVal(score ? String(+score.score) : ''); setComment(score?.comment || ''); setReason(''); setErr(''); setEditing(true); };
  const changed = isEdit && val !== '' && +val !== +score.score;

  const save = async () => {
    const n = Number(val);
    if (val === '' || !Number.isFinite(n) || n < 0 || n > maxScore) return setErr(t('wl_err_score', { max: maxScore, defaultValue: `Điểm phải từ 0 đến ${maxScore}` }));
    if (changed && !reason.trim()) return setErr(t('wl_err_reason', 'Cần ghi lý do khi sửa điểm đã chấm'));
    setBusy(true);
    try {
      await api.put('/worklog/scores', { user_id: member.id, work_date: date, score: n, comment, edit_reason: reason || undefined });
      setEditing(false); onSaved();
    } catch (e) { setErr(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };

  // Form chấm / sửa điểm
  if (editing || (!score && canScore && scorable)) {
    return (
      <div style={{ padding: 14, borderRadius: 12, background: C.violetSoft, border: `1px solid ${C.violet}33`, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.violet }}>{isEdit ? `✏️ ${t('wl_edit_score', 'Sửa điểm')}` : `⭐ ${t('wl_score_title', 'Chấm điểm cả ngày')}`} (0–{maxScore})</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 9, background: 'var(--wt-surface)', border: `1px solid ${C.violet}33`, fontSize: 12.5, color: C.sub }}>
          <span style={{ width: 22, height: 22, borderRadius: '50%', background: member.avatar_color || C.violet, color: '#fff', fontSize: 10.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initialsOf(member.full_name)}</span>
          <span style={{ minWidth: 0 }}>{t('wl_scoring_for', 'Chấm cho')} <b style={{ color: C.ink }}>{member.full_name}</b>{member.username ? <span style={{ fontFamily: FONT_MONO }}> ({member.username})</span> : null} · {t('wl_day', 'ngày')} <b style={{ color: C.ink, fontFamily: FONT_MONO }}>{dmy(date)}</b></span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="number" min="0" max={maxScore} step="0.5" value={val} onChange={e => { setVal(e.target.value); setErr(''); }}
            style={{ ...inputStyle, width: 76, fontFamily: FONT_MONO, fontSize: 16, fontWeight: 800, textAlign: 'center', padding: '7px 6px' }} />
          {[5, 6, 7, 8, 9, 10].filter(n => n <= maxScore).map(n => (
            <button key={n} onClick={() => { setVal(String(n)); setErr(''); }} className="wl-btn" style={{
              width: 34, height: 34, borderRadius: 9, cursor: 'pointer', fontFamily: FONT_MONO, fontWeight: 800, fontSize: 13,
              border: `1.5px solid ${+val === n && val !== '' ? C.violet : C.line}`, background: +val === n && val !== '' ? C.violet : 'var(--wt-surface)', color: +val === n && val !== '' ? '#fff' : C.sub,
            }}>{n}</button>
          ))}
        </div>
        <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2} placeholder={t('wl_comment_ph', 'Nhận xét cho nhân viên (không bắt buộc)')} style={{ ...inputStyle, resize: 'vertical', fontSize: 12.5 }} />
        {changed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: C.danger }}>
              {t('wl_field_reason', 'Lý do sửa điểm')} * <span style={{ fontWeight: 600, color: C.sub }}>({+score.score}đ → {val}đ)</span>
            </span>
            <textarea autoFocus value={reason} onChange={e => { setReason(e.target.value); setErr(''); }} rows={2}
              placeholder={t('wl_reason_ph', 'VD: Báo cáo thiếu số liệu ca chiều, đã xác minh lại với tổ trưởng')}
              style={{ ...inputStyle, resize: 'vertical', fontSize: 12.5, borderColor: `${C.danger}66` }} />
          </div>
        )}
        <ErrBox>{err}</ErrBox>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          {isEdit && <Btn small onClick={() => setEditing(false)} disabled={busy}>{t('cancel', 'Hủy')}</Btn>}
          <Btn kind="violet" small onClick={save} disabled={busy} style={{ padding: '6px 14px' }}>{busy ? '...' : isEdit ? t('wl_update_score', 'Cập nhật điểm') : t('wl_save_score', 'Lưu điểm')}</Btn>
        </div>
      </div>
    );
  }
  // Đã chấm → hiện điểm
  if (score) {
    const col = scoreColor(+score.score, maxScore);
    return (
      <div style={{ padding: 14, borderRadius: 12, background: 'var(--wt-surface)', border: `1px solid ${C.line}`, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ width: 64, height: 64, borderRadius: 14, background: `${col}14`, border: `2px solid ${col}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: col, fontFamily: FONT_MONO, lineHeight: 1 }}>{+score.score}</span>
          <span style={{ fontSize: 10, color: C.faint, fontFamily: FONT_MONO }}>/{maxScore}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ fontSize: 12, color: C.sub }}>{t('wl_scored_by', 'Chấm bởi')} <b style={{ color: C.ink }}>{score.scorer_name || '?'}</b></div>
          {score.comment
            ? <div style={{ fontSize: 13, color: C.ink, background: C.canvas, borderRadius: 9, padding: '7px 10px', borderLeft: `3px solid ${col}`, whiteSpace: 'pre-wrap' }}>“{score.comment}”</div>
            : <div style={{ fontSize: 12, color: C.faint }}>{t('wl_no_comment', 'Không có nhận xét')}</div>}
          {canScore && scorable && <div><Btn small onClick={open}>✏️ {t('wl_edit_score', 'Sửa điểm')}</Btn></div>}
        </div>
      </div>
    );
  }
  return <div style={{ padding: 14, borderRadius: 12, background: C.canvas, color: C.faint, fontSize: 12.5, textAlign: 'center' }}>⏳ {t('wl_waiting_score', 'Chưa được Leader chấm điểm')}</div>;
}

/* ---------------- lịch sử chấm / sửa điểm ---------------- */
function ScoreHistory({ items }) {
  const { t } = useTranslation();
  if (!items.length) return null;
  return (
    <div>
      <SectionTitle icon="🕘">{t('wl_history', 'Lịch sử chấm điểm')}</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(h => {
          const edit = h.action_type === 'worklog_score_edited';
          return (
            <div key={h.id} style={{ display: 'flex', gap: 9, fontSize: 12.5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: edit ? C.warning : C.success, marginTop: 5, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.ink }}>
                  <b>{h.actor_name || '?'}</b>{' '}
                  {edit
                    ? <>{t('wl_h_edited', 'sửa điểm')} <b style={{ fontFamily: FONT_MONO }}>{h.old_score != null ? `${+h.old_score}đ` : '—'} → {+h.new_score}đ</b></>
                    : <>{t('wl_h_scored', 'chấm')} <b style={{ fontFamily: FONT_MONO }}>{+h.new_score}đ</b></>}
                  <span style={{ color: C.faint, fontSize: 11, fontFamily: FONT_MONO }}> · {h.at.slice(8, 10)}/{h.at.slice(5, 7)} {h.at.slice(11)}</span>
                </div>
                {edit && h.reason && (
                  <div style={{ marginTop: 4, padding: '6px 9px', borderRadius: 8, background: C.warningSoft, color: 'var(--wt-warn-text)', fontSize: 12, borderLeft: `3px solid ${C.warning}` }}>
                    <b>{t('wl_reason', 'Lý do')}:</b> {h.reason}
                  </div>
                )}
                {h.comment && <div style={{ marginTop: 3, color: C.sub, fontSize: 12 }}>💬 {h.comment}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- ngày nghỉ: báo nghỉ / hủy nghỉ ---------------- */
function DayOffBox({ member, date, off, canMark, locked, entryCount, isSelf, onChanged }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(entryCount ? 'am' : 'full');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const editable = canMark && !locked;

  const save = async () => {
    setBusy(true);
    try { await api.put('/worklog/offs', { user_id: member.id, work_date: date, kind, reason }); setOpen(false); setReason(''); onChanged(); }
    catch (e) { setErr(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm(t('wl_off_confirm_remove', 'Hủy ngày nghỉ này?'))) return;
    setBusy(true);
    try { await api.delete('/worklog/offs', { params: { user_id: member.id, date } }); onChanged(); }
    catch (e) { setErr(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };

  if (off) {
    return (
      <div style={{ padding: 14, borderRadius: 12, background: C.tealSoft, border: `1px solid ${C.teal}33`, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--wt-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🌴</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.teal }}>{offLabel(t, off.kind)}</div>
          {off.reason && <div style={{ fontSize: 12.5, color: C.ink, marginTop: 2 }}>{off.reason}</div>}
          {off.created_by_name && <div style={{ fontSize: 11, color: C.faint, marginTop: 3 }}>{t('wl_off_by', 'Ghi bởi')} {off.created_by_name}</div>}
          {off.kind === 'full' && <div style={{ fontSize: 11.5, color: C.sub, marginTop: 6 }}>{t('wl_off_full_hint', 'Nghỉ cả ngày: không ghi việc, không chấm điểm, không tính vào điểm trung bình.')}</div>}
          <ErrBox>{err}</ErrBox>
        </div>
        {editable && <Btn small onClick={remove} disabled={busy}>{t('wl_off_remove', 'Hủy nghỉ')}</Btn>}
      </div>
    );
  }
  if (!editable) return null;
  if (!open) {
    return (
      <button onClick={() => { setOpen(true); setKind(entryCount ? 'am' : 'full'); setErr(''); }} className="wl-btn" style={{
        alignSelf: 'flex-start', padding: '7px 12px', borderRadius: 10, border: `1.5px dashed ${C.teal}66`, background: 'var(--wt-surface)', color: C.teal,
        fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_SANS,
      }}>🌴 {isSelf ? t('wl_off_report', 'Báo nghỉ ngày này') : t('wl_off_mark', 'Đánh dấu nghỉ cho {{name}}', { name: member.full_name })}</button>
    );
  }
  return (
    <div style={{ padding: 14, borderRadius: 12, background: C.tealSoft, border: `1px solid ${C.teal}33`, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: C.teal }}>🌴 {isSelf ? t('wl_off_report', 'Báo nghỉ ngày này') : t('wl_off_mark', 'Đánh dấu nghỉ cho {{name}}', { name: member.full_name })}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {OFF_KINDS.map(k => {
          const disabled = k === 'full' && entryCount > 0, on = kind === k;
          return (
            <button key={k} disabled={disabled} onClick={() => setKind(k)} title={disabled ? t('wl_off_full_blocked', 'Ngày đã có việc — xóa việc trước nếu nghỉ cả ngày') : ''} className="wl-btn" style={{
              padding: '6px 11px', borderRadius: 9, fontSize: 12, fontWeight: 700, fontFamily: FONT_SANS, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .45 : 1,
              border: `1.5px solid ${on ? C.teal : C.line}`, background: on ? C.teal : 'var(--wt-surface)', color: on ? '#fff' : C.sub,
            }}>{offLabel(t, k)}</button>
          );
        })}
      </div>
      <input value={reason} maxLength={255} onChange={e => setReason(e.target.value)} placeholder={t('wl_off_reason_ph', 'Lý do (VD: nghỉ phép, ốm, việc riêng...)')} style={inputStyle} />
      <ErrBox>{err}</ErrBox>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <Btn small onClick={() => setOpen(false)} disabled={busy}>{t('cancel', 'Hủy')}</Btn>
        <Btn small onClick={save} disabled={busy} style={{ background: C.teal, color: '#fff', border: 'none' }}>{busy ? '...' : t('save', 'Lưu')}</Btn>
      </div>
    </div>
  );
}

/* ---------------- hộp thoại xuất báo cáo Excel ---------------- */
const ExportOpt = ({ on, onClick, children }) => (
  <button onClick={onClick} className="wl-btn" style={{
    flex: 1, padding: '9px 10px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_SANS, textAlign: 'center',
    border: `1.5px solid ${on ? C.primary : C.line}`, background: on ? C.primarySoft : 'var(--wt-surface)', color: on ? C.primary : C.sub,
  }}>{children}</button>
);

function ExportDialog({ onClose, refDate, member, members, viewUserId, defaultWho = 'one' }) {
  const { t } = useTranslation();
  const monday = mondayOf(refDate);
  const [range, setRange] = useState('week');
  const [month, setMonth] = useState(refDate.slice(0, 7));
  const [from, setFrom] = useState(monday);
  const [to, setTo] = useState(addDays(monday, 4));
  const [who, setWho] = useState(defaultWho);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const period = range === 'week' ? [monday, addDays(monday, 4)]
    : range === 'month' ? monthRange(`${month}-01`)
    : [from, to];

  const download = async () => {
    if (!period[0] || !period[1] || period[0] > period[1]) return setErr(t('wl_export_bad_range', 'Khoảng ngày không hợp lệ'));
    setBusy(true); setErr('');
    try {
      await downloadFile('/worklog/export', {
        params: { from: period[0], to: period[1], user_id: who === 'all' ? 'all' : viewUserId },
        fallbackName: `baocao_${period[0]}_${period[1]}.xlsx`,
      });
      onClose();
    } catch (e) {
      let msg = e.message;
      try { msg = JSON.parse(await e.response.data.text()).message || msg; } catch { /* không phải JSON */ }
      setErr(msg);
    } finally { setBusy(false); }
  };

  const label = { fontSize: 11.5, fontWeight: 800, color: C.sub, textTransform: 'uppercase', letterSpacing: .5 };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(15,23,41,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="wl-sheet" style={{ width: 'min(440px, 100%)', background: 'var(--wt-surface)', borderRadius: 18, boxShadow: '0 24px 60px rgba(15,23,41,.25)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: C.successSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>📊</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>{t('wl_export_title', 'Xuất báo cáo Excel')}</div>
            <div style={{ fontSize: 11.5, color: C.faint }}>{t('wl_export_sub', 'Tổng hợp + chi tiết từng ngày (T2–T6)')}</div>
          </div>
          <button className="wl-icon-btn" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={label}>{t('wl_export_period', 'Kỳ báo cáo')}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <ExportOpt on={range === 'week'} onClick={() => setRange('week')}>{t('wl_export_week', 'Theo tuần')}</ExportOpt>
              <ExportOpt on={range === 'month'} onClick={() => setRange('month')}>{t('wl_export_month', 'Theo tháng')}</ExportOpt>
              <ExportOpt on={range === 'custom'} onClick={() => setRange('custom')}>{t('wl_export_custom', 'Tùy chọn')}</ExportOpt>
            </div>
            {range === 'month' && <input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} style={inputStyle} />}
            {range === 'custom' && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} />
                <span style={{ color: C.faint }}>→</span>
                <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} />
              </div>
            )}
            <div style={{ fontSize: 12, color: C.sub, fontFamily: FONT_MONO, background: C.board, borderRadius: 9, padding: '7px 10px' }}>
              📅 {period[0] && dmy(period[0])} – {period[1] && dmy(period[1])}
            </div>
          </div>
          {members.length > 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={label}>{t('wl_export_who', 'Xuất cho')}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <ExportOpt on={who === 'one'} onClick={() => setWho('one')}>👤 {member?.full_name || t('wl_me', 'Của tôi')}</ExportOpt>
                <ExportOpt on={who === 'all'} onClick={() => setWho('all')}>👥 {t('wl_export_all', 'Cả nhóm')} ({members.length})</ExportOpt>
              </div>
            </div>
          )}
          <ErrBox>{err}</ErrBox>
        </div>
        <div style={{ padding: '12px 18px', borderTop: `1px solid ${C.line}`, display: 'flex', justifyContent: 'flex-end', gap: 8, background: C.board }}>
          <Btn onClick={onClose} disabled={busy}>{t('cancel', 'Hủy')}</Btn>
          <Btn kind="primary" onClick={download} disabled={busy}>{busy ? t('wl_exporting', 'Đang xuất...') : `⬇ ${t('wl_export_btn', 'Tải file Excel')}`}</Btn>
        </div>
      </div>
    </div>
  );
}

/* ---------------- khung bên phải: ghi chú của 1 ngày ---------------- */
function NotePanel({ day, member, entries, score, off, data, history, onChanged, onClose, isMobile, isSelf }) {
  const { t } = useTranslation();
  const locked = !!score;
  const fullOff = off?.kind === 'full';
  const editable = data.can_edit && !locked && !fullOff;
  const scorable = day.date <= data.today;
  const bandCol = fullOff ? C.teal : score ? scoreColor(+score.score, data.max_score) : C.warning;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: C.surface }}>
      <div style={{ padding: '16px 18px', borderBottom: `1px solid ${C.line}`, borderTop: `4px solid ${bandCol}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        {isMobile && <Btn small onClick={onClose}>‹</Btn>}
        <span title={member.full_name} style={{ width: 40, height: 40, borderRadius: '50%', background: member.avatar_color || C.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, flexShrink: 0, boxShadow: isSelf ? 'none' : `0 0 0 3px var(--wt-surface), 0 0 0 5px ${C.violet}` }}>
          {initialsOf(member.full_name)}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {!isSelf && <div style={{ fontSize: 13.5, fontWeight: 800, color: C.violet, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{member.full_name}</div>}
          <div style={{ fontSize: isSelf ? 16 : 13, fontWeight: 800, color: isSelf ? C.ink : C.sub, letterSpacing: -.2 }}>{day.full}, <span style={{ fontFamily: FONT_MONO }}>{dmy(day.date)}</span></div>
          <div style={{ fontSize: 12, color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isSelf ? `${member.full_name} · ` : ''}{idLine(member) ? `${idLine(member)} · ` : ''}{entries.length} {t('wl_tasks', 'việc')}</div>
        </div>
        {fullOff
          ? <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 20, background: C.tealSoft, color: C.teal }}>🌴 {t('wl_off_short', 'Nghỉ')}</span>
          : locked
          ? <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 20, background: C.successSoft, color: C.success }}>🔒 {t('wl_locked', 'Đã chấm')}</span>
          : <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 20, background: C.warningSoft, color: C.warning }}>{t('wl_not_scored', 'Chưa chấm')}</span>}
        {!isMobile && <button className="wl-icon-btn" onClick={onClose} title={t('close', 'Đóng')}>✕</button>}
      </div>

      <div className="wl-scroll" style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <DayOffBox key={`${day.date}-${off?.kind}-${off?.reason}`} member={member} date={day.date} off={off} canMark={data.can_mark_off}
          locked={locked} entryCount={entries.length} isSelf={isSelf} onChanged={onChanged} />

        {!fullOff && <>
        <div>
          <SectionTitle icon="📝">{t('wl_done_tasks', 'Công việc đã làm')}</SectionTitle>
          <div style={{ background: C.note, border: `1px solid ${C.noteLine}`, borderRadius: 12, padding: '4px 12px 10px' }}>
            {entries.length
              ? entries.map((e, i) => <TaskItem key={`${e.id}-${e.title}-${e.description}`} idx={i + 1} entry={e} editable={editable} onChanged={onChanged} />)
              : <div style={{ padding: '18px 4px 8px', textAlign: 'center', color: C.faint, fontSize: 12.5 }}>
                  {data.can_edit ? t('wl_empty_self', 'Chưa ghi công việc nào. Hãy ghi lại những việc đã làm hôm nay.') : t('wl_day_empty', 'Chưa ghi công việc nào trong ngày')}
                </div>}
            {editable && <AddTask date={day.date} onAdded={onChanged} />}
            {data.can_edit && locked && <div style={{ fontSize: 11.5, color: C.success, marginTop: 8 }}>🔒 {t('wl_locked_hint', 'Ngày đã được chấm điểm — không chỉnh sửa công việc được nữa')}</div>}
          </div>
        </div>

        <div>
          <SectionTitle icon="⭐">{t('wl_evaluation', 'Đánh giá')}</SectionTitle>
          <ScoreBox key={`${day.date}-${score?.score}-${score?.comment}`} member={member} date={day.date} score={score} maxScore={data.max_score}
            canScore={data.can_score} scorable={scorable} onSaved={onChanged} />
        </div>
        </>}

        <ScoreHistory items={history} />
      </div>
    </div>
  );
}

/* ============================================================
   BẢNG TỔNG HỢP: mỗi dòng 1 nhân viên (Tên · MSNV · Bộ phận),
   mỗi cột 1 ngày (T2–T6) trong khoảng "từ ngày → đến ngày".
   Trắng: chưa tới · Đỏ: chưa ghi việc · Vàng: đã ghi, chờ chấm ·
   Có số: điểm đã chấm · 🌴: nghỉ. Bấm 1 ô → mở ngày đó bên phải.
   ============================================================ */
const mondayOf = (s) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return ymd(d); };
const monthRange = (s, delta = 0) => {
  const d = new Date(`${s}T00:00:00`); d.setDate(1); d.setMonth(d.getMonth() + delta);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return [ymd(d), ymd(last)];
};
const workdaysBetween = (from, to) => {
  const out = [];
  if (!from || !to || from > to) return out;
  for (let d = from; d <= to && out.length < 120; d = addDays(d, 1)) {
    const wd = new Date(`${d}T00:00:00`).getDay();
    if (wd !== 0 && wd !== 6) out.push(d);
  }
  return out;
};
const CELL = {
  future:  { bg: 'var(--wt-surface)', fg: C.faint, bd: C.line },
  missing: { bg: 'var(--wt-tint-danger)', fg: C.danger, bd: 'var(--wt-tint-danger-bd)' },
  pending: { bg: 'var(--wt-tint-warning)', fg: 'var(--wt-warn-text)', bd: 'var(--wt-tint-warning-bd)' },
  off:     { bg: C.tealSoft, fg: C.teal, bd: 'var(--wt-tint-teal-bd)' },
};
const cellState = (c, date, today) => {
  if (c?.off === 'full') return 'off';
  if (c?.score != null) return 'scored';
  if (date > today) return 'future';
  return c?.n ? 'pending' : 'missing';
};

function OverviewBoard({ isMobile, isNarrow, onOpenPerson }) {
  const { t } = useTranslation();
  const todayStr = ymd(new Date());
  const [from, setFrom] = useState(() => mondayOf(todayStr));
  const [to, setTo] = useState(() => addDays(mondayOf(todayStr), 4));
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [tick, setTick] = useState(0);
  const [ov, setOv] = useState(null);         // { key, users, cells, today, max_score } | { key, err }
  const [sel, setSel] = useState(null);       // { userId, date }
  const [detail, setDetail] = useState(null); // { key, data, history } | { key, err }

  const key = `${from}|${to}`;
  useEffect(() => {
    if (!from || !to || from > to) return;
    let alive = true;
    api.get('/worklog/overview', { params: { from, to } })
      .then(r => { if (alive) setOv({ key, ...r.data.data }); })
      .catch(e => { if (alive) setOv({ key, err: e.response?.data?.message || e.message }); });
    return () => { alive = false; };
  }, [from, to, key, tick]);

  const selKey = sel ? `${sel.userId}|${sel.date}` : '';
  useEffect(() => {
    if (!sel) return;
    let alive = true;
    Promise.all([
      api.get('/worklog', { params: { user_id: sel.userId, week: sel.date } }),
      api.get('/worklog/history', { params: { user_id: sel.userId, date: sel.date } }),
    ]).then(([w, h]) => { if (alive) setDetail({ key: selKey, data: w.data.data, history: h.data.data || [] }); })
      .catch(e => { if (alive) setDetail({ key: selKey, err: e.response?.data?.message || e.message }); });
    return () => { alive = false; };
  }, [sel, selKey, tick]);

  const refresh = useCallback(() => setTick(n => n + 1), []);
  // 📡 Chỉ tải lại khi có thay đổi nằm trong khoảng ngày đang xem
  useEffect(() => onRealtime('worklog:updated', (evs) => {
    if (evs.some(e => !e?.workDate || (e.workDate >= from && e.workDate <= to))) refresh();
  }), [refresh, from, to]);

  const loading = ov?.key !== key;
  const today = ov?.today || todayStr;
  const maxScore = ov?.max_score || 10;
  const days = workdaysBetween(from, to);
  const { short: WDS, full: WDF } = weekdayNames(t);

  const allUsers = ov?.users || [];
  const groups = [...new Set(allUsers.flatMap(u => (u.group_names || '').split(', ').filter(Boolean)))].sort();
  const needle = q.trim().toLowerCase();
  const users = allUsers
    .filter(u => !group || (u.group_names || '').split(', ').includes(group))
    .filter(u => !needle || `${u.full_name} ${u.username || ''}`.toLowerCase().includes(needle))
    .sort((a, b) => (a.group_names || '~').localeCompare(b.group_names || '~') || a.full_name.localeCompare(b.full_name));

  const cellOf = (u, d) => ov?.cells?.[u.id]?.[d];
  const rowStats = (u) => {
    let missing = 0, pending = 0;
    days.forEach(d => {
      const st = cellState(cellOf(u, d), d, today);
      if (st === 'missing') missing++;
      if (st === 'pending') pending++;
    });
    return { missing, pending };
  };
  const statsById = new Map(users.map(u => [u.id, rowStats(u)]));
  const totals = [...statsById.values()].reduce((acc, s) => ({ missing: acc.missing + s.missing, pending: acc.pending + s.pending }), { missing: 0, pending: 0 });

  const setRange = ([a, b]) => { setFrom(a); setTo(b); };
  const presets = [
    [t('wl_this_week', 'Tuần này'), [mondayOf(todayStr), addDays(mondayOf(todayStr), 4)]],
    [t('wl_prev_week', 'Tuần trước'), [addDays(mondayOf(todayStr), -7), addDays(mondayOf(todayStr), -3)]],
    [t('wl_this_month', 'Tháng này'), monthRange(todayStr)],
    [t('wl_prev_month', 'Tháng trước'), monthRange(todayStr, -1)],
  ];

  // Panel chi tiết của ô đang chọn
  const d = detail?.key === selKey ? detail : null;
  let panel = null;
  if (sel) {
    const inner = d?.err ? <div style={{ margin: 18 }}><ErrBox>{d.err}</ErrBox></div>
      : !d?.data ? <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>{[0, 1, 2].map(i => <div key={i} className="wl-skel" style={{ height: i ? 90 : 50, borderRadius: 12 }} />)}</div>
      : (
        <NotePanel day={{ date: sel.date, full: WDF[wdOf(sel.date)] }} member={d.data.user}
          entries={d.data.entries.filter(e => e.work_date === sel.date)} score={d.data.scores.find(s => s.work_date === sel.date)}
          off={(d.data.offs || []).find(o => o.work_date === sel.date)} data={d.data} history={d.history}
          onChanged={refresh} onClose={() => setSel(null)} isMobile={isMobile} isSelf={d.data.can_edit} />
      );
    panel = <DetailDock isMobile={isMobile} isNarrow={isNarrow} width={440} onClose={() => setSel(null)}>{inner}</DetailDock>;
  }

  const stickyL = (left, w, extra = {}) => ({ position: 'sticky', left, minWidth: w, maxWidth: w, width: w, zIndex: 2, ...extra });
  const W = isMobile ? { name: 140, msnv: 0, dept: 0 } : { name: 190, msnv: 84, dept: 130 };
  const th = { padding: '8px 6px', fontSize: 11, fontWeight: 800, color: C.sub, background: 'var(--wt-surface-2)', borderBottom: `1px solid ${C.line}`, textAlign: 'left', whiteSpace: 'nowrap' };

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* bộ lọc */}
        <div style={{ padding: isMobile ? '12px 12px 8px' : '14px 18px 10px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <div className="wl-ov-range" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px 4px 10px', borderRadius: 11, border: `1.5px solid ${C.line}`, background: 'var(--wt-surface)' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: C.faint, textTransform: 'uppercase' }}>{t('wl_from', 'Từ')}</span>
            <input type="date" value={from} max={to} onChange={e => e.target.value && setFrom(e.target.value)} className="wl-seg-date" style={{ border: 'none', outline: 'none', background: 'transparent', font: `700 12.5px ${FONT_SANS}`, color: C.ink, width: 128 }} />
            <span style={{ color: C.faint }}>→</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: C.faint, textTransform: 'uppercase' }}>{t('wl_to', 'Đến')}</span>
            <input type="date" value={to} min={from} onChange={e => e.target.value && setTo(e.target.value)} className="wl-seg-date" style={{ border: 'none', outline: 'none', background: 'transparent', font: `700 12.5px ${FONT_SANS}`, color: C.ink, width: 128 }} />
          </div>
          <div className="wl-ov-presets" style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 11, border: `1.5px solid ${C.line}`, background: 'var(--wt-surface)', flexWrap: 'wrap' }}>
            {presets.map(([label, r]) => {
              const on = r[0] === from && r[1] === to;
              return <button key={label} className="wl-seg" onClick={() => setRange(r)} style={on ? { background: C.primarySoft, color: C.primary } : undefined}>{label}</button>;
            })}
          </div>
          <input className="wl-ov-search" value={q} onChange={e => setQ(e.target.value)} placeholder={`🔍 ${t('wl_search_emp', 'Tìm tên / MSNV...')}`} style={{ ...inputStyle, width: 190, padding: '8px 11px', borderRadius: 10 }} />
          {groups.length > 1 && (
            <select value={group} onChange={e => setGroup(e.target.value)} style={{ ...inputStyle, width: 'auto', padding: '8px 10px', borderRadius: 10, fontWeight: 700, fontSize: 12.5 }}>
              <option value="">{t('wl_all_depts', 'Tất cả bộ phận')}</option>
              {groups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
        </div>

        {/* chú thích + tổng */}
        <div style={{ padding: isMobile ? '0 12px 10px' : '0 18px 10px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', fontSize: 11.5, color: C.sub, fontWeight: 600 }}>
          {[
            ['future', t('wl_lg_future', 'Chưa tới')],
            ['missing', t('wl_lg_missing', 'Chưa ghi việc')],
            ['pending', t('wl_lg_pending', 'Chờ chấm (số = số việc)')],
          ].map(([k, label]) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 16, height: 16, borderRadius: 5, background: CELL[k].bg, border: `1.5px solid ${CELL[k].bd}` }} />{label}
            </span>
          ))}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ padding: '0 5px', height: 16, borderRadius: 5, background: `${C.success}1f`, color: C.success, fontSize: 10, fontWeight: 800, fontFamily: FONT_MONO, display: 'inline-flex', alignItems: 'center' }}>8.5</span>{t('wl_lg_scored', 'Điểm đã chấm')}
          </span>
          <span>🌴 {t('wl_off_short', 'Nghỉ')}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <span style={{ padding: '3px 10px', borderRadius: 20, background: CELL.missing.bg, color: C.danger, fontWeight: 800 }}>{totals.missing} {t('wl_lg_missing_s', 'ô chưa ghi')}</span>
            <span style={{ padding: '3px 10px', borderRadius: 20, background: CELL.pending.bg, color: CELL.pending.fg, fontWeight: 800 }}>{totals.pending} {t('wl_lg_pending_s', 'ô chờ chấm')}</span>
          </span>
        </div>

        {/* bảng */}
        <div className="wl-scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto', margin: isMobile ? '0 12px 12px' : '0 18px 18px', borderRadius: 14, border: `1px solid ${C.line}`, background: 'var(--wt-surface)', opacity: loading && ov ? .6 : 1, transition: 'opacity .15s' }}>
          {ov?.err ? <div style={{ margin: 16 }}><ErrBox>{ov.err}</ErrBox></div>
          : !ov ? <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>{[0, 1, 2, 3, 4].map(i => <div key={i} className="wl-skel" style={{ height: 38, borderRadius: 8 }} />)}</div>
          : (
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 12.5, minWidth: '100%' }}>
              <thead>
                <tr>
                  <th style={{ ...th, ...stickyL(0, W.name, { zIndex: 4, top: 0 }), position: 'sticky', paddingLeft: 14 }}>{t('wl_col_name', 'Họ tên')}</th>
                  {!isMobile && <th style={{ ...th, ...stickyL(W.name, W.msnv, { zIndex: 4, top: 0 }), position: 'sticky' }}>MSNV</th>}
                  {!isMobile && <th style={{ ...th, ...stickyL(W.name + W.msnv, W.dept, { zIndex: 4, top: 0, borderRight: `1px solid ${C.line}` }), position: 'sticky' }}>{t('wl_col_dept', 'Bộ phận')}</th>}
                  {days.map(dd => {
                    const isT = dd === today, mon = wdOf(dd) === 1;
                    return (
                      <th key={dd} style={{ ...th, position: 'sticky', top: 0, zIndex: 3, textAlign: 'center', padding: '6px 2px', minWidth: 46, background: isT ? C.primary : th.background, color: isT ? '#fff' : C.sub, borderLeft: mon ? `2px solid ${C.line}` : 'none' }}>
                        <div style={{ fontSize: 10, opacity: .8 }}>{WDS[wdOf(dd)]}</div>
                        <div style={{ fontSize: 12, fontFamily: FONT_MONO }}>{dd.slice(8, 10)}/{dd.slice(5, 7)}</div>
                      </th>
                    );
                  })}
                  <th style={{ ...th, position: 'sticky', top: 0, zIndex: 3, textAlign: 'center', borderLeft: `1px solid ${C.line}`, color: C.danger }} title={t('wl_lg_missing', 'Chưa ghi việc')}>🟥</th>
                  <th style={{ ...th, position: 'sticky', top: 0, zIndex: 3, textAlign: 'center', color: CELL.pending.fg }} title={t('wl_lg_pending', 'Chờ chấm')}>🟨</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, ri) => {
                  const st = statsById.get(u.id), rowBg = ri % 2 ? 'var(--wt-surface-2)' : 'var(--wt-surface)';
                  const td = { padding: '6px', borderBottom: `1px solid ${C.lineSoft}`, background: rowBg };
                  return (
                    <tr key={u.id} className="wl-ov-row">
                      <td style={{ ...td, ...stickyL(0, W.name), paddingLeft: 12 }}>
                        <button onClick={() => onOpenPerson(u.id)} title={t('wl_open_person', 'Mở lịch của người này')} style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'none', padding: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left', maxWidth: '100%' }}>
                          <span style={{ width: 26, height: 26, borderRadius: '50%', background: u.avatar_color || C.primary, color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initialsOf(u.full_name)}</span>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'block', fontWeight: 700, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.full_name}</span>
                            {isMobile && <span style={{ display: 'block', fontSize: 10.5, color: C.faint, fontFamily: FONT_MONO }}>{u.username}</span>}
                          </span>
                        </button>
                      </td>
                      {!isMobile && <td style={{ ...td, ...stickyL(W.name, W.msnv), fontFamily: FONT_MONO, fontSize: 12, color: C.sub }}>{u.username || '—'}</td>}
                      {!isMobile && <td style={{ ...td, ...stickyL(W.name + W.msnv, W.dept), borderRight: `1px solid ${C.line}`, color: C.sub, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={u.group_names || ''}>{u.group_names || '—'}</td>}
                      {days.map(dd => {
                        const c = cellOf(u, dd), s = cellState(c, dd, today), on = sel?.userId === u.id && sel?.date === dd;
                        const look = s === 'scored' ? { bg: `${scoreColor(c.score, maxScore)}1f`, fg: scoreColor(c.score, maxScore), bd: `${scoreColor(c.score, maxScore)}55` } : CELL[s];
                        const half = c?.off && c.off !== 'full';
                        const tip = [WDF[wdOf(dd)] + ' ' + dmy(dd), c?.off ? `${offLabel(t, c.off)}${c.reason ? ` — ${c.reason}` : ''}` : '', c?.n ? `${c.n} ${t('wl_tasks', 'việc')}` : '', c?.score != null ? `★ ${c.score}/${maxScore}` : ''].filter(Boolean).join(' · ');
                        return (
                          <td key={dd} style={{ ...td, padding: 3, textAlign: 'center', borderLeft: wdOf(dd) === 1 ? `2px solid ${C.lineSoft}` : 'none' }}>
                            <button onClick={() => setSel({ userId: u.id, date: dd })} title={tip} className="wl-cell" style={{
                              position: 'relative', width: '100%', minWidth: 40, height: 32, borderRadius: 8, cursor: 'pointer', fontFamily: FONT_MONO, fontWeight: 800,
                              fontSize: s === 'scored' ? 12.5 : 11, background: look.bg, color: look.fg, border: `1.5px solid ${on ? C.primary : look.bd}`,
                              boxShadow: on ? `0 0 0 3px ${C.primary}33` : 'none',
                            }}>
                              {s === 'off' ? '🌴' : s === 'scored' ? +c.score : s === 'pending' ? c.n : ''}
                              {half && <span style={{ position: 'absolute', top: -4, right: -4, fontSize: 9, background: C.teal, color: '#fff', borderRadius: 6, padding: '0 3px', lineHeight: '13px' }}>½</span>}
                            </button>
                          </td>
                        );
                      })}
                      <td style={{ ...td, textAlign: 'center', borderLeft: `1px solid ${C.line}`, fontFamily: FONT_MONO, fontWeight: 800, color: st.missing ? C.danger : C.faint }}>{st.missing || '·'}</td>
                      <td style={{ ...td, textAlign: 'center', fontFamily: FONT_MONO, fontWeight: 800, color: st.pending ? CELL.pending.fg : C.faint }}>{st.pending || '·'}</td>
                    </tr>
                  );
                })}
                {!users.length && <tr><td colSpan={days.length + 5} style={{ padding: 30, textAlign: 'center', color: C.faint }}>{t('wl_no_people', 'Không có nhân viên phù hợp')}</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {panel}
    </div>
  );
}

/* ============================================================
   TRANG
   ============================================================ */
export default function DailyPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const isMobile = useMaxWidth(900);
  const isNarrow = useMaxWidth(1280); // tablet: panel đè lên thay vì chen ngang

  const [members, setMembers] = useState([]);
  const [userId, setUserId] = useState(() => +params.get('user_id') || null);
  const [week, setWeek] = useState(() => params.get('date') || ymd(new Date()));
  const [selected, setSelected] = useState(() => params.get('date') || null);
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [view, setView] = useState(() => (params.get('view') === 'team' ? 'team' : 'me')); // 'me' | 'team' (bảng tổng hợp)

  const viewUserId = userId || user?.id;

  useEffect(() => { api.get('/worklog/members').then(r => setMembers(r.data.data || [])).catch(() => {}); }, []);

  const load = useCallback(async () => {
    if (!viewUserId) return;
    setLoading(true);
    try {
      const r = await api.get('/worklog', { params: { user_id: viewUserId, week } });
      setData(r.data.data); setError('');
    } catch (e) { setError(e.response?.data?.message || e.message); setData(null); }
    finally { setLoading(false); }
  }, [viewUserId, week]);
  useEffect(() => { load(); }, [load]);

  // Ngày đang mở: giữ nếu còn trong tuần, không thì chọn hôm nay (hoặc Thứ 2)
  const weekStart = data?.week_start;
  const today = data?.today || ymd(new Date());
  // Công ty nghỉ Thứ 7 & Chủ nhật → chỉ hiện T2–T6 (getDay 1..5)
  const WDN = weekdayNames(t);
  const days = weekStart ? [1, 2, 3, 4, 5].map((wd, i) => ({ label: WDN.short[wd], full: WDN.full[wd], date: addDays(weekStart, i) })) : [];
  const inWeek = (d) => days.some(x => x.date === d);
  const current = days.find(d => d.date === selected) || days.find(d => d.date === today) || days[0];
  const currentDate = current?.date;

  // Lịch sử chấm/sửa điểm của ngày đang mở — tải lại khi đổi ngày/người hoặc khi histTick tăng
  const [histTick, setHistTick] = useState(0);
  useEffect(() => {
    if (!viewUserId || !currentDate) return;
    let alive = true;
    api.get('/worklog/history', { params: { user_id: viewUserId, date: currentDate } })
      .then(r => { if (alive) setHistory(r.data.data || []); })
      .catch(() => { if (alive) setHistory([]); });
    return () => { alive = false; };
  }, [viewUserId, currentDate, histTick]);

  // Giữ người + ngày đang xem trên URL (F5 / gửi link vẫn mở đúng chỗ)
  useEffect(() => {
    const next = view === 'team' ? { view: 'team' } : { date: currentDate || week };
    if (view !== 'team' && userId && userId !== user?.id) next.user_id = String(userId);
    setParams(next, { replace: true });
  }, [view, userId, week, currentDate, user?.id, setParams]);

  const refresh = useCallback(() => { load(); setHistTick(n => n + 1); }, [load]);
  // 📡 Có người ghi việc / chấm điểm cho ĐÚNG người đang xem → tự tải lại
  useEffect(() => onRealtime('worklog:updated', (evs) => {
    if (evs.some(e => !e?.userId || e.userId === viewUserId)) refresh();
  }), [refresh, viewUserId]);

  const byDay = (date) => (data?.entries || []).filter(e => e.work_date === date);
  const scoreOf = (date) => (data?.scores || []).find(s => s.work_date === date);
  const offOf = (date) => (data?.offs || []).find(o => o.work_date === date);
  const member = data?.user;
  const isSelf = viewUserId === user?.id;
  const viewing = members.find(m => m.id === viewUserId) || member;
  const scored = (data?.scores || []).filter(s => inWeek(s.work_date));
  const workDays = days.filter(d => offOf(d.date)?.kind !== 'full').length; // trừ ngày nghỉ cả ngày
  const [showExport, setShowExport] = useState(false);
  // Đổi người → xóa dữ liệu cũ NGAY để không bao giờ thấy lịch người A dưới tên người B
  const switchUser = (id) => { if (id === viewUserId) return; setData(null); setHistory([]); setPanelOpen(false); setUserId(id); };
  const maxScore = data?.max_score || 10;
  const goWeek = (d) => { setWeek(d); setSelected(inWeek(d) ? d : null); };
  const pick = (d) => { setSelected(d); setPanelOpen(true); };

  // Trạng thái 1 ngày: đã chấm / chờ chấm / chưa ghi / tương lai
  const meta = (d) => {
    const list = byDay(d.date), sc = scoreOf(d.date), off = offOf(d.date), isToday = d.date === today, future = d.date > today;
    const fullOff = off?.kind === 'full';
    const state = cellState({ off: off?.kind, score: sc?.score, n: list.length }, d.date, today);
    const status = {
      scored:  () => ({ col: scoreColor(+sc.score, maxScore) }),
      off:     () => ({ col: C.teal, soft: C.tealSoft, label: `🌴 ${t('wl_off_short', 'Nghỉ')}` }),
      future:  () => ({ col: C.line }),
      pending: () => ({ col: C.warning, soft: C.warningSoft, label: t('wl_not_scored', 'Chưa chấm') }),
      missing: () => isToday ? { col: C.primary, soft: C.primarySoft, label: t('wl_todo_today', 'Chưa ghi') }
                             : { col: C.danger, soft: C.dangerSoft, label: t('wl_missing', 'Chưa ghi') },
    }[state]();
    return { list, sc, off, fullOff, isToday, future, status };
  };
  const statusBadge = (m, big) => m.sc ? (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 1, padding: big ? '4px 11px' : '3px 9px', borderRadius: 20, background: `${m.status.col}17`, border: `1px solid ${m.status.col}40`, color: m.status.col, fontFamily: FONT_MONO, fontWeight: 800, fontSize: big ? 14 : 12.5, whiteSpace: 'nowrap' }}>
      ★ {+m.sc.score}<span style={{ fontSize: big ? 10.5 : 10, opacity: .7 }}>/{maxScore}</span>
    </span>
  ) : m.status.label ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20, background: m.status.soft, color: m.status.col, fontSize: 10.5, fontWeight: 800, whiteSpace: 'nowrap' }}>
      {!m.fullOff && <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.status.col }} />}{m.status.label}
    </span>
  ) : null;

  const weekRange = days.length ? `${dmy(days[0].date).slice(0, 5)} – ${dmy(days[days.length - 1].date)}` : '';
  const weekHeader = days.length > 0 && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: isMobile ? '12px 12px 0' : '16px 18px 0' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: .8 }}>{t('wl_work_week', 'Tuần làm việc')}</div>
        <div style={{ fontSize: 17, fontWeight: 800, color: C.ink, fontFamily: FONT_MONO, letterSpacing: -.3 }}>{weekRange}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 180 }}>
        <div style={{ flex: 1, height: 8, borderRadius: 8, background: 'var(--wt-line)', overflow: 'hidden', display: 'flex', gap: 2 }}>
          {days.map(d => { const m = meta(d); return <span key={d.date} title={m.fullOff ? t('wl_off_short', 'Nghỉ') : ''} style={{ flex: 1, background: m.sc ? m.status.col : m.fullOff ? `repeating-linear-gradient(45deg, ${C.teal}66 0 3px, transparent 3px 6px)` : 'transparent', transition: 'background .3s' }} />; })}
        </div>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.sub, whiteSpace: 'nowrap' }}>{scored.length}/{workDays} {t('wl_days_scored', 'ngày đã chấm')}</span>
      </div>
    </div>
  );

  const skeleton = (n) => Array.from({ length: n }, (_, i) => <div key={i} className="wl-skel" style={{ borderRadius: 16, minHeight: isMobile ? 76 : 260 }} />);

  // Desktop: T2–T6 xếp ngang như bảng lịch tuần
  const weekStrip = (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {weekHeader}
      <div className="wl-scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(5, minmax(150px, 1fr))', gap: 12, padding: '14px 18px 18px', opacity: loading && days.length ? .6 : 1, transition: 'opacity .15s' }}>
        {!days.length && loading ? skeleton(5) : days.map(d => {
          const m = meta(d), on = panelOpen && current?.date === d.date;
          return (
            <div key={d.date} onClick={() => pick(d.date)} className={`wl-day${on ? ' is-on' : ''}`} style={{
              display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, borderRadius: 16, cursor: 'pointer', overflow: 'hidden', background: 'var(--wt-surface)',
              border: `1.5px solid ${on ? C.primary : C.line}`, borderTop: `4px solid ${on ? C.primary : m.status.col}`,
              boxShadow: on ? `0 0 0 4px ${C.primary}1f, 0 12px 28px rgba(15,23,41,.10)` : '0 1px 2px rgba(15,23,41,.04)',
            }}>
              {/* đầu cột */}
              <div style={{ padding: '12px 14px 10px', background: m.isToday ? `linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})` : 'var(--wt-surface)', color: m.isToday ? '#fff' : C.ink }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: .6, textTransform: 'uppercase', opacity: m.isToday ? .85 : 1, color: m.isToday ? '#fff' : C.sub }}>{d.full}</span>
                  {m.isToday && <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 800, background: 'rgba(255,255,255,.22)', borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap' }}>{t('wl_today', 'Hôm nay')}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginTop: 2, opacity: m.future && !m.isToday ? .45 : 1 }}>
                  <span style={{ fontSize: 28, fontWeight: 800, fontFamily: FONT_MONO, lineHeight: 1.05, letterSpacing: -1 }}>{d.date.slice(8, 10)}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, fontFamily: FONT_MONO, opacity: .6 }}>/{d.date.slice(5, 7)}</span>
                  {m.off && !m.fullOff && <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800, color: C.teal, background: m.isToday ? 'var(--wt-surface)' : C.tealSoft, borderRadius: 20, padding: '2px 7px', whiteSpace: 'nowrap' }}>🌴 {offShort(t, m.off.kind)}</span>}
                </div>
              </div>

              {/* danh sách việc */}
              <div className="wl-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 10, background: C.board, display: 'flex', flexDirection: 'column', gap: 6, borderTop: `1px solid ${C.lineSoft}` }}>
                {m.fullOff ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '18px 8px', textAlign: 'center', borderRadius: 12, background: `repeating-linear-gradient(135deg, ${C.tealSoft} 0 10px, var(--wt-tint-teal) 10px 20px)` }}>
                    <span style={{ fontSize: 26 }}>🌴</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: C.teal }}>{offLabel(t, 'full')}</span>
                    {m.off.reason && <span style={{ fontSize: 11.5, color: C.sub, wordBreak: 'break-word' }}>{m.off.reason}</span>}
                  </div>
                ) : m.list.length ? m.list.map((e, i) => (
                  <div key={e.id} title={e.description || e.title} className="wl-chip" style={{ display: 'flex', gap: 7, padding: '7px 9px', borderRadius: 10, background: 'var(--wt-surface)', border: `1px solid ${C.line}`, fontSize: 12.5, lineHeight: 1.4, color: C.ink }}>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 10.5, fontWeight: 800, color: C.primary, paddingTop: 1, flexShrink: 0 }}>{pad(i + 1)}</span>
                    <span style={{ minWidth: 0, wordBreak: 'break-word', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{e.title}</span>
                  </div>
                )) : (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '18px 6px', textAlign: 'center', color: C.faint, fontSize: 12 }}>
                    {m.future ? <span style={{ fontSize: 18, opacity: .5 }}>—</span> : data?.can_edit && !m.sc ? (
                      <span className="wl-add-cta" style={{ padding: '7px 12px', borderRadius: 10, border: `1.5px dashed ${C.primary}66`, color: C.primary, fontWeight: 700, fontSize: 12 }}>＋ {t('wl_add_btn_long', 'Ghi việc')}</span>
                    ) : <span>{t('wl_no_tasks', 'Chưa ghi công việc')}</span>}
                  </div>
                )}
              </div>

              {/* chân cột */}
              <div style={{ padding: '9px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, borderTop: `1px solid ${C.lineSoft}`, minHeight: 42 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.faint }}>{m.list.length ? `${m.list.length} ${t('wl_tasks', 'việc')}` : ''}</span>
                {statusBadge(m)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // Điện thoại: danh sách dọc gọn
  const dayList = (
    <div className="wl-scroll" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {weekHeader}
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, opacity: loading && days.length ? .6 : 1, transition: 'opacity .15s' }}>
        {!days.length && loading ? skeleton(5) : days.map(d => {
          const m = meta(d);
          return (
            <div key={d.date} onClick={() => pick(d.date)} className="wl-day" style={{
              display: 'flex', gap: 12, padding: 12, borderRadius: 16, cursor: 'pointer', alignItems: 'center', background: 'var(--wt-surface)',
              border: `1px solid ${C.line}`, borderLeft: `4px solid ${m.status.col}`, boxShadow: '0 1px 2px rgba(15,23,41,.04)',
            }}>
              <div style={{ width: 50, height: 54, flexShrink: 0, borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                background: m.isToday ? `linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})` : C.board, color: m.isToday ? '#fff' : C.ink }}>
                <span style={{ fontSize: 10, fontWeight: 800, opacity: .75 }}>{d.label}</span>
                <span style={{ fontSize: 20, fontWeight: 800, fontFamily: FONT_MONO, lineHeight: 1.05 }}>{d.date.slice(8, 10)}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {m.fullOff ? (
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.teal, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🌴 {offLabel(t, 'full')}{m.off.reason ? ` · ${m.off.reason}` : ''}</div>
                ) : m.list.length ? (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.list[0].title}</div>
                    <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>
                      {m.list.length > 1 ? `+${m.list.length - 1} ${t('wl_more_tasks', 'việc khác')}` : `1 ${t('wl_tasks', 'việc')}`}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 12.5, color: C.faint }}>{m.future ? '—' : t('wl_no_tasks', 'Chưa ghi công việc')}</div>
                )}
              </div>
              {statusBadge(m)}
              <span style={{ color: C.faint, fontSize: 18, flexShrink: 0 }}>›</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  const panel = data && member && current && (
    <NotePanel day={current} member={member} entries={byDay(current.date)} score={scoreOf(current.date)} off={offOf(current.date)} data={data} isSelf={isSelf}
      history={history} onChanged={refresh} onClose={() => setPanelOpen(false)} isMobile={isMobile} />
  );

  return (
    <div className="wl-root" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, background: C.canvas, fontFamily: FONT_SANS, overflow: 'hidden' }}>
      <style>{`
        .wl-root *, .wl-root *::before, .wl-root *::after { box-sizing: border-box; }
        .wl-btn { transition: transform .1s ease, filter .15s ease; }
        .wl-btn:hover:not(:disabled) { filter: brightness(.96); }
        .wl-btn:active:not(:disabled) { transform: scale(.96); }
        .wl-day { transition: border-color .15s ease, box-shadow .2s ease, transform .15s ease; }
        .wl-day:hover:not(.is-on) { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(15,23,41,.08) !important; }
        .wl-day:hover .wl-add-cta { background: ${C.primarySoft}; }
        .wl-chip { transition: border-color .15s ease; }
        .wl-day:hover .wl-chip { border-color: var(--wt-line); }
        .wl-seg { min-height: 30px; border: none; background: transparent; padding: 6px 10px; font: 700 12px ${FONT_SANS}; color: ${C.sub}; cursor: pointer; border-radius: 8px; white-space: nowrap; }
        .wl-seg:hover { background: ${C.canvas}; color: ${C.ink}; }
        .wl-skel { background: linear-gradient(90deg, var(--wt-line) 25%, var(--wt-surface-2) 50%, var(--wt-line) 75%); background-size: 200% 100%; animation: wlShimmer 1.2s linear infinite; }
        @keyframes wlShimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
        .wl-icon-btn { width: 28px; height: 28px; border-radius: 8px; border: 1px solid ${C.line}; background: var(--wt-surface); cursor: pointer; font-size: 12px; }
        .wl-icon-btn:hover { border-color: ${C.primary}; }
        .wl-task-actions { opacity: 0; transition: opacity .15s; }
        .wl-task:hover .wl-task-actions { opacity: 1; }
        @media (hover: none) { .wl-task-actions { opacity: 1; } }
        .wl-add-input:focus, .wl-root textarea:focus, .wl-root input:focus { border-color: ${C.primary} !important; box-shadow: 0 0 0 3px ${C.primary}1f; }
        .wl-root .wl-seg-date:focus { box-shadow: none; }
        .wl-cell { transition: transform .1s ease, box-shadow .15s ease; }
        .wl-cell:hover { transform: scale(1.08); box-shadow: 0 3px 10px rgba(15,23,41,.15) !important; }
        .wl-ov-row:hover td { background: var(--wt-tint-primary) !important; }
        .wl-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .wl-scroll::-webkit-scrollbar-thumb { background: var(--wt-line-strong); border-radius: 8px; }
        .wl-sheet { animation: wlSlide .2s ease both; }
        @keyframes wlSlide { from { transform: translateX(30px); opacity: 0; } to { transform: none; opacity: 1; } }
        .wl-fade { animation: wlFade .2s ease both; }
        @keyframes wlFade { from { opacity: 0; } to { opacity: 1; } }
        @media (max-width: 900px) {
          .wl-top { padding: 10px 12px !important; gap: 8px !important; }
          .wl-stats { display: none !important; }
          .wl-viewing { padding: 8px 12px !important; }
        }
        /* Điện thoại: tiêu đề đã có ở thanh trên của app → ẩn; mỗi nhóm điều khiển 1 hàng, nút to dễ bấm */
        @media (max-width: 767px) {
          .wl-title { display: none !important; }
          .wl-viewtoggle { flex: 1 1 100%; }
          .wl-viewtoggle .wl-seg { flex: 1; padding: 9px 6px; }
          .wl-person { flex: 1 1 100%; max-width: none !important; width: 100% !important; padding: 10px !important; font-size: 14px !important; }
          .wl-weeknav { flex: 1 1 auto; }
          .wl-weeknav .wl-seg { padding: 8px 10px; }
          .wl-weeknav .wl-seg-date { flex: 1; min-width: 0; width: auto !important; font-size: 13px !important; }
          .wl-export-label, .wl-back-label { display: none; }
          .wl-ov-range { flex: 1 1 100%; }
          .wl-ov-range .wl-seg-date { flex: 1; min-width: 0; width: auto !important; }
          .wl-ov-presets { flex: 1 1 100%; flex-wrap: nowrap !important; overflow-x: auto; }
          .wl-ov-presets .wl-seg { flex: 1 0 auto; }
          .wl-ov-search { flex: 1 1 auto; width: auto !important; }
          .wl-root input, .wl-root select, .wl-root textarea { font-size: 16px !important; } /* iOS không tự phóng to khi gõ */
          .wl-icon-btn { width: 34px !important; height: 34px !important; }
        }
      `}</style>

      {/* ── Thanh trên ── */}
      <div className="wl-top" style={{ padding: '12px 20px', background: C.surface, borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
        <div className="wl-title" style={{ display: 'flex', alignItems: 'center', gap: 11, flex: '1 1 220px', minWidth: 0 }}>
          <span style={{ width: 38, height: 38, borderRadius: 11, background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`, boxShadow: `0 4px 12px ${C.primary}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>📝</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.ink, letterSpacing: -.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('wl_title', 'Ghi chú công việc hằng ngày')}</div>
            <div style={{ fontSize: 12, color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{view === 'team' ? t('wl_sub_team', 'Tổng hợp theo nhân viên · bấm 1 ô để xem / chấm') : member ? `${member.full_name}${idLine(member) ? ` · ${idLine(member)}` : ''}` : ''}</div>
          </div>
        </div>

        {members.length > 1 && (
          <div className="wl-viewtoggle" style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 11, background: C.canvas, border: `1px solid ${C.line}` }}>
            {[['me', `📅 ${t('wl_view_me', 'Lịch cá nhân')}`], ['team', `👥 ${t('wl_view_team', 'Bảng tổng hợp')}`]].map(([k, label]) => (
              <button key={k} className="wl-seg" onClick={() => { setView(k); setPanelOpen(false); }} style={view === k ? { background: 'var(--wt-surface)', color: C.primary, boxShadow: '0 1px 3px rgba(15,23,41,.12)' } : undefined}>{label}</button>
            ))}
          </div>
        )}

        {view === 'me' && data && (
          <div className="wl-stats" style={{ display: 'flex', gap: 8 }}>
            {[
              ['📝', data.entries.filter(e => inWeek(e.work_date)).length, t('wl_stat_tasks_s', 'Việc trong tuần'), C.primary],
              ['✅', `${scored.length}/${workDays}`, t('wl_stat_scored_s', 'Ngày đã chấm'), C.success],
            ].map(([i, v, label, col]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px 6px 7px', borderRadius: 12, background: C.board, border: `1px solid ${C.line}` }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, background: `${col}17`, color: col, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800 }}>{i}</span>
                <div style={{ lineHeight: 1.15 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: C.ink, fontFamily: FONT_MONO }}>{v}</div>
                  <div style={{ fontSize: 10.5, fontWeight: 600, color: C.faint, whiteSpace: 'nowrap' }}>{label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {view === 'me' && members.length > 1 && (
          <select className="wl-person" value={viewUserId || ''} onChange={e => switchUser(+e.target.value)} style={{ ...inputStyle, width: 'auto', maxWidth: 260, padding: '8px 10px', fontSize: 12.5, fontWeight: 700, borderRadius: 10 }}>
            {members.map(m => <option key={m.id} value={m.id}>{m.id === user?.id ? `👤 ${t('wl_me', 'Của tôi')} — ${m.full_name}` : [m.full_name, m.username, m.group_names].filter(Boolean).join(' · ')}</option>)}
          </select>
        )}

        {view === 'me' && <div className="wl-weeknav" style={{ display: 'flex', alignItems: 'center', gap: 2, padding: 3, borderRadius: 11, border: `1.5px solid ${C.line}`, background: 'var(--wt-surface)' }}>
          <button className="wl-seg" onClick={() => goWeek(addDays(weekStart || week, -7))} title={t('wl_prev_week', 'Tuần trước')} style={{ fontSize: 15, padding: '3px 10px' }}>‹</button>
          <button className="wl-seg" onClick={() => goWeek(ymd(new Date()))} style={{ color: C.primary }}>{t('wl_this_week', 'Tuần này')}</button>
          <button className="wl-seg" onClick={() => goWeek(addDays(weekStart || week, 7))} title={t('wl_next_week', 'Tuần sau')} style={{ fontSize: 15, padding: '3px 10px' }}>›</button>
          <span style={{ width: 1, height: 20, background: C.line, margin: '0 3px' }} />
          <input type="date" value={current?.date || week} onChange={e => e.target.value && goWeek(e.target.value)} className="wl-seg-date" style={{ border: 'none', outline: 'none', background: 'transparent', font: `600 12px ${FONT_SANS}`, color: C.sub, padding: '4px 6px', width: 128 }} />
        </div>}

        <Btn kind="primary" onClick={() => setShowExport(true)} title={t('wl_export', 'Xuất báo cáo')} style={{ padding: '9px 14px', borderRadius: 10 }}>⬇<span className="wl-export-label"> {t('wl_export', 'Xuất báo cáo')}</span></Btn>
      </div>

      {/* ── Đang xem lịch của NGƯỜI KHÁC → báo thật rõ để không chấm nhầm ── */}
      {view === 'me' && !isSelf && viewing && (
        <div className="wl-viewing" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', flexShrink: 0, color: '#fff', background: `linear-gradient(90deg, ${C.violet}, #6d4de6)`, boxShadow: `0 4px 14px ${C.violet}40` }}>
          <span style={{ width: 34, height: 34, borderRadius: '50%', background: viewing.avatar_color || 'var(--wt-surface)', color: '#fff', border: '2px solid rgba(255,255,255,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, flexShrink: 0 }}>{initialsOf(viewing.full_name)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, opacity: .85, textTransform: 'uppercase', letterSpacing: .6 }}>
              {data?.can_score ? t('wl_viewing_scoring', 'Đang xem & chấm điểm cho') : t('wl_viewing', 'Đang xem lịch của')}
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {viewing.full_name}{idLine(viewing) ? <span style={{ fontWeight: 600, opacity: .85, fontSize: 12.5 }}> · {idLine(viewing)}</span> : null}
            </div>
          </div>
          <button onClick={() => switchUser(user.id)} className="wl-btn" style={{ padding: '7px 12px', borderRadius: 9, border: '1.5px solid rgba(255,255,255,.6)', background: 'rgba(255,255,255,.14)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_SANS, whiteSpace: 'nowrap' }}>
            ‹<span className="wl-back-label"> {t('wl_back_mine', 'Về lịch của tôi')}</span>
          </button>
        </div>
      )}

      {showExport && <ExportDialog onClose={() => setShowExport(false)} refDate={current?.date || week} member={viewing} members={members} viewUserId={viewUserId} defaultWho={view === 'team' ? 'all' : 'one'} />}

      {view === 'team' ? (
        <OverviewBoard isMobile={isMobile} isNarrow={isNarrow} onOpenPerson={(id) => { setView('me'); switchUser(id); }} />
      ) : error ? (
        <div style={{ margin: 20, padding: 16, borderRadius: 12, background: C.dangerSoft, color: C.danger, fontSize: 13 }}>⚠ {error}</div>
      ) : isMobile ? (
        <>
          {dayList}
          {panelOpen && panel && <DetailDock isMobile>{panel}</DetailDock>}
        </>
      ) : (
        <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>{weekStrip}</div>
          {panelOpen && panel && <DetailDock isNarrow={isNarrow} onClose={() => setPanelOpen(false)}>{panel}</DetailDock>}
        </div>
      )}
    </div>
  );
}
