// Ngày nghỉ lễ của CÔNG TY: ai cũng xem được
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { C, FONT_SANS, FONT_MONO, addDays, dmy, inputStyle } from './shared';
import { Btn, ErrBox } from './ui';
import { suggestVnHolidays } from './vnHolidays';

// Gộp các ngày liền nhau cùng tên thành 1 đợt: [{ from, to, name, days }]
const toRanges = (rows) => {
  const out = [];
  for (const h of rows) {
    const last = out[out.length - 1];
    if (last && last.name === h.name && addDays(last.to, 1) === h.work_date) { last.to = h.work_date; last.days++; }
    else out.push({ from: h.work_date, to: h.work_date, name: h.name, days: 1 });
  }
  return out;
};

export default function HolidayDialog({ onClose, onChanged, canManage, refDate }) {
  const { t } = useTranslation();
  const [year, setYear] = useState(+refDate.slice(0, 4));
  const [tick, setTick] = useState(0);
  const [res, setRes] = useState(null); // { key, rows } | { key, err }
  const [form, setForm] = useState({ from: refDate, to: refDate, name: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sugg, setSugg] = useState(null); // bảng "thêm nhanh": [{ key, name, from, to, note, on }] | null
  const key = `${year}|${tick}`;

  useEffect(() => {
    let alive = true;
    api.get('/worklog/holidays', { params: { year }, cache: false })
      .then(r => { if (alive) setRes({ key, rows: r.data.data || [] }); })
      .catch(e => { if (alive) setRes({ key, err: e.response?.data?.message || e.message }); });
    return () => { alive = false; };
  }, [year, key]);

  const done = () => { setTick(n => n + 1); onChanged(); };
  const add = async () => {
    if (!form.name.trim()) return setErr(t('hol_err_name', 'Vui lòng nhập tên ngày lễ'));
    if (!form.from || !form.to || form.to < form.from) return setErr(t('hol_err_range', 'Ngày kết thúc phải từ ngày bắt đầu trở đi'));
    setBusy(true);
    try {
      await api.put('/worklog/holidays', form);
      setYear(+form.from.slice(0, 4)); setForm(f => ({ ...f, name: '' })); setErr(''); done();
    } catch (e) { setErr(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };
  const remove = async (r) => {
    if (!window.confirm(`${t('hol_confirm_delete', 'Xóa ngày nghỉ lễ này?')}\n${r.name} · ${dmy(r.from)}${r.to !== r.from ? ` → ${dmy(r.to)}` : ''}`)) return;
    try { await api.delete('/worklog/holidays', { params: { from: r.from, to: r.to } }); done(); }
    catch (e) { setErr(e.response?.data?.message || e.message); }
  };

  const cur = res?.key === key ? res : null;
  const ranges = toRanges(cur?.rows || []);

  // Thêm nhanh: gợi ý sẵn bộ lễ Việt Nam của năm đang xem
  const have = new Set((cur?.rows || []).map(h => h.work_date));
  const covered = (it) => { for (let d = it.from; d <= it.to; d = addDays(d, 1)) if (!have.has(d)) return false; return true; };
  const openSuggest = () => { setErr(''); setSugg(suggestVnHolidays(year).map(it => ({ ...it, on: !covered(it) }))); };
  const editSugg = (k, patch) => setSugg(list => list.map(it => (it.key === k ? { ...it, ...patch } : it)));
  const picked = (sugg || []).filter(it => it.on);
  const addPicked = async () => {
    if (picked.some(it => !it.from || !it.to || it.to < it.from)) return setErr(t('hol_err_range', 'Ngày kết thúc phải từ ngày bắt đầu trở đi'));
    setBusy(true);
    try {
      await api.put('/worklog/holidays', { items: picked.map(({ from, to, name }) => ({ from, to, name })) });
      setSugg(null); setErr(''); done();
    } catch (e) { setErr(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };
  const lbl = { display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: .5, textTransform: 'uppercase', color: C.faint, marginBottom: 4 };
  return (
    <div onMouseDown={e => e.target === e.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(15,23,41,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: FONT_SANS }}>
      <div className="wl-sheet" style={{ width: 'min(480px, 100%)', maxHeight: '90dvh', display: 'flex', flexDirection: 'column', background: 'var(--wt-surface)', borderRadius: 18, boxShadow: '0 24px 60px rgba(15,23,41,.25)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🎉</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: C.ink }}>{t('hol_title', 'Ngày nghỉ lễ của công ty')}</div>
            <div style={{ fontSize: 12, color: C.faint }}>{t('hol_sub', 'Mọi người đều thấy trên lịch · ngày lễ không bị tính là chưa ghi việc')}</div>
          </div>
          <button className="wl-icon-btn" onClick={onClose} title={t('close', 'Đóng')}>✕</button>
        </div>

        <div className="wl-scroll" style={{ padding: 18, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {canManage && (
            <div style={{ padding: 12, borderRadius: 12, background: C.board, border: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={lbl}>{t('hol_name', 'Tên ngày lễ')}</label>
                <input value={form.name} maxLength={120} onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setErr(''); }} onKeyDown={e => e.key === 'Enter' && add()}
                  placeholder={t('hol_name_ph', 'VD: Tết Dương lịch, Giỗ Tổ Hùng Vương...')} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 130px' }}>
                  <label style={lbl}>{t('hol_from', 'Từ ngày')}</label>
                  <input type="date" value={form.from} onChange={e => setForm(f => ({ ...f, from: e.target.value, to: f.to < e.target.value ? e.target.value : f.to }))} style={inputStyle} />
                </div>
                <div style={{ flex: '1 1 130px' }}>
                  <label style={lbl}>{t('hol_to', 'Đến ngày')}</label>
                  <input type="date" value={form.to} min={form.from} onChange={e => setForm(f => ({ ...f, to: e.target.value }))} style={inputStyle} />
                </div>
                <Btn kind="primary" onClick={add} disabled={busy} style={{ padding: '9px 16px', borderRadius: 10 }}>{busy ? '...' : `＋ ${t('hol_add', 'Thêm')}`}</Btn>
              </div>
            </div>
          )}
          {canManage && cur && !sugg && (
            <button onClick={openSuggest} className="wl-btn" style={{ padding: '10px 14px', borderRadius: 11, cursor: 'pointer', fontFamily: FONT_SANS, fontSize: 13, fontWeight: 800, color: C.primary, background: C.primarySoft, border: `1.5px dashed ${C.primary}88` }}>
              ⚡ {t('hol_quick', 'Thêm nhanh các ngày lễ Việt Nam năm')} {year}
            </button>
          )}
          {canManage && sugg && (
            <div style={{ padding: 12, borderRadius: 12, border: `1.5px solid ${C.primary}55`, background: C.primarySoft, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: C.ink }}>⚡ {t('hol_quick_title', 'Gợi ý lễ Việt Nam năm')} {year}</div>
              <div style={{ fontSize: 11.5, color: C.sub, lineHeight: 1.45 }}>{t('hol_quick_hint', 'Bỏ chọn mục không nghỉ, sửa ngày nếu công ty nghỉ bù hoặc hoán đổi. Lễ âm lịch đã được đổi sẵn sang dương lịch.')}</div>
              {sugg.map(it => (
                <div key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '7px 9px', borderRadius: 10, background: 'var(--wt-surface)', border: `1px solid ${C.line}`, opacity: it.on ? 1 : .6 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 7, flex: '1 1 150px', minWidth: 0, cursor: 'pointer' }}>
                    <input type="checkbox" checked={it.on} onChange={e => editSugg(it.key, { on: e.target.checked })} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: C.ink }}>{it.name}</span>
                      <span style={{ display: 'block', fontSize: 11, color: covered(it) ? C.success : C.faint }}>{covered(it) ? `✓ ${t('hol_already', 'Đã có trong danh sách')}` : it.note || ''}</span>
                    </span>
                  </label>
                  <input type="date" value={it.from} disabled={!it.on} onChange={e => editSugg(it.key, { from: e.target.value, to: it.to < e.target.value ? e.target.value : it.to })} style={{ ...inputStyle, width: 'auto', padding: '5px 7px', fontSize: 12 }} />
                  <span style={{ color: C.faint }}>→</span>
                  <input type="date" value={it.to} min={it.from} disabled={!it.on} onChange={e => editSugg(it.key, { to: e.target.value })} style={{ ...inputStyle, width: 'auto', padding: '5px 7px', fontSize: 12 }} />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 2 }}>
                <Btn small onClick={() => setSugg(null)} disabled={busy}>{t('cancel', 'Hủy')}</Btn>
                <Btn small kind="primary" onClick={addPicked} disabled={busy || !picked.length}>{busy ? '...' : `＋ ${t('hol_quick_add', 'Thêm')} ${picked.length} ${t('hol_quick_items', 'mục đã chọn')}`}</Btn>
              </div>
            </div>
          )}
          <ErrBox>{err || cur?.err}</ErrBox>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ flex: 1, fontSize: 11, fontWeight: 800, letterSpacing: .6, textTransform: 'uppercase', color: C.faint }}>{t('hol_list', 'Danh sách năm')}</span>
              <button className="wl-seg" onClick={() => { setYear(y => y - 1); setSugg(null); }} title={t('hol_prev_year', 'Năm trước')} style={{ fontSize: 15, padding: '2px 10px' }}>‹</button>
              <span style={{ fontFamily: FONT_MONO, fontWeight: 800, fontSize: 14, color: C.ink }}>{year}</span>
              <button className="wl-seg" onClick={() => { setYear(y => y + 1); setSugg(null); }} title={t('hol_next_year', 'Năm sau')} style={{ fontSize: 15, padding: '2px 10px' }}>›</button>
            </div>
            {!cur ? <div className="wl-skel" style={{ height: 54, borderRadius: 12 }} />
              : !ranges.length ? <div style={{ padding: '18px 10px', textAlign: 'center', fontSize: 12.5, color: C.faint, border: `1.5px dashed ${C.line}`, borderRadius: 12 }}>{t('hol_empty', 'Chưa có ngày nghỉ lễ nào trong năm này')}</div>
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {ranges.map(r => (
                    <div key={r.from} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 11, background: 'var(--wt-tint-danger)', border: '1px solid var(--wt-tint-danger-bd)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                        <div style={{ fontSize: 12, color: C.sub, fontFamily: FONT_MONO }}>
                          {dmy(r.from)}{r.to !== r.from ? ` → ${dmy(r.to)}` : ''} <span style={{ fontFamily: FONT_SANS, color: C.faint }}>· {r.days} {t('wl_days', 'ngày')}</span>
                        </div>
                      </div>
                      {canManage && <button className="wl-icon-btn" onClick={() => remove(r)} title={t('delete', 'Xóa')}>🗑</button>}
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
