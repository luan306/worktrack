// Trang Quản trị — CHỈ Admin
//  • Sửa CV: sửa mọi trường của CV (kể cả trường không hiện trên giao diện thường) — khỏi phải vào server chạy SQL
//  • Phân quyền: chọn vai trò / người → được làm gì, với ai (AccessTab.jsx)
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api, { clearApiCache } from '../../api/client';
import { useReasonDialog } from '../../components/ReasonDialog';
import useAuth from '../../store/authStore';
import AccessTab from './AccessTab';
import WorkflowTab from './WorkflowTab';

import { notify } from '../../components/AppToast';
const C = {
  ink: 'var(--wt-ink)', sub: 'var(--wt-text-2)', faint: 'var(--wt-text-3)', mute: 'var(--wt-text-4)',
  surface: 'var(--wt-surface)', surface2: 'var(--wt-surface-2)', canvas: 'var(--wt-canvas)',
  line: 'var(--wt-line)', lineSoft: 'var(--wt-surface-3)',
  primary: '#3654ff', primaryDeep: '#2440d6', primarySoft: 'var(--wt-tint-primary)',
  success: '#17b26a', successSoft: 'var(--wt-tint-success)',
  warning: '#f59e0b', warningSoft: 'var(--wt-tint-warning)',
  danger: '#e5384d', dangerSoft: 'var(--wt-tint-danger)',
};
const FONT_MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const errMsg = (e) => e.response?.data?.message || e.message;
const TH = { fontSize: 10.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' };
const FL = { fontSize: 10.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4, display: 'block' };
const FI = { width: '100%', padding: '7px 9px', border: `1.5px solid ${C.line}`, borderRadius: 8, fontSize: 12.5, outline: 'none', background: C.surface, color: C.ink, fontFamily: 'inherit', boxSizing: 'border-box' };
const card = { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden', flexShrink: 0 }; // flexShrink 0: không bị co lại cắt nội dung
const btn = (kind = 'ghost') => ({
  padding: '7px 14px', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
  ...(kind === 'primary' ? { border: 'none', background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`, color: '#fff' }
    : kind === 'danger' ? { border: `1.5px solid ${C.danger}55`, background: C.dangerSoft, color: C.danger }
    : { border: `1.5px solid ${C.line}`, background: C.surface, color: C.sub }),
});

const STATUS = { pending: 'Chờ nhận', assigned: 'Đã giao', in_progress: 'Đang làm', scoring: 'Chờ chấm điểm', reviewing: 'Chờ duyệt', done: 'Hoàn thành', cancelled: 'Đã hủy', archived: 'Lưu trữ' };
const PRIORITY = { low: 'Thấp', medium: 'Trung bình', high: 'Cao' };

export default function AdminPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState(() => { try { const v = localStorage.getItem('wt_admin_tab'); return v === 'perms' ? 'access' : v || 'requests'; } catch { return 'requests'; } });
  const go = (k) => { setTab(k); try { localStorage.setItem('wt_admin_tab', k); } catch { /* bỏ qua */ } };
  const TABS = [['requests', '📝', t('admin_tab_requests', 'Sửa CV')], ['access', '🔐', t('admin_tab_perms', 'Phân quyền')], ['flow', '🔀', t('admin_tab_flow', 'Quy trình')], ['notif', '⚙️', t('admin_tab_settings', 'Cài đặt')]];
  return (
    <div className="adm-root" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.canvas, minWidth: 0 }}>
      <style>{`
        .adm-root *, .adm-root *::before, .adm-root *::after { box-sizing: border-box; min-width: 0; }
        .adm-root input:focus, .adm-root select:focus, .adm-root textarea:focus { border-color: ${C.primary} !important; }
        .adm-root .adm-row:hover { background: var(--wt-surface-2); }
        @media (hover: none) and (pointer: coarse) { .adm-root input, .adm-root select, .adm-root textarea { font-size: 16px !important; } }
        @media (max-width: 860px) {
          /* Màn hẹp: danh sách ⇄ chi tiết (chọn CV → form chiếm cả màn, nút "← Danh sách" để quay lại) */
          .adm-root .adm-list { width: 100% !important; border-right: none !important; }
          .adm-root .adm-split.has-sel .adm-list { display: none !important; }
          .adm-root .adm-split:not(.has-sel) .adm-detail { display: none !important; }
          .adm-root .adm-back { display: inline-flex !important; }
          .adm-root .adm-detail { padding: 10px !important; }
          .adm-root .adm-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 520px) { .adm-root .adm-grid { grid-template-columns: 1fr !important; } }
      `}</style>
      <div style={{ padding: '13px 20px', borderBottom: `1px solid ${C.line}`, background: C.surface, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: 'linear-gradient(135deg,#ef4444,#b91c1c)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🛡</span>
        <div style={{ fontSize: 15.5, fontWeight: 800, color: C.ink, flex: 1 }}>{t('nav_admin', 'Quản trị')}</div>
        <span style={{ fontSize: 11, color: C.faint }}>{t('admin_only_hint', 'Chỉ Admin thấy trang này')}</span>
      </div>
      <div style={{ display: 'flex', gap: 4, padding: '0 20px', borderBottom: `1px solid ${C.line}`, background: C.surface, flexShrink: 0, overflowX: 'auto', overflowY: 'hidden' }}>
        {TABS.map(([k, icon, label]) => (
          <div key={k} onClick={() => go(k)} style={{ padding: '11px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', marginBottom: -1, whiteSpace: 'nowrap',
            borderBottom: `2.5px solid ${tab === k ? C.primary : 'transparent'}`, color: tab === k ? C.primary : C.faint }}>{icon} {label}</div>
        ))}
      </div>
      {tab === 'requests' ? <RequestEditor /> : tab === 'notif' ? <NotifTab /> : tab === 'flow' ? <WorkflowTab /> : <AccessTab />}
    </div>
  );
}

// ═══════════════════════════ SỬA CV ═══════════════════════════
function RequestEditor() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [list, setList] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selId, setSelId] = useState(null);
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);

  const search = useCallback(async (qq, st) => {
    setLoadingList(true);
    try { const { data } = await api.get('/admin/requests', { params: { q: qq, status: st || undefined }, cache: false }); setList(data.data || []); }
    catch (e) { notify(e); }
    finally { setLoadingList(false); }
  }, []);
  useEffect(() => { const h = setTimeout(() => search(q, status), 300); return () => clearTimeout(h); }, [q, status, search]);
  useEffect(() => {
    api.get('/users', { cache: false }).then(r => setUsers((r.data.data || []).sort((a, b) => a.full_name.localeCompare(b.full_name)))).catch(() => {});
    api.get('/groups').then(r => setGroups(r.data.data || [])).catch(() => {});
  }, []);

  return (
    <div className={`adm-split${selId ? ' has-sel' : ''}`} style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
      <div className="adm-list" style={{ width: 360, flexShrink: 0, borderRight: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', background: C.surface, minHeight: 0 }}>
        <div style={{ padding: 12, display: 'flex', gap: 8, borderBottom: `1px solid ${C.line}`, flexShrink: 0, flexWrap: 'wrap' }}>
          <input style={{ ...FI, flex: '1 1 160px' }} value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Mã CV (#26) hoặc tên CV" />
          <select style={{ ...FI, flex: '0 1 140px' }} value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Mọi trạng thái</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {loadingList && !list.length && <div style={{ padding: 16, color: C.mute, fontSize: 12 }}>⏳</div>}
          {!loadingList && !list.length && <div style={{ padding: 16, color: C.mute, fontSize: 12 }}>Không tìm thấy CV nào</div>}
          {list.map(r => (
            <div key={r.id} className="adm-row" onClick={() => setSelId(r.id)}
              style={{ padding: '10px 14px', borderBottom: `1px solid ${C.lineSoft}`, cursor: 'pointer', background: selId === r.id ? C.primarySoft : undefined, borderLeft: `3px solid ${selId === r.id ? C.primary : 'transparent'}` }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.primary, fontWeight: 800, flexShrink: 0 }}>#{r.id}</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{r.title}</span>
              </div>
              <div style={{ fontSize: 10.5, color: C.faint, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {STATUS[r.status] || r.status}{r.is_late ? ' · ⚠️ trễ' : ''} · {r.creator_name || '—'}{r.assignee_names ? ` → ${r.assignee_names}` : ''}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="adm-detail" style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: 16 }}>
        {selId && <button className="adm-back" style={{ ...btn(), display: 'none', marginBottom: 10, alignItems: 'center', gap: 6 }} onClick={() => setSelId(null)}>← Danh sách CV</button>}
        {selId ? <RequestForm key={selId} id={selId} users={users} groups={groups} onSaved={() => search(q, status)} />
          : <div style={{ ...card, padding: 24, color: C.faint, fontSize: 13, textAlign: 'center' }}>
              ← Chọn một CV để sửa. Admin sửa được <b>mọi trường</b>: trạng thái, các mốc thời gian, điểm, cờ trễ hạn, người tạo, người thực hiện… <br />
              Mọi thay đổi đều được ghi vào Nhật ký hoạt động.
            </div>}
      </div>
    </div>
  );
}

const sameAssignees = (a, b) => JSON.stringify(a.map(x => [+x.user_id, x.role, x.score === '' || x.score == null ? null : +x.score, !!+x.added_late]))
  === JSON.stringify(b.map(x => [+x.user_id, x.role, x.score === '' || x.score == null ? null : +x.score, !!+x.added_late]));

function RequestForm({ id, users, groups, onSaved }) {
  const multiMain = useAuth(s => !!s.user?.features?.multi_main); // cho phép nhiều người Chính (Admin bật / tắt)
  const [orig, setOrig] = useState(null);
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/admin/requests/${id}`, { cache: false });
      const d = { ...data.data, assignees: data.data.assignees.map(a => ({ ...a, score: a.score == null ? '' : +a.score })) };
      setOrig(d); setF(d);
    } catch (e) { setMsg('❌ ' + errMsg(e)); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  const [reasonDlg, askReason] = useReasonDialog();

  const FIELDS = ['title', 'description', 'tools', 'priority', 'status', 'group_id', 'created_by', 'deadline', 'started_at', 'completed_at', 'score', 'scored_by', 'scored_at', 'is_late', 'hours_spent'];
  const norm = (k, v) => (v === '' || v === undefined ? null : ['group_id', 'created_by', 'scored_by', 'score', 'hours_spent', 'is_late'].includes(k) && v !== null ? +v : v);
  const changed = useMemo(() => (f && orig ? FIELDS.filter(k => norm(k, f[k]) !== norm(k, orig[k])) : []), [f, orig]); // eslint-disable-line react-hooks/exhaustive-deps
  const assigneesChanged = f && orig && !sameAssignees(f.assignees, orig.assignees);
  if (!f) return <div style={{ ...card, padding: 20, color: C.mute }}>{msg || '⏳'}</div>;

  const s = (k, v) => { setF(x => ({ ...x, [k]: v })); setMsg(''); };
  const setA = (i, k, v) => setF(x => ({ ...x, assignees: x.assignees.map((a, j) => (j === i ? { ...a, [k]: v } : a)) }));
  const isDirty = changed.length || assigneesChanged;
  const lateByTime = f.deadline && f.completed_at ? f.completed_at > f.deadline : false;

  const save = async () => {
    if (!isDirty) return;
    const LABEL = { title: 'Tên', description: 'Mô tả', tools: 'Công cụ', priority: 'Ưu tiên', status: 'Trạng thái', group_id: 'Nhóm', created_by: 'Người tạo',
      deadline: 'Hạn chót', started_at: 'Bắt đầu lúc', completed_at: 'Nộp / hoàn thành lúc', score: 'Điểm CV', scored_by: 'Người chấm', scored_at: 'Chấm lúc',
      is_late: 'Trễ hạn', hours_spent: 'Giờ thực hiện' };
    const uName = (v) => users.find(u => +u.id === +v)?.full_name || (v ? `#${v}` : '(trống)');
    const show = (k, v) => {
      if (v === '' || v == null) return k === 'group_id' ? '(không nhóm)' : '(trống)';
      if (k === 'status') return STATUS[v] || v;
      if (k === 'priority') return PRIORITY[v] || v;
      if (k === 'group_id') return groups.find(g => +g.id === +v)?.name || `#${v}`;
      if (['created_by', 'scored_by'].includes(k)) return uName(v);
      if (k === 'is_late') return +v ? 'có' : 'không';
      const t = String(v).replace('T', ' ');
      return t.length > 60 ? t.slice(0, 60) + '…' : t;
    };
    const fmtA = (list) => list.map(a => `${uName(a.user_id)}${a.role === 'support' ? ' (hỗ trợ)' : ''}${a.score !== '' && a.score != null ? ` ${+a.score}đ` : ''}`).join(', ') || '(không ai)';
    const lines = [...changed.map(k => `${LABEL[k] || k}: ${show(k, orig[k])} → ${show(k, f[k])}`),
      ...(assigneesChanged ? [`Người thực hiện: ${fmtA(orig.assignees)} → ${fmtA(f.assignees)}`] : [])];
    const reason = await askReason(`Lưu thay đổi CV #${id}`, lines);
    if (!reason) return;
    setSaving(true); setMsg('');
    try {
      const body = { reason };
      changed.forEach(k => { body[k] = f[k] === '' ? null : f[k]; });
      if (body.is_late !== undefined) body.is_late = !!+f.is_late;
      if (assigneesChanged) body.assignees = f.assignees.map(a => ({ user_id: +a.user_id, role: a.role, score: a.score === '' ? null : +a.score, added_late: !!+a.added_late }));
      const { data } = await api.put(`/admin/requests/${id}`, body);
      const d = { ...data.data, assignees: data.data.assignees.map(a => ({ ...a, score: a.score == null ? '' : +a.score })) };
      setOrig(d); setF(d); clearApiCache();
      setMsg(data.changed ? '✅ Đã lưu — đã ghi vào Nhật ký hoạt động' : 'Không có gì thay đổi');
      onSaved?.();
    } catch (e) { setMsg('❌ ' + errMsg(e)); }
    finally { setSaving(false); }
  };

  const mark = (k) => (changed.includes(k) ? { borderColor: C.warning, background: C.warningSoft } : null);
  const L = ({ k, children }) => <label style={FL}>{children}{changed.includes(k) && <span style={{ color: C.warning }}> ●</span>}</label>;
  const field = (k, label, el) => <div><L k={k}>{label}</L>{el}</div>;
  const dtInput = (k) => <input type="datetime-local" style={{ ...FI, ...mark(k) }} value={f[k] || ''} onChange={e => s(k, e.target.value)} />;
  const userSelect = (k, emptyLabel) => (
    <select style={{ ...FI, ...mark(k) }} value={f[k] ?? ''} onChange={e => s(k, e.target.value === '' ? null : +e.target.value)}>
      <option value="">{emptyLabel}</option>
      {users.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.username}){u.is_active ? '' : ' — đã khóa'}</option>)}
    </select>
  );
  const usedIds = new Set(f.assignees.map(a => +a.user_id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 980 }}>
      {reasonDlg}
      <div style={{ ...card, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', position: 'sticky', top: -16, zIndex: 2 }}>
        <span style={{ fontFamily: FONT_MONO, fontWeight: 800, color: C.primary }}>#{id}</span>
        <span style={{ fontWeight: 800, color: C.ink, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{orig.title}</span>
        {msg && <span style={{ fontSize: 12, color: msg.startsWith('❌') ? C.danger : C.success, fontWeight: 700 }}>{msg}</span>}
        <button style={btn()} disabled={!isDirty || saving} onClick={() => { setF(orig); setMsg(''); }}>↺ Hoàn tác</button>
        <button style={{ ...btn('primary'), opacity: !isDirty || saving ? 0.5 : 1 }} disabled={!isDirty || saving} onClick={save}>
          {saving ? '⏳' : `💾 Lưu${isDirty ? ` (${changed.length + (assigneesChanged ? 1 : 0)})` : ''}`}
        </button>
      </div>

      <Section title="Thông tin">
        {field('title', 'Tên CV', <input style={{ ...FI, ...mark('title') }} value={f.title || ''} maxLength={200} onChange={e => s('title', e.target.value)} />)}
        <div style={{ marginTop: 10 }}>{field('description', 'Mô tả', <textarea style={{ ...FI, ...mark('description'), minHeight: 80, resize: 'vertical' }} value={f.description || ''} onChange={e => s('description', e.target.value)} />)}</div>
        <div style={{ marginTop: 10 }}>{field('tools', 'Công cụ', <input style={{ ...FI, ...mark('tools') }} value={f.tools || ''} onChange={e => s('tools', e.target.value)} />)}</div>
        <div className="adm-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginTop: 10 }}>
          {field('status', 'Trạng thái', <select style={{ ...FI, ...mark('status') }} value={f.status} onChange={e => s('status', e.target.value)}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>)}
          {field('priority', 'Ưu tiên', <select style={{ ...FI, ...mark('priority') }} value={f.priority} onChange={e => s('priority', e.target.value)}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>)}
          {field('group_id', 'Nhóm', <select style={{ ...FI, ...mark('group_id') }} value={f.group_id ?? ''} onChange={e => s('group_id', e.target.value === '' ? null : +e.target.value)}>
            <option value="">(không nhóm)</option>{groups.map(g => <option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}</select>)}
          {field('created_by', 'Người tạo', userSelect('created_by', '(trống)'))}
        </div>
      </Section>

      <Section title="Thời gian & trễ hạn">
        <div className="adm-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {field('deadline', 'Hạn chót', dtInput('deadline'))}
          {field('started_at', 'Bắt đầu lúc', dtInput('started_at'))}
          {field('completed_at', 'Nộp / hoàn thành lúc', dtInput('completed_at'))}
          {field('hours_spent', 'Giờ thực hiện', <input type="number" min="0" step="0.5" style={{ ...FI, ...mark('hours_spent') }} value={f.hours_spent ?? ''} onChange={e => s('hours_spent', e.target.value)} />)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: +f.is_late ? C.danger : C.sub, cursor: 'pointer', ...(changed.includes('is_late') ? { background: C.warningSoft, padding: '4px 8px', borderRadius: 8 } : null) }}>
            <input type="checkbox" checked={!!+f.is_late} onChange={e => s('is_late', e.target.checked ? 1 : 0)} /> Đánh dấu TRỄ HẠN
          </label>
          <button style={btn()} onClick={() => s('is_late', lateByTime ? 1 : 0)} title="Theo hạn chót & giờ nộp đang nhập">
            🧮 Tính lại theo giờ: {f.deadline && f.completed_at ? (lateByTime ? 'trễ' : 'đúng hạn') : 'chưa đủ hạn chót / giờ nộp'}
          </button>
          <span style={{ fontSize: 11, color: C.mute }}>Tạo lúc {(f.created_at || '').replace('T', ' ')} · Sửa lần cuối {(f.updated_at || '').replace('T', ' ')}</span>
        </div>
      </Section>

      <Section title="Điểm">
        <div className="adm-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {field('score', 'Điểm CV (cuối)', <input type="number" min="0" step="0.5" style={{ ...FI, ...mark('score') }} value={f.score ?? ''} onChange={e => s('score', e.target.value)} placeholder="(chưa có)" />)}
          {field('scored_by', 'Người chấm', userSelect('scored_by', '(trống)'))}
          {field('scored_at', 'Chấm lúc', dtInput('scored_at'))}
        </div>
      </Section>

      <Section title={<>Người thực hiện{assigneesChanged && <span style={{ color: C.warning }}> ● đã đổi</span>}</>}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 520 }}>
            <thead><tr>{['Người', 'Vai trò', 'Điểm riêng', 'Thêm sau khi nộp', ''].map(h => <th key={h} style={{ ...TH, textAlign: 'left', padding: '0 6px 6px' }}>{h}</th>)}</tr></thead>
            <tbody>
              {f.assignees.map((a, i) => (
                <tr key={i}>
                  <td style={{ padding: 4 }}>
                    <select style={FI} value={a.user_id} onChange={e => setA(i, 'user_id', +e.target.value)}>
                      {users.filter(u => +u.id === +a.user_id || !usedIds.has(+u.id)).map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.username})</option>)}
                      {!users.some(u => +u.id === +a.user_id) && <option value={a.user_id}>{a.full_name || `#${a.user_id}`}</option>}
                    </select>
                  </td>
                  <td style={{ padding: 4, width: 120 }}>
                    <select style={FI} value={a.role} onChange={e => setA(i, 'role', e.target.value)}><option value="main">⭐ Chính</option><option value="support">🤝 Hỗ trợ</option></select>
                  </td>
                  <td style={{ padding: 4, width: 110 }}><input type="number" min="0" step="0.5" style={FI} value={a.score} placeholder="–" onChange={e => setA(i, 'score', e.target.value)} /></td>
                  <td style={{ padding: 4, width: 130, textAlign: 'center' }}><input type="checkbox" checked={!!+a.added_late} onChange={e => setA(i, 'added_late', e.target.checked ? 1 : 0)} /></td>
                  <td style={{ padding: 4, width: 40 }}><button style={{ ...btn('danger'), padding: '5px 9px' }} title="Bỏ người này" onClick={() => setF(x => ({ ...x, assignees: x.assignees.filter((_, j) => j !== i) }))}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select style={{ ...FI, maxWidth: 320 }} value="" onChange={e => {
            const uid = +e.target.value; if (!uid) return;
            setF(x => ({ ...x, assignees: [...x.assignees, { user_id: uid, role: x.assignees.some(a => a.role === 'main') ? 'support' : 'main', score: '', added_late: 0 }] }));
          }}>
            <option value="">＋ Thêm người thực hiện…</option>
            {users.filter(u => !usedIds.has(+u.id) && u.is_active).map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.username})</option>)}
          </select>
          {!multiMain && f.assignees.filter(a => a.role === 'main').length > 1 && <span style={{ color: C.danger, fontSize: 12, fontWeight: 700 }}>⚠️ Chỉ được 1 người Chính</span>}
        </div>
      </Section>
      <div style={{ fontSize: 11.5, color: C.mute, padding: '0 4px 12px' }}>
        💡 Sửa ở đây ghi thẳng vào dữ liệu, không gửi thông báo cho ai và không đi theo luồng duyệt. Điểm ở kỳ ĐÃ CHỐT không tự đổi theo — chỉ ảnh hưởng kỳ đang mở.
      </div>
    </div>
  );
}

const Section = ({ title, children }) => (
  <div style={card}>
    <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.line}`, fontSize: 12.5, fontWeight: 800, color: C.ink, background: C.surface2 }}>{title}</div>
    <div style={{ padding: 14 }}>{children}</div>
  </div>
);

// ═══════════════════════════ THÔNG BÁO ═══════════════════════════
// Admin bật / tắt từng loại thông báo tự động — áp dụng ngay cho cả hệ thống
function NotifTab() {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState('');
  const [reasonDlg, askReason] = useReasonDialog();
  const load = useCallback(async () => {
    try { const { data } = await api.get('/admin/settings', { cache: false }); setList(data.data); }
    catch (e) { notify(e); }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!list) return <div style={{ padding: 20, color: C.mute }}>⏳</div>;
  const toggle = async (it) => {
    const value = !it.value;
    const reason = await askReason(`${value ? 'BẬT' : 'TẮT'}: ${it.label}`, [`${value ? '● Bật' : '○ Tắt'}: "${it.label}"`, it.desc]);
    if (!reason) return;
    setBusy(it.key);
    try { const { data } = await api.put('/admin/settings', { key: it.key, value, reason }); setList(data.data); clearApiCache(); }
    catch (e) { notify(e); }
    finally { setBusy(''); }
  };
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
      {reasonDlg}
      <div style={card}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.line}`, background: C.surface2 }}>
          <div style={{ fontWeight: 800, color: C.ink, fontSize: 13.5 }}>⚙️ Cài đặt hệ thống</div>
          <div style={{ fontSize: 11.5, color: C.faint, marginTop: 3 }}>Bật / tắt là áp dụng ngay cho cả hệ thống. Các thông báo nhắc việc gửi lúc 8:00 sáng thứ 2–6 (trừ ngày lễ công ty).</div>
        </div>
        {list.map((it, i) => [
          (i === 0 || list[i - 1].group !== it.group) && (
            <div key={'g' + it.key} style={{ padding: '8px 16px 4px', fontSize: 11, fontWeight: 800, color: C.primary, background: C.canvas, borderTop: i ? `1px solid ${C.line}` : 'none' }}>
              {it.group === 'Hồ sơ' ? '👤 ' : it.group === 'Công việc yêu cầu' ? '📋 ' : it.group === 'CV Hằng ngày' ? '📅 ' : it.group === 'Phân quyền mới' ? '🧭 ' : '🔔 '}{it.group}
            </div>
          ),
          <div key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderTop: `1px solid ${C.lineSoft}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>
                {it.label}
                {!it.is_default && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 8, background: C.warningSoft, color: C.warning }}>đã đổi</span>}
              </div>
              <div style={{ fontSize: 11.5, color: C.sub, marginTop: 3, lineHeight: 1.5 }}>{it.desc}</div>
              <div style={{ fontSize: 11, marginTop: 4, fontWeight: 700, color: it.value ? C.success : C.faint }}>{it.value ? '● Đang BẬT' : '○ Đang TẮT'}</div>
            </div>
            <button type="button" role="switch" aria-checked={it.value} disabled={!!busy} onClick={() => toggle(it)} title={it.value ? 'Bấm để tắt' : 'Bấm để bật'}
              style={{ width: 52, height: 28, borderRadius: 28, border: 'none', padding: 3, cursor: busy ? 'wait' : 'pointer', flexShrink: 0,
                background: it.value ? C.success : 'var(--wt-line-strong, #c5cbd8)', display: 'flex', alignItems: 'center', transition: 'background .15s' }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.25)', transform: `translateX(${it.value ? 24 : 0}px)`, transition: 'transform .15s' }} />
            </button>
          </div>,
        ])}
      </div>
    </div>
  );
}
