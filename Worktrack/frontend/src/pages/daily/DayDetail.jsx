// Panel chi tiết 1 ngày của 1 người BẤT KỲ (dùng ở Bảng tổng hợp và hộp "Chờ chấm"):
// tự tải dữ liệu tuần + lịch sử chấm của ô đang chọn rồi hiện NotePanel đúng kiểu thiết bị.
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { weekdayNames, wdOf } from './shared';
import { DetailDock, ErrBox } from './ui';
import NotePanel from './NotePanel';

/**
 * @param sel         { userId, date } | null — ô đang chọn
 * @param refreshKey  đổi giá trị → tải lại (cha tăng sau mỗi thay đổi / sự kiện realtime)
 * @param onChanged   gọi sau khi ghi việc / chấm điểm / báo nghỉ trong panel
 */
export default function DayDetail({ sel, refreshKey, onChanged, onClose, isMobile, isNarrow, width = 440 }) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState(null); // { key, data, history } | { key, err }
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
  }, [sel, selKey, refreshKey]);

  if (!sel) return null;
  const d = detail?.key === selKey ? detail : null;
  const inner = d?.err ? <div style={{ margin: 18 }}><ErrBox>{d.err}</ErrBox></div>
    : !d?.data ? <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>{[0, 1, 2].map(i => <div key={i} className="wl-skel" style={{ height: i ? 90 : 50, borderRadius: 12 }} />)}</div>
    : (
      <NotePanel key={selKey} day={{ date: sel.date, full: weekdayNames(t).full[wdOf(sel.date)] }} member={d.data.user}
        entries={d.data.entries.filter(e => e.work_date === sel.date)} score={d.data.scores.find(s => s.work_date === sel.date)}
        off={(d.data.offs || []).find(o => o.work_date === sel.date)} data={d.data} history={d.history}
        onChanged={onChanged} onClose={onClose} isMobile={isMobile} isSelf={d.data.can_edit} />
    );
  return <DetailDock isMobile={isMobile} isNarrow={isNarrow} width={width} onClose={onClose}>{inner}</DetailDock>;
}
