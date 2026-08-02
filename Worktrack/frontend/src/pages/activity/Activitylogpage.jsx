import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';

const C = {
  primary: '#3a7bd5', dark: '#1e2a3a', success: '#27ae60',
  warning: '#e67e22', danger: '#e74c3c', border: '#e8eaed', bg: '#f7f8fb',
};

// Icon + màu theo loại hành động — dễ quét mắt khi danh sách dài
const ACTION_META = {
  request_created:          { icon: '➕', color: C.primary, bg: '#eef3ff' },
  request_deleted:          { icon: '🗑', color: C.danger,  bg: '#fde8e8' },
  request_assignee_added:   { icon: '👤', color: '#27ae60', bg: '#e8f8ee' },
  request_assignee_removed: { icon: '👤', color: C.warning, bg: '#fff4e8' },
  request_scored:           { icon: '⭐', color: '#8e44ad', bg: '#f3e8ff' },
  request_completed:        { icon: '✅', color: C.success, bg: '#e8f8ee' },
  daily_scored:             { icon: '📅', color: '#27ae60', bg: '#e8f8ee' },
  daily_score_edited:       { icon: '✏️', color: C.warning, bg: '#fff4e8' },
};
const defaultMeta = { icon: '📝', color: '#888', bg: '#f0f2f8' };

const ACTION_LABELS = {
  request_created:          'Tạo CV',
  request_deleted:          'Xóa CV',
  request_assignee_added:   'Thêm người',
  request_assignee_removed: 'Xóa người',
  request_scored:           'Chấm điểm CV',
  request_completed:        'Duyệt hoàn thành',
  daily_scored:             'Chấm điểm Daily',
  daily_score_edited:       'Sửa điểm Daily',
};

const Chip = ({ color = C.primary, name = '?', size = 28 }) => {
  const ini = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: color, color: '#fff', fontSize: size > 24 ? 12 : 9, fontWeight: 700 }}>
      {ini}
    </div>
  );
};

export default function ActivityLogPage() {
  const { t, i18n } = useTranslation();
  const currentLocale = { vi: 'vi-VN', en: 'en-US', ja: 'ja-JP' }[i18n.language] || 'vi-VN';

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [actionTypes, setActionTypes] = useState([]);
  const [users, setUsers] = useState([]);

  const [filterType, setFilterType] = useState('');
  const [filterActor, setFilterActor] = useState('');
  const [actorSearchText, setActorSearchText] = useState(''); // tên đang gõ để tìm
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  useEffect(() => {
    api.get('/activity-logs/action-types').then(r => setActionTypes(r.data.data || [])).catch(() => {});
    api.get('/users').then(r => setUsers(r.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [page, filterType, filterActor, filterFrom, filterTo]);

  const load = async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page, limit: 30 });
      if (filterType)  p.append('action_type', filterType);
      if (filterActor) p.append('actor_id', filterActor);
      if (filterFrom)  p.append('from', filterFrom);
      if (filterTo)    p.append('to', filterTo);
      const { data } = await api.get(`/activity-logs?${p}`);
      setItems(data.data.items || []);
      setTotalPages(data.data.totalPages || 1);
      setTotal(data.data.total || 0);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fmtDt = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')} · ${dt.toLocaleDateString(currentLocale)}`;
  };

  const resetFilters = () => { setFilterType(''); setFilterActor(''); setActorSearchText(''); setFilterFrom(''); setFilterTo(''); setPage(1); };
  const hasFilters = filterType || filterActor || filterFrom || filterTo;

  return (
    <div className="al-root" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff', minWidth: 0 }}>
      <style>{`
        .al-root { box-sizing: border-box; }
        .al-root *, .al-root *::before, .al-root *::after { box-sizing: border-box; }
        .al-root button { -webkit-tap-highlight-color: transparent; touch-action: manipulation; transition: transform .1s ease, background .15s, color .15s, border-color .15s; }
        .al-root button:active { transform: scale(0.96); }
        @media (max-width: 768px) {
          .al-root .al-filterbar { flex-wrap: wrap !important; padding: 10px 14px !important; }
          .al-root .al-filterbar > * { flex: 1 1 140px !important; }
        }
      `}</style>

      {/* Topbar */}
      <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, background: '#fff', flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.dark, flex: 1 }}>📜 {t('activity_log_title', { defaultValue: 'Lịch sử thay đổi' })}</div>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 10, background: '#eef3ff', color: C.primary }}>
          {t('activity_log_total', { count: total, defaultValue: `${total} mục` })}
        </span>
      </div>

      {/* Filter bar */}
      <div className="al-filterbar" style={{ padding: '10px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, background: C.bg, flexShrink: 0 }}>
        <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }}
          style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid #dde3f0', fontSize: 12, color: '#555', outline: 'none', background: '#fff' }}>
          <option value="">{t('activity_log_all_types', { defaultValue: 'Tất cả loại' })}</option>
          {actionTypes.map(type => (
            <option key={type} value={type}>{ACTION_LABELS[type] || type}</option>
          ))}
        </select>
        <input list="activity-log-actor-list" value={actorSearchText}
          placeholder={`🔍 ${t('activity_log_search_person', { defaultValue: 'Gõ tên để tìm...' })}`}
          onChange={e => {
            const val = e.target.value;
            setActorSearchText(val);
            const match = users.find(u => u.full_name === val);
            setFilterActor(match ? match.id : '');
            setPage(1);
          }}
          style={{ padding: '6px 10px', borderRadius: 7, border: `1.5px solid ${filterActor?C.primary:'#dde3f0'}`, fontSize: 12, color: '#555', outline: 'none', background: '#fff', width: 160 }} />
        <datalist id="activity-log-actor-list">
          {[...users].sort((a,b)=>a.full_name.localeCompare(b.full_name,'vi')).map(u => (
            <option key={u.id} value={u.full_name} />
          ))}
        </datalist>
        <input type="date" value={filterFrom} onChange={e => { setFilterFrom(e.target.value); setPage(1); }}
          style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid #dde3f0', fontSize: 12, color: '#555', outline: 'none', background: '#fff' }} />
        <span style={{ fontSize: 12, color: '#aaa' }}>{t('daily_to', { defaultValue: 'đến' })}</span>
        <input type="date" value={filterTo} onChange={e => { setFilterTo(e.target.value); setPage(1); }}
          style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid #dde3f0', fontSize: 12, color: '#555', outline: 'none', background: '#fff' }} />
        {hasFilters && (
          <button onClick={resetFilters} style={{ padding: '6px 12px', borderRadius: 7, border: '1.5px solid #dde3f0', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#888' }}>
            ✕ {t('activity_log_clear_filters', { defaultValue: 'Xóa lọc' })}
          </button>
        )}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 14, background: C.bg }}>
        {loading && <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>⏳</div>}

        {!loading && !items.length && (
          <div style={{ textAlign: 'center', padding: 60, color: '#bbb', fontSize: 13 }}>
            {t('activity_log_empty', { defaultValue: 'Không có hoạt động nào' })}
          </div>
        )}

        {!loading && items.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 900, margin: '0 auto' }}>
            {items.map(item => {
              const meta = ACTION_META[item.action_type] || defaultMeta;
              return (
                <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', background: '#fff', borderRadius: 10, border: `1.5px solid ${C.border}` }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, background: meta.bg }}>
                    {meta.icon}
                  </div>
                  <Chip color={item.actor_color || C.primary} name={item.actor_name || '?'} size={26} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: C.dark, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{item.description}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 8, background: meta.bg, color: meta.color }}>
                        {ACTION_LABELS[item.action_type] || item.action_type}
                      </span>
                      <span style={{ fontSize: 11, color: '#aaa' }}>{fmtDt(item.created_at)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '10px 14px', borderTop: `1px solid ${C.border}`, background: '#fff', flexShrink: 0 }}>
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            style={{ padding: '5px 12px', borderRadius: 7, border: `1.5px solid ${C.border}`, background: '#fff', fontSize: 12, fontWeight: 600, cursor: page === 1 ? 'default' : 'pointer', color: page === 1 ? '#ccc' : '#555' }}>
            ‹ {t('board_prev', { defaultValue: 'Trước' })}
          </button>
          <span style={{ fontSize: 12, color: '#888' }}>{page} / {totalPages}</span>
          <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
            style={{ padding: '5px 12px', borderRadius: 7, border: `1.5px solid ${C.border}`, background: '#fff', fontSize: 12, fontWeight: 600, cursor: page === totalPages ? 'default' : 'pointer', color: page === totalPages ? '#ccc' : '#555' }}>
            {t('board_next', { defaultValue: 'Sau' })} ›
          </button>
        </div>
      )}
    </div>
  );
}