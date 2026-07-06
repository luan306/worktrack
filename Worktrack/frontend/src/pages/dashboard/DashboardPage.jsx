// src/pages/dashboard/DashboardPage.jsx

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';

const C = {
  primary: '#3a7bd5', dark: '#1e2a3a', success: '#27ae60',
  warning: '#e67e22', danger: '#e74c3c', border: '#e8eaed', bg: '#f7f8fb',
};

const RANKS = [
  { icon: '🥇', cls: 'gold'   },
  { icon: '🥈', cls: 'silver' },
  { icon: '🥉', cls: 'bronze' },
];

const RANK_COLOR = { gold: '#f1c40f', silver: '#95a5a6', bronze: '#cd7f32' };

function Chip({ color = C.primary, name = '?', size = 38 }) {
  const ini = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{
      background: color, width: size, height: size, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: size > 30 ? 13 : 9, fontWeight: 700,
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

  const doLock = async () => {
    setLocking(true);
    try {
      const r = await api.post('/dashboard/lock', { group_id: groupId || undefined });
      alert(t('dash_lock_success', { filename: r.data.data.filename }));
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
    <div className="dash-root" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff', minWidth: 0 }}>
      <style>{`
        .dash-root { box-sizing: border-box; }
        .dash-root *, .dash-root *::before, .dash-root *::after { box-sizing: border-box; }

        /* ── Cảm giác chạm mượt & phản hồi khi nhấn (mobile/touch) ── */
        .dash-root button { -webkit-tap-highlight-color: transparent; touch-action: manipulation; transition: transform .1s ease, background .15s, color .15s, border-color .15s; }
        .dash-root button:active { transform: scale(0.96); }
        .dash-root .dash-ranking-row { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
        .dash-root .dash-ranking-row:active { background: #e5edff !important; }
        .dash-root tbody tr { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
        .dash-root tbody tr:active { background: #eef3ff !important; }

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
          .dash-root .dash-ranking-panel { position: relative; width: 100% !important; border-right: none !important; border-bottom: 1.5px solid ${C.border} !important; max-height: 48vh !important; }
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
      <div className="dash-topbar" style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, background: '#fff', flexShrink: 0 }}>
        <div className="dash-title" style={{ fontSize: 15, fontWeight: 800, color: C.dark, flex: 1 }}>
          📊 {t('dash_title')}
        </div>
        <button style={{ padding: '6px 14px', borderRadius: 7, border: '1.5px solid #dde3f0', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#555', display: 'flex', alignItems: 'center', gap: 5 }}>
          📤 {t('dash_export_excel')}
        </button>
        <button onClick={() => setShowLock(true)}
          style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: C.danger, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
          🔒 {t('dash_lock_reset')}
        </button>
      </div>

      {/* ── Filter bar ── */}
      <div className="dash-filterbar" style={{ padding: '10px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, background: C.bg, flexShrink: 0 }}>
        <div className="dash-filter-hint" style={{ fontSize: 11, color: '#aaa', flex: 1 }}>
          👁 {t('dash_filter_hint')}
        </div>

        {/* Group filter */}
        <select className="dash-group-select" value={groupId} onChange={e => setGroupId(e.target.value)}
          style={{ padding: '5px 10px', borderRadius: 7, border: '1.5px solid #dde3f0', fontSize: 12, color: '#555', outline: 'none', background: '#fff' }}>
          <option value="">{t('dash_all_groups')}</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}
        </select>

        {/* Period tabs */}
        <div className="dash-period-tabs" style={{ display: 'flex', gap: 6 }}>
          {['day', 'week', 'month', 'all'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: '1.5px solid #dde3f0',
              background: view === v ? C.dark : '#fff',
              color:      view === v ? '#fff' : '#888',
              whiteSpace: 'nowrap',
            }}>
              {VIEW_LABEL[v]}
            </button>
          ))}
        </div>

        {/* Search */}
        <input className="dash-search" value={search} onChange={e => setSearch(e.target.value)}
          placeholder={`🔍 ${t('dash_search_employee')}`}
          style={{ padding: '6px 12px', border: '1.5px solid #dde3f0', borderRadius: 8, fontSize: 12, outline: 'none', width: 180 }} />
      </div>

      {/* ── Period banner ── */}
      <div className="dash-periodbanner" style={{ padding: '8px 20px', background: '#eef3ff', borderBottom: '1.5px solid #c8d8f0', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span>📅</span>
        <div style={{ flex: 1, fontSize: 12, color: C.primary, fontWeight: 600 }}>
          {t('dash_period_prefix')} <strong>{periodStart}</strong> {t('dash_period_suffix')}
        </div>
        <div style={{ fontSize: 11, color: '#7a9bbf' }}>
          {t('dash_today_label')} {new Date().toLocaleDateString(currentLocale)}
        </div>
      </div>

      {/* ── Body: 2 cols ── */}
      <div className="dash-body" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* LEFT: Ranking */}
        <div className="dash-ranking-panel" style={{ width: 460, flexShrink: 0, borderRight: `1.5px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '11px 16px', borderBottom: `1px solid ${C.border}`, background: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.dark, flex: 1 }}>👥 {t('dash_ranking_header')}</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading && <div style={{ textAlign: 'center', padding: 32, color: '#aaa' }}>⏳</div>}

            {filtered.map((s, i) => (
              <div key={s.user.id}
                className="dash-ranking-row"
                onClick={() => setSelected(s)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid #f0f2f8`, cursor: 'pointer', transition: 'background .1s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {/* Rank */}
                <div style={{
                  width: 24, textAlign: 'center', flexShrink: 0, fontSize: i < 3 ? 18 : 12,
                  fontWeight: 800, color: i < 3 ? RANK_COLOR[RANKS[i].cls] : '#aaa',
                }}>
                  {i < 3 ? RANKS[i].icon : `#${i + 1}`}
                </div>

                {/* Avatar */}
                <Chip color={s.user.avatar_color} name={s.user.full_name} size={38} />

                {/* Info */}
                <div className="dash-ranking-info" style={{ flex: 1, minWidth: 0 }}>
                  <div className="dash-ranking-name" style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>{s.user.full_name}</div>
                  <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>
                    {t('dash_ranking_meta',{daily:s.cv_counts.daily, main:s.cv_counts.main, support:s.cv_counts.support})}
                  </div>
                </div>

                {/* Score */}
                <div className="dash-score-block" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, minWidth: 130 }}>
                  <div>
                    <span style={{ fontSize: 22, fontWeight: 900, color: C.dark, lineHeight: 1 }}>
                      {s.period_score.total.toFixed(0)}
                    </span>
                    <span style={{ fontSize: 11, color: '#aaa', fontWeight: 400 }}> {t('score')}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 6, background: '#e8f8ee', color: '#27ae60' }}>HN {s.period_score.daily.toFixed(0)}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 6, background: '#eef3ff', color: C.primary }}>YC {s.period_score.request.toFixed(0)}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 6, background: '#fff4e8', color: C.warning }}>HT 0</span>
                  </div>
                </div>

                {/* View btn */}
                <button className="dash-view-btn" onClick={e => { e.stopPropagation(); setSelected(s); }}
                  style={{ padding: '4px 10px', borderRadius: 6, border: '1.5px solid #dde3f0', background: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: C.primary, whiteSpace: 'nowrap' }}>
                  👁 {t('view')}
                </button>
              </div>
            ))}

            {/* Legend */}
            {!loading && (
              <div style={{ padding: '12px 16px', display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid #f0f2f8', background: '#fafbfc' }}>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: '#e8f8ee', color: '#27ae60' }}>{t('dash_legend_daily')}</span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: '#eef3ff', color: C.primary }}>{t('dash_legend_request')}</span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: '#fff4e8', color: C.warning }}>{t('dash_legend_support')}</span>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Stats */}
        <div className="dash-stats-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg, minWidth: 0 }}>
          <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`, background: '#fff', flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.dark }}>📨 {t('dash_requests_stats_header')}</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Stat cards */}
            <div className="dash-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
              {[
                { num: cvTotal,            lbl: t('dash_stat_total_requests'),    cls: 'blue'  },
                { num: cvOntime,           lbl: `✅ ${t('on_time')}`,         cls: 'green' },
                { num: cvLate,             lbl: `⚠️ ${t('late')}`,          cls: 'red'   },
                { num: totalScore.toFixed(0), lbl: `⭐ ${t('dash_stat_total_score')}`, cls: 'gold' },
              ].map(s => {
                const styles = {
                  blue:  { border: '#c8d8f0', bg: '#f0f4ff', color: C.primary },
                  green: { border: '#b8e8c8', bg: '#f0fdf4', color: C.success },
                  red:   { border: '#f5c0c0', bg: '#fdf4f4', color: C.danger  },
                  gold:  { border: '#f5d8a0', bg: '#fffbf0', color: C.warning },
                }[s.cls];
                return (
                  <div key={s.lbl} className="dash-stat-card" style={{ background: styles.bg, border: `1.5px solid ${styles.border}`, borderRadius: 10, padding: '13px 14px', minWidth: 0 }}>
                    <div className="dash-stat-num" style={{ fontSize: 24, fontWeight: 900, color: styles.color }}>{s.num}</div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>{s.lbl}</div>
                  </div>
                );
              })}
            </div>

            {/* Detail table */}
            <div style={{ background: '#fff', borderRadius: 10, border: `1.5px solid ${C.border}`, overflow: 'hidden' }}>
              <div style={{ padding: '11px 16px', background: C.bg, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, flex: 1 }}>👤 {t('dash_detail_header')}</div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: '#eef3ff', color: C.primary }}>
                  {t('dash_people_count',{count:scores.length})}
                </span>
              </div>
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: C.bg }}>
                      {[t('dash_th_employee'), t('dash_th_total'), t('dash_th_daily'), t('dash_th_request'), t('dash_th_support'), t('dash_th_ontime_late')].map(h => (
                        <th key={h} style={{ padding: '8px 14px', fontSize: 11, color: '#888', fontWeight: 700, textAlign: 'left', borderBottom: `1px solid ${C.border}`, textTransform: 'uppercase', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scores.map(s => (
                      <tr key={s.user.id}
                        onClick={() => setSelected(s)}
                        style={{ cursor: 'pointer', borderBottom: '1px solid #f5f6f8' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f7f9ff'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '9px 14px', fontSize: 12, whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 22, height: 22, borderRadius: '50%', background: s.user.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>
                              {s.user.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                            <strong style={{ color: C.dark }}>{s.user.full_name}</strong>
                          </div>
                        </td>
                        <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                          <strong style={{ fontSize: 15, color: C.dark }}>{s.period_score.total.toFixed(0)}đ</strong>
                        </td>
                        <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 7, background: '#e8f8ee', color: C.success }}>{s.period_score.daily.toFixed(0)}</span>
                        </td>
                        <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 7, background: '#eef3ff', color: C.primary }}>{s.period_score.request.toFixed(0)}</span>
                        </td>
                        <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 7, background: '#fff4e8', color: C.warning }}>0</span>
                        </td>
                        <td style={{ padding: '9px 14px', fontSize: 11, whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 7, background: '#e8f8ee', color: C.success }}>{s.cv_counts.ontime}✅</span>
                          {' '}
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 7, background: s.cv_counts.late > 0 ? '#fde8e8' : '#f5f6f8', color: s.cv_counts.late > 0 ? C.danger : '#aaa' }}>
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

      {/* ── Modal: Chốt & Reset ── */}
      {showLock && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}
          onClick={e => e.target === e.currentTarget && setShowLock(false)}>
          <div className="dash-modal" style={{ background: '#fff', borderRadius: 14, padding: 30, width: 420, maxWidth: '92vw', boxShadow: '0 10px 40px rgba(0,0,0,.2)', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>🔒</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.dark, marginBottom: 10 }}>{t('dash_lock_title')}</div>
            <div style={{ fontSize: 13, color: '#666', lineHeight: 1.7, marginBottom: 6 }}>{t('dash_lock_desc')}</div>

            <div style={{ textAlign: 'left', background: C.bg, borderRadius: 10, padding: '12px 16px', margin: '12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                ['1', t('dash_lock_step1'), false],
                ['2', t('dash_lock_step2'), false],
                ['3', t('dash_lock_step3'), true],
              ].map(([n, l, danger]) => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: C.dark, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</div>
                  <span style={{ color: danger ? C.danger : '#444', fontWeight: danger ? 600 : 400 }}>{l}</span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 12, color: C.danger, fontWeight: 600, background: '#fde8e8', padding: '8px 14px', borderRadius: 8, margin: '10px 0' }}>
              ⚠️ {t('dash_lock_warning')}
            </div>
            <div style={{ fontSize: 12, color: '#aaa', marginBottom: 16 }}>
              {t('dash_lock_summary',{count:scores.length, total:totalScore.toFixed(0)})}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => setShowLock(false)}
                style={{ padding: '9px 20px', borderRadius: 8, border: '1.5px solid #dde3f0', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#555' }}>
                {t('dash_cancel')}
              </button>
              <button onClick={doLock} disabled={locking}
                style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: C.danger, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
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

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dash-modal-nopad" style={{ background: '#fff', borderRadius: 14, width: 580, maxWidth: '92vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,.2)', overflow: 'hidden' }}>

        {/* Header */}
        <div className="dash-detail-header" style={{ padding: '16px 20px', borderBottom: '1px solid #e8eaed', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, background: '#1e2a3a' }}>
          <div style={{ width: 42, height: 42, borderRadius: '50%', background: s.user.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 15, fontWeight: 800, flexShrink: 0 }}>
            {ini}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.user.full_name} — {t('dash_detail_title_suffix')}</div>
            <div style={{ fontSize: 11, color: '#7a9bbf', marginTop: 2, textTransform: 'capitalize' }}>{s.user.role}</div>
          </div>
          <button onClick={onClose}
            style={{ marginLeft: 'auto', width: 30, height: 30, borderRadius: 7, border: '1px solid #2d3f52', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, color: '#9db8d2', flexShrink: 0 }}>
            ×
          </button>
        </div>

        {/* Score summary */}
        <div className="dash-detail-summary" style={{ padding: '14px 20px', borderBottom: '1px solid #e8eaed', display: 'flex', gap: 10, flexShrink: 0 }}>
          {[
            { val: s.period_score.total.toFixed(0), lbl: t('dash_stat_total_score'), highlight: true },
            { val: s.period_score.daily.toFixed(0), lbl: `📅 ${t('dash_detail_daily')}`,      color: '#27ae60' },
            { val: s.period_score.request.toFixed(0), lbl: `📨 ${t('dash_detail_request')}`,      color: '#3a7bd5' },
            { val: '0',                              lbl: `🤝 ${t('dash_detail_support')}`,         color: '#e67e22' },
          ].map(d => (
            <div key={d.lbl} className="dash-detail-card" style={{
              flex: 1, borderRadius: 10, padding: 12, textAlign: 'center', minWidth: 0,
              border: `1.5px solid ${d.highlight ? '#1e2a3a' : '#e8eaed'}`,
              background: d.highlight ? '#1e2a3a' : '#f7f8fb',
            }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: d.highlight ? '#2ecc71' : (d.color || '#1e2a3a') }}>{d.val}</div>
              <div style={{ fontSize: 10, color: d.highlight ? '#7a9bbf' : '#aaa', marginTop: 3 }}>{d.lbl}</div>
            </div>
          ))}
        </div>

        {/* CV list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>

          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 0 2px' }}>
            📅 {t('board_col_daily')}
          </div>
          <div className="dash-cv-row" style={{ padding: '9px 12px', borderRadius: 8, background: '#f7f8fb', border: '1px solid #e8eaed', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#27ae60', flexShrink: 0 }} />
            <div style={{ flex: 1, color: '#1e2a3a', fontWeight: 500, minWidth: 120 }}>{t('dash_cv_daily_total',{count:s.cv_counts.daily})}</div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 6, background: '#e8f8ee', color: '#27ae60', whiteSpace: 'nowrap' }}>{t('dash_detail_daily')}</span>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#1e2a3a', minWidth: 36, textAlign: 'right' }}>{s.period_score.daily.toFixed(0)}đ</div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 0 2px' }}>
            📨 {t('dash_cv_request_section',{count:s.cv_counts.main})}
          </div>
          <div className="dash-cv-row" style={{ padding: '9px 12px', borderRadius: 8, background: '#f7f8fb', border: '1px solid #e8eaed', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3a7bd5', flexShrink: 0 }} />
            <div style={{ flex: 1, color: '#1e2a3a', fontWeight: 500, minWidth: 120 }}>
              {t('dash_cv_request_detail',{ontime:s.cv_counts.ontime, late:s.cv_counts.late})}
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 6, background: '#eef3ff', color: '#3a7bd5', whiteSpace: 'nowrap' }}>{t('dash_badge_main')}</span>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#1e2a3a', minWidth: 36, textAlign: 'right' }}>{s.period_score.request.toFixed(0)}đ</div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 0 2px' }}>
            🤝 {t('dash_cv_support_section',{count:s.cv_counts.support})}
          </div>
          <div className="dash-cv-row" style={{ padding: '9px 12px', borderRadius: 8, background: '#f7f8fb', border: '1px solid #e8eaed', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#e67e22', flexShrink: 0 }} />
            <div style={{ flex: 1, color: '#1e2a3a', fontWeight: 500, minWidth: 120 }}>{t('dash_cv_support_total',{count:s.cv_counts.support})}</div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 6, background: '#fff4e8', color: '#e67e22', whiteSpace: 'nowrap' }}>{t('dash_badge_support')}</span>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#1e2a3a', minWidth: 36, textAlign: 'right' }}>0đ</div>
          </div>

        </div>
      </div>
    </div>
  );
}