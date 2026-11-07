// Tab "🔐 Phân quyền" — chọn AI → chọn được làm GÌ, với AI. Không phải sửa code.
//  • Theo vai trò: đổi cho tất cả Leader / Trợ lý / Nhân viên / Manager
//  • Theo người: cấp / bớt riêng cho 1 người (ưu tiên hơn vai trò)
//  • Gom thay đổi → Lưu 1 lần, bắt buộc nhập lý do (ghi Nhật ký). ↺ = trả về mặc định.
import { useState, useEffect, useCallback, useMemo } from 'react';
import api, { clearApiCache } from '../../api/client';
import { useReasonDialog } from '../../components/ReasonDialog';
import { toast, notify } from '../../components/AppToast';

const C = {
  ink: 'var(--wt-ink)', sub: 'var(--wt-text-2)', faint: 'var(--wt-text-3)', mute: 'var(--wt-text-4)',
  surface: 'var(--wt-surface)', surface2: 'var(--wt-surface-2)', canvas: 'var(--wt-canvas)', line: 'var(--wt-line)', lineSoft: 'var(--wt-surface-3)',
  primary: '#3654ff', primaryDeep: '#2440d6', primarySoft: 'var(--wt-tint-primary)',
  success: '#17b26a', successSoft: 'var(--wt-tint-success)', warning: '#f59e0b', warningSoft: 'var(--wt-tint-warning)',
  danger: '#e5384d', dangerSoft: 'var(--wt-tint-danger)', violet: '#7c3aed', violetSoft: 'var(--wt-tint-violet)',
};
const card = { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden', flexShrink: 0 };
const FI = { width: '100%', padding: '8px 10px', border: `1.5px solid ${C.line}`, borderRadius: 8, fontSize: 12.5, outline: 'none', background: C.surface, color: C.ink, fontFamily: 'inherit', boxSizing: 'border-box' };
const FL = { fontSize: 10.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4, display: 'block' };
const btn = (kind) => ({
  padding: '8px 16px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
  ...(kind === 'primary' ? { border: 'none', background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`, color: '#fff' }
    : { border: `1.5px solid ${C.line}`, background: C.surface, color: C.sub }),
});
const ROLE_ICON = { manager: '🧭', leader: '⭐', assistant: '🤝', user: '👤' };
// màu ô chọn theo mức: không được → xám, rộng nhất → xanh lá
const levelColor = (opts, v) => {
  const i = opts.findIndex(o => o[0] === v);
  if (v === '' || i < 0) return C.mute;
  return i === opts.length - 1 ? C.success : C.primary;
};

export default function AccessTab() {
  const [d, setD] = useState(null);
  const [users, setUsers] = useState([]);
  const [mode, setMode] = useState(() => { try { return localStorage.getItem('wt_access_mode') || 'role'; } catch { return 'role'; } });
  const [role, setRole] = useState('leader');
  const [uid, setUid] = useState('');
  const [uData, setUData] = useState(null);
  const [pending, setPending] = useState({}); // `${type}|${subject}|${action}` → value | null
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [reasonDlg, askReason] = useReasonDialog();

  const load = useCallback(async () => {
    try { const { data } = await api.get('/admin/access', { cache: false }); setD(data.data); }
    catch (e) { notify(e); }
  }, []);
  const loadUser = useCallback(async (id) => {
    if (!id) { setUData(null); return; }
    try { const { data } = await api.get(`/admin/access/user/${id}`, { cache: false }); setUData(data.data); }
    catch (e) { notify(e); }
  }, []);
  useEffect(() => {
    load();
    api.get('/users', { cache: false }).then(r => setUsers((r.data.data || []).filter(u => u.is_active && u.role !== 'admin').sort((a, b) => a.full_name.localeCompare(b.full_name)))).catch(() => {});
  }, [load]);
  useEffect(() => { loadUser(uid); }, [uid, loadUser]);
  const pickMode = (m) => { setMode(m); try { localStorage.setItem('wt_access_mode', m); } catch { /* bỏ qua */ } };

  const actions = useMemo(() => (d?.modules || []).flatMap(m => m.actions), [d]);
  const byKey = useMemo(() => new Map(actions.map(a => [a.key, a])), [actions]);
  if (!d) return <div style={{ padding: 20, color: C.mute }}>⏳</div>;

  const roleName = Object.fromEntries(d.roles);
  const subject = mode === 'role' ? role : uid;
  const type = mode === 'role' ? 'role' : 'user';
  const pk = (action) => `${type}|${subject}|${action}`;
  const optsOf = (a) => d.opts[a.opts];
  const labelOf = (a, v) => (optsOf(a).find(o => o[0] === v) || [v, v || 'Không được'])[1];

  // giá trị đang hiện + mặc định để so (vai trò: mặc định hệ thống; người: giá trị của vai trò)
  const rowState = (a) => {
    if (mode === 'role') {
      const r = a.roles[role];
      const saved = r.value, base = r.base, has = pk(a.key) in pending;
      const v = has ? (pending[pk(a.key)] ?? base) : saved;
      return { v, base, tuned: has ? pending[pk(a.key)] !== null && pending[pk(a.key)] !== base : r.tuned, dirty: has, baseLabel: 'mặc định' };
    }
    const r = uData?.values?.[a.key];
    if (!r) return null;
    const has = pk(a.key) in pending;
    const v = has ? (pending[pk(a.key)] ?? r.role_value) : r.value;
    return { v, base: r.role_value, tuned: has ? pending[pk(a.key)] !== null && pending[pk(a.key)] !== r.role_value : r.tuned, dirty: has, baseLabel: `theo vai trò ${roleName[uData.user.role]}` };
  };
  const change = (a, v) => setPending(p => ({ ...p, [pk(a.key)]: v }));
  const reset = (a) => setPending(p => ({ ...p, [pk(a.key)]: null }));
  const pendingList = Object.entries(pending).map(([k, value]) => { const [t, s, action] = k.split('|'); return { type: t, subject: s, action, value }; });

  const save = async () => {
    const userName = (id) => users.find(u => String(u.id) === String(id))?.full_name || `#${id}`;
    const lines = pendingList.map(c => {
      const a = byKey.get(c.action);
      const who = c.type === 'role' ? `Vai trò ${roleName[c.subject]}` : userName(c.subject);
      return `${who} · ${a.label}: ${c.value === null ? '↺ về mặc định' : labelOf(a, c.value)}`;
    });
    const reason = await askReason(`Lưu ${pendingList.length} thay đổi phân quyền`, lines);
    if (!reason) return;
    setSaving(true);
    try {
      const { data } = await api.put('/admin/access', { changes: pendingList, reason });
      setD(x => ({ ...x, ...data.data })); setPending({}); clearApiCache();
      if (uid) loadUser(uid);
      toast({ kind: 'success', title: 'Đã lưu phân quyền', note: `${pendingList.length} thay đổi có hiệu lực ngay — đã ghi vào Nhật ký hoạt động.` });
    } catch (e) { notify(e); }
    finally { setSaving(false); }
  };

  const ql = q.trim().toLowerCase();
  const tunedCount = (m) => m.actions.filter(a => rowState(a)?.tuned).length;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {reasonDlg}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
        {/* Hướng dẫn 3 bước */}
        <div style={{ ...card, padding: '12px 16px', display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', background: C.primarySoft, borderColor: 'var(--wt-tint-primary-bd)' }}>
          {[['1', 'Chọn', 'Theo vai trò hoặc Theo người'], ['2', 'Đổi ô chọn', 'bên cạnh việc muốn cấp / bớt'], ['3', 'Bấm Lưu', 'nhập lý do → có hiệu lực ngay']].map(([n, t1, t2]) => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 9, flex: '1 1 200px' }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', background: C.primary, color: '#fff', fontWeight: 900, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</span>
              <span style={{ fontSize: 12.5, color: C.ink }}><b>{t1}</b> <span style={{ color: C.sub }}>{t2}</span></span>
            </div>
          ))}
        </div>

        {/* Chọn ai */}
        <div style={card}>
          <div style={{ display: 'flex', borderBottom: `1px solid ${C.line}` }}>
            {[['role', '👥 Theo vai trò', 'Áp dụng cho mọi người cùng vai trò'], ['user', '👤 Theo người', 'Cấp / bớt riêng cho 1 người']].map(([k, t1, t2]) => (
              <div key={k} onClick={() => pickMode(k)} style={{ flex: 1, padding: '12px 16px', cursor: 'pointer', borderBottom: `3px solid ${mode === k ? C.primary : 'transparent'}`, background: mode === k ? C.surface : C.surface2 }}>
                <div style={{ fontWeight: 800, fontSize: 13.5, color: mode === k ? C.primary : C.sub }}>{t1}</div>
                <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>{t2}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {mode === 'role' ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
                {d.roles.map(([r, n]) => (
                  <button key={r} onClick={() => setRole(r)} style={{ ...btn(), padding: '9px 16px', fontSize: 13, ...(role === r ? { border: `1.5px solid ${C.primary}`, background: C.primarySoft, color: C.primary } : {}) }}>
                    {ROLE_ICON[r]} {n}
                  </button>
                ))}
                <span style={{ alignSelf: 'center', fontSize: 11, color: C.mute }}>· Admin luôn có toàn quyền</span>
              </div>
            ) : (
              <div style={{ flex: '1 1 320px' }}>
                <label style={FL}>Người cần phân quyền</label>
                <select style={{ ...FI, fontSize: 13.5, padding: '9px 11px' }} value={uid} onChange={e => setUid(e.target.value)}>
                  <option value="">— chọn người —</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name} · {roleName[u.role] || u.role}{u.username ? ` · ${u.username}` : ''}</option>)}
                </select>
              </div>
            )}
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Tìm việc…" style={{ ...FI, maxWidth: 220 }} />
          </div>
          {mode === 'user' && uData?.user && (
            <div style={{ padding: '0 14px 12px', fontSize: 12, color: C.sub }}>
              Đang xem quyền của <b>{uData.user.full_name}</b> ({roleName[uData.user.role]}). Ô nào chưa chỉnh riêng thì đi theo vai trò {roleName[uData.user.role]}.
            </div>
          )}
        </div>

        {/* Danh sách việc */}
        {mode === 'user' && !uid ? (
          <div style={{ ...card, padding: 30, textAlign: 'center', color: C.faint, fontSize: 13 }}>👆 Chọn 1 người để xem và chỉnh quyền của người đó</div>
        ) : mode === 'user' && !uData ? <div style={{ padding: 20, color: C.mute }}>⏳</div> : d.modules.map(m => {
          const acts = m.actions.filter(a => !ql || a.label.toLowerCase().includes(ql));
          if (!acts.length) return null;
          const n = tunedCount(m);
          return (
            <div key={m.key} style={card}>
              <div style={{ padding: '10px 16px', background: C.surface2, borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 800, fontSize: 13.5, color: C.ink, flex: 1 }}>{m.label}</span>
                {n > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: C.violet, background: C.violetSoft, padding: '2px 9px', borderRadius: 20 }}>● {n} mục đã chỉnh</span>}
              </div>
              {acts.map(a => {
                const st = rowState(a);
                if (!st) return null;
                const opts = optsOf(a), col = levelColor(opts, st.v);
                const list = opts.some(o => o[0] === st.v) ? opts : [...opts, [st.v, labelOf(a, st.v)]];
                return (
                  <div key={a.key} className="adm-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderTop: `1px solid ${C.lineSoft}`, flexWrap: 'wrap', background: st.dirty ? 'var(--wt-tint-warning)' : undefined }}>
                    <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{a.label}</div>
                      {(a.hint || a.guard) && <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>{a.guard ? `🔒 ${a.guard}` : ''}{a.guard && a.hint ? ' · ' : ''}{a.hint || ''}</div>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {st.tuned
                        ? <span title={`Khác ${st.baseLabel}: ${labelOf(a, st.base)}`} style={{ fontSize: 10.5, fontWeight: 800, color: C.violet, whiteSpace: 'nowrap' }}>● {mode === 'role' ? 'đã chỉnh' : 'chỉnh riêng'}</span>
                        : <span style={{ fontSize: 10.5, color: C.mute, whiteSpace: 'nowrap' }}>{st.baseLabel}</span>}
                      <select value={st.v} onChange={e => change(a, e.target.value)}
                        style={{ ...FI, width: 210, fontWeight: 700, color: col, borderColor: st.tuned ? C.violet : `${col}66` }}>
                        {list.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <button onClick={() => reset(a)} disabled={!st.tuned} title={`Trả về ${st.baseLabel}: ${labelOf(a, st.base)}`}
                        style={{ width: 30, height: 30, borderRadius: 8, border: `1.5px solid ${C.line}`, background: C.surface, cursor: st.tuned ? 'pointer' : 'default', opacity: st.tuned ? 1 : .3, color: C.sub, fontSize: 14 }}>↺</button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        <Checker users={users} actions={actions} />

        <div style={card}>
          <div style={{ padding: '10px 16px', background: C.surface2, borderBottom: `1px solid ${C.line}`, fontWeight: 800, fontSize: 13, color: C.ink }}>🔒 Luôn giữ cứng — không chỉnh được</div>
          <ul style={{ margin: 0, padding: '10px 16px 12px 34px', fontSize: 12.5, color: C.sub, lineHeight: 1.8 }}>{d.guards.map(g => <li key={g}>{g}</li>)}</ul>
          <div style={{ padding: '0 16px 12px', fontSize: 11, color: C.mute }}>
            Đối chiếu ngầm với hệ thống cũ: {d.shadow.enabled ? `${d.shadow.compared.toLocaleString('vi-VN')} lần, ${d.shadow.mismatched} lần khác nhau` : 'đang tắt'} · {d.tuned} mục đang chỉnh khác mặc định
          </div>
        </div>
      </div>

      {/* Thanh lưu */}
      {pendingList.length > 0 && (
        <div style={{ flexShrink: 0, padding: '10px 16px', borderTop: `1px solid ${C.line}`, background: C.surface, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', boxShadow: '0 -6px 20px rgba(15,23,41,.08)' }}>
          <span style={{ flex: 1, fontSize: 13, color: C.ink }}>✏️ <b>{pendingList.length}</b> thay đổi chưa lưu</span>
          <button onClick={() => setPending({})} disabled={saving} style={btn()}>Bỏ</button>
          <button onClick={save} disabled={saving} style={btn('primary')}>{saving ? '…' : '💾 Lưu thay đổi'}</button>
        </div>
      )}
    </div>
  );
}

// "Kiểm tra quyền": ai đó báo không làm được → chọn người + việc (+ với ai) → được / không và vì sao
function Checker({ users, actions }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ user_id: '', action: 'wl.score', target_user_id: '' });
  const [r, setR] = useState(null);
  const [busy, setBusy] = useState(false);
  const act = actions.find(a => a.key === f.action);
  const needTarget = act && ['view', 'people'].includes(act.opts);
  const set = (k, v) => { setF(x => ({ ...x, [k]: v })); setR(null); };
  const run = async () => {
    setBusy(true); setR(null);
    try { const { data } = await api.post('/admin/access/check', { ...f, target_user_id: needTarget ? f.target_user_id || undefined : undefined }); setR(data.data); }
    catch (e) { notify(e); }
    finally { setBusy(false); }
  };
  return (
    <div style={card}>
      <div onClick={() => setOpen(o => !o)} style={{ padding: '11px 16px', background: C.surface2, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: C.ink }}>🔍 Kiểm tra quyền</div>
          <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>Ai đó báo "tôi không làm được"? Chọn người + việc → xem được hay không và vì sao.</div>
        </div>
        <span style={{ color: C.faint }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && <>
        <div style={{ padding: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <UserSel users={users} value={f.user_id} onChange={v => set('user_id', v)} label="Người" />
          <div style={{ flex: '1 1 240px' }}><label style={FL}>Muốn làm</label>
            <select style={FI} value={f.action} onChange={e => set('action', e.target.value)}>
              {actions.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
          </div>
          {needTarget && <UserSel users={users} value={f.target_user_id} onChange={v => set('target_user_id', v)} label="Với ai" />}
          <button onClick={run} disabled={!f.user_id || busy} style={{ ...btn('primary'), opacity: f.user_id ? 1 : .5 }}>{busy ? '…' : 'Kiểm tra'}</button>
        </div>
        {r && (
          <div style={{ margin: '0 14px 14px', padding: '12px 14px', borderRadius: 12, background: r.ok ? C.successSoft : C.dangerSoft, border: `1px solid ${r.ok ? C.success : C.danger}44` }}>
            <div style={{ fontWeight: 900, fontSize: 14, color: r.ok ? C.success : C.danger }}>{r.ok ? '✅ Được' : '❌ Không được'}</div>
            <div style={{ fontSize: 12.5, color: C.ink, marginTop: 4 }}>{r.reason}</div>
            {r.scope?.src && <div style={{ fontSize: 11.5, color: C.sub, marginTop: 4 }}>Nguồn: {r.scope.src}</div>}
            {r.legacy !== null && r.legacy !== undefined && <div style={{ fontSize: 11.5, marginTop: 6, fontWeight: 700, color: r.same ? C.success : C.danger }}>Hệ thống cũ: {r.legacy ? 'được' : 'không được'} — {r.same ? '✔ trùng khớp' : '✘ KHÁC'}</div>}
          </div>
        )}
      </>}
    </div>
  );
}

const UserSel = ({ users, value, onChange, label }) => (
  <div style={{ flex: '1 1 200px' }}><label style={FL}>{label}</label>
    <select style={FI} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">— chọn người —</option>
      {users.map(u => <option key={u.id} value={u.id}>{u.full_name} · {u.role}</option>)}
    </select>
  </div>
);
