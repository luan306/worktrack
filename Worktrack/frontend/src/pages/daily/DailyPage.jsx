/* ============================================================
   GHI CHÚ CÔNG VIỆC HẰNG NGÀY — trang chính (lịch tháng)
   - Lịch tháng T2 → CN; T7/CN mặc định nghỉ, có thể ghi tăng ca.
   - Bấm 1 ngày → panel chi tiết (NotePanel): ghi việc, chấm điểm, báo nghỉ.
   - Leader/Manager/Admin xem & chấm người trong nhóm; "Bảng tổng hợp" (OverviewBoard)
     xem cả nhóm theo khoảng ngày; "Xuất báo cáo" (ExportDialog) ra Excel.
   - Ngày đã chấm bị khóa: nhân viên không thêm/sửa/xóa việc được nữa.
   ============================================================ */
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import useMaxWidth from '../../lib/useMediaQuery';
import useAuth from '../../store/authStore';
import { onRealtime } from '../../lib/socket';
import { C, FONT_SANS, FONT_MONO, ymd, addDays, dmy, scoreColor, initialsOf, idLine, offLabel, offShort, weekdayNames, wdOf, monthRange, isWeekendDate, cellState, inputStyle } from './shared';
import { DetailDock, Btn } from './ui';
import NotePanel from './NotePanel';
import ExportDialog from './ExportDialog';
import OverviewBoard from './OverviewBoard';
import PendingBoard from './PendingBoard';
import usePendingScoreCount from '../../lib/usePendingScoreCount';

/* ============================================================
   TRANG
   ============================================================ */
export default function DailyPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const isMobile = useMaxWidth(900);
  const isNarrow = useMaxWidth(1280); // tablet: panel đè lên thay vì chen ngang

  const [members, setMembers] = useState([]);
  const [userId, setUserId] = useState(() => +params.get('user_id') || null);
  const [month, setMonth] = useState(() => (params.get('date') || ymd(new Date())).slice(0, 7)); // 'YYYY-MM'
  const [selected, setSelected] = useState(() => params.get('date') || null);
  const [res, setRes] = useState(null); // kết quả tải gần nhất: { key, data } | { key, error }
  const [tick, setTick] = useState(0);    // tăng → tải lại
  const [history, setHistory] = useState([]);
  const [panelOpen, setPanelOpen] = useState(false);
  // 'me' = lịch cá nhân · 'pending' = hộp chờ chấm · 'team' = bảng tổng hợp
  const [view, setView] = useState(() => (['team', 'pending'].includes(params.get('view')) ? params.get('view') : 'me'));
  // Mở từ thông báo "còn ngày chưa chấm": ?view=team&from=YYYY-MM-DD&to=YYYY-MM-DD
  const [teamRange] = useState(() => {
    const f = params.get('from'), t2 = params.get('to'), ok = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
    return ok(f) && ok(t2) && f <= t2 ? [f, t2] : null;
  });

  const viewUserId = userId || user?.id;
  // Chấm được người khác (leader/manager/admin có thành viên) → có tab "Chờ chấm" + "Bảng tổng hợp"
  const canScoreOthers = user?.role !== 'user' && members.length > 1;
  const pendingCount = usePendingScoreCount(canScoreOthers);

  useEffect(() => { api.get('/worklog/members').then(r => setMembers(r.data.data || [])).catch(() => {}); }, []);

  // Tải lịch tháng của người đang xem. "Đang tải" = kết quả hiện có thuộc khóa khác.
  const loadKey = `${viewUserId}|${month}`;
  useEffect(() => {
    if (!viewUserId) return;
    let alive = true;
    api.get('/worklog', { params: { user_id: viewUserId, month } })
      .then(r => { if (alive) setRes({ key: loadKey, data: r.data.data }); })
      .catch(e => { if (alive) setRes({ key: loadKey, error: e.response?.data?.message || e.message }); });
    return () => { alive = false; };
  }, [viewUserId, month, loadKey, tick]);
  const loading = res?.key !== loadKey;
  // Đổi tháng: giữ lịch cũ (mờ) trong lúc tải. Đổi NGƯỜI: ẩn ngay — không bao giờ hiện lịch người A dưới tên người B
  const sameUser = res?.key?.split('|')[0] === String(viewUserId);
  const data = sameUser ? res.data ?? null : null;
  const error = res?.key === loadKey ? res.error || '' : '';

  // ── Lịch THÁNG: lưới T2 → CN, mỗi hàng 1 tuần. T7/CN mặc định nghỉ, có thể ghi tăng ca ──
  const today = data?.today || ymd(new Date());
  const WDN = weekdayNames(t);
  const allDays = [];
  if (data?.week_start) {
    for (let d = data.week_start; d <= data.week_end; d = addDays(d, 1)) {
      const wd = wdOf(d);
      allDays.push({ label: WDN.short[wd], full: WDN.full[wd], date: d, inMonth: d.slice(0, 7) === month, weekend: wd === 0 || wd === 6 });
    }
  }
  // Bỏ hàng (tuần) không có ngày nào của tháng
  const days = [];
  for (let i = 0; i < allDays.length; i += 7) {
    const row = allDays.slice(i, i + 7);
    if (row.some(d => d.inMonth)) days.push(...row);
  }
  const monthDays = days.filter(d => d.inMonth);
  // Ngày đang mở: ngày đã chọn → hôm nay (nếu thuộc tháng) → ngày làm việc đầu tháng
  const current = days.find(d => d.date === selected) || monthDays.find(d => d.date === today) || monthDays.find(d => !d.weekend) || monthDays[0];
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
    const next = view !== 'me' ? { view } : { date: currentDate || `${month}-01` };
    if (view === 'me' && userId && userId !== user?.id) next.user_id = String(userId);
    setParams(next, { replace: true });
  }, [view, userId, month, currentDate, user?.id, setParams]);

  const refresh = useCallback(() => { setTick(n => n + 1); setHistTick(n => n + 1); }, []);
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
  const maxScore = data?.max_score || 10;
  const [showExport, setShowExport] = useState(false);
  // Đổi người → xóa dữ liệu cũ NGAY để không bao giờ thấy lịch người A dưới tên người B
  const switchUser = (id) => { if (id === viewUserId) return; setHistory([]); setPanelOpen(false); setUserId(id); };
  const goMonth = (m) => { if (m === month) return; setMonth(m); setSelected(null); setPanelOpen(false); };
  const shiftMonth = (delta) => goMonth(monthRange(`${month}-01`, delta)[0].slice(0, 7));
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
      weekend: () => ({ col: 'transparent' }),
      overtime:() => ({ col: C.violet, soft: C.violetSoft, label: `⏰ ${t('wl_overtime', 'Tăng ca')}` }),
      pending: () => ({ col: C.warning, soft: C.warningSoft, label: t('wl_not_scored', 'Chưa chấm') }),
      missing: () => isToday ? { col: C.primary, soft: C.primarySoft, label: t('wl_todo_today', 'Chưa ghi') }
                             : { col: C.danger, soft: C.dangerSoft, label: t('wl_missing', 'Chưa ghi') },
    }[state]();
    return { list, sc, off, fullOff, isToday, future, state, status, weekend: isWeekendDate(d.date) };
  };
  const statusBadge = (m) => m.sc ? (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 1, padding: '2px 8px', borderRadius: 20, background: `${m.status.col}17`, border: `1px solid ${m.status.col}40`, color: m.status.col, fontFamily: FONT_MONO, fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap' }}>
      ★ {+m.sc.score}<span style={{ fontSize: 9.5, opacity: .7 }}>/{maxScore}</span>
    </span>
  ) : m.status.label ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, background: m.status.soft, color: m.status.col, fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap' }}>
      {!m.fullOff && m.state !== 'overtime' && <span style={{ width: 5, height: 5, borderRadius: '50%', background: m.status.col }} />}{m.status.label}
    </span>
  ) : null;

  // Tổng hợp tháng (chỉ các ngày thuộc tháng)
  const monthAll = monthDays.map(d => [d, meta(d)]);
  const monthMeta = monthAll.filter(([d]) => !d.weekend); // ngày làm việc T2–T6
  const count = (st) => monthMeta.filter(([, m]) => m.state === st).length;
  const scoredN = count('scored'), workDays = monthMeta.filter(([, m]) => !m.fullOff).length;
  const overtimeN = monthAll.filter(([d, m]) => d.weekend && m.list.length).length;
  const monthTasks = monthAll.reduce((s, [, m]) => s + m.list.length, 0);
  const [yy, mm] = month.split('-');
  // Tên tháng theo ngôn ngữ đang dùng: "October 2026" / "Tháng 10 năm 2026" / "2026年10月"
  const lang = i18n.language === 'jp' ? 'ja' : i18n.language || 'vi';
  const monthTitle = (() => {
    const s = new Date(+yy, +mm - 1, 1).toLocaleDateString(lang, { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  })();

  const monthHeader = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: isMobile ? '12px 12px 4px' : '16px 18px 6px' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: .8 }}>{t('wl_work_month', 'Lịch làm việc')}</div>
        <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 800, color: C.ink, letterSpacing: -.3 }}>{monthTitle}</div>
      </div>
      <div style={{ flex: '1 1 220px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div style={{ flex: 1, height: 8, borderRadius: 8, background: 'var(--wt-line)', overflow: 'hidden', display: 'flex', gap: 2 }}>
          {monthMeta.map(([d, m]) => <span key={d.date} style={{ flex: 1, background: m.sc ? m.status.col : m.fullOff ? `repeating-linear-gradient(45deg, ${C.teal}66 0 3px, transparent 3px 6px)` : 'transparent' }} />)}
        </div>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.sub, whiteSpace: 'nowrap' }}>{scoredN}/{workDays} {t('wl_days_scored', 'ngày đã chấm')}</span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[
          ['pending', t('wl_not_scored', 'Chưa chấm'), C.warning, C.warningSoft],
          ['missing', t('wl_missing', 'Chưa ghi'), C.danger, C.dangerSoft],
          ['off', `🌴 ${t('wl_off_short', 'Nghỉ')}`, C.teal, C.tealSoft],
          ['overtime', `⏰ ${t('wl_overtime_days', 'ngày tăng ca')}`, C.violet, C.violetSoft],
        ].map(([st, label, col, soft]) => {
          const n = st === 'missing' ? monthMeta.filter(([d, m]) => m.state === 'missing' && d.date < today).length
            : st === 'overtime' ? overtimeN : count(st);
          return n ? <span key={st} style={{ padding: '3px 10px', borderRadius: 20, background: soft, color: col, fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap' }}>{n} {label}</span> : null;
        })}
      </div>
    </div>
  );

  const weeksN = Math.max(1, Math.ceil(days.length / 7));
  // Lưới lịch tháng: desktop = ô có tên việc; điện thoại = ô gọn (ngày + chấm màu + điểm)
  const monthGrid = (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {monthHeader}
      <div className="wl-scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: isMobile ? '6px 10px 14px' : '8px 18px 18px', opacity: loading && days.length ? .6 : 1, transition: 'opacity .15s' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(7, minmax(0, 1fr))' : 'repeat(5, minmax(0, 1fr)) repeat(2, minmax(0, .62fr))', gap: isMobile ? 4 : 8, minWidth: isMobile ? 0 : 660, height: isMobile ? 'auto' : '100%',
          gridTemplateRows: isMobile ? 'auto' : `auto repeat(${weeksN}, minmax(108px, 1fr))` }}>
          {[1, 2, 3, 4, 5, 6, 0].map(wd => (
            <div key={wd} style={{ textAlign: 'center', fontSize: isMobile ? 10.5 : 11, fontWeight: 800, color: wd === 0 || wd === 6 ? `${C.danger}bb` : C.faint, textTransform: 'uppercase', letterSpacing: .6, padding: '2px 0 4px' }}>
              {isMobile ? WDN.short[wd] : WDN.full[wd]}
            </div>
          ))}
          {!days.length && loading ? Array.from({ length: 28 }, (_, i) => <div key={i} className="wl-skel" style={{ borderRadius: 12, minHeight: isMobile ? 62 : 108 }} />)
          : days.map(d => {
            const m0 = meta(d), on = panelOpen && current?.date === d.date;
            // Ngày ngoài tháng: chỉ hiện số mờ, không trạng thái (đỡ rối mắt)
            const m = d.inMonth ? m0 : { ...m0, sc: null, list: [], off: null, fullOff: false, state: 'future', status: { col: C.line } };
            const dim = !d.inMonth;
            const rest = m.state === 'weekend'; // cuối tuần không tăng ca
            const today_ = m.isToday && d.inMonth;
            const editable = data?.can_edit && !m.sc && !m.fullOff && !m.future && !d.weekend;
            return (
              <button key={d.date} onClick={() => pick(d.date)} className={`wl-day wl-mcell${on ? ' is-on' : ''}`} title={`${d.full} ${dmy(d.date)}`} style={{
                display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: isMobile ? 62 : 0, padding: isMobile ? '6px 5px' : '8px 10px', gap: isMobile ? 3 : 5,
                borderRadius: isMobile ? 10 : 12, cursor: 'pointer', textAlign: 'left', fontFamily: FONT_SANS, overflow: 'hidden',
                background: m.fullOff && d.inMonth ? `repeating-linear-gradient(135deg, var(--wt-surface) 0 9px, ${C.tealSoft} 9px 12px)`
                  : today_ ? `linear-gradient(180deg, ${C.primarySoft}, var(--wt-surface) 75%)`
                  : d.weekend ? 'var(--wt-surface-2)' : 'var(--wt-surface)',
                border: today_ ? `2px solid ${C.primary}` : `1.5px solid ${on ? C.primary : rest ? 'transparent' : C.line}`,
                borderTop: `${today_ ? 4 : 3}px solid ${on || today_ ? C.primary : m.status.col}`,
                boxShadow: today_ ? `0 0 0 4px ${C.primary}22, 0 8px 22px ${C.primary}26` : on ? `0 0 0 3px ${C.primary}26` : 'none',
                opacity: dim ? .4 : 1, position: 'relative', zIndex: today_ ? 1 : 0,
              }}>
                {/* dòng đầu: số ngày + điểm / trạng thái */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: isMobile ? 'center' : 'space-between', width: '100%' }}>
                  <span style={{
                    minWidth: isMobile ? 24 : 28, height: isMobile ? 24 : 28, padding: '0 4px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: FONT_MONO, fontWeight: 800, fontSize: isMobile ? 12.5 : 14,
                    background: today_ ? C.primary : 'transparent', color: today_ ? '#fff' : m.future || rest ? C.faint : C.ink,
                    boxShadow: today_ ? `0 2px 8px ${C.primary}66` : 'none',
                  }}>{+d.date.slice(8, 10)}</span>
                  {!isMobile && today_ && <span style={{ fontSize: 9.5, fontWeight: 800, color: C.primary, textTransform: 'uppercase', letterSpacing: .5, marginRight: 'auto' }}>{t('wl_today', 'Hôm nay')}</span>}
                  {!isMobile && (d.weekend && m.state === 'overtime'
                    ? <span title={t('wl_overtime', 'Tăng ca')} style={{ padding: '1px 7px', borderRadius: 20, background: C.violetSoft, fontSize: 12 }}>⏰</span>
                    : statusBadge(m))}
                </div>

                {isMobile ? (
                  // Điện thoại: điểm hoặc chấm màu + số việc
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: '100%' }}>
                    {m.sc ? <span style={{ fontFamily: FONT_MONO, fontWeight: 800, fontSize: 12, color: m.status.col }}>{+m.sc.score}</span>
                      : m.fullOff ? <span style={{ fontSize: 13 }}>🌴</span>
                      : m.state === 'overtime' ? <span style={{ fontSize: 11 }}>⏰</span>
                      : m.status.label ? <span style={{ width: 7, height: 7, borderRadius: '50%', background: m.status.col }} /> : null}
                    {m.list.length > 0 && <span style={{ fontSize: 9.5, color: C.faint, fontWeight: 700 }}>{m.list.length} {t('wl_tasks', 'việc')}</span>}
                  </div>
                ) : rest ? (
                  d.inMonth ? <div style={{ fontSize: 11, color: C.faint, fontWeight: 600 }}>🛌 {t('wl_rest', 'Nghỉ')}</div> : null
                ) : m.fullOff ? (
                  <div style={{ fontSize: 11.5, fontWeight: 800, color: C.teal, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    🌴 {offLabel(t, 'full')}{m.off.reason ? <span style={{ fontWeight: 600, color: C.sub }}> · {m.off.reason}</span> : null}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%', minWidth: 0 }}>
                    {m.off && <span style={{ fontSize: 10, fontWeight: 800, color: C.teal }}>🌴 {offShort(t, m.off.kind)}</span>}
                    {m.list.slice(0, 2).map(e => (
                      <span key={e.id} style={{ fontSize: 11.5, lineHeight: 1.35, color: C.ink, padding: '2px 6px', borderRadius: 6, background: C.board, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</span>
                    ))}
                    {m.list.length > 2 && <span style={{ fontSize: 10.5, color: C.faint, fontWeight: 700 }}>+{m.list.length - 2} {t('wl_more_tasks', 'việc khác')}</span>}
                    {!m.list.length && editable && d.inMonth && <span className="wl-add-cta" style={{ alignSelf: 'flex-start', fontSize: 11, fontWeight: 700, color: C.primary, padding: '2px 8px', borderRadius: 8, border: `1px dashed ${C.primary}66` }}>＋ {t('wl_add_btn_long', 'Ghi việc')}</span>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        {isMobile && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 12, fontSize: 11, color: C.sub, fontWeight: 600 }}>
            {[[C.success, t('wl_lg_scored', 'Điểm đã chấm')], [C.warning, t('wl_not_scored', 'Chưa chấm')], [C.danger, t('wl_missing', 'Chưa ghi')], [C.violet, `⏰ ${t('wl_overtime', 'Tăng ca')}`]].map(([col, label]) => (
              <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: col }} />{label}</span>
            ))}
            <span>🌴 {t('wl_off_short', 'Nghỉ')}</span>
          </div>
        )}
      </div>
    </div>
  );

  const panel = data && member && current && (
    <NotePanel key={`${viewUserId}-${current.date}`} day={current} member={member} entries={byDay(current.date)} score={scoreOf(current.date)} off={offOf(current.date)} data={data} isSelf={isSelf}
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
        .wl-mcell:hover:not(.is-on) { transform: none; border-color: ${C.primary}88 !important; box-shadow: 0 4px 14px rgba(15,23,41,.08) !important; }
        .wl-mcell:focus-visible { outline: 2px solid ${C.primary}; outline-offset: 2px; }
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
        @media (prefers-reduced-motion: reduce) { .wl-root .wl-sheet, .wl-root .wl-fade, .wl-root .wl-skel { animation: none !important; } .wl-root * { transition: none !important; } }
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
            <div style={{ fontSize: 12, color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{view === 'pending' ? t('wl_sub_pending', 'Ai · ngày nào đã ghi việc mà chưa được chấm') : view === 'team' ? t('wl_sub_team', 'Tổng hợp theo nhân viên · bấm 1 ô để xem / chấm') : member ? `${member.full_name}${idLine(member) ? ` · ${idLine(member)}` : ''}` : ''}</div>
          </div>
        </div>

        {canScoreOthers && (
          <div className="wl-viewtoggle" style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 11, background: C.canvas, border: `1px solid ${C.line}` }}>
            {[['me', `📅 ${t('wl_view_me', 'Lịch cá nhân')}`], ['pending', `⏳ ${t('wl_view_pending', 'Chờ chấm')}`], ['team', `👥 ${t('wl_view_team', 'Bảng tổng hợp')}`]].map(([k, label]) => (
              <button key={k} className="wl-seg" onClick={() => { setView(k); setPanelOpen(false); }} style={view === k ? { background: 'var(--wt-surface)', color: C.primary, boxShadow: '0 1px 3px rgba(15,23,41,.12)' } : undefined}>
                {label}
                {k === 'pending' && pendingCount > 0 && <span style={{ marginLeft: 6, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: C.danger, color: '#fff', fontSize: 10.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_MONO }}>{pendingCount > 99 ? '99+' : pendingCount}</span>}
              </button>
            ))}
          </div>
        )}

        {view === 'me' && data && (
          <div className="wl-stats" style={{ display: 'flex', gap: 8 }}>
            {[
              ['📝', monthTasks, t('wl_stat_tasks_m', 'Việc trong tháng'), C.primary],
              ['✅', `${scoredN}/${workDays}`, t('wl_stat_scored_s', 'Ngày đã chấm'), C.success],
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
          <button className="wl-seg" onClick={() => shiftMonth(-1)} title={t('wl_prev_month', 'Tháng trước')} style={{ fontSize: 15, padding: '3px 10px' }}>‹</button>
          <button className="wl-seg" onClick={() => goMonth(ymd(new Date()).slice(0, 7))} style={{ color: C.primary }}>{t('wl_this_month', 'Tháng này')}</button>
          <button className="wl-seg" onClick={() => shiftMonth(1)} title={t('wl_next_month', 'Tháng sau')} style={{ fontSize: 15, padding: '3px 10px' }}>›</button>
          <span style={{ width: 1, height: 20, background: C.line, margin: '0 3px' }} />
          <input type="month" value={month} onChange={e => e.target.value && goMonth(e.target.value)} className="wl-seg-date" style={{ border: 'none', outline: 'none', background: 'transparent', font: `600 12px ${FONT_SANS}`, color: C.sub, padding: '4px 6px', width: 132 }} />
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

      {showExport && <ExportDialog onClose={() => setShowExport(false)} refDate={current?.date || `${month}-01`} defaultRange="month" member={viewing} members={members} viewUserId={viewUserId} defaultWho={view === 'me' ? 'one' : 'all'} />}

      {view === 'pending' ? (
        <PendingBoard isMobile={isMobile} isNarrow={isNarrow} onOpenPerson={(id, date) => { setView('me'); switchUser(id); goMonth(date.slice(0, 7)); setSelected(date); }} />
      ) : view === 'team' ? (
        <OverviewBoard isMobile={isMobile} isNarrow={isNarrow} initialRange={teamRange} onOpenPerson={(id) => { setView('me'); switchUser(id); }} />
      ) : error ? (
        <div style={{ margin: 20, padding: 16, borderRadius: 12, background: C.dangerSoft, color: C.danger, fontSize: 13 }}>⚠ {error}</div>
      ) : (
        <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>{monthGrid}</div>
          {panelOpen && panel && <DetailDock isMobile={isMobile} isNarrow={isNarrow} onClose={() => setPanelOpen(false)}>{panel}</DetailDock>}
        </div>
      )}
    </div>
  );
}
