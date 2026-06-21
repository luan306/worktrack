// src/pages/dashboard/DashboardPage.jsx

import { useState, useEffect } from 'react';
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
      alert(`✅ Đã xuất Excel!\n📁 ${r.data.data.filename}\n\n🔄 Điểm đã reset về 0. Kỳ mới bắt đầu.`);
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

  const periodStart = data?.period?.started_at
    ? new Date(data.period.started_at).toLocaleDateString('vi-VN')
    : '—';

  const VIEW_LABEL = { day: 'Ngày', week: 'Tuần', month: 'Tháng', all: 'Tất cả (kỳ này)' };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' }}>

      {/* ── Topbar ── */}
      <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, background: '#fff', flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.dark, flex: 1 }}>
          📊 Dashboard — Điểm cộng dồn
        </div>
        <button style={{ padding: '6px 14px', borderRadius: 7, border: '1.5px solid #dde3f0', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#555', display: 'flex', alignItems: 'center', gap: 5 }}>
          📤 Xuất Excel
        </button>
        <button onClick={() => setShowLock(true)}
          style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: C.danger, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
          🔒 Chốt & Reset
        </button>
      </div>

      {/* ── Filter bar ── */}
      <div style={{ padding: '10px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, background: C.bg, flexShrink: 0 }}>
        <div style={{ fontSize: 11, color: '#aaa', flex: 1 }}>
          👁 Xem điểm theo khoảng thời gian (không ảnh hưởng điểm tổng):
        </div>

        {/* Group filter */}
        <select value={groupId} onChange={e => setGroupId(e.target.value)}
          style={{ padding: '5px 10px', borderRadius: 7, border: '1.5px solid #dde3f0', fontSize: 12, color: '#555', outline: 'none', background: '#fff' }}>
          <option value="">Tất cả nhóm</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}
        </select>

        {/* Period tabs */}
        <div style={{ display: 'flex', gap: 6 }}>
          {['day', 'week', 'month', 'all'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: '1.5px solid #dde3f0',
              background: view === v ? C.dark : '#fff',
              color:      view === v ? '#fff' : '#888',
            }}>
              {VIEW_LABEL[v]}
            </button>
          ))}
        </div>

        {/* Search */}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Tìm nhân viên..."
          style={{ padding: '6px 12px', border: '1.5px solid #dde3f0', borderRadius: 8, fontSize: 12, outline: 'none', width: 180 }} />
      </div>

      {/* ── Period banner ── */}
      <div style={{ padding: '8px 20px', background: '#eef3ff', borderBottom: '1.5px solid #c8d8f0', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span>📅</span>
        <div style={{ flex: 1, fontSize: 12, color: C.primary, fontWeight: 600 }}>
          Kỳ hiện tại: bắt đầu từ <strong>{periodStart}</strong> — chưa chốt · Điểm cộng dồn từ ngày bắt đầu kỳ
        </div>
        <div style={{ fontSize: 11, color: '#7a9bbf' }}>
          Ngày hiện tại: {new Date().toLocaleDateString('vi-VN')}
        </div>
      </div>

      {/* ── Body: 2 cols ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* LEFT: Ranking */}
        <div style={{ width: 460, flexShrink: 0, borderRight: `1.5px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '11px 16px', borderBottom: `1px solid ${C.border}`, background: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.dark, flex: 1 }}>👥 Xếp hạng — Điểm cộng dồn kỳ này</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading && <div style={{ textAlign: 'center', padding: 32, color: '#aaa' }}>⏳</div>}

            {filtered.map((s, i) => (
              <div key={s.user.id}
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
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>{s.user.full_name}</div>
                  <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>
                    {s.cv_counts.daily} CV hằng ngày · {s.cv_counts.main} CV yêu cầu · {s.cv_counts.support} hỗ trợ
                  </div>
                </div>

                {/* Score */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, minWidth: 130 }}>
                  <div>
                    <span style={{ fontSize: 22, fontWeight: 900, color: C.dark, lineHeight: 1 }}>
                      {s.period_score.total.toFixed(0)}
                    </span>
                    <span style={{ fontSize: 11, color: '#aaa', fontWeight: 400 }}> điểm</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 6, background: '#e8f8ee', color: '#27ae60' }}>HN {s.period_score.daily.toFixed(0)}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 6, background: '#eef3ff', color: C.primary }}>YC {s.period_score.request.toFixed(0)}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 6, background: '#fff4e8', color: C.warning }}>HT 0</span>
                  </div>
                </div>

                {/* View btn */}
                <button onClick={e => { e.stopPropagation(); setSelected(s); }}
                  style={{ padding: '4px 10px', borderRadius: 6, border: '1.5px solid #dde3f0', background: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: C.primary, whiteSpace: 'nowrap' }}>
                  👁 Xem
                </button>
              </div>
            ))}

            {/* Legend */}
            {!loading && (
              <div style={{ padding: '12px 16px', display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid #f0f2f8', background: '#fafbfc' }}>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: '#e8f8ee', color: '#27ae60' }}>HN = Điểm hằng ngày</span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: '#eef3ff', color: C.primary }}>YC = Điểm yêu cầu (chính)</span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: '#fff4e8', color: C.warning }}>HT = Điểm hỗ trợ</span>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Stats */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>
          <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`, background: '#fff', flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.dark }}>📨 Thống kê CV yêu cầu — Kỳ này</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Stat cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
              {[
                { num: cvTotal,            lbl: 'Tổng CV yêu cầu',    cls: 'blue'  },
                { num: cvOntime,           lbl: '✅ Đúng hạn',         cls: 'green' },
                { num: cvLate,             lbl: '⚠️ Quá hạn',          cls: 'red'   },
                { num: totalScore.toFixed(0), lbl: '⭐ Tổng điểm kỳ này', cls: 'gold' },
              ].map(s => {
                const styles = {
                  blue:  { border: '#c8d8f0', bg: '#f0f4ff', color: C.primary },
                  green: { border: '#b8e8c8', bg: '#f0fdf4', color: C.success },
                  red:   { border: '#f5c0c0', bg: '#fdf4f4', color: C.danger  },
                  gold:  { border: '#f5d8a0', bg: '#fffbf0', color: C.warning },
                }[s.cls];
                return (
                  <div key={s.lbl} style={{ background: styles.bg, border: `1.5px solid ${styles.border}`, borderRadius: 10, padding: '13px 14px' }}>
                    <div style={{ fontSize: 24, fontWeight: 900, color: styles.color }}>{s.num}</div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>{s.lbl}</div>
                  </div>
                );
              })}
            </div>

            {/* Detail table */}
            <div style={{ background: '#fff', borderRadius: 10, border: `1.5px solid ${C.border}`, overflow: 'hidden' }}>
              <div style={{ padding: '11px 16px', background: C.bg, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, flex: 1 }}>👤 Chi tiết điểm từng nhân viên — Kỳ này</div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: '#eef3ff', color: C.primary }}>
                  {scores.length} người
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: C.bg }}>
                      {['Nhân viên', 'Tổng điểm', 'HN', 'YC chính', 'Hỗ trợ', 'ĐH / QH'].map(h => (
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
                        <td style={{ padding: '9px 14px', fontSize: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 22, height: 22, borderRadius: '50%', background: s.user.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9, fontWeight: 700 }}>
                              {s.user.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                            <strong style={{ color: C.dark }}>{s.user.full_name}</strong>
                          </div>
                        </td>
                        <td style={{ padding: '9px 14px' }}>
                          <strong style={{ fontSize: 15, color: C.dark }}>{s.period_score.total.toFixed(0)}đ</strong>
                        </td>
                        <td style={{ padding: '9px 14px' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 7, background: '#e8f8ee', color: C.success }}>{s.period_score.daily.toFixed(0)}</span>
                        </td>
                        <td style={{ padding: '9px 14px' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 7, background: '#eef3ff', color: C.primary }}>{s.period_score.request.toFixed(0)}</span>
                        </td>
                        <td style={{ padding: '9px 14px' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 7, background: '#fff4e8', color: C.warning }}>0</span>
                        </td>
                        <td style={{ padding: '9px 14px', fontSize: 11 }}>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => e.target === e.currentTarget && setShowLock(false)}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 30, width: 420, boxShadow: '0 10px 40px rgba(0,0,0,.2)', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>🔒</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.dark, marginBottom: 10 }}>Chốt dữ liệu & Reset điểm?</div>
            <div style={{ fontSize: 13, color: '#666', lineHeight: 1.7, marginBottom: 6 }}>Hệ thống sẽ thực hiện theo thứ tự:</div>

            <div style={{ textAlign: 'left', background: C.bg, borderRadius: 10, padding: '12px 16px', margin: '12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                ['1', 'Xuất file Excel điểm toàn bộ nhân viên', false],
                ['2', 'Lưu lịch sử kỳ vào database (không mất)', false],
                ['3', 'Reset điểm tất cả về 0 — bắt đầu kỳ mới', true],
              ].map(([n, l, danger]) => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: C.dark, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</div>
                  <span style={{ color: danger ? C.danger : '#444', fontWeight: danger ? 600 : 400 }}>{l}</span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 12, color: C.danger, fontWeight: 600, background: '#fde8e8', padding: '8px 14px', borderRadius: 8, margin: '10px 0' }}>
              ⚠️ Sau khi chốt, điểm kỳ này sẽ reset về 0. Không thể hoàn tác!
            </div>
            <div style={{ fontSize: 12, color: '#aaa', marginBottom: 16 }}>
              {scores.length} nhân viên · Tổng {totalScore.toFixed(0)} điểm
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setShowLock(false)}
                style={{ padding: '9px 20px', borderRadius: 8, border: '1.5px solid #dde3f0', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#555' }}>
                Huỷ bỏ
              </button>
              <button onClick={doLock} disabled={locking}
                style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: C.danger, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {locking ? '...' : '🔒 Xác nhận chốt & Reset'}
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
  const ini = s.user.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 14, width: 580, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,.2)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e8eaed', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, background: '#1e2a3a' }}>
          <div style={{ width: 42, height: 42, borderRadius: '50%', background: s.user.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 15, fontWeight: 800, flexShrink: 0 }}>
            {ini}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{s.user.full_name} — Chi tiết điểm kỳ này</div>
            <div style={{ fontSize: 11, color: '#7a9bbf', marginTop: 2, textTransform: 'capitalize' }}>{s.user.role}</div>
          </div>
          <button onClick={onClose}
            style={{ marginLeft: 'auto', width: 30, height: 30, borderRadius: 7, border: '1px solid #2d3f52', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, color: '#9db8d2', flexShrink: 0 }}>
            ×
          </button>
        </div>

        {/* Score summary */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e8eaed', display: 'flex', gap: 10, flexShrink: 0 }}>
          {[
            { val: s.period_score.total.toFixed(0), lbl: 'Tổng điểm kỳ này', highlight: true },
            { val: s.period_score.daily.toFixed(0), lbl: '📅 Hằng ngày',      color: '#27ae60' },
            { val: s.period_score.request.toFixed(0), lbl: '📨 Yêu cầu',      color: '#3a7bd5' },
            { val: '0',                              lbl: '🤝 Hỗ trợ',         color: '#e67e22' },
          ].map(d => (
            <div key={d.lbl} style={{
              flex: 1, borderRadius: 10, padding: 12, textAlign: 'center',
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
            📅 CV Hằng ngày
          </div>
          <div style={{ padding: '9px 12px', borderRadius: 8, background: '#f7f8fb', border: '1px solid #e8eaed', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#27ae60', flexShrink: 0 }} />
            <div style={{ flex: 1, color: '#1e2a3a', fontWeight: 500 }}>Tổng {s.cv_counts.daily} ngày làm việc</div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 6, background: '#e8f8ee', color: '#27ae60' }}>Hằng ngày</span>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#1e2a3a', minWidth: 36, textAlign: 'right' }}>{s.period_score.daily.toFixed(0)}đ</div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 0 2px' }}>
            📨 CV Yêu cầu (chính) — {s.cv_counts.main} CV
          </div>
          <div style={{ padding: '9px 12px', borderRadius: 8, background: '#f7f8fb', border: '1px solid #e8eaed', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3a7bd5', flexShrink: 0 }} />
            <div style={{ flex: 1, color: '#1e2a3a', fontWeight: 500 }}>
              {s.cv_counts.ontime} đúng hạn · {s.cv_counts.late} quá hạn
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 6, background: '#eef3ff', color: '#3a7bd5' }}>Chính</span>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#1e2a3a', minWidth: 36, textAlign: 'right' }}>{s.period_score.request.toFixed(0)}đ</div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 0 2px' }}>
            🤝 CV Hỗ trợ — {s.cv_counts.support} CV
          </div>
          <div style={{ padding: '9px 12px', borderRadius: 8, background: '#f7f8fb', border: '1px solid #e8eaed', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#e67e22', flexShrink: 0 }} />
            <div style={{ flex: 1, color: '#1e2a3a', fontWeight: 500 }}>Tổng {s.cv_counts.support} lần hỗ trợ</div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 6, background: '#fff4e8', color: '#e67e22' }}>Hỗ trợ</span>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#1e2a3a', minWidth: 36, textAlign: 'right' }}>0đ</div>
          </div>

        </div>
      </div>
    </div>
  );
}