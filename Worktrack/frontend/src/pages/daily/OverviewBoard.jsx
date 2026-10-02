import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { onRealtime } from '../../lib/socket';
import { C, FONT_SANS, FONT_MONO, ymd, addDays, dmy, scoreColor, initialsOf, offLabel, weekdayNames, wdOf, mondayOf, monthRange, daysBetween, isWeekendDate, CELL, cellState, inputStyle } from './shared';
import { DetailDock, ErrBox } from './ui';
import NotePanel from './NotePanel';

/* ============================================================
   BẢNG TỔNG HỢP: mỗi dòng 1 nhân viên (Tên · MSNV · Bộ phận),
   mỗi cột 1 ngày (T2–CN, cuối tuần hẹp & nhạt) trong khoảng "từ ngày → đến ngày".
   Trắng: chưa tới · Đỏ: chưa ghi việc · Vàng: đã ghi, chờ chấm ·
   Có số: điểm đã chấm · 🌴: nghỉ. Bấm 1 ô → mở ngày đó bên phải.
   ============================================================ */
export default function OverviewBoard({ isMobile, isNarrow, onOpenPerson }) {
  const { t } = useTranslation();
  const todayStr = ymd(new Date());
  const [from, setFrom] = useState(() => mondayOf(todayStr));
  const [to, setTo] = useState(() => addDays(mondayOf(todayStr), 6));
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
  const days = daysBetween(from, to);
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
      if (st === 'pending' || st === 'overtime') pending++;
    });
    return { missing, pending };
  };
  const statsById = new Map(users.map(u => [u.id, rowStats(u)]));
  const totals = [...statsById.values()].reduce((acc, s) => ({ missing: acc.missing + s.missing, pending: acc.pending + s.pending }), { missing: 0, pending: 0 });

  const setRange = ([a, b]) => { setFrom(a); setTo(b); };
  const presets = [
    [t('wl_this_week', 'Tuần này'), [mondayOf(todayStr), addDays(mondayOf(todayStr), 6)]],
    [t('wl_prev_week', 'Tuần trước'), [addDays(mondayOf(todayStr), -7), addDays(mondayOf(todayStr), -1)]],
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
        <NotePanel key={`${sel.userId}-${sel.date}`} day={{ date: sel.date, full: WDF[wdOf(sel.date)] }} member={d.data.user}
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
            ['overtime', `⏰ ${t('wl_overtime', 'Tăng ca')}`],
            ['weekend', t('wl_weekend', 'Cuối tuần')],
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
                    const isT = dd === today, mon = wdOf(dd) === 1, we = isWeekendDate(dd);
                    return (
                      <th key={dd} style={{ ...th, position: 'sticky', top: 0, zIndex: 3, textAlign: 'center', padding: '6px 2px', minWidth: we ? 32 : 46, background: isT ? C.primary : th.background, color: isT ? '#fff' : we ? `${C.danger}bb` : C.sub, borderLeft: mon ? `2px solid ${C.line}` : 'none', opacity: we && !isT ? .8 : 1 }}>
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
                              position: 'relative', width: '100%', minWidth: isWeekendDate(dd) ? 26 : 40, height: 32, borderRadius: 8, cursor: 'pointer', fontFamily: FONT_MONO, fontWeight: 800,
                              fontSize: s === 'scored' ? 12.5 : 11, background: look.bg, color: look.fg, border: `1.5px solid ${on ? C.primary : look.bd}`,
                              boxShadow: on ? `0 0 0 3px ${C.primary}33` : 'none',
                            }}>
                              {s === 'off' ? '🌴' : s === 'scored' ? +c.score : s === 'pending' ? c.n : s === 'overtime' ? `⏰${c.n}` : ''}
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
