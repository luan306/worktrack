// src/pages/dashboard/DashboardPage.jsx

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';

/* ============================================================
   DESIGN TOKENS — cùng hệ thống với Board/Daily/Requests/Completed.
   ============================================================ */
const C = {
  ink:        '#0f1729',
  sub:        '#6b7280',
  faint:      '#9aa3b2',
  surface:    '#ffffff',
  canvas:     '#eef1f8',
  line:       '#e6e9f2',
  lineSoft:   '#f0f2f8',

  primary:      '#3654ff',
  primaryDeep:  '#2440d6',
  primarySoft:  '#eaefff',

  success:     '#17b26a',
  successSoft: '#e8f9f0',
  warning:     '#f59e0b',
  warningSoft: '#fef3e2',
  danger:      '#e5384d',
  dangerSoft:  '#fdeaec',
  violet:      '#8b5cf6',
  violetSoft:  '#f2ecfe',
  gold:        '#f1c40f',

  panelDark:  '#0f1729',
  panelDark2: '#1a2540',
};

const FONT_SANS = "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";

const RANKS = [
  { icon: '🥇', cls: 'gold'   },
  { icon: '🥈', cls: 'silver' },
  { icon: '🥉', cls: 'bronze' },
];

const RANK_COLOR = { gold: '#f1c40f', silver: '#9aa3b2', bronze: '#cd7f32' };

function Chip({ color = C.primary, name = '?', size = 38, ring=false }) {
  const ini = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{
      background: `linear-gradient(135deg, ${color}, ${color}cc)`, width: size, height: size, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: size > 30 ? 13 : 9, fontWeight: 700, fontFamily: FONT_SANS,
      boxShadow: ring ? `0 0 0 2px #fff, 0 0 0 3.5px ${color}55` : '0 1px 3px rgba(15,23,41,.18)',
    }}>{ini}</div>
  );
}

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [view,      setView]      = useState('week');
  const [groups,    setGroups]    = useState([]);
  const [groupId,   setGroupId]   = useState('');
  const [search,    setSearch]    = useState('');
  const [selected,  setSelected]  = useState(null); // NV được chọn → modal
  const [showLock,  setShowLock]  = useState(false);
  const [locking,   setLocking]   = useState(false);

  // ── Modal chọn kỳ để xuất Excel ──
  const [showExportList,   setShowExportList]   = useState(false);
  const [exportList,        setExportList]        = useState([]);
  const [loadingExportList, setLoadingExportList] = useState(false);
  const [downloadingFile,   setDownloadingFile]   = useState(null); // filename đang tải

  useEffect(() => { api.get('/groups').then(r => setGroups(r.data.data)).catch(() => {}); }, []);
  useEffect(() => { fetchScores(); }, [view, groupId]);

  const fetchScores = async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ view });
      if (groupId) p.append('group_id', groupId);
      const r = await api.get(`/dashboard/scores?${p}`);
      setData(r.data.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // Tải file Excel qua endpoint GET /dashboard/excel/:filename (dùng res.download()
  // ở server, không phải static '/uploads/...'). Gọi qua chính `api` (đã có sẵn
  // auth header/cookie) và nhận về dạng blob, thay vì gắn thẳng URL vào <a> —
  // tránh bị 401/403 nếu API cần token mà request trực tiếp qua <a href> không
  // gửi kèm được.
  const downloadExcelFile = async (filename) => {
    const fileRes = await api.get(`/dashboard/excel/${filename}`, { responseType: 'blob' });
    const blobUrl = window.URL.createObjectURL(new Blob([fileRes.data]));
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
  };

  // Nút "📤 Xuất Excel" ở topbar — mở modal liệt kê TẤT CẢ các kỳ đã CHỐT
  // (GET /dashboard/exports) để người dùng chọn kỳ muốn tải lại báo cáo.
  // KHÔNG chốt/reset điểm gì cả — khác hẳn nút "🔒 Chốt & Reset" bên cạnh.
  const openExportList = async () => {
    setShowExportList(true);
    setLoadingExportList(true);
    try {
      const r = await api.get('/dashboard/exports');
      setExportList(r.data.data || []);
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    } finally { setLoadingExportList(false); }
  };

  const handleDownloadPeriod = async (filename) => {
    setDownloadingFile(filename);
    try {
      await downloadExcelFile(filename);
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    } finally { setDownloadingFile(null); }
  };

  const doLock = async () => {
    setLocking(true);
    try {
      const r = await api.post('/dashboard/lock', { group_id: groupId || undefined });
      const { filename } = r.data.data || {};

      if (filename) {
        try {
          await downloadExcelFile(filename);
        } catch (dlErr) {
          console.error('[download excel]', dlErr);
          alert(t('dash_lock_download_failed', { filename, defaultValue: `Đã chốt kỳ thành công nhưng tải file "${filename}" thất bại — vui lòng thử tải lại.` }));
        }
      }

      alert(t('dash_lock_success', { filename }));
      setShowLock(false);
      fetchScores();
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setLocking(false); }
  };

  const scores     = data?.scores || [];
  const filtered   = scores.filter(s => s.user.full_name.toLowerCase().includes(search.toLowerCase()));
  const totalScore = scores.reduce((s, u) => s + u.period_score.total, 0);
  const cvOntime   = scores.reduce((s, u) => s + u.cv_counts.ontime,   0);
  const cvLate     = scores.reduce((s, u) => s + u.cv_counts.late,     0);
  const cvTotal    = cvOntime + cvLate;

  const localeMap = { vi:'vi-VN', en:'en-US', ja:'ja-JP' };
  const currentLocale = localeMap[i18n.language] || 'vi-VN';

  const periodStart = data?.period?.started_at
    ? new Date(data.period.started_at).toLocaleDateString(currentLocale)
    : '—';

  const VIEW_LABEL = { day: t('dash_view_day'), week: t('dash_view_week'), month: t('dash_view_month'), all: t('dash_view_all') };

  return (
    <div className="dash-root" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.canvas, minWidth: 0, fontFamily: FONT_SANS }}>
      <style>{`
        .dash-root { box-sizing: border-box; }
        .dash-root *, .dash-root *::before, .dash-root *::after { box-sizing: border-box; }

        @keyframes dashSpin { to { transform: rotate(360deg); } }
        @keyframes dashRise { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }

        /* ── Cảm giác chạm mượt & phản hồi khi nhấn (mobile/touch) ── */
        .dash-root button { -webkit-tap-highlight-color: transparent; touch-action: manipulation; transition: transform .1s ease, background .15s, color .15s, border-color .15s, box-shadow .15s; }
        .dash-root button:active { transform: scale(0.96); }
        .dash-root .dash-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 16px ${C.primary}55; }
        .dash-root .dash-btn-danger:hover { transform: translateY(-1px); box-shadow: 0 6px 16px ${C.danger}55; }
        .dash-root .dash-ranking-row { -webkit-tap-highlight-color: transparent; touch-action: manipulation; transition: background .12s ease; animation: dashRise .18s ease both; }
        .dash-root .dash-ranking-row:active { background: ${C.primarySoft} !important; }
        .dash-root .dash-stat-card { transition: transform .15s ease, box-shadow .15s ease; }
        .dash-root .dash-stat-card:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(15,23,41,.08); }
        .dash-root tbody tr { -webkit-tap-highlight-color: transparent; touch-action: manipulation; transition: background .12s ease; }
        .dash-root tbody tr:active { background: ${C.primarySoft} !important; }

        /* ── Focus rõ ràng cho bàn phím (a11y) ── */
        .dash-root *:focus-visible { outline: 2px solid ${C.primary}; outline-offset: 2px; border-radius: 4px; }

        /* ── Chặn Safari iOS tự zoom khi focus input/select ── */
        .dash-root input:focus, .dash-root select:focus { font-size: 16px !important; }

        /* ── Thanh cuộn mảnh, đẹp trên desktop ── */
        .dash-root ::-webkit-scrollbar { width: 8px; height: 8px; }
        .dash-root ::-webkit-scrollbar-track { background: transparent; }
        .dash-root ::-webkit-scrollbar-thumb { background: #c8d4e6; border-radius: 8px; }
        .dash-root ::-webkit-scrollbar-thumb:hover { background: #aebedb; }

        /* ── Hiệu ứng mở nhẹ cho modal ── */
        @keyframes dashFadeIn { from { opacity: 0; transform: translateY(-6px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .dash-root .dash-modal, .dash-root .dash-modal-nopad { animation: dashFadeIn .18s ease-out; }

        /* ── Tôn trọng cài đặt giảm chuyển động của người dùng ── */
        @media (prefers-reduced-motion: reduce) {
          .dash-root, .dash-root * { animation: none !important; transition: none !important; }
        }

        @media (max-width: 900px) {
          .dash-root .dash-body { flex-direction: column !important; overflow: auto !important; }
          .dash-root .dash-ranking-panel { position: relative; width: 100% !important; border-right: none !important; border-bottom: 1px solid ${C.line} !important; max-height: 48vh !important; }
          .dash-root .dash-ranking-panel::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 24px; background: linear-gradient(to top, rgba(255,255,255,0.95), rgba(255,255,255,0)); pointer-events: none; }
          .dash-root .dash-stats-panel { flex: none !important; }
        }

        @media (max-width: 768px) {
          .dash-root .dash-topbar { flex-wrap: wrap !important; padding: 10px 14px !important; gap: 8px !important; }
          .dash-root .dash-title { flex-basis: 100% !important; font-size: 14px !important; }
          .dash-root .dash-topbar button { flex: 1 1 auto !important; justify-content: center !important; }

          .dash-root .dash-filterbar { flex-wrap: wrap !important; padding: 10px 14px !important; gap: 8px !important; }
          .dash-root .dash-filter-hint { flex-basis: 100% !important; order: -1 !important; }
          .dash-root .dash-search { flex: 1 1 140px !important; width: auto !important; min-width: 0 !important; }
          .dash-root .dash-period-tabs { flex-wrap: wrap !important; }
          .dash-root .dash-group-select { flex: 1 1 130px !important; }

          .dash-root .dash-periodbanner { flex-wrap: wrap !important; padding: 8px 14px !important; font-size: 11px !important; }

          .dash-root .dash-ranking-row { flex-wrap: wrap !important; row-gap: 6px !important; padding: 10px 12px !important; justify-content: space-between !important; }
          .dash-root .dash-ranking-info { flex-basis: 100% !important; order: 5 !important; }
          .dash-root .dash-score-block { order: 3 !important; min-width: 0 !important; }
          .dash-root .dash-view-btn { display: none !important; }

          .dash-root .dash-stats-grid { grid-template-columns: repeat(2,1fr) !important; }

          .dash-root .dash-modal { width: calc(100vw - 32px) !important; max-width: calc(100vw - 32px) !important; padding: 20px !important; }
          .dash-root .dash-modal-nopad { width: calc(100vw - 32px) !important; max-width: calc(100vw - 32px) !important; }
          .dash-root .dash-detail-header { padding: 12px 14px !important; }
          .dash-root .dash-detail-summary { flex-wrap: wrap !important; }
          .dash-root .dash-detail-card { flex: 1 1 45% !important; }
          .dash-root .dash-cv-row { flex-wrap: wrap !important; }
        }

        @media (max-width: 480px) {
          .dash-root .dash-stats-grid { grid-template-columns: repeat(2,1fr) !important; gap: 8px !important; }
          .dash-root .dash-stat-card { padding: 10px 10px !important; }
          .dash-root .dash-stat-card .dash-stat-num { font-size: 19px !important; }
          .dash-root .dash-detail-card { flex: 1 1 100% !important; }
          .dash-root .dash-score-block { min-width: 96px !important; }
          .dash-root .dash-ranking-name { font-size: 12px !important; }
        }

        @media (min-width: 1440px) {
          .dash-root .dash-ranking-panel { width: 520px !important; }
          .dash-root .dash-stats-panel > div:last-child { padding: 20px 24px !important; }
        }
      `}</style>

      {/* ── Topbar ── */}
      <div className="dash-topbar" style={{ padding: '13px 20px', borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 10, background: C.surface, flexShrink: 0 }}>
        <div className="dash-title" style={{ fontSize: 15, fontWeight: 800, color: C.ink, flex: 1, display:'flex', alignItems:'center', gap:9 }}>
          <span style={{ width:32, height:32, borderRadius:9, background:`linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, boxShadow:`0 3px 10px ${C.primary}4d` }}>📊</span>
          {t('dash_title')}
        </div>
        <button onClick={openExportList} className="dash-btn-primary"
          style={{ padding: '7px 15px', borderRadius: 9, border: `1.5px solid ${C.line}`, background: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: C.sub, display: 'flex', alignItems: 'center', gap: 6 }}>
          📤 {t('dash_export_excel')}
        </button>
        <button onClick={() => setShowLock(true)} className="dash-btn-danger"
          style={{ padding: '7px 15px', borderRadius: 9, border: 'none', background: `linear-gradient(135deg, ${C.danger}, #c72d3f)`, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow:`0 3px 10px ${C.danger}44` }}>
          🔒 {t('dash_lock_reset')}
        </button>
      </div>

      {/* ── Filter bar ── */}
      <div className="dash-filterbar" style={{ padding: '10px 20px', borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 10, background: C.surface, flexShrink: 0 }}>
        <div className="dash-filter-hint" style={{ fontSize: 11, color: C.faint, flex: 1 }}>
          👁 {t('dash_filter_hint')}
        </div>

        {/* Group filter */}
        <select className="dash-group-select" value={groupId} onChange={e => setGroupId(e.target.value)}
          style={{ padding: '6px 11px', borderRadius: 9, border: `1.5px solid ${C.line}`, fontSize: 12, color: C.sub, outline: 'none', background: '#fff', fontFamily: FONT_SANS }}>
          <option value="">{t('dash_all_groups')}</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}
        </select>

        {/* Period tabs */}
        <div className="dash-period-tabs" style={{ display: 'flex', gap: 3, background: C.canvas, borderRadius: 9, padding: 3 }}>
          {['day', 'week', 'month', 'all'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '5px 13px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: 'none',
              background: view === v ? `linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})` : 'transparent',
              color:      view === v ? '#fff' : C.sub,
              whiteSpace: 'nowrap',
              boxShadow: view === v ? `0 3px 8px ${C.primary}44` : 'none',
            }}>
              {VIEW_LABEL[v]}
            </button>
          ))}
        </div>

        {/* Search */}
        <input className="dash-search" value={search} onChange={e => setSearch(e.target.value)}
          placeholder={`🔍 ${t('dash_search_employee')}`}
          style={{ padding: '7px 13px', border: `1.5px solid ${C.line}`, borderRadius: 9, fontSize: 12, outline: 'none', width: 190, fontFamily: FONT_SANS }} />
      </div>

      {/* ── Period banner ── */}
      <div className="dash-periodbanner" style={{ padding: '9px 20px', background: C.primarySoft, borderBottom: `1px solid #c8d8f0`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span>📅</span>
        <div style={{ flex: 1, fontSize: 12, color: C.primaryDeep, fontWeight: 700 }}>
          {t('dash_period_prefix')} <strong style={{fontFamily:FONT_MONO}}>{periodStart}</strong> {t('dash_period_suffix')}
        </div>
        <div style={{ fontSize: 11, color: '#5a76c9', fontFamily: FONT_MONO }}>
          {t('dash_today_label')} {new Date().toLocaleDateString(currentLocale)}
        </div>
      </div>

      {/* ── Body: 2 cols ── */}
      <div className="dash-body" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* LEFT: Ranking */}
        <div className="dash-ranking-panel" style={{ width: 460, flexShrink: 0, borderRight: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.surface }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.line}`, background: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.ink, flex: 1 }}>👥 {t('dash_ranking_header')}</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading && <div style={{ textAlign: 'center', padding: 32 }}><div style={{width:26,height:26,margin:'0 auto',border:`3px solid ${C.line}`,borderTopColor:C.primary,borderRadius:'50%',animation:'dashSpin .7s linear infinite'}}/></div>}

            {filtered.map((s, i) => (
              <div key={s.user.id}
                className="dash-ranking-row"
                onClick={() => setSelected(s)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${C.lineSoft}`, cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f7f9ff'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {/* Rank */}
                <div style={{
                  width: 26, textAlign: 'center', flexShrink: 0, fontSize: i < 3 ? 19 : 12,
                  fontWeight: 800, color: i < 3 ? RANK_COLOR[RANKS[i].cls] : C.faint, fontFamily: i<3?FONT_SANS:FONT_MONO,
                }}>
                  {i < 3 ? RANKS[i].icon : `#${i + 1}`}
                </div>

                {/* Avatar */}
                <Chip color={s.user.avatar_color} name={s.user.full_name} size={38} ring={i<3} />

                {/* Info */}
                <div className="dash-ranking-info" style={{ flex: 1, minWidth: 0 }}>
                  <div className="dash-ranking-name" style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{s.user.full_name}</div>
                  <div style={{ fontSize: 10, color: C.faint, marginTop: 2 }}>
                    {t('dash_ranking_meta',{daily:s.cv_counts.daily, main:s.cv_counts.main, support:s.cv_counts.support})}
                  </div>
                </div>

                {/* Score */}
                <div className="dash-score-block" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, minWidth: 130 }}>
                  <div>
                    <span style={{ fontSize: 22, fontWeight: 900, color: C.ink, lineHeight: 1, fontFamily: FONT_MONO }}>
                      {s.period_score.total.toFixed(0)}
                    </span>
                    <span style={{ fontSize: 11, color: C.faint, fontWeight: 400 }}> {t('score')}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1.5px 7px', borderRadius: 7, background: C.successSoft, color: C.success, fontFamily: FONT_MONO }}>HN {s.period_score.daily.toFixed(0)}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1.5px 7px', borderRadius: 7, background: C.primarySoft, color: C.primary, fontFamily: FONT_MONO }}>YC {s.period_score.request.toFixed(0)}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1.5px 7px', borderRadius: 7, background: C.warningSoft, color: C.warning, fontFamily: FONT_MONO }}>🤝 {s.cv_counts.support}</span>
                  </div>
                </div>

                {/* View btn */}
                <button className="dash-view-btn" onClick={e => { e.stopPropagation(); setSelected(s); }}
                  style={{ padding: '5px 11px', borderRadius: 8, border: `1.5px solid ${C.line}`, background: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: C.primary, whiteSpace: 'nowrap' }}>
                  👁 {t('view')}
                </button>
              </div>
            ))}

            {/* Legend */}
            {!loading && (
              <div style={{ padding: '12px 16px', display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: `1px solid ${C.lineSoft}`, background: '#fafbfc' }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: C.successSoft, color: C.success }}>{t('dash_legend_daily')}</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: C.primarySoft, color: C.primary }}>{t('dash_legend_request')}</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: C.warningSoft, color: C.warning }}>{t('dash_legend_support')}</span>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Stats */}
        <div className="dash-stats-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.canvas, minWidth: 0 }}>
          <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.line}`, background: '#fff', flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.ink }}>📨 {t('dash_requests_stats_header')}</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 15, display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Stat cards */}
            <div className="dash-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
              {[
                { num: cvTotal,            lbl: t('dash_stat_total_requests'),    icon:'📨', cls: 'blue'  },
                { num: cvOntime,           lbl: `✅ ${t('on_time')}`,         icon:'✅', cls: 'green' },
                { num: cvLate,             lbl: `⚠️ ${t('late')}`,          icon:'⚠️', cls: 'red'   },
                { num: totalScore.toFixed(0), lbl: `⭐ ${t('dash_stat_total_score')}`, icon:'⭐', cls: 'gold' },
              ].map(s => {
                const styles = {
                  blue:  { border: '#c8d8f0', bg: C.primarySoft,  color: C.primary },
                  green: { border: '#b8e8c8', bg: C.successSoft,  color: C.success },
                  red:   { border: '#f5c0c0', bg: C.dangerSoft,   color: C.danger  },
                  gold:  { border: '#f5d8a0', bg: C.warningSoft,  color: C.warning },
                }[s.cls];
                return (
                  <div key={s.lbl} className="dash-stat-card" style={{ background: styles.bg, border: `1.5px solid ${styles.border}`, borderRadius: 14, padding: '14px 15px', minWidth: 0 }}>
                    <div className="dash-stat-num" style={{ fontSize: 25, fontWeight: 900, color: styles.color, fontFamily: FONT_MONO }}>{s.num}</div>
                    <div style={{ fontSize: 11, color: C.sub, marginTop: 4, fontWeight: 600 }}>{s.lbl}</div>
                  </div>
                );
              })}
            </div>

            {/* Detail table */}
            <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.line}`, overflow: 'hidden', boxShadow:'0 1px 3px rgba(15,23,41,.03)' }}>
              <div style={{ padding: '12px 16px', background: C.canvas, borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.ink, flex: 1 }}>👤 {t('dash_detail_header')}</div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 8, background: C.primarySoft, color: C.primary, fontFamily: FONT_MONO }}>
                  {t('dash_people_count',{count:scores.length})}
                </span>
              </div>
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: C.canvas }}>
                      {[t('dash_th_employee'), t('dash_th_total'), t('dash_th_daily'), t('dash_th_request'), t('dash_th_support'), t('dash_th_ontime_late')].map(h => (
                        <th key={h} style={{ padding: '9px 14px', fontSize: 11, color: C.faint, fontWeight: 800, textAlign: 'left', borderBottom: `1px solid ${C.line}`, textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scores.map(s => (
                      <tr key={s.user.id}
                        onClick={() => setSelected(s)}
                        style={{ cursor: 'pointer', borderBottom: `1px solid ${C.lineSoft}` }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f7f9ff'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '10px 14px', fontSize: 12, whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Chip color={s.user.avatar_color} name={s.user.full_name} size={22} />
                            <strong style={{ color: C.ink, fontFamily: FONT_SANS }}>{s.user.full_name}</strong>
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          <strong style={{ fontSize: 15, color: C.ink, fontFamily: FONT_MONO }}>{s.period_score.total.toFixed(0)}đ</strong>
                        </td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: C.successSoft, color: C.success, fontFamily: FONT_MONO }}>{s.period_score.daily.toFixed(0)}</span>
                        </td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: C.primarySoft, color: C.primary, fontFamily: FONT_MONO }}>{s.period_score.request.toFixed(0)}</span>
                        </td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: C.warningSoft, color: C.warning, fontFamily: FONT_MONO }}>{s.cv_counts.support}</span>
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 11, whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: C.successSoft, color: C.success, fontFamily: FONT_MONO }}>{s.cv_counts.ontime}✅</span>
                          {' '}
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: s.cv_counts.late > 0 ? C.dangerSoft : C.lineSoft, color: s.cv_counts.late > 0 ? C.danger : C.faint, fontFamily: FONT_MONO }}>
                            {s.cv_counts.late}{s.cv_counts.late > 0 ? '⚠' : ''}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── Modal: Chi tiết NV ── */}
      {selected && <DetailModal s={selected} onClose={() => setSelected(null)} />}

      {/* ── Modal: Chọn kỳ để xuất Excel ── */}
      {showExportList && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,41,.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}
          onClick={e => e.target === e.currentTarget && setShowExportList(false)}>
          <div className="dash-modal-nopad" style={{ background: C.surface, borderRadius: 18, width: 460, maxWidth: '92vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 70px rgba(15,23,41,.3)', overflow: 'hidden' }}>

            {/* Header */}
            <div className="dash-detail-header" style={{ padding: '17px 20px', borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 11, flexShrink: 0 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:C.primarySoft, color:C.primary, display:'flex', alignItems:'center', justifyContent:'center', fontSize:17 }}>📤</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.ink, flex: 1 }}>{t('dash_export_list_title', { defaultValue: 'Chọn kỳ để tải Excel' })}</div>
              <button onClick={() => setShowExportList(false)}
                style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, color: C.faint, flexShrink: 0 }}>
                ×
              </button>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '11px 14px', display: 'flex', flexDirection: 'column', gap: 7 }}>
              {loadingExportList && (
                <div style={{ textAlign: 'center', padding: 32 }}><div style={{width:24,height:24,margin:'0 auto',border:`3px solid ${C.line}`,borderTopColor:C.primary,borderRadius:'50%',animation:'dashSpin .7s linear infinite'}}/></div>
              )}

              {!loadingExportList && exportList.length === 0 && (
                <div style={{ textAlign: 'center', padding: 32, color: C.faint, fontSize: 13 }}>
                  {t('dash_export_list_empty', { defaultValue: 'Chưa có kỳ nào được chốt để xuất Excel' })}
                </div>
              )}

              {!loadingExportList && exportList.map(p => (
                <div key={p.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 15px', borderRadius: 11, border: `1.5px solid ${C.line}`, background: C.canvas }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name || `Kỳ #${p.id}`}
                    </div>
                    <div style={{ fontSize: 11, color: C.faint, marginTop: 3, fontFamily: FONT_MONO }}>
                      {t('dash_export_locked_at', { defaultValue: 'Chốt lúc' })}: {p.locked_at ? new Date(p.locked_at).toLocaleString(currentLocale) : '—'}
                    </div>
                  </div>
                  <button onClick={() => handleDownloadPeriod(p.excel_path)} disabled={downloadingFile === p.excel_path} className="dash-btn-primary"
                    style={{ padding: '8px 15px', borderRadius: 9, border: 'none', background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`, color: '#fff', fontSize: 12, fontWeight: 700, cursor: downloadingFile === p.excel_path ? 'default' : 'pointer', flexShrink: 0, whiteSpace: 'nowrap', boxShadow:`0 3px 10px ${C.primary}44` }}>
                    {downloadingFile === p.excel_path ? '...' : `⬇ ${t('dash_export_download', { defaultValue: 'Tải về' })}`}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Chốt & Reset ── */}
      {showLock && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,41,.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}
          onClick={e => e.target === e.currentTarget && setShowLock(false)}>
          <div className="dash-modal" style={{ background: C.surface, borderRadius: 18, padding: 32, width: 420, maxWidth: '92vw', boxShadow: '0 30px 70px rgba(15,23,41,.3)', textAlign: 'center' }}>
            <div style={{ width:72, height:72, borderRadius:'50%', background:C.dangerSoft, display:'flex', alignItems:'center', justifyContent:'center', fontSize: 34, margin:'0 auto 16px' }}>🔒</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.ink, marginBottom: 10 }}>{t('dash_lock_title')}</div>
            <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.7, marginBottom: 6 }}>{t('dash_lock_desc')}</div>

            <div style={{ textAlign: 'left', background: C.canvas, borderRadius: 12, padding: '13px 16px', margin: '14px 0', display: 'flex', flexDirection: 'column', gap: 9 }}>
              {[
                ['1', t('dash_lock_step1'), false],
                ['2', t('dash_lock_step2'), false],
                ['3', t('dash_lock_step3'), true],
              ].map(([n, l, danger]) => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                  <div style={{ width: 23, height: 23, borderRadius: '50%', background: `linear-gradient(135deg, ${C.ink}, ${C.panelDark2})`, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: FONT_MONO }}>{n}</div>
                  <span style={{ color: danger ? C.danger : C.sub, fontWeight: danger ? 700 : 500 }}>{l}</span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 12, color: C.danger, fontWeight: 700, background: C.dangerSoft, padding: '9px 15px', borderRadius: 10, margin: '11px 0' }}>
              ⚠️ {t('dash_lock_warning')}
            </div>
            <div style={{ fontSize: 12, color: C.faint, marginBottom: 18, fontFamily: FONT_MONO }}>
              {t('dash_lock_summary',{count:scores.length, total:totalScore.toFixed(0)})}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => setShowLock(false)}
                style={{ padding: '9px 20px', borderRadius: 10, border: `1.5px solid ${C.line}`, background: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: C.sub }}>
                {t('dash_cancel')}
              </button>
              <button onClick={doLock} disabled={locking} className="dash-btn-danger"
                style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg, ${C.danger}, #c72d3f)`, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow:`0 4px 14px ${C.danger}44` }}>
                {locking ? '...' : `🔒 ${t('dash_lock_confirm_btn')}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════
// Modal: Chi tiết NV
// ══════════════════════════════════════
function DetailModal({ s, onClose }) {
  const { t } = useTranslation();
  const ini = s.user.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  // Danh sách CV thật (tên từng CV) mà người này làm Chính / Hỗ trợ —
  // KHÔNG tải ngay khi mở modal (tránh gọi API + lọc toàn bộ CV công ty mỗi lần
  // xem 1 người). Chỉ tải 1 lần duy nhất khi người dùng bấm mở rộng lần đầu.
  const [myRequests,     setMyRequests]     = useState(null); // null = chưa tải
  const [loadingReq,     setLoadingReq]     = useState(false);
  const [showMainList,   setShowMainList]   = useState(false);
  const [showSupportList,setShowSupportList]= useState(false);
  // Giới hạn số dòng render mỗi lần — có "Xem thêm" thay vì đẩy hết hàng trăm
  // dòng vào DOM cùng lúc.
  const PAGE = 20;
  const [mainShown,    setMainShown]    = useState(PAGE);
  const [supportShown, setSupportShown] = useState(PAGE);

  const ensureLoaded = () => {
    if (myRequests !== null || loadingReq) return; // đã tải rồi hoặc đang tải dở
    setLoadingReq(true);
    api.get('/requests').then(r => {
      const all = r.data.data || [];
      const mine = all.filter(t2 => (t2.assignees||[]).some(a => a.user_id === s.user.id));
      setMyRequests(mine);
    }).catch(() => setMyRequests([])).finally(() => setLoadingReq(false));
  };

  const toggleMain = () => { ensureLoaded(); setShowMainList(p=>!p); };
  const toggleSupport = () => { ensureLoaded(); setShowSupportList(p=>!p); };

  const myRole = (t2) => (t2.assignees||[]).find(a => a.user_id === s.user.id)?.role;
  const mainList    = (myRequests||[]).filter(t2 => myRole(t2) !== 'support');
  const supportList = (myRequests||[]).filter(t2 => myRole(t2) === 'support');

  const STATUS_ICON = { pending:'⏳', assigned:'⏳', in_progress:'🔄', scoring:'🏆', reviewing:'📋', done:'✅', cancelled:'❌' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,41,.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dash-modal-nopad" style={{ background: C.surface, borderRadius: 18, width: 580, maxWidth: '92vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 70px rgba(15,23,41,.3)', overflow: 'hidden' }}>

        {/* Header — dark control-panel gradient, đồng bộ với header bảng chấm điểm DailyPage */}
        <div className="dash-detail-header" style={{ padding: '17px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, background: `linear-gradient(160deg, ${C.panelDark}, ${C.panelDark2})` }}>
          <Chip color={s.user.avatar_color} name={s.user.full_name} size={44} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.user.full_name} — {t('dash_detail_title_suffix')}</div>
            <div style={{ fontSize: 11, color: '#8fa8c9', marginTop: 2, textTransform: 'capitalize' }}>{s.user.role}</div>
          </div>
          <button onClick={onClose}
            style={{ marginLeft: 'auto', width: 32, height: 32, borderRadius: 9, border: '1px solid #2d3f52', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, color: '#9db8d2', flexShrink: 0 }}>
            ×
          </button>
        </div>

        {/* Score summary */}
        <div className="dash-detail-summary" style={{ padding: '15px 20px', borderBottom: `1px solid ${C.line}`, display: 'flex', gap: 10, flexShrink: 0 }}>
          {[
            { val: s.period_score.total.toFixed(0), lbl: t('dash_stat_total_score'), highlight: true },
            { val: s.period_score.daily.toFixed(0), lbl: `📅 ${t('dash_detail_daily')}`,      color: C.success },
            { val: s.period_score.request.toFixed(0), lbl: `📨 ${t('dash_detail_request')}`,      color: C.primary },
            { val: s.cv_counts.support,               lbl: `🤝 ${t('dash_detail_support')}`,         color: C.warning },
          ].map(d => (
            <div key={d.lbl} className="dash-detail-card" style={{
              flex: 1, borderRadius: 12, padding: 13, textAlign: 'center', minWidth: 0,
              border: `1.5px solid ${d.highlight ? C.ink : C.line}`,
              background: d.highlight ? `linear-gradient(160deg, ${C.panelDark}, ${C.panelDark2})` : C.canvas,
            }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: d.highlight ? '#2ecc71' : (d.color || C.ink), fontFamily: FONT_MONO }}>{d.val}</div>
              <div style={{ fontSize: 10, color: d.highlight ? '#8fa8c9' : C.faint, marginTop: 4, fontWeight: 600 }}>{d.lbl}</div>
            </div>
          ))}
        </div>

        {/* CV list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '15px 20px', display: 'flex', flexDirection: 'column', gap: 6, background: C.canvas }}>

          <div style={{ fontSize: 11, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 0 2px' }}>
            📅 {t('board_col_daily')}
          </div>
          <div className="dash-cv-row" style={{ padding: '10px 13px', borderRadius: 11, background: C.surface, border: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.success, flexShrink: 0 }} />
            <div style={{ flex: 1, color: C.ink, fontWeight: 600, minWidth: 120 }}>{t('dash_cv_daily_total',{count:s.cv_counts.daily})}</div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '1.5px 8px', borderRadius: 7, background: C.successSoft, color: C.success, whiteSpace: 'nowrap' }}>{t('dash_detail_daily')}</span>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.ink, minWidth: 36, textAlign: 'right', fontFamily: FONT_MONO }}>{s.period_score.daily.toFixed(0)}đ</div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 0 2px' }}>
            📨 {t('dash_cv_request_section',{count:s.cv_counts.main})}
          </div>
          <div className="dash-cv-row" onClick={toggleMain}
            style={{ padding: '10px 13px', borderRadius: 11, background: C.surface, border: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, cursor:'pointer' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.primary, flexShrink: 0 }} />
            <div style={{ flex: 1, color: C.ink, fontWeight: 600, minWidth: 120 }}>
              {t('dash_cv_request_detail',{ontime:s.cv_counts.ontime, late:s.cv_counts.late})}
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '1.5px 8px', borderRadius: 7, background: C.primarySoft, color: C.primary, whiteSpace: 'nowrap' }}>{t('dash_badge_main')}</span>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.ink, minWidth: 36, textAlign: 'right', fontFamily: FONT_MONO }}>{s.period_score.request.toFixed(0)}đ</div>
            <span style={{ fontSize: 11, color: C.faint, flexShrink:0 }}>{showMainList?'▲':'▼'}</span>
          </div>
          {showMainList && (
            <div style={{ display:'flex', flexDirection:'column', gap:4, padding:'2px 4px 8px' }}>
              {loadingReq && <div style={{fontSize:11,color:C.faint,padding:'4px 8px'}}>⏳</div>}
              {!loadingReq && !mainList.length && <div style={{fontSize:11,color:C.faint,padding:'4px 8px'}}>{t('req_no_tasks')}</div>}
              {mainList.slice(0, mainShown).map(t2=>(
                <div key={t2.id} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 11px',borderRadius:9,background:'#fff',border:`1px solid ${C.lineSoft}`,fontSize:11}}>
                  <span>{STATUS_ICON[t2.status]||'⏳'}</span>
                  <span style={{flex:1,color:C.ink,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t2.title}</span>
                  {t2.score!=null&&<span style={{fontWeight:700,color:C.primary,whiteSpace:'nowrap',fontFamily:FONT_MONO}}>{t2.score}đ</span>}
                </div>
              ))}
              {mainList.length>mainShown&&(
                <div onClick={()=>setMainShown(n=>n+PAGE)} style={{textAlign:'center',padding:'7px 8px',fontSize:11,color:C.primary,cursor:'pointer',fontWeight:700}}>
                  {t('board_view_all')} (+{mainList.length-mainShown})
                </div>
              )}
            </div>
          )}

          <div style={{ fontSize: 11, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 0 2px' }}>
            🤝 {t('dash_cv_support_section',{count:s.cv_counts.support})}
          </div>
          <div className="dash-cv-row" onClick={toggleSupport}
            style={{ padding: '10px 13px', borderRadius: 11, background: C.surface, border: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, cursor:'pointer' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.warning, flexShrink: 0 }} />
            <div style={{ flex: 1, color: C.ink, fontWeight: 600, minWidth: 120 }}>{t('dash_cv_support_total',{count:s.cv_counts.support})}</div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '1.5px 8px', borderRadius: 7, background: C.warningSoft, color: C.warning, whiteSpace: 'nowrap' }}>{t('dash_badge_support')}</span>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.ink, minWidth: 36, textAlign: 'right', fontFamily: FONT_MONO }}>0đ</div>
            <span style={{ fontSize: 11, color: C.faint, flexShrink:0 }}>{showSupportList?'▲':'▼'}</span>
          </div>
          {showSupportList && (
            <div style={{ display:'flex', flexDirection:'column', gap:4, padding:'2px 4px 8px' }}>
              {loadingReq && <div style={{fontSize:11,color:C.faint,padding:'4px 8px'}}>⏳</div>}
              {!loadingReq && !supportList.length && <div style={{fontSize:11,color:C.faint,padding:'4px 8px'}}>{t('req_no_tasks')}</div>}
              {supportList.slice(0, supportShown).map(t2=>(
                <div key={t2.id} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 11px',borderRadius:9,background:'#fff',border:`1px solid ${C.lineSoft}`,fontSize:11}}>
                  <span>{STATUS_ICON[t2.status]||'⏳'}</span>
                  <span style={{flex:1,color:C.ink,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t2.title}</span>
                  <span style={{fontWeight:700,color:C.warning,whiteSpace:'nowrap'}}>🤝 {t('dash_badge_support')}</span>
                </div>
              ))}
              {supportList.length>supportShown&&(
                <div onClick={()=>setSupportShown(n=>n+PAGE)} style={{textAlign:'center',padding:'7px 8px',fontSize:11,color:C.warning,cursor:'pointer',fontWeight:700}}>
                  {t('board_view_all')} (+{supportList.length-supportShown})
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}