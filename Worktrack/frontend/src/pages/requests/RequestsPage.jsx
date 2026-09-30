import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api, { clearApiCache } from '../../api/client';
import useAuth from '../../store/authStore';
import { getSocket, onRealtime } from '../../lib/socket';
import { useNow } from '../../lib/useNow';

const C = {
  primary:'#3a7bd5', dark:'var(--wt-ink)', success:'#27ae60',
  warning:'#e67e22', danger:'#e74c3c', border:'var(--wt-line)', bg:'var(--wt-surface-2)',
};

const STATUS = {
  pending:     { key:'req_status_pending',     color:'var(--wt-text-3)',    bg:'var(--wt-surface-2)',  icon:'⏳' },
  assigned:    { key:'req_status_pending',     color:'var(--wt-text-3)',    bg:'var(--wt-surface-2)',  icon:'⏳' },
  in_progress: { key:'req_status_in_progress', color:C.warning, bg:'var(--wt-tint-warning)',  icon:'🔄' },
  scoring:     { key:'req_status_scoring',     color:'#8e44ad', bg:'var(--wt-tint-violet)',  icon:'🏆' },
  reviewing:   { key:'req_status_reviewing',   color:C.primary, bg:'var(--wt-tint-primary)',  icon:'📋' },
  done:        { key:'req_status_done',        color:C.success, bg:'var(--wt-tint-success)',  icon:'✅' },
  cancelled:   { key:'req_status_cancelled',   color:C.danger,  bg:'var(--wt-tint-danger)',  icon:'❌' },
};

const PRIORITY = {
  high:   { key:'req_priority_high',   color:C.danger,  bg:'var(--wt-tint-danger)', icon:'🔴' },
  medium: { key:'req_priority_medium', color:C.warning, bg:'var(--wt-tint-warning)', icon:'🟡' },
  low:    { key:'req_priority_low',    color:C.success, bg:'var(--wt-tint-success)', icon:'🟢' },
};

const STEPS = [
  { key:'in_progress', tkey:'req_step_in_progress' },
  { key:'scoring',     tkey:'req_step_scoring' },
  { key:'reviewing',   tkey:'req_step_reviewing' },
  { key:'done',        tkey:'req_step_done' },
];

// Icon + màu cho từng loại hành động trong Timeline "Tiến trình" — cùng bộ
// action_type với trang Lịch sử thay đổi (/activity-log), chỉ khác là ở đây
// lọc riêng theo 1 CV và không giới hạn admin/manager.
const ACTIVITY_META = {
  request_created:          { icon:'➕', color:C.primary, bg:'var(--wt-tint-primary)' },
  request_assignee_added:   { icon:'🙋', color:'#27ae60', bg:'var(--wt-tint-success)' },
  request_assignee_removed: { icon:'↩️', color:C.warning, bg:'var(--wt-tint-warning)' },
  request_scored:           { icon:'⭐', color:'#8e44ad', bg:'var(--wt-tint-violet)' },
  request_completed:        { icon:'✅', color:C.success, bg:'var(--wt-tint-success)' },
};
const ACTIVITY_DEFAULT_META = { icon:'📝', color:'var(--wt-text-3)', bg:'var(--wt-surface-3)' };

const FI = { width:'100%', padding:'8px 12px', border:'1.5px solid var(--wt-line)', borderRadius:8, fontSize:13, color:C.dark, outline:'none', boxSizing:'border-box', background:'var(--wt-surface)' };
const FL = { display:'block', fontSize:11, fontWeight:700, color:'var(--wt-text-3)', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:5 };

const Chip = ({color=C.primary,name='?',size=28})=>{
  const ini=(name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  return <div style={{width:size,height:size,borderRadius:'50%',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',background:color,color:'#fff',fontSize:size>24?12:9,fontWeight:700}}>{ini}</div>;
};

// Badge nhỏ hiển thị vai trò Chính/Hỗ trợ trên chip người thực hiện.
// clickable=true khi cho phép bấm để đổi vai trò tại chỗ.
const RoleBadge = ({role, clickable, onClick}) => {
  const isSupport = role==='support';
  return (
    <span onClick={clickable?onClick:undefined}
      title={clickable ? 'Bấm để đổi vai trò' : undefined}
      style={{fontSize:9,fontWeight:700,padding:'1px 6px',borderRadius:6,marginLeft:2,
        background:isSupport?'var(--wt-tint-warning)':'var(--wt-tint-primary)',color:isSupport?C.warning:C.primary,
        cursor:clickable?'pointer':'default',whiteSpace:'nowrap',flexShrink:0}}>
      {isSupport?'🤝 Hỗ trợ':'⭐ Chính'}
    </span>
  );
};

const LOCALE_MAP = { vi:'vi-VN', en:'en-US', ja:'ja-JP' };
const makeFmtDt = locale => d => {
  if (!d) return '—';
  const dt = new Date(d);
  return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')} · ${dt.toLocaleDateString(locale)}`;
};

// Đếm ngược deadline
function Countdown({deadline, status}) {
  const { t } = useTranslation();
  const ended = ['done','cancelled','archived'].includes(status);
  // Còn > 1 ngày chỉ hiện ngày/giờ/phút → cập nhật mỗi 30s là đủ
  const now = useNow(n => (new Date(deadline) - n > 86400000 ? 30000 : 1000), !ended);
  const diff = new Date(deadline) - now;
  if (ended) return null;
  if (diff<=0) return <span style={{fontSize:11,fontWeight:700,color:C.danger,background:'var(--wt-tint-danger)',padding:'3px 8px',borderRadius:6}}>⚠ {t('late')}</span>;
  const d=Math.floor(diff/86400000), h=Math.floor(diff%86400000/3600000), m=Math.floor(diff%3600000/60000), s=Math.floor(diff%60000/1000);
  const color=diff<3600000?C.danger:diff<86400000?C.warning:C.success;
  const bg   =diff<3600000?'var(--wt-tint-danger)':diff<86400000?'var(--wt-tint-warning)':'var(--wt-tint-success)';
  const label=d>0?t('req_countdown_dhm',{d,h,m}):`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return <span style={{fontSize:11,fontWeight:700,color,background:bg,padding:'3px 8px',borderRadius:6}}>⏱ {label}</span>;
}

// Giờ công tự động: đếm lên liên tục kể từ started_at trong lúc đang làm,
// và đứng yên = khoảng thời gian thực (started_at → completed_at) khi task đã "done".
// ⚠️ Khi vượt quá 24h thì tính thành "X ngày Y giờ Z phút" — cứ đủ 24h thì
// ghi nhận 1 ngày rồi tiếp tục đếm phần lẻ còn lại, thay vì hiện 1 con số
// giờ dồn rất dài (VD: "26h 30p" → "1 ngày 2h 30p").
function WorkDuration({startedAt, completedAt, status}) {
  const { t } = useTranslation();
  const finished = status==='done' && !!completedAt;
  const now = useNow(1000, !!startedAt && !finished);

  if (!startedAt) return <span style={{fontSize:12,color:'var(--wt-text-4)'}}>{t('req_not_started')}</span>;

  const endMs = finished ? new Date(completedAt).getTime() : now;
  const ms = Math.max(0, endMs - new Date(startedAt).getTime());
  const totalMin = Math.floor(ms/60000);
  const days = Math.floor(totalMin/1440);           // đủ 24h (1440 phút) = 1 ngày
  const h    = Math.floor((totalMin%1440)/60);       // giờ lẻ còn lại trong ngày hiện tại
  const m    = totalMin%60;
  const s    = Math.floor((ms%60000)/1000);

  if (finished) {
    const label = days>0
      ? t('req_hours_worked_total_days', { defaultValue:`{{d}} ngày {{h}}h {{m}}p`, d:days, h, m })
      : t('req_hours_worked_total', { defaultValue:`{{h}}h {{m}}p`, h, m });
    return <span style={{fontSize:13,fontWeight:700,color:C.success}}>✅ {label}</span>;
  }
  // Đang chạy trực tiếp — vẫn đếm giây, nhưng thêm "X ngày" phía trước nếu đã qua 24h.
  const liveLabel = days>0
    ? `${days} ${t('req_days_short','ngày')} ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return <span style={{fontSize:13,fontWeight:700,color:C.warning}}>⏱ {liveLabel}</span>;
}

// Mục có nút sổ ra / thu gọn — nhớ trạng thái từng mục (theo `id`) trên trình duyệt
const SEC_KEY = (id) => `req-sec-collapsed:${id}`;
function Section({id,icon,title,extra,children,defaultOpen=true}){
  const [open, setOpen] = useState(() => {
    try { const v = localStorage.getItem(SEC_KEY(id||title)); return v == null ? defaultOpen : v !== '1'; }
    catch { return defaultOpen; }
  });
  const toggle = () => setOpen(o => {
    try { localStorage.setItem(SEC_KEY(id||title), o ? '1' : '0'); } catch { /* trình duyệt chặn lưu */ }
    return !o;
  });
  return (
    <div style={{background:'var(--wt-surface)',borderRadius:10,border:`1.5px solid ${C.border}`,overflow:'hidden',marginBottom:14}}>
      <div onClick={toggle} role="button" aria-expanded={open} title={open ? 'Thu gọn' : 'Mở rộng'}
        style={{padding:'10px 14px',background:C.bg,borderBottom:open?`1px solid ${C.border}`:'none',display:'flex',alignItems:'center',gap:7,cursor:'pointer',userSelect:'none'}}>
        <span>{icon}</span>
        <div className="req-sec-title" style={{fontSize:13,fontWeight:700,color:C.dark,flex:1}}>{title}</div>
        {extra && <span className="req-sec-extra" onClick={e=>e.stopPropagation()} style={{display:'flex',alignItems:'center',flexShrink:0}}>{extra}</span>}
        <span style={{width:30,height:30,borderRadius:8,border:`1px solid ${C.border}`,background:'var(--wt-surface)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,color:'var(--wt-text-3)',flexShrink:0,
          transform:open?'rotate(0deg)':'rotate(-90deg)',transition:'transform .15s ease'}}>▼</span>
      </div>
      {open && <div style={{padding:'14px 16px'}}>{children}</div>}
    </div>
  );
}

// ── Chấm điểm RIÊNG từng người trong CV ──
// Hiện danh sách người thực hiện (chính / hỗ trợ), mỗi người 1 ô điểm. Có ô
// "chấm nhanh cho tất cả" để điền cùng 1 điểm rồi chỉnh riêng từng người.
// CV chưa có ai thực hiện → 1 ô "điểm công việc" chung (được để trống như trước).
const TASK_ROW = 'task';
function AssigneeScoring({ task, hint, tone = C.primary, bg = 'var(--wt-tint-primary)', border = 'var(--wt-tint-primary-bd)', actions }) {
  const { t } = useTranslation();
  const perPerson = (task.assignees || []).length > 0;
  const people = perPerson ? task.assignees : [{ user_id: TASK_ROW, full_name: t('req_task_score', 'Điểm công việc'), score: task.score }];
  const [vals, setVals] = useState(() => Object.fromEntries(people.map(a => [a.user_id, a.score ?? task.score ?? ''])));
  const [err, setErr] = useState('');
  const setOne = (id, v) => { setVals(x => ({ ...x, [id]: v })); setErr(''); };
  const setAll = (v) => { setVals(Object.fromEntries(people.map(a => [a.user_id, v]))); setErr(''); };
  const valid = (v) => v !== '' && v != null && Number.isFinite(+v) && +v >= 0 && +v <= 10;
  const filled = people.filter(a => valid(vals[a.user_id])).length;
  const avg = filled ? people.reduce((s, a) => s + (valid(vals[a.user_id]) ? +vals[a.user_id] : 0), 0) / filled : null;

  // Trả về payload cho API, hoặc null nếu còn người chưa có điểm hợp lệ
  const collect = () => {
    if (!perPerson) {
      const v = vals[TASK_ROW] ?? '';
      if (v !== '' && !valid(v)) { setErr(t('req_score_range', 'Điểm phải từ 0 đến 10')); return null; }
      return { score: v === '' ? undefined : +v };
    }
    const bad = people.find(a => !valid(vals[a.user_id]));
    if (bad) { setErr(t('req_score_missing_person', { name: bad.full_name, defaultValue: `Chưa nhập điểm hợp lệ (0–10) cho ${bad.full_name}` })); return null; }
    return { assignee_scores: people.map(a => ({ user_id: a.user_id, score: +vals[a.user_id] })) };
  };


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: bg, padding: '14px 16px', borderRadius: 10, border: `1.5px solid ${border}` }}>
      {hint && <div style={{ fontSize: 12, color: 'var(--wt-text-3)' }}>{hint}</div>}

      {people.length > 1 && (
        <div className="req-quick" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingBottom: 8, borderBottom: `1px dashed ${border}` }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--wt-text-3)', flexBasis: '100%' }}>⚡ {t('req_score_all', 'Chấm nhanh cho tất cả')}:</span>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
            <button key={n} onClick={() => setAll(String(n))} style={{ width: 30, height: 28, borderRadius: 7, border: `1.5px solid ${C.border}`, background: 'var(--wt-surface)', color: 'var(--wt-text-2)', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>{n}</button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {people.map(a => (
          <div key={a.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 9, background: 'var(--wt-surface)', border: `1px solid ${valid(vals[a.user_id]) || !perPerson ? border : 'var(--wt-tint-danger-bd)'}` }}>
            {perPerson ? <Chip color={a.avatar_color || C.primary} name={a.full_name} size={28} /> : <span style={{ fontSize: 20 }}>🏆</span>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.full_name}</div>
              {perPerson && <div style={{ marginTop: 2 }}><RoleBadge role={a.role} clickable={false} /></div>}
            </div>
            <input type="number" min="0" max="10" step="0.5" value={vals[a.user_id] ?? ''} onChange={e => setOne(a.user_id, e.target.value)} placeholder="–"
              style={{ width: 62, textAlign: 'center', border: `2px solid ${valid(vals[a.user_id]) ? tone : 'var(--wt-line-strong)'}`, borderRadius: 9, padding: 5,
                fontSize: 16, fontWeight: 900, color: tone, background: 'var(--wt-surface)', outline: 'none' }} />
            <span style={{ fontSize: 12, color: 'var(--wt-text-4)' }}>/10</span>
          </div>
        ))}
      </div>

      {err && <div style={{ fontSize: 12, color: C.danger, background: 'var(--wt-tint-danger)', padding: '6px 10px', borderRadius: 8 }}>⚠ {err}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--wt-text-3)', visibility: perPerson ? 'visible' : 'hidden' }}>
          {t('req_scored_count', { n: filled, total: people.length, defaultValue: `Đã chấm ${filled}/${people.length} người` })}
          {avg != null && people.length > 1 && <> · {t('req_score_avg_task', 'Điểm CV (TB)')}: <b style={{ color: tone }}>{avg.toFixed(1)}</b></>}
        </span>
        <div style={{ flex: 1 }} />
        {actions(collect)}
      </div>
    </div>
  );
}

// ── Timeline "Tiến trình" — ai tạo → ai nhận → nếu đổi người thì ai nhận
// tiếp theo → chấm điểm → duyệt hoàn thành. Lấy từ activity_logs qua endpoint
// riêng /requests/:id/activity (không giới hạn admin/manager như trang audit
// toàn hệ thống /activity-log).
function ActivityTimeline({ taskId }) {
  const { t, i18n } = useTranslation();
  const fmtDt = makeFmtDt(LOCALE_MAP[i18n.language] || 'vi-VN');
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/requests/${taskId}/activity`)
      .then(r => setItems(r.data.data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [taskId]);

  if (loading) return <div style={{fontSize:12,color:'var(--wt-text-4)',padding:'4px 0'}}>⏳</div>;
  if (!items.length) return <div style={{fontSize:12,color:'var(--wt-text-4)',padding:'4px 0'}}>{t('req_activity_empty', { defaultValue: 'Chưa có hoạt động nào được ghi lại.' })}</div>;

  // Hàng ngang, cuộn được nếu dài — mỗi bước là 1 icon + mô tả rút gọn (tối đa
  // 2 dòng, hover để xem đầy đủ), nối nhau bằng mũi tên "→".
  return (
    <div style={{display:'flex',alignItems:'flex-start',gap:6,overflowX:'auto',padding:'4px 2px 8px'}}>
      {items.map((item,i)=>{
        const meta = ACTIVITY_META[item.action_type] || ACTIVITY_DEFAULT_META;
        const isLast = i===items.length-1;
        return (
          <div key={item.id} style={{display:'flex',alignItems:'flex-start',gap:6,flexShrink:0}}>
            <div title={item.description} style={{display:'flex',flexDirection:'column',alignItems:'center',width:96,flexShrink:0}}>
              <div style={{width:28,height:28,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,background:meta.bg,flexShrink:0}}>{meta.icon}</div>
              <div style={{fontSize:10,color:C.dark,textAlign:'center',marginTop:5,lineHeight:1.35,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{item.description}</div>
              <div style={{fontSize:9,color:'var(--wt-text-4)',marginTop:3,whiteSpace:'nowrap'}}>{fmtDt(item.created_at)}</div>
            </div>
            {!isLast && <div style={{fontSize:14,color:'var(--wt-text-4)',flexShrink:0,marginTop:5}}>→</div>}
          </div>
        );
      })}
    </div>
  );
}

export default function RequestsPage() {
  const { t, i18n } = useTranslation();
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isLeader = can('admin','manager','leader');
  const currentLocale = LOCALE_MAP[i18n.language] || 'vi-VN';
  const fmtDt = makeFmtDt(currentLocale);

  const [tasks,   setTasks]   = useState([]);
  const [groups,  setGroups]  = useState([]);
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('all');
  const [search,  setSearch]  = useState('');
  const [selected,setSelected]= useState(
    isLeader && searchParams.get('create')==='1' ? 'new' :
    searchParams.get('id') ? {id:+searchParams.get('id')} : null
  );

  useEffect(()=>{
    Promise.all([api.get('/requests'), api.get('/groups'), api.get('/users')])
      .then(([t,g,u])=>{ setTasks(t.data.data||[]); setGroups(g.data.data||[]); setUsers(u.data.data||[]); })
      .catch(console.error).finally(()=>setLoading(false));
  },[]);

  const reload = async () => {
    const {data} = await api.get('/requests');
    // console.log('[DEBUG reload] tasks fetched:', data.data?.length, '| ids:', data.data?.map(t=>t.id));
    setTasks(data.data||[]);
  };

  // 📡 Realtime — tự cập nhật danh sách khi có CV mới/đổi trạng thái/gán
  // người... ở bất kỳ đâu, không cần F5. Dùng chung 1 socket đã kết nối sẵn
  // (từ notificationStore) — chỉ gắn thêm listener, không tạo kết nối mới.
  useEffect(()=>{
    if (!user?.id) return;
    return onRealtime('requests:updated', () => { clearApiCache(); reload(); });
  }, [user?.id]);

  const isAdminOrManager = can('admin','manager');
  const isTeamLeaderOnly = !isAdminOrManager && can('leader');
  const myGroupIds = new Set((user?.groups||[]).map(g=>g.id));

  const teamMemberIds = new Set([user?.id]);
  if (isTeamLeaderOnly) {
    users.forEach(u=>{
      const uGroupIds = (u.groups||[]).map(g=>g.id);
      if (uGroupIds.some(id=>myGroupIds.has(id))) teamMemberIds.add(u.id);
    });
  }

  // CV "đang mở, chưa ai nhận" (status='pending', chưa có assignee) phải hiện
  // cho MỌI người liên quan để họ còn bấm "Nhận việc" được — trước đây bộ lọc
  // chỉ cho xem CV do chính mình tạo/được gán, nên CV chưa gán ai bị "vô hình"
  // với tất cả user thường, kể cả F5 cũng không thấy.
  const isUnclaimedOpen = (t2) => t2.status === 'pending' && !(t2.assignees||[]).length;

  const visibleTasks = isAdminOrManager
    ? tasks
    : isTeamLeaderOnly
      ? tasks.filter(t2 =>
          teamMemberIds.has(t2.created_by) ||
          (t2.assignees||[]).some(a=>teamMemberIds.has(a.user_id)) ||
          isUnclaimedOpen(t2)
        )
      : tasks.filter(t2 => t2.created_by===user?.id || (t2.assignees||[]).some(a=>a.user_id===user?.id) || isUnclaimedOpen(t2));

  const filtered = visibleTasks
    .filter(t=>{
      if (filter!=='all' && t.status!==filter) return false;
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a,b)=>{
      const doneA = ['done','cancelled'].includes(a.status);
      const doneB = ['done','cancelled'].includes(b.status);
      if (doneA !== doneB) return doneA ? 1 : -1;
      if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline);
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return new Date(b.created_at) - new Date(a.created_at);
    });

  const counts = {};
  visibleTasks.forEach(t=>{ counts[t.status]=(counts[t.status]||0)+1; });

  return (
    <div className="req-root" style={{flex:1,display:'flex',overflow:'hidden',background:'var(--wt-surface)',minWidth:0}}>
      <style>{`
        .req-root { box-sizing: border-box; }
        .req-root *, .req-root *::before, .req-root *::after { box-sizing: border-box; }
        .req-root button { -webkit-tap-highlight-color: transparent; touch-action: manipulation; transition: transform .1s ease, background .15s, color .15s, border-color .15s; }
        .req-root button:active { transform: scale(0.96); }
        .req-root .req-list-item { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
        .req-root .req-list-item:active { background: var(--wt-tint-primary) !important; }
        .req-root *:focus-visible { outline: 2px solid ${C.primary}; outline-offset: 2px; border-radius: 4px; }
        .req-root input:focus, .req-root select:focus, .req-root textarea:focus { font-size: 16px !important; }
        .req-root ::-webkit-scrollbar { width: 8px; height: 8px; }
        .req-root ::-webkit-scrollbar-track { background: transparent; }
        .req-root ::-webkit-scrollbar-thumb { background: var(--wt-scroll); border-radius: 8px; }
        .req-root ::-webkit-scrollbar-thumb:hover { background: var(--wt-line-strong); }
        @media (prefers-reduced-motion: reduce) {
          .req-root, .req-root * { animation: none !important; transition: none !important; }
        }
        .req-root .req-back { display: none; }
        .req-root .req-sec-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .req-root .req-chips { display: flex; gap: 4px; flex-wrap: wrap; }

        /* ── Tablet (≤ 1180px): đang mở 1 CV thì chi tiết chiếm hết chiều ngang, ẩn danh sách ── */
        @media (max-width: 1180px) {
          .req-root .req-list-selected { display: none !important; }
          .req-root .req-list-panel { width: 100% !important; flex: 1 1 auto !important; }
          .req-root .req-back { display: inline-flex; }
          .req-root .req-chat-panel { width: 320px !important; }
        }

        /* ── Điện thoại & tablet dọc (≤ 900px): xếp dọc, cuộn 1 lần cho cả trang chi tiết ── */
        @media (max-width: 900px) {
          .req-root .req-detail-body { flex-direction: column !important; overflow-y: auto !important; overflow-x: hidden !important; -webkit-overflow-scrolling: touch; }
          .req-root .req-form-panel { border-right: none !important; border-bottom: 1.5px solid ${C.border} !important; overflow: visible !important; }
          .req-root .req-form-scroll { flex: none !important; overflow: visible !important; padding: 12px !important; }
          .req-root .req-form-footer { position: sticky; bottom: 0; z-index: 5; box-shadow: 0 -6px 16px rgba(15,23,41,.06); }
          .req-root .req-chat-panel { width: 100% !important; flex-shrink: 0 !important; height: min(460px, 70vh) !important; }
          .req-root .req-detail-topbar { flex-wrap: wrap !important; padding: 8px 12px !important; row-gap: 8px !important; }
          .req-root .req-detail-crumb { flex-basis: 100% !important; font-size: 14px !important; }
          .req-root .req-detail-crumb .req-crumb-root { display: none !important; }
          .req-root .req-steps-bar { padding: 8px 12px !important; flex-wrap: nowrap !important; overflow-x: auto !important; scrollbar-width: none; }
          .req-root .req-steps-bar::-webkit-scrollbar { display: none; }
          .req-root .req-steps-bar > div { flex-shrink: 0; }
          .req-root .req-filter-toolbar { padding: 8px 10px !important; }
          .req-root .req-chips { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; }
          .req-root .req-chips::-webkit-scrollbar { display: none; }
          .req-root .req-chips > button { flex-shrink: 0; padding: 6px 12px !important; font-size: 12px !important; }
          .req-root .req-list-item { padding: 14px !important; }
          .req-root .req-sec-extra { display: none !important; }
        }
        @media (max-width: 480px) {
          .req-root .req-score-row { flex-wrap: wrap; }
          .req-root .req-quick { gap: 4px !important; }
          .req-root .req-quick > button { width: 34px !important; height: 34px !important; }
        }
      `}</style>

      {/* LEFT: List */}
      <div className={`req-list-panel${selected ? ' req-list-selected' : ''}`} style={{flex:selected?'0 0 300px':'1 1 auto',display:'flex',flexDirection:'column',borderRight:`1.5px solid ${C.border}`,overflow:'hidden'}}>
        <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:8,background:'var(--wt-surface)',flexShrink:0}}>
          <div style={{fontSize:14,fontWeight:800,color:C.dark,flex:1}}>📨 {t('requests')}</div>
          {isLeader&&<button onClick={()=>setSelected('new')} style={{padding:'6px 12px',borderRadius:7,border:'none',background:C.primary,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>➕ {t('create')}</button>}
        </div>

        <div className="req-filter-toolbar" style={{padding:'8px 12px',borderBottom:`1px solid ${C.border}`,background:C.bg,flexShrink:0}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={`🔍 ${t('req_search_title')}`}
            style={{...FI,padding:'6px 10px',fontSize:12,marginBottom:8}}/>
          <div className="req-chips">
            {[['all',t('req_filter_all'),visibleTasks.length],['pending',t('req_filter_pending'),counts.pending||0],['assigned',t('req_filter_assigned'),counts.assigned||0],['in_progress',t('req_filter_in_progress'),counts.in_progress||0],['scoring',t('req_filter_scoring'),counts.scoring||0],['done',t('req_filter_done'),counts.done||0]].map(([k,l,c])=>(
              <button key={k} onClick={()=>setFilter(k)} style={{padding:'3px 10px',borderRadius:15,fontSize:11,fontWeight:600,cursor:'pointer',border:`1.5px solid ${filter===k?C.primary:C.border}`,background:filter===k?C.primary:'var(--wt-surface)',color:filter===k?'#fff':'var(--wt-text-3)'}}>
                {l} {c>0&&<span style={{opacity:.7}}>{c}</span>}
              </button>
            ))}
          </div>
        </div>

        <div style={{flex:1,overflowY:'auto'}}>
          {loading&&<div style={{textAlign:'center',padding:32,color:'var(--wt-text-4)'}}>⏳</div>}
          {filtered.map(t2=>{
            const st=STATUS[t2.status]||STATUS.pending;
            const pr=PRIORITY[t2.priority]||PRIORITY.medium;
            const isActive=selected?.id===t2.id;
            const overdue=t2.deadline&&new Date(t2.deadline)<new Date()&&t2.status!=='done';
            const timeLeft = t2.deadline ? new Date(t2.deadline)-new Date() : null;
            const isUrgent = t2.deadline && !['done','cancelled'].includes(t2.status) && timeLeft<3600000;
            const isNew = t2.created_at && (Date.now()-new Date(t2.created_at).getTime()) < 24*60*60*1000;
            return (
              <div key={t2.id} className="req-list-item" onClick={()=>setSelected(t2)}
                style={{padding:'12px 14px',borderBottom:`1px solid var(--wt-surface-3)`,cursor:'pointer',background:isActive?'var(--wt-tint-primary)':'transparent',borderLeft:`3px solid ${isActive?C.primary:'transparent'}`}}
                onMouseEnter={e=>{if(!isActive)e.currentTarget.style.background='var(--wt-surface-2)';}}
                onMouseLeave={e=>{if(!isActive)e.currentTarget.style.background='transparent';}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}>
                  <span style={{fontSize:11,fontWeight:700,padding:'2px 7px',borderRadius:8,background:pr.bg,color:pr.color}}>{pr.icon}</span>
                  {isNew&&<span style={{fontSize:9,fontWeight:800,padding:'2px 6px',borderRadius:6,background:'#8e44ad',color:'#fff',whiteSpace:'nowrap'}}>🆕 {t('req_new_badge')}</span>}
                  {isUrgent&&<span style={{fontSize:9,fontWeight:800,padding:'2px 6px',borderRadius:6,background:C.danger,color:'#fff',whiteSpace:'nowrap'}}>⚠️ {t('req_urgent_badge')}</span>}
                  <div style={{flex:1,fontSize:13,fontWeight:700,color:C.dark,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t2.title}</div>
                  <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:8,background:st.bg,color:st.color,whiteSpace:'nowrap'}}>{st.icon} {t(st.key)}</span>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8,fontSize:11,color:'var(--wt-text-4)',flexWrap:'wrap'}}>
                  <span>👤 {t2.creator_name}</span>
                  {t2.deadline&&<span style={{color:overdue?C.danger:'var(--wt-text-4)'}}>⏰ {new Date(t2.deadline).toLocaleDateString(currentLocale)}</span>}
                  {t2.deadline&&<Countdown deadline={t2.deadline} status={t2.status}/>}
                  {t2.assignees?.length>0&&<div style={{display:'flex',gap:2,marginLeft:'auto'}}>{t2.assignees.slice(0,3).map(a=><Chip key={a.user_id} color={a.avatar_color||C.primary} name={a.full_name||'?'} size={18}/>)}</div>}
                </div>
              </div>
            );
          })}
          {!loading&&!filtered.length&&<div style={{textAlign:'center',padding:40,color:'var(--wt-text-4)',fontSize:13}}>{t('req_no_tasks')}</div>}
        </div>
      </div>

      {/* RIGHT: Detail / Create */}
      {selected==='new'&&<CreatePanel groups={groups} users={users} onClose={()=>setSelected(null)} onSaved={async newId=>{
        await reload();
        if(newId){const{data}=await api.get(`/requests/${newId}`);setSelected(data.data);}
        else setSelected(null);
      }}/>}
      {selected&&selected!=='new'&&<DetailPanel key={selected.id} taskId={selected.id} users={users} isLeader={isLeader} user={user} onClose={()=>setSelected(null)} onSaved={async updated=>{await reload();setSelected(updated||null);}}/>}
      {!selected&&(
        <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',background:C.bg,flexDirection:'column',gap:10}}>
          <div style={{fontSize:40}}>📨</div>
          <div style={{fontSize:14,color:'var(--wt-text-4)'}}>{t('req_no_task_selected')}</div>
          {isLeader&&<button onClick={()=>setSelected('new')} style={{padding:'8px 20px',borderRadius:8,border:'none',background:C.primary,color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer',marginTop:4}}>➕ {t('req_create_new')}</button>}
        </div>
      )}
    </div>
  );
}

// ── Detail Panel ──
function DetailPanel({taskId,users,isLeader,user,onClose,onSaved}){
  const { t, i18n } = useTranslation();
  const fmtDt = makeFmtDt(LOCALE_MAP[i18n.language] || 'vi-VN');
  const [task,    setTask]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [comment, setComment] = useState('');
  const [showAddUser, setShowAddUser] = useState(false);
  const [pendingRole, setPendingRole] = useState('main');
  const [attachFile, setAttachFile]   = useState(null);
  const [sendingMsg, setSendingMsg]   = useState(false);
  const feedRef = useRef();
  const chatFileRef = useRef();
  // Đếm mỗi lần loadTask() chạy — dùng làm key ép ActivityTimeline tự tải lại,
  // vì taskId không đổi khi nhận việc/thêm người/chấm điểm... nên bản thân
  // Timeline (chỉ fetch 1 lần lúc mount theo taskId) sẽ không tự biết cần
  // refetch nếu không có tín hiệu này.
  const [activityTick, setActivityTick] = useState(0);

  const isAdmin = ['admin','manager'].includes(user?.role);

  useEffect(()=>{ loadTask(); },[taskId]);

  // 📡 Realtime — nếu CV đang mở bị người khác đổi (gán/xóa người, chấm điểm,
  // đổi trạng thái...), tự tải lại chi tiết + Timeline ngay, không cần đóng mở
  // lại. Nếu CV bị XÓA, tự đóng panel thay vì cố tải 1 CV không còn tồn tại.
  useEffect(()=>{
    if (!user?.id) return;
    const socket = getSocket(user.id);
    const onUpdate = (payload) => {
      if (payload?.taskId !== taskId) return;
      clearApiCache();
      if (payload.action === 'deleted') { onClose(); return; }
      loadTask();
    };
    socket.on('requests:updated', onUpdate);
    return () => socket.off('requests:updated', onUpdate);
  }, [taskId, user?.id]);

  const loadTask = async()=>{
    setLoading(true);
    try{
      const{data}=await api.get(`/requests/${taskId}`);
      setTask(data.data);
      setActivityTick(n=>n+1);
      setTimeout(()=>feedRef.current?.scrollTo(0,feedRef.current.scrollHeight),100);
    }catch(e){console.error(e);}
    finally{setLoading(false);}
  };

  const save = async updates=>{
    setSaving(true);
    try{await api.put(`/requests/${taskId}`,updates);await loadTask();onSaved?.(task);}
    catch(e){alert(e.response?.data?.message||e.message);}
    finally{setSaving(false);}
  };

  const sendComment = async()=>{
    if(!comment.trim() && !attachFile) return;
    setSendingMsg(true);
    try{
      if (attachFile) {
        const form = new FormData();
        form.append('content', comment);
        form.append('file', attachFile);
        await api.post(`/requests/${taskId}/comments`, form, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        await api.post(`/requests/${taskId}/comments`,{content:comment});
      }
      setComment('');
      setAttachFile(null);
      loadTask();
    }
    catch(e){alert(e.response?.data?.message||e.message);}
    finally{setSendingMsg(false);}
  };

  const pickChatFile = e=>{
    const f = e.target.files[0];
    if (f) setAttachFile(f);
    e.target.value = '';
  };

  const chatFileIcon = (name)=>{
    const ext = (name||'').split('.').pop().toLowerCase();
    if (['jpg','jpeg','png','gif'].includes(ext)) return '🖼';
    if (ext==='pdf') return '📄';
    if (['doc','docx'].includes(ext)) return '📝';
    if (['xls','xlsx'].includes(ext)) return '📊';
    if (['zip','rar'].includes(ext)) return '🗜';
    if (['mp4','mov'].includes(ext)) return '🎬';
    return '📎';
  };

  const CHAT_BASE = (import.meta.env.VITE_API_URL||'http://localhost:3001/api').replace('/api','');
  const resolveFileUrl = (url)=> url && url.startsWith('/') ? CHAT_BASE + url : url;

  const addAssignee = async (uid, role='main')=>{
    try{await api.post(`/requests/${taskId}/assign`,{user_id:uid,role});loadTask();setShowAddUser(false);}
    catch(e){alert(e.response?.data?.message||e.message);}
  };

  const removeAssignee = async uid=>{
    try{await api.delete(`/requests/${taskId}/assign/${uid}`);loadTask();}
    catch(e){alert(e.message);}
  };

  // Mỗi CV chỉ 1 người làm CHÍNH — chọn người khác làm chính thì người cũ tự sang hỗ trợ
  const toggleAssigneeRole = async (a)=>{
    const newRole = a.role==='support' ? 'main' : 'support';
    try{
      await api.put(`/requests/${taskId}/assign/${a.user_id}/role`,{role:newRole});
      loadTask();
    }catch(e){alert(e.response?.data?.message||e.message);}
  };

  const claimTask = async()=>{
    try{
      await api.post(`/requests/${taskId}/claim`);
      await loadTask();
      onSaved?.(task);
      alert(t('req_self_assign_success', { defaultValue: 'Bạn đã nhận và bắt đầu công việc thành công.' }));
    }
    catch(e){alert(e.response?.data?.message||e.message);}
  };

  // ⚠️ Nếu CV do chính MANAGER tạo (yêu cầu công việc), khi nộp bài đi thẳng
  // lên Manager duyệt 1 lần duy nhất — bỏ qua bước Leader chấm điểm sơ bộ.
  // (Chỉ áp dụng khi creator_role==='manager', không tính admin — theo đúng
  // yêu cầu "nếu manager yêu cầu công việc".)
  const markDone = async()=>{
    const skipLeaderStep = task.creator_role === 'manager';
    await save({status: skipLeaderStep ? 'reviewing' : 'scoring'});
  };

  if(loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--wt-text-4)'}}>⏳</div>;
  if(!task)   return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--wt-text-4)'}}>{t('req_not_found')}</div>;

  const st=STATUS[task.status]||STATUS.pending;
  const pr=PRIORITY[task.priority]||PRIORITY.medium;
  const isCreator  = task.created_by === user?.id;
  const isAssignee = (task.assignees||[]).some(a=>a.user_id===user?.id);
  const canManageAssignees = (isAdmin||isCreator) && !['done','cancelled'].includes(task.status);
  const overdue=task.deadline&&new Date(task.deadline)<new Date()&&task.status!=='done';
  const existingIds=new Set((task.assignees||[]).map(a=>a.user_id));
  const chatItems=task.comments||[];
  const hasPeople=(task.assignees||[]).length>0;
  const mainPerson=(task.assignees||[]).find(a=>a.role==='main');
  const hasMain=!!mainPerson;
  const peopleKey=(task.assignees||[]).map(a=>`${a.user_id}:${a.score??''}`).join(',')+`|${task.score??''}`;
  // Điểm từng người (riêng nếu có, không thì điểm chung của CV)
  const personScores = hasPeople && (
    <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:8}}>
      {task.assignees.map(a=>{
        const sc = a.score ?? task.score;
        return (
          <span key={a.user_id} style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'var(--wt-text-2)',background:'var(--wt-surface)',border:`1px solid ${C.border}`,padding:'4px 6px 4px 4px',borderRadius:14}}>
            <Chip color={a.avatar_color||C.primary} name={a.full_name} size={20}/>
            {a.full_name}<RoleBadge role={a.role} clickable={false}/>
            <b style={{color:sc!=null?C.success:'var(--wt-text-4)',marginLeft:2}}>{sc!=null?`${+sc}đ`:'—'}</b>
          </span>
        );
      })}
    </div>
  );

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>

      {/* Topbar */}
      <div className="req-detail-topbar" style={{padding:'10px 18px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:8,background:'var(--wt-surface)',flexShrink:0}}>
        <div className="req-detail-crumb" style={{flex:1,fontSize:13,color:'var(--wt-text-3)',display:'flex',alignItems:'center',gap:5,minWidth:0}}>
          <button className="req-back" onClick={onClose} aria-label={t('back','Quay lại')}
            style={{alignItems:'center',justifyContent:'center',width:34,height:34,borderRadius:9,border:`1.5px solid ${C.border}`,background:'var(--wt-surface)',color:C.primary,fontSize:18,fontWeight:700,cursor:'pointer',flexShrink:0}}>‹</button>
          <span className="req-crumb-root" style={{color:C.primary,cursor:'pointer',whiteSpace:'nowrap'}} onClick={onClose}>📨 {t('requests')}</span>
          <span className="req-crumb-root" style={{color:'var(--wt-text-4)'}}>›</span>
          <span style={{color:C.dark,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{task.title}</span>
        </div>
        <span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:8,background:st.bg,color:st.color,whiteSpace:'nowrap'}}>{st.icon} {t(st.key)}</span>
        {(() => {
          if (task.status==='pending' && !isLeader) {
            return <button onClick={claimTask} style={{padding:'6px 12px',borderRadius:7,border:'none',background:C.primary,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>🙋 {t('req_claim_task')}</button>;
          }
          if (task.status==='assigned' && isAssignee && !isAdmin) {
            return <button onClick={()=>save({status:'in_progress'})} style={{padding:'6px 12px',borderRadius:7,border:'none',background:C.warning,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>🔄 {t('req_start_work')}</button>;
          }
          if (task.status==='in_progress' && !isAdmin) {
            return <button onClick={markDone} style={{padding:'6px 12px',borderRadius:7,border:'none',background:C.success,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>✅ {t('req_mark_done')}</button>;
          }
          return <button onClick={()=>save({})} disabled={saving} style={{padding:'6px 12px',borderRadius:7,border:'none',background:saving?'var(--wt-text-4)':C.primary,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>💾 {t('save')}</button>;
        })()}
        <button onClick={onClose} style={{width:28,height:28,borderRadius:7,border:`1px solid ${C.border}`,background:'var(--wt-surface)',cursor:'pointer',fontSize:16,color:'var(--wt-text-4)',display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
      </div>

      {/* Status bar */}
      <div className="req-steps-bar" style={{padding:'9px 18px',background:C.bg,borderBottom:`1.5px solid ${C.border}`,display:'flex',alignItems:'center',gap:4,flexShrink:0,flexWrap:'wrap'}}>
        {(isAdmin||isCreator||isLeader ? STEPS : [
          {key:'in_progress', tkey:'in_progress'},
          {key:'done',        tkey:'done'},
        ]).map((s,i,arr)=>{
          const steps = isAdmin||isCreator||isLeader ? STEPS : arr;
          const idx   = steps.findIndex(x=>x.key===task.status);
          const effectiveIdx = task.status==='scoring'||task.status==='reviewing' ? (isAdmin||isCreator||isLeader?idx:1) : idx;
          const done  = i < effectiveIdx;
          const active= i === effectiveIdx || (i===1&&['scoring','reviewing','done'].includes(task.status)&&!(isAdmin||isCreator||isLeader));
          const isDone= task.status==='done';
          return (
            <div key={s.key} style={{display:'flex',alignItems:'center',gap:4}}>
              <div style={{display:'flex',alignItems:'center',gap:5,fontSize:11,fontWeight:600,color:done||isDone?C.success:active?C.primary:'var(--wt-text-4)'}}>
                <div style={{width:7,height:7,borderRadius:'50%',background:done||isDone?C.success:active?C.primary:'var(--wt-disabled)'}}/>
                {t(s.tkey)}
              </div>
              {i<arr.length-1&&<div style={{width:20,height:2,background:done||isDone?C.success:'var(--wt-line)',borderRadius:2,margin:'0 3px'}}/>}
            </div>
          );
        })}
      </div>

      {/* Body */}
      <div className="req-detail-body" style={{flex:1,display:'flex',overflow:'hidden'}}>

        <div className="req-form-panel" style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',borderRight:`1.5px solid ${C.border}`}}>
          <div className="req-form-scroll" style={{flex:1,overflowY:'auto',padding:16}}>

            <Section id="info" icon="📋" title={t('req_job_info')}
              extra={<span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:8,background:pr.bg,color:pr.color}}>{pr.icon} {t(pr.key)}</span>}>
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <div><label style={FL}>{t('req_title_field')}</label>
                  <input style={{...FI,background:(isCreator||isAdmin)?'var(--wt-surface)':'var(--wt-surface-2)',color:(isCreator||isAdmin)?C.dark:'var(--wt-text-3)'}}
                    defaultValue={task.title}
                    readOnly={!isCreator&&!isAdmin}
                    onBlur={e=>(isCreator||isAdmin)&&e.target.value!==task.title&&save({title:e.target.value})}/>
                </div>
                <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
                  <div style={{flex:'1 1 160px'}}><label style={FL}>{t('req_creator_label')}</label>
                    <input style={{...FI,background:'var(--wt-surface-2)',color:'var(--wt-text-3)'}} value={task.creator_name||'—'} readOnly/>
                  </div>
                  <div style={{flex:'1 1 120px'}}><label style={FL}>{t('req_score_leader_label')}</label>
                    <input style={{...FI,background:'var(--wt-surface-2)',color:task.score!=null?C.success:'var(--wt-text-4)'}} value={task.score!=null?`${+task.score}đ${(task.assignees||[]).some(a=>a.score!=null)&&(task.assignees||[]).length>1?` (${t('req_avg_short','TB')})`:''}`:t('req_not_scored')} readOnly/>
                  </div>
                </div>
                <div><label style={FL}>{t('req_description_label')}</label>
                  <textarea style={{...FI,minHeight:72,resize:'vertical',background:(isCreator||isAdmin)?'var(--wt-surface)':'var(--wt-surface-2)',color:(isCreator||isAdmin)?C.dark:'var(--wt-text-3)'}}
                    defaultValue={task.description||''}
                    readOnly={!isCreator&&!isAdmin}
                    onBlur={e=>(isCreator||isAdmin)&&e.target.value!==(task.description||'')&&save({description:e.target.value})}/>
                </div>
                <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
                  <div style={{flex:'1 1 160px'}}><label style={FL}>{t('priority')}</label>
                    <select style={{...FI,background:(isCreator||isAdmin)?'var(--wt-surface)':'var(--wt-surface-2)'}}
                      value={task.priority||'medium'}
                      disabled={!isCreator&&!isAdmin}
                      onChange={e=>(isCreator||isAdmin)&&save({priority:e.target.value})}>
                      <option value="high">🔴 {t('req_priority_high')}</option><option value="medium">🟡 {t('req_priority_medium')}</option><option value="low">🟢 {t('req_priority_low')}</option>
                    </select>
                  </div>
                  <div style={{flex:'1 1 160px'}}><label style={FL}>{t('status')}</label>
                    <div style={{...FI,display:'flex',alignItems:'center',background:'var(--wt-surface-2)'}}>
                      <span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:8,background:st.bg,color:st.color}}>{st.icon} {t(st.key)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </Section>

            <Section id="time" icon="⏱" title={t('req_time_section')}>
              <div style={{display:'grid',gridTemplateColumns:'repeat(2, minmax(0,1fr))',gap:12,marginBottom:12}}>
                <div style={{background:C.bg,borderRadius:8,padding:'9px 12px',border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:10,fontWeight:700,color:'var(--wt-text-4)',textTransform:'uppercase',marginBottom:4}}>{t('req_time_received')}</div>
                  <div style={{fontSize:13,fontWeight:600,color:C.dark}}>{fmtDt(task.created_at)}</div>
                </div>
                <div style={{background:task.started_at?'var(--wt-tint-success)':C.bg,borderRadius:8,padding:'9px 12px',border:`1px solid ${task.started_at?'var(--wt-tint-success-bd)':C.border}`}}>
                  <div style={{fontSize:10,fontWeight:700,color:'var(--wt-text-4)',textTransform:'uppercase',marginBottom:4}}>{t('req_time_started')}</div>
                  {task.started_at
                    ? <div style={{fontSize:13,fontWeight:600,color:C.success}}>{fmtDt(task.started_at)}</div>
                    : <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span style={{fontSize:12,color:'var(--wt-text-4)'}}>{t('req_not_started')}</span>
                        {(isAssignee||isAdmin)&&task.status!=='done'&&(
                          <button onClick={()=>save({status:'in_progress'})}
                            style={{padding:'3px 10px',borderRadius:6,border:'none',background:C.warning,color:'#fff',fontSize:11,fontWeight:600,cursor:'pointer'}}>
                            🔄 {t('req_start_btn')}
                          </button>
                        )}
                      </div>
                  }
                </div>
                <div style={{background:overdue?'var(--wt-tint-danger)':C.bg,borderRadius:8,padding:'9px 12px',border:`1px solid ${overdue?'var(--wt-tint-danger-bd)':C.border}`}}>
                  <div style={{fontSize:10,fontWeight:700,color:'var(--wt-text-4)',textTransform:'uppercase',marginBottom:4}}>{t('req_time_expected')}</div>
                  <div style={{fontSize:13,fontWeight:600,color:overdue?C.danger:C.dark}}>{fmtDt(task.deadline)}</div>
                  {task.deadline&&<div style={{marginTop:4}}><Countdown deadline={task.deadline} status={task.status}/></div>}
                </div>
                <div style={{background:task.completed_at?'var(--wt-tint-success)':C.bg,borderRadius:8,padding:'9px 12px',border:`1px solid ${task.completed_at?'var(--wt-tint-success-bd)':C.border}`}}>
                  <div style={{fontSize:10,fontWeight:700,color:'var(--wt-text-4)',textTransform:'uppercase',marginBottom:4}}>{t('req_time_completed')}</div>
                  <div style={{fontSize:13,fontWeight:600,color:task.completed_at?C.success:'var(--wt-text-4)'}}>
                    {task.completed_at?fmtDt(task.completed_at):t('req_not_completed')}
                  </div>
                </div>
              </div>
              <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
                <div style={{flex:'1 1 200px'}}><label style={FL}>
                    {t('req_deadline_change')}
                    {!isCreator&&!isAdmin&&<span style={{color:'var(--wt-text-4)',fontSize:10,marginLeft:6}}>🔒 {t('req_lock_creator_admin')}</span>}
                  </label>
                  <input type="datetime-local"
                    style={{...FI,background:(!isCreator&&!isAdmin)?'var(--wt-surface-2)':'var(--wt-surface)',color:(!isCreator&&!isAdmin)?'var(--wt-text-4)':'var(--wt-ink)'}}
                    defaultValue={task.deadline?new Date(task.deadline).toISOString().slice(0,16):''}
                    disabled={!isCreator&&!isAdmin}
                    onBlur={e=>(isCreator||isAdmin)&&save({deadline:e.target.value})}/>
                </div>
                <div style={{flex:'1 1 160px'}}><label style={FL}>{t('req_hours_log')}</label>
                  <div style={{...FI,background:'var(--wt-surface-2)',display:'flex',alignItems:'center'}}>
                    <WorkDuration startedAt={task.started_at} completedAt={task.completed_at} status={task.status}/>
                  </div>
                </div>
              </div>
            </Section>

            <Section id="assignees" icon="👥" title={t('req_assignees_section')} extra={<span style={{fontSize:11,color:'var(--wt-text-4)'}}>{t('req_max_assignees')}</span>}>
              <div style={{display:'flex',flexWrap:'wrap',gap:8,alignItems:'center'}}>
                {(task.assignees||[]).map(a=>(
                  <div key={a.user_id} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px',borderRadius:20,background:'var(--wt-tint-primary)',border:'1.5px solid var(--wt-tint-primary-bd)',fontSize:12,color:C.primary,fontWeight:600}}>
                    <div style={{width:20,height:20,borderRadius:'50%',background:a.avatar_color||C.primary,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:9,fontWeight:700}}>
                      {(a.full_name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                    </div>
                    {a.full_name}
                    <RoleBadge role={a.role} clickable={canManageAssignees} onClick={()=>toggleAssigneeRole(a)}/>
                    {canManageAssignees&&<span onClick={()=>removeAssignee(a.user_id)} style={{cursor:'pointer',color:'var(--wt-text-4)',fontSize:15,lineHeight:1}} onMouseEnter={e=>e.target.style.color=C.danger} onMouseLeave={e=>e.target.style.color='var(--wt-text-4)'}>×</span>}
                  </div>
                ))}
                {task.status==='pending' && (task.assignees||[]).length===0 && !isLeader && !isAdmin && (
                  <div onClick={claimTask} style={{display:'flex',alignItems:'center',gap:5,padding:'5px 10px',borderRadius:20,border:`1.5px dashed ${C.primary}`,color:C.primary,fontSize:12,fontWeight:600,cursor:'pointer'}}>
                    🙋 {t('req_claim_task')}
                  </div>
                )}
                {canManageAssignees&&(task.assignees||[]).length<12&&(
                  <div onClick={()=>{
                      setPendingRole(hasMain ? 'support' : 'main');
                      setShowAddUser(p=>!p);
                    }} style={{display:'flex',alignItems:'center',gap:5,padding:'5px 10px',borderRadius:20,border:'1.5px dashed var(--wt-line-strong)',color:'var(--wt-text-3)',fontSize:12,cursor:'pointer'}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=C.primary;e.currentTarget.style.color=C.primary;}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--wt-line-strong)';e.currentTarget.style.color='var(--wt-text-3)';}}>
                    ＋ {t('req_add_person')}
                  </div>
                )}
              </div>
              {showAddUser&&(
                <div style={{marginTop:8,background:'var(--wt-surface)',border:`1.5px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
                  <div style={{display:'flex',gap:6,padding:'8px 10px',borderBottom:`1px solid ${C.border}`,background:C.bg}}>
                    <span style={{fontSize:11,color:'var(--wt-text-3)',fontWeight:600,alignSelf:'center'}}>{t('req_role_label')}:</span>
                    <button onClick={()=>!hasMain&&setPendingRole('main')} disabled={hasMain}
                      title={hasMain?t('req_main_taken',{name:mainPerson.full_name,defaultValue:`Đã có người làm chính (${mainPerson.full_name}) — bấm vào nhãn vai trò của người khác để đổi`}):''}
                      style={{padding:'3px 10px',borderRadius:12,border:`1.5px solid ${pendingRole==='main'?C.primary:C.border}`,background:pendingRole==='main'?C.primary:'var(--wt-surface)',color:pendingRole==='main'?'#fff':'var(--wt-text-3)',fontSize:11,fontWeight:600,cursor:hasMain?'not-allowed':'pointer',opacity:hasMain?.45:1}}>
                      ⭐ {t('req_role_main')}
                    </button>
                    {hasMain&&<span style={{fontSize:10.5,color:'var(--wt-text-4)',alignSelf:'center'}}>({t('req_main_is',{name:mainPerson.full_name,defaultValue:`chính: ${mainPerson.full_name}`})})</span>}
                    <button onClick={()=>setPendingRole('support')}
                      style={{padding:'3px 10px',borderRadius:12,border:`1.5px solid ${pendingRole==='support'?C.warning:C.border}`,background:pendingRole==='support'?C.warning:'var(--wt-surface)',color:pendingRole==='support'?'#fff':'var(--wt-text-3)',fontSize:11,fontWeight:600,cursor:'pointer'}}>
                      🤝 {t('req_role_support')}
                    </button>
                  </div>
                  <div style={{maxHeight:160,overflowY:'auto'}}>
                    {users.filter(u=>!existingIds.has(u.id)).map(u=>(
                      <div key={u.id} onClick={()=>addAssignee(u.id,pendingRole)}
                        style={{display:'flex',alignItems:'center',gap:8,padding:'7px 12px',cursor:'pointer',fontSize:12}}
                        onMouseEnter={e=>e.currentTarget.style.background='var(--wt-tint-primary)'}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <Chip color={u.avatar_color||C.primary} name={u.full_name} size={22}/>
                        <span style={{flex:1,color:C.dark,fontWeight:500}}>{u.full_name}</span>
                        <span style={{color:'var(--wt-text-4)',fontSize:11}}>{u.role}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Section>

            {/* 🕒 Tiến trình — ai tạo, ai nhận, đổi người thì ai nhận tiếp theo,
                chấm điểm, duyệt hoàn thành. Không giới hạn quyền — ai xem được
                CV này thì xem được tiến trình của nó. Bỏ tiêu đề Section theo
                yêu cầu — chỉ còn khối nội dung, không có thanh header. */}
            <div style={{background:'var(--wt-surface)',borderRadius:10,border:`1.5px solid ${C.border}`,padding:'12px 14px',marginBottom:14}}>
              <ActivityTimeline key={activityTick} taskId={task.id} />
            </div>

            <Section id="files" icon="📎" title={t('req_files_section')}>
              <FileSection taskId={task.id} files={task.files||[]} user={user} onReload={loadTask}/>
            </Section>

            {isLeader&&(
              <Section id="scoring" icon="🏆" title={t('req_leader_scoring')}>
                {task.status==='scoring'&&(
                  <AssigneeScoring key={`s-${task.id}-${peopleKey}`} task={task}
                    hint={hasPeople
                      ? t('req_leader_score_prompt_each', { defaultValue: 'Chấm điểm sơ bộ cho TỪNG người trong công việc trước khi gửi Manager duyệt lần cuối.' })
                      : t('req_leader_score_prompt', { defaultValue: 'Nhập điểm chấm sơ bộ trước khi gửi lên Manager duyệt lần cuối.' })}
                    actions={collect=>(<>
                      <button onClick={()=>save({status:'in_progress',completed_at:null})}
                        style={{padding:'7px 14px',borderRadius:8,border:`1.5px solid ${C.border}`,background:'var(--wt-surface)',color:'var(--wt-text-3)',fontSize:12,fontWeight:600,cursor:'pointer'}}>↩️ {t('req_send_back')}</button>
                      <button disabled={saving} onClick={()=>{const p=collect(); if(p) save({status:'reviewing',...p});}}
                        style={{padding:'7px 14px',borderRadius:8,border:'none',background:C.primary,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>✅ {t('req_scoring_done')}</button>
                    </>)}/>
                )}

                {task.status==='reviewing'&&(
                  isAdmin ? (
                    <AssigneeScoring key={`r-${task.id}-${peopleKey}`} task={task} tone={C.success} bg="var(--wt-tint-success)" border="var(--wt-tint-success-bd)"
                      hint={<><b style={{color:C.primary}}>{t('req_ready_for_final_approval')}</b> — {hasPeople
                        ? t('req_rescore_each_hint', { defaultValue: 'kiểm tra / chỉnh điểm từng người rồi duyệt hoàn thành.' })
                        : t('req_rescore_hint')}</>}
                      actions={collect=>(
                        <button disabled={saving} onClick={()=>{const p=collect(); if(p) save({status:'done',...p});}}
                          style={{padding:'7px 14px',borderRadius:8,border:'none',background:C.success,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>✅ {t('req_approve_done')}</button>
                      )}/>
                  ) : (
                    <div style={{display:'flex',alignItems:'center',gap:10,background:'var(--wt-tint-warning)',padding:'14px 16px',borderRadius:10,border:'1.5px solid var(--wt-tint-warning-bd)'}}>
                      <span style={{fontSize:20}}>⏳</span>
                      <div>
                        <div style={{fontSize:12,fontWeight:700,color:C.warning}}>
                          {t('req_waiting_manager_approval', { defaultValue: 'Đã chấm điểm sơ bộ — đang chờ Manager duyệt lần cuối' })}
                        </div>
                        <div style={{fontSize:11,color:'var(--wt-warn-text)',marginTop:2}}>
                          {t('req_waiting_manager_approval_hint', { defaultValue: 'CV sẽ chuyển sang "Hoàn thành" sau khi Manager chấm điểm và duyệt.' })}
                        </div>
                        {personScores}
                      </div>
                    </div>
                  )
                )}

                {task.status==='done'&&(
                  <div>
                    <div style={{fontSize:12,color:C.success,fontWeight:600,marginBottom:8}}>✅ {t('req_status_done')}</div>
                    {personScores}
                  </div>
                )}
                {!['scoring','reviewing','done'].includes(task.status)&&(
                  <div style={{fontSize:12,color:'var(--wt-text-4)'}}>{t('req_waiting_completion')}</div>
                )}
              </Section>
            )}

          </div>

          <div className="req-form-footer" style={{padding:'10px 16px',borderTop:`1.5px solid ${C.border}`,display:'flex',gap:8,alignItems:'center',background:'var(--wt-surface)',flexShrink:0}}>
            <div style={{flex:1,minWidth:0,fontSize:12,color:'var(--wt-text-4)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t('req_created_by',{time:fmtDt(task.created_at),name:task.creator_name})}</div>
            {(task.status==='in_progress'||task.status==='assigned') ? (
              <button onClick={markDone} style={{padding:'6px 14px',borderRadius:7,border:'none',background:C.warning,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>✅ {t('req_submit_done')}</button>
            ) : (
              <button onClick={()=>save({})} disabled={saving} style={{padding:'6px 14px',borderRadius:7,border:'none',background:saving?'var(--wt-text-4)':C.success,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>💾 {t('save')}</button>
            )}
          </div>
        </div>

        <div className="req-chat-panel" style={{width:300,flexShrink:0,display:'flex',flexDirection:'column',overflow:'hidden',background:'var(--wt-surface-2)'}}>
          <div style={{padding:'11px',textAlign:'center',fontSize:12,fontWeight:600,color:C.primary,borderBottom:`2.5px solid ${C.primary}`,flexShrink:0}}>💬 {t('req_messages_tab')}</div>

          <div ref={feedRef} style={{flex:1,overflowY:'auto',padding:12,display:'flex',flexDirection:'column',gap:10}}>
            {chatItems.length===0&&<div style={{textAlign:'center',padding:20,color:'var(--wt-text-4)',fontSize:12}}>{t('req_no_messages')}</div>}
            {chatItems.map((c,i)=>{
              const isMe=c.user_id===user?.id;
              return (
                <div key={i} style={{display:'flex',gap:8,flexDirection:isMe?'row-reverse':'row'}}>
                  <Chip color={c.avatar_color||C.primary} name={c.full_name||'?'} size={26}/>
                  <div style={{maxWidth:'80%'}}>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3,flexDirection:isMe?'row-reverse':'row'}}>
                      <span style={{fontSize:11,fontWeight:700,color:isMe?C.primary:C.dark}}>{c.full_name}</span>
                      <span style={{fontSize:10,color:'var(--wt-text-4)'}}>{fmtDt(c.created_at)}</span>
                    </div>
                    <div style={{background:isMe?'var(--wt-tint-primary)':'var(--wt-surface)',border:`1px solid ${isMe?'var(--wt-tint-primary-bd)':C.border}`,borderRadius:isMe?'12px 4px 12px 12px':'4px 12px 12px 12px',padding:'8px 12px',fontSize:12,color:'var(--wt-ink)',lineHeight:1.5}}>
                      {(c.content||c.message)&&<div>{c.content||c.message}</div>}
                      {(c.file_name||c.filename)&&(
                        <a href={resolveFileUrl(c.file_url||c.url)} target="_blank" rel="noreferrer"
                          style={{display:'flex',alignItems:'center',gap:6,marginTop:(c.content||c.message)?6:0,padding:'6px 9px',borderRadius:8,background:'var(--wt-surface)',border:`1px solid ${C.border}`,textDecoration:'none',color:C.primary,fontSize:11,fontWeight:600}}>
                          <span>{chatFileIcon(c.file_name||c.filename)}</span>
                          <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.file_name||c.filename}</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{padding:'10px 12px',borderTop:`1.5px solid ${C.border}`,flexShrink:0}}>
            {attachFile&&(
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6,padding:'5px 9px',borderRadius:8,background:'var(--wt-tint-primary)',border:'1px solid var(--wt-tint-primary-bd)',fontSize:11,color:C.primary,fontWeight:600}}>
                <span>{chatFileIcon(attachFile.name)}</span>
                <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{attachFile.name}</span>
                <span onClick={()=>setAttachFile(null)} style={{cursor:'pointer',color:'var(--wt-text-4)',fontSize:14}}>×</span>
              </div>
            )}
            <textarea value={comment} onChange={e=>setComment(e.target.value)}
              placeholder={t('req_message_placeholder')}
              onKeyDown={e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendComment(); } }}
              style={{width:'100%',padding:'8px 10px',border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:12,resize:'none',outline:'none',fontFamily:'inherit',boxSizing:'border-box'}}
              rows={3}/>
            <input ref={chatFileRef} type="file" style={{display:'none'}} onChange={pickChatFile}
              accept=".jpg,.jpeg,.png,.gif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.csv,.mp4,.mov"/>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:6,marginTop:6}}>
              <button onClick={()=>chatFileRef.current.click()} title={t('req_attach_file')}
                style={{width:28,height:28,borderRadius:7,border:`1.5px solid ${C.border}`,background:'var(--wt-surface)',color:'var(--wt-text-3)',cursor:'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center'}}>📎</button>
              <button onClick={sendComment} disabled={sendingMsg||(!comment.trim()&&!attachFile)}
                style={{padding:'5px 14px',borderRadius:7,border:'none',background:(comment.trim()||attachFile)&&!sendingMsg?C.primary:'var(--wt-disabled)',color:'#fff',fontSize:11,fontWeight:600,cursor:'pointer'}}>
                {sendingMsg?'…':`➤ ${t('send')}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Create Panel ──
function CreatePanel({groups,users,onClose,onSaved}){
  const { t } = useTranslation();
  const [form,setForm]=useState({title:'',description:'',priority:'medium',deadline:'',group_id:'',assignees:[],score:''});
  const [saving,setSaving]=useState(false);
  const s=(k,v)=>setForm(p=>({...p,[k]:v}));

  // Mỗi CV chỉ 1 người làm CHÍNH
  const toggleFormAssigneeRole = (uid)=>{
    const target = form.assignees.find(a=>a.user_id===uid);
    if (!target) return;
    if (target.role==='support') {
      s('assignees', form.assignees.map(a=>({...a, role: a.user_id===uid ? 'main' : 'support'})));
    } else if (form.assignees.length>1) {
      // Hạ người chính → người kế tiếp lên làm chính
      const next = form.assignees.find(a=>a.user_id!==uid);
      s('assignees', form.assignees.map(a=>({...a, role: a.user_id===next.user_id ? 'main' : 'support'})));
    }
  };

  const submit=async()=>{
    if(!form.title.trim()) return alert(t('req_title_required_alert'));
    setSaving(true);
    try{
      const payload = { ...form, score: form.score===''?undefined:+form.score };
      const{data}=await api.post('/requests',payload);
      onSaved(data.data?.id);
    }
    catch(e){alert(e.response?.data?.message||e.message);}
    finally{setSaving(false);}
  };

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{padding:'10px 18px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:8,background:'var(--wt-surface)',flexShrink:0}}>
        <div style={{flex:1,fontSize:14,fontWeight:800,color:C.dark}}>➕ {t('req_create_title')}</div>
        <button onClick={onClose} style={{width:28,height:28,borderRadius:7,border:`1px solid ${C.border}`,background:'var(--wt-surface)',cursor:'pointer',fontSize:16,color:'var(--wt-text-4)',display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:16}}>
        <Section icon="📋" title={t('req_info_section')}>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div><label style={FL}>{t('req_title_required')}</label><input style={FI} value={form.title} onChange={e=>s('title',e.target.value)} autoFocus placeholder={t('req_title_placeholder')}/></div>
            <div><label style={FL}>{t('req_description_label')}</label><textarea style={{...FI,minHeight:72,resize:'vertical'}} value={form.description} onChange={e=>s('description',e.target.value)}/></div>
            <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
              <div style={{flex:'1 1 140px'}}><label style={FL}>{t('priority')}</label>
                <select style={FI} value={form.priority} onChange={e=>s('priority',e.target.value)}>
                  <option value="high">🔴 {t('req_priority_high')}</option><option value="medium">🟡 {t('req_priority_medium')}</option><option value="low">🟢 {t('req_priority_low')}</option>
                </select>
              </div>
              <div style={{flex:'1 1 140px'}}><label style={FL}>{t('group')}</label>
                <select style={FI} value={form.group_id} onChange={e=>s('group_id',e.target.value)}>
                  <option value="">{t('req_no_group')}</option>
                  {groups.map(g=><option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}
                </select>
              </div>
              <div style={{flex:'1 1 100px'}}><label style={FL}>{t('req_score_rating')}</label>
                <input type="number" min="0" max="10" step="0.5" style={FI} value={form.score}
                  onChange={e=>s('score',e.target.value)} placeholder="–"/>
              </div>
            </div>
            <div><label style={FL}>{t('deadline')}</label><input type="datetime-local" style={FI} value={form.deadline} onChange={e=>s('deadline',e.target.value)}/></div>
          </div>
        </Section>
        <Section icon="👥" title={t('req_assign_to')}>
          <select style={FI} onChange={e=>{ if(!e.target.value) return; const uid=+e.target.value; if(form.assignees.find(a=>a.user_id===uid)) return; const u=users.find(x=>x.id===uid); const role = form.assignees.some(a=>a.role==='main') ? 'support' : 'main'; s('assignees',[...form.assignees,{user_id:uid,role,full_name:u?.full_name,avatar_color:u?.avatar_color}]); e.target.value=''; }}>
            <option value="">{t('req_choose_person')}</option>
            {users.filter(u=>!form.assignees.find(a=>a.user_id===u.id)).map(u=><option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
          <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:8}}>
            {form.assignees.map(a=>(
              <span key={a.user_id} style={{display:'flex',alignItems:'center',gap:5,background:'var(--wt-tint-primary)',border:'1px solid var(--wt-tint-primary-bd)',color:C.primary,fontSize:12,padding:'4px 10px',borderRadius:20,fontWeight:600}}>
                {a.full_name}
                <RoleBadge role={a.role} clickable onClick={()=>toggleFormAssigneeRole(a.user_id)}/>
                <span onClick={()=>s('assignees',form.assignees.filter(x=>x.user_id!==a.user_id))} style={{cursor:'pointer',color:'var(--wt-text-4)',fontSize:14}}>×</span>
              </span>
            ))}
          </div>
        </Section>
      </div>
      <div style={{padding:'10px 16px',borderTop:`1.5px solid ${C.border}`,display:'flex',gap:8,justifyContent:'flex-end',background:'var(--wt-surface)',flexShrink:0}}>
        <button onClick={onClose} style={{padding:'7px 16px',borderRadius:8,border:`1.5px solid ${C.border}`,background:'var(--wt-surface)',fontSize:13,fontWeight:600,cursor:'pointer',color:'var(--wt-text-2)'}}>{t('cancel')}</button>
        <button onClick={submit} disabled={saving||!form.title.trim()} style={{padding:'7px 16px',borderRadius:8,border:'none',background:saving?'var(--wt-text-4)':C.primary,color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>
          {saving?'...':`✓ ${t('req_create_confirm')}`}
        </button>
      </div>
    </div>
  );
}

// ── File Section ──
function FileSection({ taskId, files, user, onReload }) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await api.post(`/requests/${taskId}/files`, form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      onReload();
    } catch(err) {
      alert(err.response?.data?.message || t('req_upload_failed'));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (fileId) => {
    if (!confirm(t('req_delete_file_confirm'))) return;
    try {
      await api.delete(`/requests/${taskId}/files/${fileId}`);
      onReload();
    } catch(e) { alert(e.message); }
  };

  const getIcon = (name) => {
    const ext = (name||'').split('.').pop().toLowerCase();
    if (['jpg','jpeg','png','gif'].includes(ext)) return '🖼';
    if (['pdf'].includes(ext)) return '📄';
    if (['doc','docx'].includes(ext)) return '📝';
    if (['xls','xlsx'].includes(ext)) return '📊';
    if (['zip','rar'].includes(ext)) return '🗜';
    if (['mp4','mov'].includes(ext)) return '🎬';
    return '📎';
  };

  const BASE = (import.meta.env.VITE_API_URL||'http://localhost:3001/api').replace('/api','');

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      {files.map(f => (
        <div key={f.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'var(--wt-surface-2)', borderRadius:8, border:'1px solid var(--wt-line)' }}>
          <span style={{ fontSize:18 }}>{getIcon(f.filename)}</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--wt-ink)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.filename}</div>
            <div style={{ fontSize:10, color:'var(--wt-text-4)' }}>{f.filesize} · {f.uploader_name||'Unknown'}</div>
          </div>
          <a href={f.url||(BASE+'/uploads/'+(f.stored_name||f.filename))}
            target="_blank" rel="noreferrer"
            style={{ fontSize:11, color:'#3a7bd5', textDecoration:'none', fontWeight:600, padding:'3px 8px', borderRadius:5, border:'1px solid var(--wt-tint-primary-bd)', background:'var(--wt-tint-primary)' }}>
            ⬇ {t('req_download')}
          </a>
          <button onClick={()=>handleDelete(f.id)}
            style={{ width:24, height:24, borderRadius:5, border:'1px solid var(--wt-tint-danger)', background:'var(--wt-tint-danger)', color:'#e74c3c', cursor:'pointer', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center' }}>
            ×
          </button>
        </div>
      ))}

      <input ref={fileRef} type="file" style={{ display:'none' }} onChange={handleUpload}
        accept=".jpg,.jpeg,.png,.gif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.csv,.mp4,.mov"/>

      <div onClick={()=>!uploading&&fileRef.current.click()}
        style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'10px 14px', borderRadius:8, border:'2px dashed var(--wt-line-strong)', color:uploading?'var(--wt-text-4)':'var(--wt-text-3)', fontSize:12, fontWeight:600, cursor:uploading?'not-allowed':'pointer', background:uploading?'var(--wt-surface-2)':'transparent' }}
        onMouseEnter={e=>{ if(!uploading){e.currentTarget.style.borderColor='#3a7bd5';e.currentTarget.style.color='#3a7bd5';e.currentTarget.style.background='var(--wt-tint-primary)';}}}
        onMouseLeave={e=>{ if(!uploading){e.currentTarget.style.borderColor='var(--wt-line-strong)';e.currentTarget.style.color='var(--wt-text-3)';e.currentTarget.style.background='transparent';}}}>
        {uploading ? `⏳ ${t('req_uploading')}` : `📎 ${t('req_attach_file')}`}
      </div>
    </div>
  );
}