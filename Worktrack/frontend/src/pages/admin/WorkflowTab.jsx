// Tab "🔀 Quy trình" — Admin xếp các bước bằng giao diện (không phải sửa code)
// Quy trình 1: Chấm CV hằng ngày — Nhân viên ghi việc → Bước 1 chấm → (Bước 2 Manager duyệt) → Xong
import { useState, useEffect, useCallback } from 'react';
import api, { clearApiCache } from '../../api/client';
import { useReasonDialog } from '../../components/ReasonDialog';
import { toast, notify } from '../../components/AppToast';

const C = {
  ink: 'var(--wt-ink)', sub: 'var(--wt-text-2)', faint: 'var(--wt-text-3)', mute: 'var(--wt-text-4)',
  surface: 'var(--wt-surface)', surface2: 'var(--wt-surface-2)', canvas: 'var(--wt-canvas)', line: 'var(--wt-line)',
  primary: '#3654ff', primaryDeep: '#2440d6', primarySoft: 'var(--wt-tint-primary)',
  success: '#17b26a', successSoft: 'var(--wt-tint-success)', warning: '#f59e0b', warningSoft: 'var(--wt-tint-warning)',
  violet: '#7c3aed', violetSoft: 'var(--wt-tint-violet)', teal: '#0ea5a4',
};
const card = { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden', flexShrink: 0 };
const FI = { width: '100%', padding: '8px 10px', border: `1.5px solid ${C.line}`, borderRadius: 8, fontSize: 12.5, outline: 'none', background: C.surface, color: C.ink, fontFamily: 'inherit', boxSizing: 'border-box' };
const btn = (kind) => ({
  padding: '8px 16px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
  ...(kind === 'primary' ? { border: 'none', background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`, color: '#fff' }
    : { border: `1.5px solid ${C.line}`, background: C.surface, color: C.sub }),
});
const same = (a, b) => a && b && ['first', 'review', 'see', 'approve', 'count'].every(k => (a[k] ?? 'scored') === (b[k] ?? 'scored'));
const sameReq = (a, b) => a && b && a.prelim === b.prelim && a.final === b.final;
// Mẫu dựng sẵn — bấm là áp dụng vào bản nháp
const REQ_PRESETS = [
  { key: 'std', icon: '📨', title: 'Như hiện tại', desc: 'Leader chấm sơ bộ → Manager duyệt cuối (CV do Manager tạo bỏ qua chấm sơ bộ)', v: { prelim: 'auto', final: 'manager' } },
  { key: 'full', icon: '2️⃣', title: 'Luôn 2 bước', desc: 'Mọi CV đều qua chấm sơ bộ rồi Manager duyệt', v: { prelim: 'always', final: 'manager' } },
  { key: 'mgr', icon: '🧭', title: 'Chỉ Manager duyệt', desc: 'Người làm nộp thẳng lên Manager', v: { prelim: 'off', final: 'manager' } },
  { key: 'lead', icon: '⭐', title: 'Chỉ chấm sơ bộ', desc: 'Leader / người tạo chấm xong là Hoàn thành — không cần Manager', v: { prelim: 'always', final: 'off' } },
];
const PRESETS = [
  { key: 'one', icon: '1️⃣', title: '1 cấp', desc: 'Leader hoặc Manager chấm — ai trước cũng được', v: { first: 'any', review: false, see: 'always', approve: false, count: 'scored' } },
  { key: 'leader', icon: '⭐', title: 'Chỉ Leader chấm', desc: 'Leader của nhóm chấm; Manager chỉ xem / sửa điểm khi cần', v: { first: 'leader', review: false, see: 'always', approve: false, count: 'scored' } },
  { key: 'two', icon: '2️⃣', title: '2 cấp: Leader → Manager', desc: 'Manager chỉ thấy sau khi Leader chấm', v: { first: 'leader', review: true, see: 'after', approve: false, count: 'scored' } },
  { key: 'approve', icon: '✅', title: '2 cấp + Manager duyệt', desc: 'Leader chấm → Manager bấm Duyệt mới tính điểm; duyệt xong Leader không sửa được', v: { first: 'leader', review: true, see: 'after', approve: true, count: 'reviewed' } },
];

// 1 lựa chọn dạng nút bấm
function Choice({ value, onChange, options }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {options.map(([v, title, desc]) => {
        const on = value === v;
        return (
          <div key={String(v)} onClick={() => onChange(v)} style={{ display: 'flex', gap: 9, padding: '9px 11px', borderRadius: 10, cursor: 'pointer',
            border: `1.5px solid ${on ? C.primary : C.line}`, background: on ? C.primarySoft : C.surface }}>
            <span style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${on ? C.primary : C.mute}`, marginTop: 1, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {on && <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.primary }} />}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: on ? C.primary : C.ink }}>{title}</div>
              {desc && <div style={{ fontSize: 11, color: C.faint, marginTop: 2, lineHeight: 1.45 }}>{desc}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// 1 ô bước trên chuỗi
function Step({ n, icon, title, who, color, off, children }) {
  return (
    <div style={{ flex: '1 1 220px', minWidth: 200, borderRadius: 14, border: `1.5px ${off ? 'dashed' : 'solid'} ${off ? C.line : `${color}66`}`, background: off ? C.surface2 : C.surface, opacity: off ? .75 : 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 8, background: off ? 'transparent' : `${color}10`, borderRadius: '14px 14px 0 0' }}>
        {n && <span style={{ width: 22, height: 22, borderRadius: '50%', background: off ? C.mute : color, color: '#fff', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</span>}
        <span style={{ fontSize: 16 }}>{icon}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: off ? C.faint : C.ink }}>{title}</div>
          {who && <div style={{ fontSize: 11, color: C.faint }}>{who}</div>}
        </div>
      </div>
      {children && <div style={{ padding: 10, flex: 1 }}>{children}</div>}
    </div>
  );
}
const Arrow = () => <div style={{ alignSelf: 'center', color: C.mute, fontSize: 18, fontWeight: 900, flexShrink: 0 }}>→</div>;

export default function WorkflowTab() {
  const [d, setD] = useState(null);
  const [draft, setDraft] = useState(null);
  const [users, setUsers] = useState([]);
  const [pv, setPv] = useState({ uid: '', res: null });
  const [saving, setSaving] = useState(false);
  const [reasonDlg, askReason] = useReasonDialog();
  const load = useCallback(async () => {
    try { const { data } = await api.get('/admin/workflow', { cache: false }); setD(data.data); setDraft(data.data.daily); }
    catch (e) { notify(e); }
  }, []);
  useEffect(() => {
    load();
    api.get('/users', { cache: false }).then(r => setUsers((r.data.data || []).filter(u => u.is_active && ['user', 'assistant', 'leader'].includes(u.role)).sort((a, b) => a.full_name.localeCompare(b.full_name)))).catch(() => {});
  }, [load]);
  // xem thử theo BẢN NHÁP
  useEffect(() => {
    if (!pv.uid || !draft) return undefined;
    let live = true;
    api.post('/admin/workflow/preview', { user_id: pv.uid, daily: draft }).then(r => live && setPv(p => ({ ...p, res: r.data.data }))).catch(() => {});
    return () => { live = false; };
  }, [pv.uid, draft]);
  if (!d || !draft) return <div style={{ padding: 20, color: C.mute }}>⏳</div>;

  // bước 2 bật → bước 1 luôn là Leader
  const set = (patch) => setDraft(x => { const n = { ...x, ...patch }; if (n.review) n.first = 'leader'; if (!n.review) { n.see = 'always'; n.approve = false; } if (!n.approve) n.count = 'scored'; return n; });
  const dirty = !same(draft, d.daily);
  const save = async () => {
    const preset = PRESETS.find(p => same(p.v, draft));
    const reason = await askReason('Đổi quy trình chấm CV hằng ngày', [`Trước: ${d.text}`, `Sau: ${preset ? `mẫu "${preset.title}"` : 'tùy chỉnh'}`]);
    if (!reason) return;
    setSaving(true);
    try {
      const { data } = await api.put('/admin/workflow', { daily: draft, reason });
      setD(x => ({ ...x, ...data.data })); setDraft(data.data.daily); clearApiCache();
      toast({ kind: 'success', title: 'Đã lưu quy trình', note: 'Có hiệu lực ngay — trang CV hằng ngày đang mở sẽ tự cập nhật. Đã ghi vào Nhật ký.' });
    } catch (e) { notify(e); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {reasonDlg}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
        <div style={{ ...card, padding: '12px 16px', background: C.primarySoft, borderColor: 'var(--wt-tint-primary-bd)', fontSize: 12.5, color: C.ink, lineHeight: 1.6 }}>
          <b>Quy trình</b> = công việc đi qua <b>những bước nào, ai làm ở mỗi bước</b>. Chọn 1 mẫu có sẵn hoặc chỉnh từng bước → xem thử với 1 nhân viên → <b>Lưu</b> (nhập lý do).
          <span style={{ color: C.sub }}> Quyền "ai được làm gì" vẫn chỉnh ở tab 🔐 Phân quyền.</span>
        </div>

        <div style={card}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.line}`, background: C.surface2, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: C.ink }}>📅 Chấm CV hằng ngày</div>
              <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>Đang chạy: {d.text}</div>
            </div>
            {!d.meta.saved && <span style={{ fontSize: 11, color: C.faint }}>(đang theo cài đặt cũ — chưa lưu lần nào)</span>}
          </div>

          {/* Mẫu dựng sẵn */}
          <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
            {PRESETS.map(p => {
              const on = same(p.v, draft);
              return (
                <div key={p.key} onClick={() => setDraft(p.v)} style={{ padding: '10px 12px', borderRadius: 12, cursor: 'pointer', border: `1.5px solid ${on ? C.primary : C.line}`, background: on ? C.primarySoft : C.surface }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: on ? C.primary : C.ink }}>{p.icon} {p.title}{same(p.v, d.daily) ? <span style={{ fontSize: 10, color: C.success, marginLeft: 6 }}>● đang chạy</span> : null}</div>
                  <div style={{ fontSize: 11, color: C.faint, marginTop: 3, lineHeight: 1.45 }}>{p.desc}</div>
                </div>
              );
            })}
          </div>

          {/* Chuỗi bước */}
          <div style={{ padding: '0 14px 14px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'stretch' }}>
            <Step icon="📝" title="Nhân viên ghi việc" who="Mỗi người tự ghi" color={C.teal} />
            <Arrow />
            <Step n="1" icon="⭐" title="Chấm điểm" who={draft.first === 'leader' ? 'Leader của nhóm' : 'Leader hoặc Manager'} color={C.violet}>
              <Choice value={draft.first} onChange={v => set({ first: v })} options={[
                ['any', 'Leader hoặc Manager', 'Ai chấm trước cũng được'],
                ['leader', 'Chỉ Leader của nhóm', 'Nhóm không có Leader → Manager chấm thay'],
              ].filter(([v]) => !draft.review || v === 'leader')} />
            </Step>
            <Arrow />
            <Step n="2" icon="🧭" title="Manager duyệt" who={draft.review ? 'Manager' : 'Đang tắt'} color={C.primary} off={!draft.review}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: C.ink, cursor: 'pointer', marginBottom: draft.review ? 10 : 0 }}>
                <input type="checkbox" checked={draft.review} onChange={e => set({ review: e.target.checked })} style={{ width: 16, height: 16 }} />
                Có bước Manager duyệt
              </label>
              {draft.review && <>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', margin: '4px 0 5px' }}>Manager thấy nội dung</div>
                <Choice value={draft.see} onChange={v => set({ see: v })} options={[
                  ['after', 'Chỉ sau khi Leader chấm', 'Trước đó chỉ thấy "⏳ Chờ Leader chấm"'],
                  ['always', 'Luôn thấy', 'Thấy ngay nhưng chưa chấm được'],
                ]} />
                <div style={{ fontSize: 10.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', margin: '10px 0 5px' }}>Manager cần làm</div>
                <Choice value={draft.approve} onChange={v => set({ approve: v })} options={[
                  [false, 'Chỉ xem, sửa điểm khi cần', 'Không cần bấm gì thêm'],
                  [true, 'Bấm "Duyệt" từng ngày', 'Hiện trong hộp "Chờ chấm" của Manager; duyệt xong Leader không sửa được'],
                ]} />
                {draft.approve && <>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', margin: '10px 0 5px' }}>Điểm vào Bảng điều khiển</div>
                  <Choice value={draft.count || 'scored'} onChange={v => set({ count: v })} options={[
                    ['scored', 'Ngay khi Leader chấm', 'Như trước đây'],
                    ['reviewed', 'Sau khi Manager duyệt', 'Điểm chấm trước lúc bật vẫn được tính — không ai mất điểm cũ'],
                  ]} />
                </>}
              </>}
            </Step>
            <Arrow />
            <Step icon="🏁" title="Xong" who="Điểm được tính" color={C.success} />
          </div>

          {d.groups_without_leader.length > 0 && draft.first === 'leader' && (
            <div style={{ margin: '0 14px 14px', padding: '9px 12px', borderRadius: 10, background: C.warningSoft, fontSize: 12, color: C.ink, lineHeight: 1.55 }}>
              ⚠️ {d.groups_without_leader.length} nhóm chưa có Leader: <b>{d.groups_without_leader.map(g => g.name).join(', ')}</b> — người trong các nhóm này sẽ do <b>Manager chấm thẳng</b>.
            </div>
          )}

          {/* Xem thử */}
          <div style={{ margin: '0 14px 14px', padding: 12, borderRadius: 12, border: `1px solid ${C.line}`, background: C.canvas }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: C.ink }}>👁 Xem thử với</span>
              <select style={{ ...FI, maxWidth: 320 }} value={pv.uid} onChange={e => setPv({ uid: e.target.value, res: null })}>
                <option value="">— chọn 1 nhân viên —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}{u.username ? ` · ${u.username}` : ''}</option>)}
              </select>
              {dirty && <span style={{ fontSize: 11, color: C.warning, fontWeight: 700 }}>(theo bản đang chỉnh, chưa lưu)</span>}
            </div>
            {pv.res && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'stretch', marginTop: 10 }}>
                {pv.res.steps.map((s, i) => [
                  i > 0 && <span key={'a' + i} style={{ alignSelf: 'center', color: C.mute, fontWeight: 900 }}>→</span>,
                  <div key={i} style={{ padding: '7px 10px', borderRadius: 10, background: C.surface, border: `1px solid ${C.line}`, maxWidth: 260 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: C.ink }}>{s.what}</div>
                    {s.who && <div style={{ fontSize: 11.5, color: C.primary, fontWeight: 700, marginTop: 2 }}>{s.who}</div>}
                    {s.note && <div style={{ fontSize: 10.5, color: C.faint, marginTop: 2, lineHeight: 1.4 }}>{s.note}</div>}
                  </div>,
                ])}
              </div>
            )}
          </div>
        </div>

        <ReqFlow data={d} onSaved={(x) => setD(v => ({ ...v, ...x }))} askReason={askReason} />
        <AcctFlow data={d} onSaved={(x) => setD(v => ({ ...v, ...x }))} askReason={askReason} />
      </div>

      {dirty && (
        <div style={{ flexShrink: 0, padding: '10px 16px', borderTop: `1px solid ${C.line}`, background: C.surface, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', boxShadow: '0 -6px 20px rgba(15,23,41,.08)' }}>
          <span style={{ flex: 1, fontSize: 13, color: C.ink }}>✏️ Quy trình CV hằng ngày đã chỉnh — chưa lưu</span>
          <button onClick={() => setDraft(d.daily)} disabled={saving} style={btn()}>Bỏ</button>
          <button onClick={save} disabled={saving} style={btn('primary')}>{saving ? '…' : '💾 Lưu quy trình'}</button>
        </div>
      )}
    </div>
  );
}

// Quy trình 2: CV YÊU CẦU — Người làm nộp → (Chấm sơ bộ) → (Manager duyệt cuối) → Hoàn thành
function ReqFlow({ data, onSaved, askReason }) {
  const [draft, setDraft] = useState(data.req);
  const [saving, setSaving] = useState(false);
  // không có Manager duyệt → luôn phải có bước chấm sơ bộ (CV phải có người chấm điểm)
  const set = (patch) => setDraft(x => { const n = { ...x, ...patch }; if (n.final === 'off') n.prelim = 'always'; return n; });
  const dirty = !sameReq(draft, data.req);
  const save = async () => {
    const preset = REQ_PRESETS.find(p => sameReq(p.v, draft));
    const reason = await askReason('Đổi quy trình CV yêu cầu', [`Trước: ${data.req_text}`, `Sau: ${preset ? `mẫu "${preset.title}"` : 'tùy chỉnh'}`]);
    if (!reason) return;
    setSaving(true);
    try {
      const { data: r } = await api.put('/admin/workflow', { req: draft, reason });
      onSaved(r.data); setDraft(r.data.req); clearApiCache();
      toast({ kind: 'success', title: 'Đã lưu quy trình CV yêu cầu', note: 'Có hiệu lực ngay với các lần nộp / chấm tiếp theo. Đã ghi vào Nhật ký.' });
    } catch (e) { notify(e); }
    finally { setSaving(false); }
  };
  const prelimOff = draft.prelim === 'off', finalOff = draft.final === 'off';
  return (
    <div style={card}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.line}`, background: C.surface2 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: C.ink }}>📨 CV yêu cầu</div>
        <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>Đang chạy: {data.req_text}</div>
      </div>
      <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
        {REQ_PRESETS.map(p => {
          const on = sameReq(p.v, draft);
          return (
            <div key={p.key} onClick={() => setDraft(p.v)} style={{ padding: '10px 12px', borderRadius: 12, cursor: 'pointer', border: `1.5px solid ${on ? C.primary : C.line}`, background: on ? C.primarySoft : C.surface }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: on ? C.primary : C.ink }}>{p.icon} {p.title}{sameReq(p.v, data.req) ? <span style={{ fontSize: 10, color: C.success, marginLeft: 6 }}>● đang chạy</span> : null}</div>
              <div style={{ fontSize: 11, color: C.faint, marginTop: 3, lineHeight: 1.45 }}>{p.desc}</div>
            </div>
          );
        })}
      </div>
      <div style={{ padding: '0 14px 14px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'stretch' }}>
        <Step icon="🛠" title="Người làm nộp" who="Bấm Hoàn thành / Nộp" color={C.teal} />
        <Arrow />
        <Step n="1" icon="⭐" title="Chấm sơ bộ" who={prelimOff ? 'Đang tắt' : 'Leader / người tạo CV'} color={C.violet} off={prelimOff}>
          <Choice value={draft.prelim} onChange={v => set({ prelim: v })} options={[
            ['auto', 'Như hiện tại', 'CV do Manager / Admin tạo thì bỏ qua bước này'],
            ['always', 'Mọi CV đều chấm sơ bộ', ''],
            ['off', 'Tắt — nộp thẳng lên Manager', ''],
          ].filter(([v]) => !finalOff || v === 'always')} />
        </Step>
        <Arrow />
        <Step n="2" icon="🧭" title="Manager duyệt cuối" who={finalOff ? 'Đang tắt' : 'Manager'} color={C.primary} off={finalOff}>
          <Choice value={draft.final} onChange={v => set({ final: v })} options={[
            ['manager', 'Manager duyệt + chấm điểm cuối', 'Như hiện tại'],
            ['off', 'Tắt — chấm sơ bộ xong là Hoàn thành', 'Tự bật "Mọi CV đều chấm sơ bộ"'],
          ].filter(([v]) => !prelimOff || v === 'manager')} />
        </Step>
        <Arrow />
        <Step icon="🏁" title="Hoàn thành" who="Điểm được tính" color={C.success} />
      </div>
      <div style={{ margin: '0 14px 14px', fontSize: 11.5, color: C.faint, lineHeight: 1.55 }}>
        💡 Ai được chấm sơ bộ / duyệt cuối vẫn theo tab 🔐 Phân quyền ("Chấm điểm CV (sơ bộ)", "Duyệt hoàn thành"). CV đang dở dang đi theo quy trình mới ở lần bấm tiếp theo.
      </div>
      {dirty && (
        <div style={{ padding: '10px 14px', borderTop: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: C.warningSoft }}>
          <span style={{ flex: 1, fontSize: 13, color: C.ink }}>✏️ Quy trình CV yêu cầu đã chỉnh — chưa lưu</span>
          <button onClick={() => setDraft(data.req)} disabled={saving} style={btn()}>Bỏ</button>
          <button onClick={save} disabled={saving} style={btn('primary')}>{saving ? '…' : '💾 Lưu'}</button>
        </div>
      )}
    </div>
  );
}

// Quy trình 3: DUYỆT THAY ĐỔI TÀI KHOẢN — Leader đổi vai trò / khóa–mở / chuyển nhóm → ai duyệt
const ACCT_PRESETS = [
  { key: 'std', icon: '🤝', title: 'Như hiện tại', desc: 'Sửa người nhóm khác → Leader nhóm đó duyệt', v: { when: 'cross_group', approver: 'group_leader', no_leader: 'block' } },
  { key: 'two', icon: '2️⃣', title: 'Leader nhóm đó → Manager', desc: 'Sửa người nhóm khác → Leader nhóm đó, rồi Manager duyệt', v: { when: 'cross_group', approver: 'leader_then_manager', no_leader: 'manager' } },
  { key: 'mgr', icon: '🧭', title: 'Manager duyệt mọi thay đổi', desc: 'Mọi lần Leader đổi vai trò / khóa / chuyển nhóm → Manager duyệt', v: { when: 'always', approver: 'manager', no_leader: 'manager' } },
  { key: 'none', icon: '⚡', title: 'Không cần duyệt', desc: 'Leader đổi là áp dụng ngay (theo quyền ở tab Phân quyền)', v: { when: 'never', approver: 'group_leader', no_leader: 'block' } },
];
const sameAcct = (a, b) => a && b && a.when === b.when && (a.when === 'never' || (a.approver === b.approver && (a.approver === 'manager' || a.no_leader === b.no_leader)));

function AcctFlow({ data, onSaved, askReason }) {
  const [draft, setDraft] = useState(data.acct);
  const [saving, setSaving] = useState(false);
  const set = (patch) => setDraft(x => ({ ...x, ...patch }));
  const dirty = !sameAcct(draft, data.acct);
  const save = async () => {
    const preset = ACCT_PRESETS.find(p => sameAcct(p.v, draft));
    const reason = await askReason('Đổi quy trình duyệt thay đổi tài khoản', [`Trước: ${data.acct_text}`, `Sau: ${preset ? `mẫu "${preset.title}"` : 'tùy chỉnh'}`]);
    if (!reason) return;
    setSaving(true);
    try {
      const { data: r } = await api.put('/admin/workflow', { acct: draft, reason });
      onSaved(r.data); setDraft(r.data.acct); clearApiCache();
      toast({ kind: 'success', title: 'Đã lưu quy trình duyệt tài khoản', note: 'Áp dụng cho các yêu cầu gửi từ bây giờ (yêu cầu đang chờ giữ nguyên người duyệt). Đã ghi vào Nhật ký.' });
    } catch (e) { notify(e); }
    finally { setSaving(false); }
  };
  const never = draft.when === 'never', mgrOnly = draft.approver === 'manager';
  const leaderOn = !never && !mgrOnly, managerOn = !never && draft.approver !== 'group_leader';
  return (
    <div style={card}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.line}`, background: C.surface2 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: C.ink }}>👤 Duyệt thay đổi tài khoản</div>
        <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>Khi Leader đổi vai trò / khóa – mở khóa / chuyển nhóm. Đang chạy: {data.acct_text}</div>
      </div>
      <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
        {ACCT_PRESETS.map(p => {
          const on = sameAcct(p.v, draft);
          return (
            <div key={p.key} onClick={() => setDraft(p.v)} style={{ padding: '10px 12px', borderRadius: 12, cursor: 'pointer', border: `1.5px solid ${on ? C.primary : C.line}`, background: on ? C.primarySoft : C.surface }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: on ? C.primary : C.ink }}>{p.icon} {p.title}{sameAcct(p.v, data.acct) ? <span style={{ fontSize: 10, color: C.success, marginLeft: 6 }}>● đang chạy</span> : null}</div>
              <div style={{ fontSize: 11, color: C.faint, marginTop: 3, lineHeight: 1.45 }}>{p.desc}</div>
            </div>
          );
        })}
      </div>
      <div style={{ padding: '0 14px 14px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'stretch' }}>
        <Step icon="✏️" title="Leader gửi thay đổi" who="Vai trò / khóa / chuyển nhóm" color={C.teal}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', marginBottom: 5 }}>Khi nào cần duyệt</div>
          <Choice value={draft.when} onChange={v => set({ when: v })} options={[
            ['cross_group', 'Khi sửa người nhóm khác', 'Như hiện tại — người nhóm mình áp dụng ngay'],
            ['always', 'Mọi lần', 'Kể cả người trong nhóm mình'],
            ['never', 'Không cần duyệt', 'Áp dụng ngay'],
          ]} />
        </Step>
        <Arrow />
        <Step n="1" icon="⭐" title="Leader nhóm của người đó" who={leaderOn ? 'Duyệt' : 'Không dùng'} color={C.violet} off={!leaderOn}>
          {!never && <>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', marginBottom: 5 }}>Ai duyệt</div>
            <Choice value={draft.approver} onChange={v => set({ approver: v })} options={[
              ['group_leader', 'Leader nhóm đó', 'Như hiện tại'],
              ['leader_then_manager', 'Leader nhóm đó → rồi Manager', '2 bước'],
              ['manager', 'Chỉ Manager', ''],
            ]} />
            {leaderOn && <>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', margin: '10px 0 5px' }}>Nhóm chưa có Leader</div>
              <Choice value={draft.no_leader} onChange={v => set({ no_leader: v })} options={[
                ['block', 'Không gửi được — nhờ Manager làm', 'Như hiện tại'],
                ['manager', 'Chuyển cho Manager duyệt', ''],
              ]} />
            </>}
          </>}
        </Step>
        <Arrow />
        <Step n={leaderOn ? '2' : '1'} icon="🧭" title="Manager" who={managerOn ? 'Duyệt' : 'Không dùng'} color={C.primary} off={!managerOn} />
        <Arrow />
        <Step icon="🏁" title="Áp dụng" who="Thay đổi có hiệu lực" color={C.success} />
      </div>
      <div style={{ margin: '0 14px 14px', fontSize: 11.5, color: C.faint, lineHeight: 1.55 }}>
        💡 Manager / Admin tự sửa thì không cần duyệt. Ai được sửa tài khoản nào vẫn theo tab 🔐 Phân quyền. Người duyệt thấy yêu cầu ở trang Quản lý User và nhận thông báo.
      </div>
      {dirty && (
        <div style={{ padding: '10px 14px', borderTop: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: C.warningSoft }}>
          <span style={{ flex: 1, fontSize: 13, color: C.ink }}>✏️ Quy trình duyệt tài khoản đã chỉnh — chưa lưu</span>
          <button onClick={() => setDraft(data.acct)} disabled={saving} style={btn()}>Bỏ</button>
          <button onClick={save} disabled={saving} style={btn('primary')}>{saving ? '…' : '💾 Lưu'}</button>
        </div>
      )}
    </div>
  );
}
