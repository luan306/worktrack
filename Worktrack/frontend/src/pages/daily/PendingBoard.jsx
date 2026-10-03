/* ============================================================
   HỘP "CHỜ CHẤM": leader thấy ngay AI · NGÀY NÀO đã ghi việc mà chưa được chấm
   (30 ngày gần nhất). Ngày cũ nhất lên đầu; bấm "Chấm" → mở panel chấm điểm,
   chấm xong dòng đó tự biến mất.
   ============================================================ */
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { onRealtime } from '../../lib/socket';
import { C, FONT_SANS, FONT_MONO, dmy, initialsOf, idLine, weekdayNames, wdOf, inputStyle } from './shared';
import { ErrBox } from './ui';
import DayDetail from './DayDetail';

const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 864e5);

export default function PendingBoard({ isMobile, isNarrow, onOpenPerson }) {
  const { t } = useTranslation();
  const WDF = weekdayNames(t).full;
  const [tick, setTick] = useState(0);
  const [res, setRes] = useState(null); // { tick, total, today, items } | { tick, err }
  const [sel, setSel] = useState(null);  // { userId, date }
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    api.get('/worklog/pending')
      .then(r => { if (alive) setRes({ tick, ...r.data.data }); })
      .catch(e => { if (alive) setRes({ tick, err: e.response?.data?.message || e.message }); });
    return () => { alive = false; };
  }, [tick]);
  const refresh = useCallback(() => setTick(n => n + 1), []);
  useEffect(() => onRealtime('worklog:updated', refresh), [refresh]);

  const loading = res?.tick !== tick;
  const today = res?.today;
  const needle = q.trim().toLowerCase();
  const items = (res?.items || []).filter(i => !needle || `${i.user.full_name} ${i.user.username || ''}`.toLowerCase().includes(needle));
  // nhóm theo ngày (đã sắp ngày cũ → mới từ server)
  const groups = [];
  for (const it of items) {
    if (groups.at(-1)?.date !== it.work_date) groups.push({ date: it.work_date, rows: [] });
    groups.at(-1).rows.push(it);
  }
  const people = new Set(items.map(i => i.user.id)).size;
  const oldest = items[0] && today ? daysBetween(items[0].work_date, today) : 0;

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* tóm tắt + tìm */}
        <div style={{ padding: isMobile ? '12px 12px 8px' : '16px 18px 10px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: .8 }}>{t('wl_pending_title', 'Chờ chấm điểm')}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: isMobile ? 18 : 20, fontWeight: 800, color: C.ink }}>
                {t('wl_pending_summary', { days: items.length, people, defaultValue: `${items.length} ngày · ${people} người` })}
              </span>
              {oldest > 2 && <span style={{ fontSize: 11.5, fontWeight: 800, padding: '3px 10px', borderRadius: 20, background: C.dangerSoft, color: C.danger }}>
                ⏰ {t('wl_pending_oldest', { n: oldest, defaultValue: `Lâu nhất ${oldest} ngày` })}
              </span>}
            </div>
          </div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={`🔍 ${t('wl_search_emp', 'Tìm tên / MSNV...')}`}
            style={{ ...inputStyle, width: isMobile ? '100%' : 220, padding: '8px 11px', borderRadius: 10 }} />
        </div>

        <div className="wl-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: isMobile ? '0 12px 16px' : '0 18px 20px', opacity: loading && res ? .6 : 1, transition: 'opacity .15s' }}>
          {res?.err ? <ErrBox>{res.err}</ErrBox>
          : !res ? [0, 1, 2, 3].map(i => <div key={i} className="wl-skel" style={{ height: 64, borderRadius: 14, marginBottom: 10 }} />)
          : !items.length ? (
            <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center', color: C.sub }}>
              <span style={{ fontSize: 44 }}>🎉</span>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>{t('wl_pending_empty', 'Đã chấm hết!')}</div>
              <div style={{ fontSize: 13 }}>{needle ? t('wl_no_people', 'Không có nhân viên phù hợp') : t('wl_pending_empty_hint', 'Không còn ngày nào chờ chấm trong 30 ngày gần nhất.')}</div>
            </div>
          ) : groups.map(g => {
            const ago = today ? daysBetween(g.date, today) : 0;
            return (
              <section key={g.date} style={{ marginBottom: 14 }}>
                {/* đầu nhóm: ngày */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 2px 8px', position: 'sticky', top: 0, zIndex: 1, background: C.canvas }}>
                  <span style={{ fontSize: 13.5, fontWeight: 800, color: C.ink }}>{WDF[wdOf(g.date)]}, <span style={{ fontFamily: FONT_MONO }}>{dmy(g.date)}</span></span>
                  <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap',
                    background: ago > 2 ? C.dangerSoft : ago > 0 ? C.warningSoft : C.primarySoft, color: ago > 2 ? C.danger : ago > 0 ? 'var(--wt-warn-text)' : C.primary }}>
                    {ago === 0 ? t('wl_today', 'Hôm nay') : t('wl_days_ago', { n: ago, defaultValue: `${ago} ngày trước` })}
                  </span>
                  <span style={{ flex: 1, height: 1, background: C.line }} />
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: C.faint }}>{t('wl_n_people', { n: g.rows.length, defaultValue: `${g.rows.length} người` })}</span>
                </div>
                {/* từng người */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {g.rows.map(it => {
                    const on = sel?.userId === it.user.id && sel?.date === it.work_date;
                    return (
                      <div key={`${it.user.id}-${it.work_date}`} onClick={() => setSel({ userId: it.user.id, date: it.work_date })} className="wl-pend-row" style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 14, cursor: 'pointer', background: 'var(--wt-surface)',
                        border: `1.5px solid ${on ? C.primary : C.line}`, borderLeft: `4px solid ${C.warning}`, boxShadow: on ? `0 0 0 3px ${C.primary}22` : '0 1px 2px rgba(15,23,41,.04)',
                      }}>
                        <button onClick={(e) => { e.stopPropagation(); onOpenPerson(it.user.id, it.work_date); }} title={t('wl_open_person', 'Mở lịch của người này')}
                          style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', cursor: 'pointer', flexShrink: 0, background: it.user.avatar_color || C.primary, color: '#fff', fontWeight: 800, fontSize: 14, fontFamily: FONT_SANS }}>
                          {initialsOf(it.user.full_name)}
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                            <span style={{ fontSize: 13.5, fontWeight: 800, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.user.full_name}</span>
                            {!isMobile && <span style={{ fontSize: 11, color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{idLine(it.user)}</span>}
                          </div>
                          <div style={{ display: 'flex', gap: 5, marginTop: 4, minWidth: 0, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                            {it.titles.map((ti, k) => (
                              <span key={k} style={{ fontSize: 11.5, color: C.sub, background: C.board, padding: '2px 8px', borderRadius: 6, maxWidth: isMobile ? '100%' : 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ti}</span>
                            ))}
                            {it.n > it.titles.length && <span style={{ fontSize: 11, color: C.faint, fontWeight: 700, whiteSpace: 'nowrap', alignSelf: 'center' }}>+{it.n - it.titles.length}</span>}
                          </div>
                        </div>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: C.faint, whiteSpace: 'nowrap' }}>{it.n} {t('wl_tasks', 'việc')}</span>
                        <span className="wl-btn" style={{ padding: '7px 12px', borderRadius: 10, fontSize: 12, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap',
                          background: `linear-gradient(135deg, ${C.violet}, #7c3aed)`, boxShadow: `0 3px 10px ${C.violet}44` }}>⭐ {t('wl_score_btn', 'Chấm')}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      <DayDetail sel={sel} refreshKey={tick} onChanged={refresh} onClose={() => setSel(null)} isMobile={isMobile} isNarrow={isNarrow} />
    </div>
  );
}
