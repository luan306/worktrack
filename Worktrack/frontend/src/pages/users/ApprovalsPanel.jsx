// Khung "Yêu cầu chờ duyệt" ở đầu Quản lý User:
//  • Leader nhóm được nhờ duyệt: Đồng ý / Từ chối (kèm lý do) — yêu cầu đổi vai trò / khóa / chuyển nhóm từ Leader nhóm khác
//  • Người gửi: xem trạng thái yêu cầu của mình, hủy khi còn chờ
import { useState, useEffect, useCallback, useRef } from 'react';
import api, { clearApiCache } from '../../api/client';
import useNotificationStore from '../../store/notificationStore';

import { notify } from '../../components/AppToast';
const C = {
  ink: 'var(--wt-ink)', sub: 'var(--wt-text-2)', faint: 'var(--wt-text-3)', line: 'var(--wt-line)', lineSoft: 'var(--wt-surface-3)',
  surface: 'var(--wt-surface)', primary: '#3654ff', success: '#17b26a', successSoft: 'var(--wt-tint-success)',
  danger: '#e5384d', dangerSoft: 'var(--wt-tint-danger)', warning: '#f59e0b', warningSoft: 'var(--wt-tint-warning)',
};
const STATUS = {
  pending: ['⏳ Chờ duyệt', C.warning, C.warningSoft], approved: ['✅ Đã đồng ý', C.success, C.successSoft],
  rejected: ['❌ Bị từ chối', C.danger, C.dangerSoft], cancelled: ['↩ Đã hủy', C.faint, C.lineSoft],
};
const fmt = (v) => { if (!v) return ''; const d = new Date(v), p = (n) => String(n).padStart(2, '0'); return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}`; };
const btn = (bg, color, border) => ({ padding: '6px 12px', borderRadius: 8, border: `1.5px solid ${border || bg}`, background: bg, color, fontSize: 12, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' });

export default function ApprovalsPanel({ onChanged, focus, openMine = false }) {
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(0);
  const [rejecting, setRejecting] = useState(null); // id đang nhập lý do từ chối
  const [note, setNote] = useState('');
  const [showMine, setShowMine] = useState(openMine); // vừa gửi yêu cầu → mở sẵn danh sách
  const ref = useRef(null);
  const load = useCallback(async () => {
    try { const { data } = await api.get('/users/approvals', { cache: false }); setList(data.data || []); } catch { /* không có quyền / lỗi mạng → ẩn */ }
  }, []);
  useEffect(() => { load(); }, [load]);
  // có thông báo mới (vd vừa được nhờ duyệt / vừa được đồng ý) → tải lại
  const unread = useNotificationStore(s => s.unreadCount);
  useEffect(() => { load(); }, [unread, load]);
  useEffect(() => { if (focus && list.some(a => a.can_decide)) ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, [focus, list]);

  const toMe = list.filter(a => a.can_decide);
  const mine = list.filter(a => a.mine);
  if (!toMe.length && !mine.length) return null;

  const act = async (a, kind) => {
    setBusy(a.id);
    try {
      await api.post(`/users/approvals/${a.id}/${kind}`, kind === 'reject' ? { note } : {});
      setRejecting(null); setNote(''); clearApiCache(); await load(); onChanged?.();
    } catch (e) { notify(e); await load(); }
    finally { setBusy(0); }
  };
  const minePending = mine.filter(a => a.status === 'pending').length;
  const mineDone = mine.length - minePending;
  const hide = async (a) => {
    setBusy(a ? a.id : -1);
    try { await api.post(a ? `/users/approvals/${a.id}/hide` : '/users/approvals/hide-done'); await load(); }
    catch (e) { notify(e); }
    finally { setBusy(0); }
  };

  return (
    <div ref={ref} style={{ flexShrink: 0, maxHeight: '45vh', overflowY: 'auto', padding: '12px 20px', background: 'var(--wt-canvas)', borderBottom: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {toMe.length > 0 && (
        <div style={{ background: C.surface, border: `1.5px solid ${C.warning}88`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '9px 14px', background: C.warningSoft, fontWeight: 800, fontSize: 13, color: C.ink }}>
            📨 {toMe.length} yêu cầu chờ bạn duyệt <span style={{ fontWeight: 600, fontSize: 11.5, color: C.sub }}>— Leader muốn đổi vai trò / khóa / chuyển nhóm tài khoản</span>
          </div>
          {toMe.map(a => (
            <div key={a.id} style={{ padding: '10px 14px', borderTop: `1px solid ${C.lineSoft}`, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: C.ink }}><b>{a.requester_name}</b> muốn sửa <b>{a.target_name}</b> <span style={{ color: C.faint }}>({a.target_username})</span></div>
                <div style={{ fontSize: 12, color: C.sub, marginTop: 2, overflowWrap: 'anywhere' }}>→ {a.what}</div>
                <div style={{ fontSize: 10.5, color: C.faint, marginTop: 2 }}>gửi lúc {fmt(a.created_at)}<StageLine a={a} /></div>
              </div>
              {rejecting === a.id ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: '1 1 260px' }}>
                  <input autoFocus value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="Lý do từ chối (không bắt buộc)"
                    onKeyDown={e => { if (e.key === 'Enter') act(a, 'reject'); if (e.key === 'Escape') setRejecting(null); }}
                    style={{ flex: 1, padding: '7px 9px', border: `1.5px solid ${C.line}`, borderRadius: 8, fontSize: 12.5, background: C.surface, color: C.ink, outline: 'none', fontFamily: 'inherit' }} />
                  <button disabled={busy === a.id} onClick={() => act(a, 'reject')} style={btn(C.danger, '#fff')}>Từ chối</button>
                  <button onClick={() => setRejecting(null)} style={btn(C.surface, C.sub, C.line)}>Hủy</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button disabled={busy === a.id} onClick={() => act(a, 'approve')} style={btn(C.success, '#fff')}>{busy === a.id ? '⏳' : '✓ Đồng ý'}</button>
                  <button disabled={busy === a.id} onClick={() => { setRejecting(a.id); setNote(''); }} style={btn(C.surface, C.danger, C.danger + '66')}>✕ Từ chối</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {mine.length > 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
          <div onClick={() => setShowMine(v => !v)} style={{ padding: '8px 14px', fontWeight: 800, fontSize: 12.5, color: C.ink, cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center' }}>
            📤 Yêu cầu bạn đã gửi
            {minePending > 0 && <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 8, background: C.warningSoft, color: C.warning }}>{minePending} đang chờ</span>}
            {showMine && mineDone > 1 && (
              <button disabled={busy === -1} onClick={(e) => { e.stopPropagation(); hide(null); }}
                style={{ ...btn(C.surface, C.sub, C.line), marginLeft: 'auto', padding: '3px 10px', fontSize: 11.5 }}>🧹 Xóa {mineDone} yêu cầu đã xử lý</button>
            )}
            <span style={{ marginLeft: showMine && mineDone > 1 ? 0 : 'auto', color: C.faint, fontSize: 11 }}>{showMine ? '▲' : '▼'}</span>
          </div>
          {showMine && mine.map(a => {
            const [label, color, bg] = STATUS[a.status] || STATUS.pending;
            return (
              <div key={a.id} style={{ padding: '8px 14px', borderTop: `1px solid ${C.lineSoft}`, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 8, background: bg, color, whiteSpace: 'nowrap' }}>{label}</span>
                <span style={{ flex: '1 1 200px', color: C.sub, minWidth: 0, overflowWrap: 'anywhere' }}>
                  <b style={{ color: C.ink }}>{a.target_name}</b>{a.what ? ` — ${a.what}` : ''}
                  {a.decided_by_name && <span style={{ color: C.faint }}> · {a.decided_by_name}</span>}
                  {a.decision_note && <span style={{ color: C.faint }}> · “{a.decision_note}”</span>}
                  {a.status === 'pending' && <span style={{ fontSize: 10.5, color: C.faint }}><StageLine a={a} /></span>}
                </span>
                <span style={{ color: C.faint, fontSize: 10.5 }}>{fmt(a.decided_at || a.created_at)}</span>
                {a.status === 'pending'
                  ? <button disabled={busy === a.id} onClick={() => act(a, 'cancel')} style={btn(C.surface, C.sub, C.line)}>Hủy yêu cầu</button>
                  : <button disabled={busy === a.id} onClick={() => hide(a)} title="Xóa khỏi danh sách (nhật ký vẫn giữ)" aria-label="Xóa khỏi danh sách"
                      style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: 'var(--wt-surface-3)', color: C.sub, cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>×</button>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Nhiều bước duyệt (🔀 Quy trình): "Bước 2/2 · chờ Manager — Leader A đã đồng ý"
const KIND = { leader: 'Leader nhóm', manager: 'Manager' };
function StageLine({ a }) {
  if (!a.stages || a.stages.length < 2) return null;
  const done = (a.progress || []).map(p => `${p.name} (${KIND[p.kind] || p.kind}) đã đồng ý`).join(', ');
  return <> · <b style={{ color: '#7c3aed' }}>Bước {a.stage}/{a.stages.length} · chờ {KIND[a.stages[a.stage - 1]] || 'duyệt'}</b>{done ? ` — ${done}` : ''}</>;
}
