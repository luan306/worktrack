// Hộp thoại xuất báo cáo Excel (theo tuần / tháng / tùy chọn; 1 người, 1 nhóm hoặc tất cả)
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api, { downloadFile } from '../../api/client';
import { C, FONT_SANS, FONT_MONO, addDays, dmy, mondayOf, monthRange, inputStyle } from './shared';
import { Btn, ErrBox } from './ui';

/* ---------------- hộp thoại xuất báo cáo Excel ---------------- */
const ExportOpt = ({ on, onClick, children }) => (
  <button onClick={onClick} className="wl-btn" style={{
    flex: 1, padding: '9px 10px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_SANS, textAlign: 'center',
    border: `1.5px solid ${on ? C.primary : C.line}`, background: on ? C.primarySoft : 'var(--wt-surface)', color: on ? C.primary : C.sub,
  }}>{children}</button>
);

export default function ExportDialog({ onClose, refDate, member, members, viewUserId, defaultWho = 'one', defaultRange = 'week' }) {
  const { t } = useTranslation();
  const monday = mondayOf(refDate);
  const [range, setRange] = useState(defaultRange);
  const [month, setMonth] = useState(refDate.slice(0, 7));
  const [from, setFrom] = useState(monday);
  const [to, setTo] = useState(addDays(monday, 4));
  const [who, setWho] = useState(defaultWho); // one | all | group
  const [groupId, setGroupId] = useState(null);
  const [groups, setGroups] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Nhóm có người mình được xem (Admin/Manager: mọi nhóm; Leader: nhóm của mình)
  useEffect(() => {
    if (members.length < 2) return;
    let alive = true;
    api.get('/groups').then(r => {
      if (!alive) return;
      const ids = new Set(members.map(m => m.id));
      setGroups((r.data.data || []).map(g => ({ id: g.id, name: g.name, icon: g.icon, n: (g.members || []).filter(m => ids.has(m.id)).length })).filter(g => g.n > 0));
    }).catch(() => {});
    return () => { alive = false; };
  }, [members]);
  // chỉ có 1 nhóm và nhóm đó = tất cả người mình xem → nút "Theo nhóm" thừa
  const showGroups = groups.length > 1 || (groups.length === 1 && groups[0].n < members.length);

  const period = range === 'week' ? [monday, addDays(monday, 4)]
    : range === 'month' ? monthRange(`${month}-01`)
    : [from, to];

  const download = async () => {
    if (!period[0] || !period[1] || period[0] > period[1]) return setErr(t('wl_export_bad_range', 'Khoảng ngày không hợp lệ'));
    if (who === 'group' && !groupId) return setErr(t('wl_export_pick_group', 'Chọn nhóm cần xuất'));
    setBusy(true); setErr('');
    try {
      await downloadFile('/worklog/export', {
        params: { from: period[0], to: period[1], user_id: who === 'one' ? viewUserId : 'all', ...(who === 'group' ? { group_id: groupId } : null) },
        fallbackName: `baocao_${period[0]}_${period[1]}.xlsx`,
      });
      onClose();
    } catch (e) {
      setErr(e.response?.data?.message || e.message); // api/client đã đổi thành thông báo dễ hiểu
    } finally { setBusy(false); }
  };

  const label = { fontSize: 11.5, fontWeight: 800, color: C.sub, textTransform: 'uppercase', letterSpacing: .5 };

  return (
    <div onMouseDown={e => e.target === e.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(15,23,41,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="wl-sheet" style={{ width: 'min(440px, 100%)', background: 'var(--wt-surface)', borderRadius: 18, boxShadow: '0 24px 60px rgba(15,23,41,.25)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: C.successSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>📊</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>{t('wl_export_title', 'Xuất báo cáo Excel')}</div>
            <div style={{ fontSize: 11.5, color: C.faint }}>{t('wl_export_sub', 'Tổng hợp + chi tiết từng ngày (T2–T6)')}</div>
          </div>
          <button className="wl-icon-btn" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={label}>{t('wl_export_period', 'Kỳ báo cáo')}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <ExportOpt on={range === 'week'} onClick={() => setRange('week')}>{t('wl_export_week', 'Theo tuần')}</ExportOpt>
              <ExportOpt on={range === 'month'} onClick={() => setRange('month')}>{t('wl_export_month', 'Theo tháng')}</ExportOpt>
              <ExportOpt on={range === 'custom'} onClick={() => setRange('custom')}>{t('wl_export_custom', 'Tùy chọn')}</ExportOpt>
            </div>
            {range === 'month' && <input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} style={inputStyle} />}
            {range === 'custom' && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} />
                <span style={{ color: C.faint }}>→</span>
                <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} />
              </div>
            )}
            <div style={{ fontSize: 12, color: C.sub, fontFamily: FONT_MONO, background: C.board, borderRadius: 9, padding: '7px 10px' }}>
              📅 {period[0] && dmy(period[0])} – {period[1] && dmy(period[1])}
            </div>
          </div>
          {members.length > 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={label}>{t('wl_export_who', 'Xuất cho')}</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <ExportOpt on={who === 'one'} onClick={() => { setWho('one'); setErr(''); }}>👤 {member?.full_name || t('wl_me', 'Của tôi')}</ExportOpt>
                {showGroups && <ExportOpt on={who === 'group'} onClick={() => { setWho('group'); setErr(''); }}>🏭 {t('wl_export_by_group', 'Theo nhóm')}</ExportOpt>}
                <ExportOpt on={who === 'all'} onClick={() => { setWho('all'); setErr(''); }}>👥 {showGroups ? t('wl_export_everyone', 'Tất cả') : t('wl_export_all', 'Cả nhóm')} ({members.length})</ExportOpt>
              </div>
              {who === 'group' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 168, overflowY: 'auto', padding: 8, borderRadius: 10, background: C.board }}>
                  {groups.map(g => {
                    const on = groupId === g.id;
                    return (
                      <button key={g.id} onClick={() => { setGroupId(g.id); setErr(''); }} className="wl-btn" style={{
                        padding: '6px 11px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_SANS,
                        border: `1.5px solid ${on ? C.primary : C.line}`, background: on ? C.primary : 'var(--wt-surface)', color: on ? '#fff' : C.sub,
                      }}>{g.icon ? `${g.icon} ` : ''}{g.name} <span style={{ opacity: .7, fontWeight: 600 }}>({g.n})</span></button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <ErrBox>{err}</ErrBox>
        </div>
        <div style={{ padding: '12px 18px', borderTop: `1px solid ${C.line}`, display: 'flex', justifyContent: 'flex-end', gap: 8, background: C.board }}>
          <Btn onClick={onClose} disabled={busy}>{t('cancel', 'Hủy')}</Btn>
          <Btn kind="primary" onClick={download} disabled={busy}>{busy ? t('wl_exporting', 'Đang xuất...') : `⬇ ${t('wl_export_btn', 'Tải file Excel')}`}</Btn>
        </div>
      </div>
    </div>
  );
}
