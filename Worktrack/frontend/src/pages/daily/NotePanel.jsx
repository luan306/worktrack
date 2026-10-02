// Panel 1 ngày: danh sách việc, thêm/sửa việc, chấm điểm, lịch sử chấm, báo nghỉ / tăng ca
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { C, FONT_SANS, FONT_MONO, dmy, scoreColor, initialsOf, OFF_KINDS, idLine, offLabel, isWeekendDate, inputStyle } from './shared';
import { Btn, SectionTitle, ErrBox } from './ui';

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

/* ---------------- khung bên phải: ghi chú của 1 ngày ---------------- */
export default function NotePanel({ day, member, entries, score, off, data, history, onChanged, onClose, isMobile, isSelf }) {
  const { t } = useTranslation();
  const weekend = isWeekendDate(day.date);
  // Cuối tuần: mặc định nghỉ — chỉ hiện phần ghi việc khi đã có việc hoặc bấm "Ghi tăng ca"
  const [overtimeOpen, setOvertimeOpen] = useState(false);
  const restDay = weekend && !entries.length && !score && !overtimeOpen;
  const locked = !!score;
  const fullOff = off?.kind === 'full';
  const editable = data.can_edit && !locked && !fullOff;
  const scorable = day.date <= data.today;
  const bandCol = fullOff ? C.teal : score ? scoreColor(+score.score, data.max_score) : restDay ? C.line : weekend ? C.violet : C.warning;
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
        {restDay
          ? <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 20, background: 'var(--wt-surface-3)', color: C.sub }}>🛌 {t('wl_weekend', 'Cuối tuần')}</span>
          : fullOff
          ? <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 20, background: C.tealSoft, color: C.teal }}>🌴 {t('wl_off_short', 'Nghỉ')}</span>
          : weekend && !locked
          ? <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 20, background: C.violetSoft, color: C.violet }}>⏰ {t('wl_overtime', 'Tăng ca')}</span>
          : locked
          ? <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 20, background: C.successSoft, color: C.success }}>🔒 {t('wl_locked', 'Đã chấm')}</span>
          : <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 20, background: C.warningSoft, color: C.warning }}>{t('wl_not_scored', 'Chưa chấm')}</span>}
        {!isMobile && <button className="wl-icon-btn" onClick={onClose} title={t('close', 'Đóng')}>✕</button>}
      </div>

      <div className="wl-scroll" style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {!weekend && <DayOffBox key={`${day.date}-${off?.kind}-${off?.reason}`} member={member} date={day.date} off={off} canMark={data.can_mark_off}
          locked={locked} entryCount={entries.length} isSelf={isSelf} onChanged={onChanged} />}

        {restDay && (
          <div style={{ padding: '22px 18px', borderRadius: 14, border: `1.5px dashed ${C.line}`, background: 'var(--wt-surface-2)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
            <span style={{ fontSize: 34 }}>🛌</span>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: C.ink }}>{t('wl_weekend_rest', 'Cuối tuần — mặc định là ngày nghỉ')}</div>
            {data.can_edit ? (<>
              <div style={{ fontSize: 12.5, color: C.sub, maxWidth: 300 }}>{t('wl_weekend_hint', 'Nếu bạn đi làm tăng ca, hãy ghi lại để được ghi nhận và chấm điểm.')}</div>
              <button onClick={() => setOvertimeOpen(true)} className="wl-btn" style={{
                marginTop: 4, padding: '10px 18px', borderRadius: 11, border: 'none', cursor: 'pointer', fontFamily: FONT_SANS, fontSize: 13, fontWeight: 800, color: '#fff',
                background: `linear-gradient(135deg, ${C.violet}, #7c3aed)`, boxShadow: `0 4px 14px ${C.violet}55`,
              }}>⏰ {t('wl_log_overtime', 'Ghi tăng ca')}</button>
            </>) : <div style={{ fontSize: 12.5, color: C.faint }}>{t('wl_no_overtime', 'Không tăng ca')}</div>}
          </div>
        )}

        {weekend && !restDay && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: C.violetSoft, color: C.violet, fontSize: 12.5, fontWeight: 700 }}>
            <span style={{ fontSize: 18 }}>⏰</span>{t('wl_overtime_banner', 'Ngày tăng ca (cuối tuần) — ghi lại các việc đã làm')}
          </div>
        )}

        {!fullOff && !restDay && <>
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
