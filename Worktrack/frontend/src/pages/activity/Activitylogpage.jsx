import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';

const C = {
  primary: '#3654ff', dark: 'var(--wt-ink)', success: '#17b26a',
  warning: '#f59e0b', danger: '#e5384d', border: 'var(--wt-line)', bg: 'var(--wt-surface-2)',
};

// Icon + màu theo loại hành động — dễ quét mắt khi danh sách dài
const ACTION_META = {
  request_created:          { icon: '➕', color: C.primary, bg: 'var(--wt-tint-primary)' },
  request_deleted:          { icon: '🗑', color: C.danger,  bg: 'var(--wt-tint-danger)' },
  request_assignee_added:   { icon: '👤', color: '#17b26a', bg: 'var(--wt-tint-success)' },
  request_assignee_removed: { icon: '👤', color: C.warning, bg: 'var(--wt-tint-warning)' },
  request_scored:           { icon: '⭐', color: '#8e44ad', bg: 'var(--wt-tint-violet)' },
  request_completed:        { icon: '✅', color: C.success, bg: 'var(--wt-tint-success)' },
  daily_scored:             { icon: '📅', color: '#17b26a', bg: 'var(--wt-tint-success)' },
  daily_score_edited:       { icon: '✏️', color: C.warning, bg: 'var(--wt-tint-warning)' },
  daily_task_created:       { icon: '🆕', color: C.primary, bg: 'var(--wt-tint-primary)' },
  daily_group_created:      { icon: '🏭', color: C.primary, bg: 'var(--wt-tint-primary)' },
  request_updated:          { icon: '📝', color: C.primary, bg: 'var(--wt-tint-primary)' },
  daily_task_updated:       { icon: '✏️', color: C.warning, bg: 'var(--wt-tint-warning)' },
  daily_task_deleted:       { icon: '🗑', color: C.danger,  bg: 'var(--wt-tint-danger)' },
  daily_group_updated:      { icon: '✏️', color: C.warning, bg: 'var(--wt-tint-warning)' },
  daily_group_deleted:      { icon: '🗑', color: C.danger,  bg: 'var(--wt-tint-danger)' },
  score_period_locked:      { icon: '🔒', color: C.danger,  bg: 'var(--wt-tint-danger)' },
  user_created:             { icon: '👤', color: '#17b26a', bg: 'var(--wt-tint-success)' },
  user_updated:             { icon: '👤', color: C.primary, bg: 'var(--wt-tint-primary)' },
  user_role_changed:        { icon: '🛡', color: '#8e44ad', bg: 'var(--wt-tint-violet)' },
  user_locked:              { icon: '🔒', color: C.danger,  bg: 'var(--wt-tint-danger)' },
  user_unlocked:            { icon: '🔓', color: '#17b26a', bg: 'var(--wt-tint-success)' },
  user_deleted:             { icon: '🗑', color: C.danger,  bg: 'var(--wt-tint-danger)' },
  user_imported:            { icon: '📥', color: C.primary, bg: 'var(--wt-tint-primary)' },
  user_password_reset:      { icon: '🔑', color: C.warning, bg: 'var(--wt-tint-warning)' },
  user_password_changed:    { icon: '🔑', color: 'var(--wt-text-3)',    bg: 'var(--wt-surface-3)' },
  group_created:            { icon: '🏭', color: C.primary, bg: 'var(--wt-tint-primary)' },
  group_updated:            { icon: '🏭', color: C.warning, bg: 'var(--wt-tint-warning)' },
  group_deleted:            { icon: '🗑', color: C.danger,  bg: 'var(--wt-tint-danger)' },
  group_member_added:       { icon: '👥', color: '#17b26a', bg: 'var(--wt-tint-success)' },
  group_member_removed:     { icon: '👥', color: C.warning, bg: 'var(--wt-tint-warning)' },
  worklog_scored:           { icon: '🗓', color: '#17b26a', bg: 'var(--wt-tint-success)' },
  worklog_score_edited:     { icon: '✏️', color: C.warning, bg: 'var(--wt-tint-warning)' },
  worklog_day_off:          { icon: '🌴', color: '#0d9488', bg: 'var(--wt-tint-teal)' },
};
const defaultMeta = { icon: '📝', color: 'var(--wt-text-3)', bg: 'var(--wt-surface-3)' };

const ACTION_LABELS = {
  request_created:          'Tạo CV',
  request_deleted:          'Xóa CV',
  request_assignee_added:   'Thêm người',
  request_assignee_removed: 'Xóa người',
  request_scored:           'Chấm điểm CV',
  request_completed:        'Duyệt hoàn thành',
  daily_scored:             'Chấm điểm Daily',
  daily_score_edited:       'Sửa điểm Daily',
  daily_task_created:       'Tạo công việc Daily',
  daily_group_created:      'Tạo nhóm Daily',
  request_updated:          'Sửa CV',
  daily_task_updated:       'Sửa công việc Daily',
  daily_task_deleted:       'Xóa công việc Daily',
  daily_group_updated:      'Sửa nhóm Daily',
  daily_group_deleted:      'Xóa nhóm Daily',
  score_period_locked:      'Chốt kỳ & reset điểm',
  user_created:             'Tạo tài khoản',
  user_updated:             'Sửa tài khoản',
  user_role_changed:        'Đổi vai trò',
  user_locked:              'Khóa tài khoản',
  user_unlocked:            'Mở khóa tài khoản',
  user_deleted:             'Xóa tài khoản',
  user_imported:            'Nhập tài khoản',
  user_password_reset:      'Đặt lại mật khẩu',
  user_password_changed:    'Tự đổi mật khẩu',
  group_created:            'Tạo nhóm',
  group_updated:            'Sửa nhóm',
  group_deleted:            'Xóa nhóm',
  group_member_added:       'Thêm vào nhóm',
  group_member_removed:     'Gỡ khỏi nhóm',
  worklog_scored:           'Chấm điểm công việc hằng ngày',
  worklog_score_edited:     'Sửa điểm công việc hằng ngày',
  worklog_day_off:          'Ngày nghỉ (công việc hằng ngày)',
};

// Thao tác do hệ thống tự chạy (VD: tự động chốt kỳ) không có người thực hiện
const SYSTEM = 'Hệ thống';

const Chip = ({ color = C.primary, name = '?', size = 22 }) => {
  const ini = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: color, color: '#fff', fontSize: size > 24 ? 12 : 9, fontWeight: 700 }}>
      {ini}
    </div>
  );
};

// Xuất CSV cho toàn bộ danh sách ĐANG LỌC (không giới hạn theo trang hiện
// tại) — gọi API riêng với limit cao để lấy hết, không phụ thuộc phân trang
// đang hiển thị trên màn hình.
const exportCsv = async (filters) => {
  const p = new URLSearchParams({ page: 1, limit: 1000 });
  if (filters.type)  p.append('action_type', filters.type);
  if (filters.actor) p.append('actor_id', filters.actor);
  if (filters.from)  p.append('from', filters.from);
  if (filters.to)    p.append('to', filters.to);
  const { data } = await api.get(`/activity-logs?${p}`);
  const items = data.data.items || [];

  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = [
    ['Thời gian', 'Người thực hiện', 'Loại hành động', 'Mô tả'].map(esc).join(','),
    ...items.map(item => [
      new Date(item.created_at).toLocaleString('vi-VN'),
      item.actor_name || SYSTEM,
      ACTION_LABELS[item.action_type] || item.action_type,
      item.description,
    ].map(esc).join(',')),
  ].join('\n');

  const BOM = '\uFEFF';
  const blob = new Blob([BOM + rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lich_su_thay_doi_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
  const [exporting, setExporting] = useState(false);

  const [filterType, setFilterType] = useState('');
  const [filterActor, setFilterActor] = useState('');
  const [actorSearchText, setActorSearchText] = useState('');
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

  const handleExport = async () => {
    setExporting(true);
    try { await exportCsv({ type: filterType, actor: filterActor, from: filterFrom, to: filterTo }); }
    catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setExporting(false); }
  };

  return (
    <div className="al-root" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--wt-surface)', minWidth: 0 }}>
      <style>{`
        .al-root { box-sizing: border-box; }
        .al-root *, .al-root *::before, .al-root *::after { box-sizing: border-box; }
        .al-root button { -webkit-tap-highlight-color: transparent; touch-action: manipulation; transition: transform .1s ease, background .15s, color .15s, border-color .15s; }
        .al-root button:active { transform: scale(0.96); }
        @media (max-width: 768px) {
          .al-root .al-filterbar { flex-wrap: wrap !important; padding: 8px 12px !important; }
          .al-root .al-filterbar > * { flex: 1 1 130px !important; }
        }
      `}</style>

      {/* Topbar */}
      <div style={{ padding: '10px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--wt-surface)', flexShrink: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.dark, flex: 1 }}>📜 {t('activity_log_title', { defaultValue: 'Lịch sử thay đổi' })}</div>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 9, background: 'var(--wt-tint-primary)', color: C.primary }}>
          {t('activity_log_total', { count: total, defaultValue: `${total} mục` })}
        </span>
        <button onClick={handleExport} disabled={exporting || loading}
          style={{ padding: '5px 12px', borderRadius: 7, border: `1.5px solid ${C.border}`, background: exporting ? 'var(--wt-surface-3)' : 'var(--wt-surface)', fontSize: 11, fontWeight: 600, cursor: exporting ? 'default' : 'pointer', color: exporting ? 'var(--wt-text-4)' : 'var(--wt-text-2)', display: 'flex', alignItems: 'center', gap: 5 }}>
          {exporting ? '⏳' : '⬇️'} {t('activity_log_export', { defaultValue: 'Xuất CSV' })}
        </button>
      </div>

      {/* Filter bar */}
      <div className="al-filterbar" style={{ padding: '8px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8, background: C.bg, flexShrink: 0 }}>
        <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }}
          style={{ padding: '5px 9px', borderRadius: 7, border: '1.5px solid var(--wt-line)', fontSize: 11, color: 'var(--wt-text-2)', outline: 'none', background: 'var(--wt-surface)' }}>
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
          style={{ padding: '5px 9px', borderRadius: 7, border: `1.5px solid ${filterActor?C.primary:'var(--wt-line)'}`, fontSize: 11, color: 'var(--wt-text-2)', outline: 'none', background: 'var(--wt-surface)', width: 150 }} />
        <datalist id="activity-log-actor-list">
          {[...users].sort((a,b)=>a.full_name.localeCompare(b.full_name,'vi')).map(u => (
            <option key={u.id} value={u.full_name} />
          ))}
        </datalist>
        <input type="date" value={filterFrom} onChange={e => { setFilterFrom(e.target.value); setPage(1); }}
          style={{ padding: '5px 9px', borderRadius: 7, border: '1.5px solid var(--wt-line)', fontSize: 11, color: 'var(--wt-text-2)', outline: 'none', background: 'var(--wt-surface)' }} />
        <span style={{ fontSize: 11, color: 'var(--wt-text-4)' }}>{t('daily_to', { defaultValue: 'đến' })}</span>
        <input type="date" value={filterTo} onChange={e => { setFilterTo(e.target.value); setPage(1); }}
          style={{ padding: '5px 9px', borderRadius: 7, border: '1.5px solid var(--wt-line)', fontSize: 11, color: 'var(--wt-text-2)', outline: 'none', background: 'var(--wt-surface)' }} />
        {hasFilters && (
          <button onClick={resetFilters} style={{ padding: '5px 10px', borderRadius: 7, border: '1.5px solid var(--wt-line)', background: 'var(--wt-surface)', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: 'var(--wt-text-3)' }}>
            ✕ {t('activity_log_clear_filters', { defaultValue: 'Xóa lọc' })}
          </button>
        )}
      </div>

      {/* List — dạng bảng có ô kẻ lưới như Excel */}
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--wt-surface)' }}>
        {loading && <div style={{ textAlign: 'center', padding: 30, color: 'var(--wt-text-4)', fontSize: 12 }}>⏳</div>}

        {!loading && !items.length && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--wt-text-4)', fontSize: 12 }}>
            {t('activity_log_empty', { defaultValue: 'Không có hoạt động nào' })}
          </div>
        )}

        {!loading && items.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, minWidth: 760 }}>
            <thead>
              <tr>
                {['', t('activity_log_th_time', { defaultValue: 'Thời gian' }), t('activity_log_th_actor', { defaultValue: 'Người thực hiện' }), t('activity_log_th_type', { defaultValue: 'Loại hành động' }), t('activity_log_th_desc', { defaultValue: 'Mô tả' })].map((h,i) => (
                  <th key={i} style={{ position: 'sticky', top: 0, background: C.bg, color: 'var(--wt-text-3)', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px', textAlign: 'left', padding: '6px 10px', border: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const meta = ACTION_META[item.action_type] || defaultMeta;
                return (
                  <tr key={item.id}
                    onMouseEnter={e=>e.currentTarget.style.background=C.bg}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <td style={{ border: `1px solid ${C.border}`, padding: '4px 8px', textAlign: 'center', width: 26 }}>{meta.icon}</td>
                    <td style={{ border: `1px solid ${C.border}`, padding: '4px 10px', color: 'var(--wt-text-3)', whiteSpace: 'nowrap' }}>{fmtDt(item.created_at)}</td>
                    <td style={{ border: `1px solid ${C.border}`, padding: '4px 10px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Chip color={item.actor_color || 'var(--wt-text-3)'} name={item.actor_name || SYSTEM} size={18} />
                        <span style={{ color: C.dark, fontWeight: 600 }}>{item.actor_name || SYSTEM}</span>
                      </div>
                    </td>
                    <td style={{ border: `1px solid ${C.border}`, padding: '4px 10px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 6, background: meta.bg, color: meta.color }}>
                        {ACTION_LABELS[item.action_type] || item.action_type}
                      </span>
                    </td>
                    <td style={{ border: `1px solid ${C.border}`, padding: '4px 10px', color: C.dark }}>{item.description}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '8px 14px', borderTop: `1px solid ${C.border}`, background: 'var(--wt-surface)', flexShrink: 0 }}>
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            style={{ padding: '4px 11px', borderRadius: 7, border: `1.5px solid ${C.border}`, background: 'var(--wt-surface)', fontSize: 11, fontWeight: 600, cursor: page === 1 ? 'default' : 'pointer', color: page === 1 ? 'var(--wt-text-4)' : 'var(--wt-text-2)' }}>
            ‹ {t('board_prev', { defaultValue: 'Trước' })}
          </button>
          <span style={{ fontSize: 11, color: 'var(--wt-text-3)' }}>{page} / {totalPages}</span>
          <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
            style={{ padding: '4px 11px', borderRadius: 7, border: `1.5px solid ${C.border}`, background: 'var(--wt-surface)', fontSize: 11, fontWeight: 600, cursor: page === totalPages ? 'default' : 'pointer', color: page === totalPages ? 'var(--wt-text-4)' : 'var(--wt-text-2)' }}>
            {t('board_next', { defaultValue: 'Sau' })} ›
          </button>
        </div>
      )}
    </div>
  );
}