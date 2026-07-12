import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import useAuth from '../../store/authStore';

const C = {
  primary:'#3a7bd5', dark:'#1e2a3a', success:'#27ae60',
  warning:'#e67e22', danger:'#e74c3c', border:'#e8eaed', bg:'#f7f8fb',
};

const STATUS = {
  pending:     { key:'req_status_pending',     color:'#888',    bg:'#f5f6f8',  icon:'⏳' },
  assigned:    { key:'req_status_pending',     color:'#888',    bg:'#f5f6f8',  icon:'⏳' },
  in_progress: { key:'req_status_in_progress', color:C.warning, bg:'#fff4e8',  icon:'🔄' },
  scoring:     { key:'req_status_scoring',     color:'#8e44ad', bg:'#f3e8ff',  icon:'🏆' },
  reviewing:   { key:'req_status_reviewing',   color:C.primary, bg:'#eef3ff',  icon:'📋' },
  done:        { key:'req_status_done',        color:C.success, bg:'#e8f8ee',  icon:'✅' },
  cancelled:   { key:'req_status_cancelled',   color:C.danger,  bg:'#fde8e8',  icon:'❌' },
};

const PRIORITY = {
  high:   { key:'req_priority_high',   color:C.danger,  bg:'#fde8e8', icon:'🔴' },
  medium: { key:'req_priority_medium', color:C.warning, bg:'#fff4e8', icon:'🟡' },
  low:    { key:'req_priority_low',    color:C.success, bg:'#e8f8ee', icon:'🟢' },
};

const STEPS = [
  { key:'in_progress', tkey:'req_step_in_progress' },
  { key:'scoring',     tkey:'req_step_scoring' },
  { key:'reviewing',   tkey:'req_step_reviewing' },
  { key:'done',        tkey:'req_step_done' },
];

const FI = { width:'100%', padding:'8px 12px', border:'1.5px solid #dde3f0', borderRadius:8, fontSize:13, color:C.dark, outline:'none', boxSizing:'border-box', background:'#fff' };
const FL = { display:'block', fontSize:11, fontWeight:700, color:'#888', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:5 };

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
        background:isSupport?'#fff4e8':'#eef3ff',color:isSupport?C.warning:C.primary,
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
  const [diff, setDiff] = useState(new Date(deadline) - new Date());
  useEffect(()=>{
    const timer = setInterval(()=>setDiff(new Date(deadline)-new Date()), 1000);
    return ()=>clearInterval(timer);
  },[deadline]);
  if (['done','cancelled'].includes(status)) return null;
  if (diff<=0) return <span style={{fontSize:11,fontWeight:700,color:C.danger,background:'#fde8e8',padding:'3px 8px',borderRadius:6}}>⚠ {t('late')}</span>;
  const d=Math.floor(diff/86400000), h=Math.floor(diff%86400000/3600000), m=Math.floor(diff%3600000/60000), s=Math.floor(diff%60000/1000);
  const color=diff<3600000?C.danger:diff<86400000?C.warning:C.success;
  const bg   =diff<3600000?'#fde8e8':diff<86400000?'#fff4e8':'#e8f8ee';
  const label=d>0?t('req_countdown_dhm',{d,h,m}):`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return <span style={{fontSize:11,fontWeight:700,color,background:bg,padding:'3px 8px',borderRadius:6}}>⏱ {label}</span>;
}

// Giờ công tự động: đếm lên liên tục kể từ started_at trong lúc đang làm,
// và đứng yên = khoảng thời gian thực (started_at → completed_at) khi task đã "done".
function WorkDuration({startedAt, completedAt, status}) {
  const { t } = useTranslation();
  const finished = status==='done' && !!completedAt;
  const [now, setNow] = useState(Date.now());
  useEffect(()=>{
    if (!startedAt || finished) return;
    const timer = setInterval(()=>setNow(Date.now()), 1000);
    return ()=>clearInterval(timer);
  },[startedAt, finished]);

  if (!startedAt) return <span style={{fontSize:12,color:'#bbb'}}>{t('req_not_started')}</span>;

  const endMs = finished ? new Date(completedAt).getTime() : now;
  const ms = Math.max(0, endMs - new Date(startedAt).getTime());
  const totalMin = Math.floor(ms/60000);
  const h = Math.floor(totalMin/60), m = totalMin%60, s = Math.floor((ms%60000)/1000);

  if (finished) {
    return <span style={{fontSize:13,fontWeight:700,color:C.success}}>✅ {t('req_hours_worked_total', { defaultValue:`{{h}}h {{m}}p`, h, m })}</span>;
  }
  return <span style={{fontSize:13,fontWeight:700,color:C.warning}}>⏱ {String(h).padStart(2,'0')}:{String(m).padStart(2,'0')}:{String(s).padStart(2,'0')}</span>;
}

function Section({icon,title,extra,children}){
  return (
    <div style={{background:'#fff',borderRadius:10,border:`1.5px solid ${C.border}`,overflow:'hidden',marginBottom:14}}>
      <div style={{padding:'10px 14px',background:C.bg,borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:7}}>
        <span>{icon}</span>
        <div style={{fontSize:13,fontWeight:700,color:C.dark,flex:1}}>{title}</div>
        {extra}
      </div>
      <div style={{padding:'14px 16px'}}>{children}</div>
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
    setTasks(data.data||[]);
  };

  // Phạm vi hiển thị request:
  // - Admin/Manager: thấy toàn bộ.
  // - Leader (không phải admin/manager): thấy request do CHÍNH MÌNH hoặc
  //   THÀNH VIÊN CÙNG NHÓM (mình quản lý) tạo/được giao — không dựa vào
  //   trường "Nhóm" gắn trên request lúc tạo (field đó không phải lúc nào
  //   cũng được chọn), mà dựa vào nhóm thực tế của TỪNG NGƯỜI trong `users`.
  // - User thường: chỉ thấy request do mình tạo hoặc được giao.
  const isAdminOrManager = can('admin','manager');
  const isTeamLeaderOnly = !isAdminOrManager && can('leader');
  const myGroupIds = new Set((user?.groups||[]).map(g=>g.id));

  // Tập user_id của "đội mình" — gồm chính leader + mọi user có chung ít
  // nhất 1 nhóm với leader. Giả định mỗi phần tử trong `users` cũng có
  // trường `groups` (mảng {id,...}) giống cấu trúc của `user.groups`.
  const teamMemberIds = new Set([user?.id]);
  if (isTeamLeaderOnly) {
    users.forEach(u=>{
      const uGroupIds = (u.groups||[]).map(g=>g.id);
      if (uGroupIds.some(id=>myGroupIds.has(id))) teamMemberIds.add(u.id);
    });
  }

  const visibleTasks = isAdminOrManager
    ? tasks
    : isTeamLeaderOnly
      ? tasks.filter(t2 =>
          teamMemberIds.has(t2.created_by) ||
          (t2.assignees||[]).some(a=>teamMemberIds.has(a.user_id))
        )
      : tasks.filter(t2 => t2.created_by===user?.id || (t2.assignees||[]).some(a=>a.user_id===user?.id));

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
    <div className="req-root" style={{flex:1,display:'flex',overflow:'hidden',background:'#fff',minWidth:0}}>
      <style>{`
        .req-root { box-sizing: border-box; }
        .req-root *, .req-root *::before, .req-root *::after { box-sizing: border-box; }
        .req-root button { -webkit-tap-highlight-color: transparent; touch-action: manipulation; transition: transform .1s ease, background .15s, color .15s, border-color .15s; }
        .req-root button:active { transform: scale(0.96); }
        .req-root .req-list-item { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
        .req-root .req-list-item:active { background: #e5edff !important; }
        .req-root *:focus-visible { outline: 2px solid ${C.primary}; outline-offset: 2px; border-radius: 4px; }
        .req-root input:focus, .req-root select:focus, .req-root textarea:focus { font-size: 16px !important; }
        .req-root ::-webkit-scrollbar { width: 8px; height: 8px; }
        .req-root ::-webkit-scrollbar-track { background: transparent; }
        .req-root ::-webkit-scrollbar-thumb { background: #c8d4e6; border-radius: 8px; }
        .req-root ::-webkit-scrollbar-thumb:hover { background: #aebedb; }
        @media (prefers-reduced-motion: reduce) {
          .req-root, .req-root * { animation: none !important; transition: none !important; }
        }
        @media (max-width: 900px) {
          .req-root .req-list-selected { display: none !important; }
          .req-root .req-list-panel { width: 100% !important; }
          .req-root .req-detail-body { flex-direction: column !important; overflow-y: auto !important; overflow-x: hidden !important; }
          .req-root .req-form-panel { border-right: none !important; border-bottom: 1.5px solid ${C.border} !important; overflow: visible !important; }
          .req-root .req-form-scroll { flex: none !important; overflow: visible !important; }
          .req-root .req-chat-panel { width: 100% !important; flex-shrink: 0 !important; height: 420px !important; }
          .req-root .req-detail-topbar { flex-wrap: wrap !important; padding: 10px 14px !important; }
          .req-root .req-detail-crumb { flex-basis: 100% !important; }
          .req-root .req-steps-bar { padding: 8px 14px !important; }
          .req-root .req-filter-toolbar { padding: 8px 10px !important; }
        }
        @media (max-width: 480px) {
          .req-root .req-chat-panel { height: 360px !important; }
        }
      `}</style>

      {/* LEFT: List */}
      <div className={`req-list-panel${selected ? ' req-list-selected' : ''}`} style={{flex:selected?'0 0 300px':'1 1 auto',display:'flex',flexDirection:'column',borderRight:`1.5px solid ${C.border}`,overflow:'hidden'}}>
        <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:8,background:'#fff',flexShrink:0}}>
          <div style={{fontSize:14,fontWeight:800,color:C.dark,flex:1}}>📨 {t('requests')}</div>
          {isLeader&&<button onClick={()=>setSelected('new')} style={{padding:'6px 12px',borderRadius:7,border:'none',background:C.primary,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>➕ {t('create')}</button>}
        </div>

        <div className="req-filter-toolbar" style={{padding:'8px 12px',borderBottom:`1px solid ${C.border}`,background:C.bg,flexShrink:0}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={`🔍 ${t('req_search_title')}`}
            style={{...FI,padding:'6px 10px',fontSize:12,marginBottom:8}}/>
          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
            {[['all',t('req_filter_all'),visibleTasks.length],['pending',t('req_filter_pending'),counts.pending||0],['assigned',t('req_filter_assigned'),counts.assigned||0],['in_progress',t('req_filter_in_progress'),counts.in_progress||0],['scoring',t('req_filter_scoring'),counts.scoring||0],['done',t('req_filter_done'),counts.done||0]].map(([k,l,c])=>(
              <button key={k} onClick={()=>setFilter(k)} style={{padding:'3px 10px',borderRadius:15,fontSize:11,fontWeight:600,cursor:'pointer',border:`1.5px solid ${filter===k?C.primary:C.border}`,background:filter===k?C.primary:'#fff',color:filter===k?'#fff':'#888'}}>
                {l} {c>0&&<span style={{opacity:.7}}>{c}</span>}
              </button>
            ))}
          </div>
        </div>

        <div style={{flex:1,overflowY:'auto'}}>
          {loading&&<div style={{textAlign:'center',padding:32,color:'#aaa'}}>⏳</div>}
          {filtered.map(t2=>{
            const st=STATUS[t2.status]||STATUS.pending;
            const pr=PRIORITY[t2.priority]||PRIORITY.medium;
            const isActive=selected?.id===t2.id;
            const overdue=t2.deadline&&new Date(t2.deadline)<new Date()&&t2.status!=='done';
            // Thẻ đỏ: hết hạn rồi HOẶC còn dưới 1 tiếng — cùng ngưỡng màu đỏ
            // đang dùng trong Countdown, chỉ là đưa lên hàng tiêu đề cho dễ thấy.
            const timeLeft = t2.deadline ? new Date(t2.deadline)-new Date() : null;
            const isUrgent = t2.deadline && !['done','cancelled'].includes(t2.status) && timeLeft<3600000;
            // "Mới" = CV vừa được tạo trong 24h gần đây — tách riêng khỏi badge đếm
            // ngược deadline (Countdown) để không bị nhầm 2 ý nghĩa khác nhau.
            const isNew = t2.created_at && (Date.now()-new Date(t2.created_at).getTime()) < 24*60*60*1000;
            return (
              <div key={t2.id} className="req-list-item" onClick={()=>setSelected(t2)}
                style={{padding:'12px 14px',borderBottom:`1px solid #f0f2f8`,cursor:'pointer',background:isActive?'#eef3ff':'transparent',borderLeft:`3px solid ${isActive?C.primary:'transparent'}`}}
                onMouseEnter={e=>{if(!isActive)e.currentTarget.style.background='#f7f8fb';}}
                onMouseLeave={e=>{if(!isActive)e.currentTarget.style.background='transparent';}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}>
                  <span style={{fontSize:11,fontWeight:700,padding:'2px 7px',borderRadius:8,background:pr.bg,color:pr.color}}>{pr.icon}</span>
                  {isNew&&<span style={{fontSize:9,fontWeight:800,padding:'2px 6px',borderRadius:6,background:'#8e44ad',color:'#fff',whiteSpace:'nowrap'}}>🆕 {t('req_new_badge')}</span>}
                  {isUrgent&&<span style={{fontSize:9,fontWeight:800,padding:'2px 6px',borderRadius:6,background:C.danger,color:'#fff',whiteSpace:'nowrap'}}>⚠️ {t('req_urgent_badge')}</span>}
                  <div style={{flex:1,fontSize:13,fontWeight:700,color:C.dark,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t2.title}</div>
                  <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:8,background:st.bg,color:st.color,whiteSpace:'nowrap'}}>{st.icon} {t(st.key)}</span>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8,fontSize:11,color:'#aaa',flexWrap:'wrap'}}>
                  <span>👤 {t2.creator_name}</span>
                  {t2.deadline&&<span style={{color:overdue?C.danger:'#aaa'}}>⏰ {new Date(t2.deadline).toLocaleDateString(currentLocale)}</span>}
                  {t2.deadline&&<Countdown deadline={t2.deadline} status={t2.status}/>}
                  {t2.assignees?.length>0&&<div style={{display:'flex',gap:2,marginLeft:'auto'}}>{t2.assignees.slice(0,3).map(a=><Chip key={a.user_id} color={a.avatar_color||C.primary} name={a.full_name||'?'} size={18}/>)}</div>}
                </div>
              </div>
            );
          })}
          {!loading&&!filtered.length&&<div style={{textAlign:'center',padding:40,color:'#bbb',fontSize:13}}>{t('req_no_tasks')}</div>}
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
          <div style={{fontSize:14,color:'#bbb'}}>{t('req_no_task_selected')}</div>
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
  const [scoreInput,  setScoreInput]  = useState('');
  const [attachFile, setAttachFile]   = useState(null);
  const [sendingMsg, setSendingMsg]   = useState(false);
  const feedRef = useRef();
  const chatFileRef = useRef();

  useEffect(()=>{ loadTask(); },[taskId]);

  const loadTask = async()=>{
    setLoading(true);
    try{
      const{data}=await api.get(`/requests/${taskId}`);
      setTask(data.data);
      setScoreInput(data.data.score??'');
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
    catch(e){alert(e.message);}
  };

  const removeAssignee = async uid=>{
    try{await api.delete(`/requests/${taskId}/assign/${uid}`);loadTask();}
    catch(e){alert(e.message);}
  };

  // Đổi vai trò Chính ↔ Hỗ trợ cho 1 người đã được thêm — backend addAssignee dùng
  // INSERT IGNORE (không update được role của dòng đã tồn tại), nên cách gọn nhất
  // là gỡ ra rồi thêm lại với role mới, tận dụng 2 endpoint sẵn có.
  const toggleAssigneeRole = async (a)=>{
    const newRole = a.role==='support' ? 'main' : 'support';
    try{
      await api.delete(`/requests/${taskId}/assign/${a.user_id}`);
      await api.post(`/requests/${taskId}/assign`,{user_id:a.user_id,role:newRole});
      loadTask();
    }catch(e){alert(e.message);}
  };

  const claimTask = async()=>{
    try{await api.post(`/requests/${taskId}/claim`);await loadTask();onSaved?.(task);}
    catch(e){alert(e.response?.data?.message||e.message);}
  };

  const markDone = async()=>{
    await save({status:'scoring'});
  };

  const deleteTask = async()=>{
    if(!confirm(t('req_delete_confirm'))) return;
    try{await api.delete(`/requests/${taskId}`);onSaved?.();onClose();}
    catch(e){alert(e.message);}
  };

  if(loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'#aaa'}}>⏳</div>;
  if(!task)   return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'#aaa'}}>{t('req_not_found')}</div>;

  const st=STATUS[task.status]||STATUS.pending;
  const pr=PRIORITY[task.priority]||PRIORITY.medium;
  const isAdmin    = ['admin','manager'].includes(user?.role);
  const isCreator  = task.created_by === user?.id;
  const isAssignee = (task.assignees||[]).some(a=>a.user_id===user?.id);
  const canManageAssignees = (isAdmin||isLeader||isAssignee) && !['done','cancelled'].includes(task.status);
  const overdue=task.deadline&&new Date(task.deadline)<new Date()&&task.status!=='done';
  const existingIds=new Set((task.assignees||[]).map(a=>a.user_id));
  const chatItems=task.comments||[];

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>

      {/* Topbar */}
      <div className="req-detail-topbar" style={{padding:'10px 18px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:8,background:'#fff',flexShrink:0}}>
        <div className="req-detail-crumb" style={{flex:1,fontSize:13,color:'#888',display:'flex',alignItems:'center',gap:5,minWidth:0}}>
          <span style={{color:C.primary,cursor:'pointer',whiteSpace:'nowrap'}} onClick={onClose}>📨 {t('requests')}</span>
          <span style={{color:'#ccc'}}>›</span>
          <span style={{color:C.dark,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{task.title}</span>
        </div>
        <span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:8,background:st.bg,color:st.color,whiteSpace:'nowrap'}}>{st.icon} {t(st.key)}</span>
        {task.status==='pending'&&!isLeader&&(
          <button onClick={claimTask} style={{padding:'6px 12px',borderRadius:7,border:'none',background:C.primary,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>🙋 {t('req_claim_task')}</button>
        )}
        {task.status==='assigned'&&isAssignee&&!isAdmin&&(
          <button onClick={()=>save({status:'in_progress'})} style={{padding:'6px 12px',borderRadius:7,border:'none',background:C.warning,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>🔄 {t('req_start_work')}</button>
        )}
        {(task.status==='in_progress'||(task.status==='assigned'&&isAssignee))&&!isAdmin&&(
          <button onClick={markDone} style={{padding:'6px 12px',borderRadius:7,border:'none',background:C.success,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>✅ {t('req_mark_done')}</button>
        )}
        <button onClick={()=>save({})} disabled={saving} style={{padding:'6px 12px',borderRadius:7,border:'none',background:saving?'#aaa':C.primary,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>💾 {t('save')}</button>
        <button onClick={onClose} style={{width:28,height:28,borderRadius:7,border:`1px solid ${C.border}`,background:'#fff',cursor:'pointer',fontSize:16,color:'#aaa',display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
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
              <div style={{display:'flex',alignItems:'center',gap:5,fontSize:11,fontWeight:600,color:done||isDone?C.success:active?C.primary:'#bbb'}}>
                <div style={{width:7,height:7,borderRadius:'50%',background:done||isDone?C.success:active?C.primary:'#ddd'}}/>
                {t(s.tkey)}
              </div>
              {i<arr.length-1&&<div style={{width:20,height:2,background:done||isDone?C.success:'#e8eaed',borderRadius:2,margin:'0 3px'}}/>}
            </div>
          );
        })}
      </div>

      {/* Body */}
      <div className="req-detail-body" style={{flex:1,display:'flex',overflow:'hidden'}}>

        <div className="req-form-panel" style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',borderRight:`1.5px solid ${C.border}`}}>
          <div className="req-form-scroll" style={{flex:1,overflowY:'auto',padding:16}}>

            <Section icon="📋" title={t('req_job_info')}
              extra={<span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:8,background:pr.bg,color:pr.color}}>{pr.icon} {t(pr.key)}</span>}>
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <div><label style={FL}>{t('req_title_field')}</label>
                  <input style={{...FI,background:(isCreator||isAdmin)?'#fff':'#f7f8fb',color:(isCreator||isAdmin)?C.dark:'#888'}}
                    defaultValue={task.title}
                    readOnly={!isCreator&&!isAdmin}
                    onBlur={e=>(isCreator||isAdmin)&&e.target.value!==task.title&&save({title:e.target.value})}/>
                </div>
                <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
                  <div style={{flex:'1 1 160px'}}><label style={FL}>{t('req_creator_label')}</label>
                    <input style={{...FI,background:'#f7f8fb',color:'#888'}} value={task.creator_name||'—'} readOnly/>
                  </div>
                  <div style={{flex:'1 1 120px'}}><label style={FL}>{t('req_score_leader_label')}</label>
                    <input style={{...FI,background:'#f7f8fb',color:task.score!=null?C.success:'#bbb'}} value={task.score!=null?`${task.score}đ`:t('req_not_scored')} readOnly/>
                  </div>
                </div>
                <div><label style={FL}>{t('req_description_label')}</label>
                  <textarea style={{...FI,minHeight:72,resize:'vertical',background:(isCreator||isAdmin)?'#fff':'#f7f8fb',color:(isCreator||isAdmin)?C.dark:'#888'}}
                    defaultValue={task.description||''}
                    readOnly={!isCreator&&!isAdmin}
                    onBlur={e=>(isCreator||isAdmin)&&e.target.value!==(task.description||'')&&save({description:e.target.value})}/>
                </div>
                <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
                  <div style={{flex:'1 1 160px'}}><label style={FL}>{t('priority')}</label>
                    <select style={{...FI,background:(isCreator||isAdmin)?'#fff':'#f7f8fb'}}
                      value={task.priority||'medium'}
                      disabled={!isCreator&&!isAdmin}
                      onChange={e=>(isCreator||isAdmin)&&save({priority:e.target.value})}>
                      <option value="high">🔴 {t('req_priority_high')}</option><option value="medium">🟡 {t('req_priority_medium')}</option><option value="low">🟢 {t('req_priority_low')}</option>
                    </select>
                  </div>
                  <div style={{flex:'1 1 160px'}}><label style={FL}>{t('status')}</label>
                    <div style={{...FI,display:'flex',alignItems:'center',background:'#f7f8fb'}}>
                      <span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:8,background:st.bg,color:st.color}}>{st.icon} {t(st.key)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </Section>

            <Section icon="⏱" title={t('req_time_section')}>
              <div style={{display:'grid',gridTemplateColumns:'repeat(2, minmax(0,1fr))',gap:12,marginBottom:12}}>
                <div style={{background:C.bg,borderRadius:8,padding:'9px 12px',border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#aaa',textTransform:'uppercase',marginBottom:4}}>{t('req_time_received')}</div>
                  <div style={{fontSize:13,fontWeight:600,color:C.dark}}>{fmtDt(task.created_at)}</div>
                </div>
                <div style={{background:task.started_at?'#e8f8ee':C.bg,borderRadius:8,padding:'9px 12px',border:`1px solid ${task.started_at?'#b8e8c8':C.border}`}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#aaa',textTransform:'uppercase',marginBottom:4}}>{t('req_time_started')}</div>
                  {task.started_at
                    ? <div style={{fontSize:13,fontWeight:600,color:C.success}}>{fmtDt(task.started_at)}</div>
                    : <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span style={{fontSize:12,color:'#bbb'}}>{t('req_not_started')}</span>
                        {(isAssignee||isAdmin)&&task.status!=='done'&&(
                          <button onClick={()=>save({status:'in_progress'})}
                            style={{padding:'3px 10px',borderRadius:6,border:'none',background:C.warning,color:'#fff',fontSize:11,fontWeight:600,cursor:'pointer'}}>
                            🔄 {t('req_start_btn')}
                          </button>
                        )}
                      </div>
                  }
                </div>
                <div style={{background:overdue?'#fde8e8':C.bg,borderRadius:8,padding:'9px 12px',border:`1px solid ${overdue?'#f5c0c0':C.border}`}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#aaa',textTransform:'uppercase',marginBottom:4}}>{t('req_time_expected')}</div>
                  <div style={{fontSize:13,fontWeight:600,color:overdue?C.danger:C.dark}}>{fmtDt(task.deadline)}</div>
                  {task.deadline&&<div style={{marginTop:4}}><Countdown deadline={task.deadline} status={task.status}/></div>}
                </div>
                <div style={{background:task.completed_at?'#e8f8ee':C.bg,borderRadius:8,padding:'9px 12px',border:`1px solid ${task.completed_at?'#b8e8c8':C.border}`}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#aaa',textTransform:'uppercase',marginBottom:4}}>{t('req_time_completed')}</div>
                  <div style={{fontSize:13,fontWeight:600,color:task.completed_at?C.success:'#bbb'}}>
                    {task.completed_at?fmtDt(task.completed_at):t('req_not_completed')}
                  </div>
                </div>
              </div>
              <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
                <div style={{flex:'1 1 200px'}}><label style={FL}>
                    {t('req_deadline_change')}
                    {!isCreator&&!isAdmin&&<span style={{color:'#bbb',fontSize:10,marginLeft:6}}>🔒 {t('req_lock_creator_admin')}</span>}
                  </label>
                  <input type="datetime-local"
                    style={{...FI,background:(!isCreator&&!isAdmin)?'#f7f8fb':'#fff',color:(!isCreator&&!isAdmin)?'#aaa':'#1e2a3a'}}
                    defaultValue={task.deadline?new Date(task.deadline).toISOString().slice(0,16):''}
                    disabled={!isCreator&&!isAdmin}
                    onBlur={e=>(isCreator||isAdmin)&&save({deadline:e.target.value})}/>
                </div>
                <div style={{flex:'1 1 160px'}}><label style={FL}>{t('req_hours_log')}</label>
                  <div style={{...FI,background:'#f7f8fb',display:'flex',alignItems:'center'}}>
                    <WorkDuration startedAt={task.started_at} completedAt={task.completed_at} status={task.status}/>
                  </div>
                </div>
              </div>
            </Section>

            <Section icon="👥" title={t('req_assignees_section')} extra={<span style={{fontSize:11,color:'#aaa'}}>{t('req_max_assignees')}</span>}>
              <div style={{display:'flex',flexWrap:'wrap',gap:8,alignItems:'center'}}>
                {(task.assignees||[]).map(a=>(
                  <div key={a.user_id} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px',borderRadius:20,background:'#eef3ff',border:'1.5px solid #c8d8f0',fontSize:12,color:C.primary,fontWeight:600}}>
                    <div style={{width:20,height:20,borderRadius:'50%',background:a.avatar_color||C.primary,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:9,fontWeight:700}}>
                      {(a.full_name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                    </div>
                    {a.full_name}
                    <RoleBadge role={a.role} clickable={canManageAssignees} onClick={()=>toggleAssigneeRole(a)}/>
                    {canManageAssignees&&<span onClick={()=>removeAssignee(a.user_id)} style={{cursor:'pointer',color:'#aaa',fontSize:15,lineHeight:1}} onMouseEnter={e=>e.target.style.color=C.danger} onMouseLeave={e=>e.target.style.color='#aaa'}>×</span>}
                  </div>
                ))}
                {task.status==='pending' && (task.assignees||[]).length===0 && !isLeader && !isAdmin && (
                  <div onClick={claimTask} style={{display:'flex',alignItems:'center',gap:5,padding:'5px 10px',borderRadius:20,border:`1.5px dashed ${C.primary}`,color:C.primary,fontSize:12,fontWeight:600,cursor:'pointer'}}>
                    🙋 {t('req_claim_task')}
                  </div>
                )}
                {canManageAssignees&&(task.assignees||[]).length<12&&(
                  <div onClick={()=>{
                      // Người đầu tiên được thêm → mặc định "Chính"; từ người thứ 2 trở đi → mặc định "Hỗ trợ".
                      // Vẫn cho đổi tay ở thanh chọn bên dưới nếu cần khác đi.
                      setPendingRole((task.assignees||[]).length===0 ? 'main' : 'support');
                      setShowAddUser(p=>!p);
                    }} style={{display:'flex',alignItems:'center',gap:5,padding:'5px 10px',borderRadius:20,border:'1.5px dashed #c0cce0',color:'#7a9bbf',fontSize:12,cursor:'pointer'}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=C.primary;e.currentTarget.style.color=C.primary;}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor='#c0cce0';e.currentTarget.style.color='#7a9bbf';}}>
                    ＋ {t('req_add_person')}
                  </div>
                )}
              </div>
              {showAddUser&&(
                <div style={{marginTop:8,background:'#fff',border:`1.5px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
                  <div style={{display:'flex',gap:6,padding:'8px 10px',borderBottom:`1px solid ${C.border}`,background:C.bg}}>
                    <span style={{fontSize:11,color:'#888',fontWeight:600,alignSelf:'center'}}>{t('req_role_label')}:</span>
                    <button onClick={()=>setPendingRole('main')}
                      style={{padding:'3px 10px',borderRadius:12,border:`1.5px solid ${pendingRole==='main'?C.primary:C.border}`,background:pendingRole==='main'?C.primary:'#fff',color:pendingRole==='main'?'#fff':'#888',fontSize:11,fontWeight:600,cursor:'pointer'}}>
                      ⭐ {t('req_role_main')}
                    </button>
                    <button onClick={()=>setPendingRole('support')}
                      style={{padding:'3px 10px',borderRadius:12,border:`1.5px solid ${pendingRole==='support'?C.warning:C.border}`,background:pendingRole==='support'?C.warning:'#fff',color:pendingRole==='support'?'#fff':'#888',fontSize:11,fontWeight:600,cursor:'pointer'}}>
                      🤝 {t('req_role_support')}
                    </button>
                  </div>
                  <div style={{maxHeight:160,overflowY:'auto'}}>
                    {users.filter(u=>!existingIds.has(u.id)).map(u=>(
                      <div key={u.id} onClick={()=>addAssignee(u.id,pendingRole)}
                        style={{display:'flex',alignItems:'center',gap:8,padding:'7px 12px',cursor:'pointer',fontSize:12}}
                        onMouseEnter={e=>e.currentTarget.style.background='#eef3ff'}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <Chip color={u.avatar_color||C.primary} name={u.full_name} size={22}/>
                        <span style={{flex:1,color:C.dark,fontWeight:500}}>{u.full_name}</span>
                        <span style={{color:'#aaa',fontSize:11}}>{u.role}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Section>

            <Section icon="📎" title={t('req_files_section')}>
              <FileSection taskId={task.id} files={task.files||[]} user={user} onReload={loadTask}/>
            </Section>

            {isLeader&&(
              <Section icon="🏆" title={t('req_leader_scoring')}>
                {task.status==='scoring'&&(
                  <div style={{display:'flex',alignItems:'center',gap:10,background:'#f0f4ff',padding:'14px 16px',borderRadius:10,border:'1.5px solid #c8d8f0',flexWrap:'wrap'}}>
                    <div style={{flex:'1 1 160px',fontSize:12,color:'#7a9bbf'}}>{t('req_waiting_completion')}</div>
                    <button onClick={()=>save({status:'in_progress',completed_at:null})}
                      style={{padding:'7px 14px',borderRadius:8,border:`1.5px solid ${C.border}`,background:'#fff',color:'#888',fontSize:12,fontWeight:600,cursor:'pointer'}}>↩️ {t('req_send_back')}</button>
                    <button onClick={()=>save({status:'reviewing'})}
                      style={{padding:'7px 14px',borderRadius:8,border:'none',background:C.primary,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>✅ {t('req_scoring_done')}</button>
                  </div>
                )}
                {task.status==='reviewing'&&(
                  <div style={{display:'flex',alignItems:'center',gap:12,background:'#eef3ff',padding:'14px 16px',borderRadius:10,border:'1.5px solid #c8d8f0',flexWrap:'wrap'}}>
                    <div style={{flex:'1 1 160px'}}>
                      <div style={{fontSize:12,color:C.primary,fontWeight:600}}>{t('req_ready_for_final_approval')}</div>
                      <div style={{fontSize:11,color:'#7a9bbf',marginTop:2}}>{t('req_rescore_hint')}</div>
                    </div>
                    <input type="number" min="0" max="10" step="0.5" value={scoreInput}
                      onChange={e=>setScoreInput(e.target.value)}
                      placeholder="–"
                      style={{width:70,textAlign:'center',border:'2px solid #3a7bd5',borderRadius:10,padding:'8px',fontSize:20,fontWeight:900,color:C.primary,background:'#fff',outline:'none'}}/>
                    <div style={{fontSize:13,color:'#aaa'}}>/ 10</div>
                    <button onClick={()=>save({status:'done', score: scoreInput===''?undefined:+scoreInput})}
                      style={{padding:'7px 14px',borderRadius:8,border:'none',background:C.success,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>✅ {t('req_approve_done')}</button>
                  </div>
                )}
                {task.status==='done'&&(
                  <div>
                    <div style={{fontSize:12,color:C.success,fontWeight:600,marginBottom:8}}>✅ {t('req_status_done')}</div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                      {(task.assignees||[]).map(a=>(
                        <span key={a.user_id} style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:'#555',background:C.bg,padding:'3px 8px',borderRadius:10}}>
                          {a.full_name}<RoleBadge role={a.role} clickable={false}/>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {!['scoring','reviewing','done'].includes(task.status)&&(
                  <div style={{fontSize:12,color:'#bbb'}}>{t('req_waiting_completion')}</div>
                )}
              </Section>
            )}

          </div>

          <div style={{padding:'10px 16px',borderTop:`1.5px solid ${C.border}`,display:'flex',gap:8,alignItems:'center',background:'#fff',flexShrink:0}}>
            <div style={{flex:1,fontSize:12,color:'#aaa'}}>{t('req_created_by',{time:fmtDt(task.created_at),name:task.creator_name})}</div>
            {isLeader&&<button onClick={deleteTask} style={{padding:'6px 12px',borderRadius:7,border:'1px solid #fde8e8',background:'#fde8e8',color:C.danger,fontSize:12,fontWeight:600,cursor:'pointer'}}>🗑 {t('delete')}</button>}
            {(task.status==='in_progress'||task.status==='assigned')&&<button onClick={markDone} style={{padding:'6px 12px',borderRadius:7,border:'1px solid #fff4e8',background:'#fff4e8',color:C.warning,fontSize:12,fontWeight:600,cursor:'pointer'}}>✅ {t('req_submit_done')}</button>}
            <button onClick={()=>save({})} disabled={saving} style={{padding:'6px 14px',borderRadius:7,border:'none',background:saving?'#aaa':C.success,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>💾 {t('save')}</button>
          </div>
        </div>

        <div className="req-chat-panel" style={{width:300,flexShrink:0,display:'flex',flexDirection:'column',overflow:'hidden',background:'#fafbfc'}}>
          <div style={{padding:'11px',textAlign:'center',fontSize:12,fontWeight:600,color:C.primary,borderBottom:`2.5px solid ${C.primary}`,flexShrink:0}}>💬 {t('req_messages_tab')}</div>

          <div ref={feedRef} style={{flex:1,overflowY:'auto',padding:12,display:'flex',flexDirection:'column',gap:10}}>
            {chatItems.length===0&&<div style={{textAlign:'center',padding:20,color:'#bbb',fontSize:12}}>{t('req_no_messages')}</div>}
            {chatItems.map((c,i)=>{
              const isMe=c.user_id===user?.id;
              return (
                <div key={i} style={{display:'flex',gap:8,flexDirection:isMe?'row-reverse':'row'}}>
                  <Chip color={c.avatar_color||C.primary} name={c.full_name||'?'} size={26}/>
                  <div style={{maxWidth:'80%'}}>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3,flexDirection:isMe?'row-reverse':'row'}}>
                      <span style={{fontSize:11,fontWeight:700,color:isMe?C.primary:C.dark}}>{c.full_name}</span>
                      <span style={{fontSize:10,color:'#bbb'}}>{fmtDt(c.created_at)}</span>
                    </div>
                    <div style={{background:isMe?'#eef3ff':'#fff',border:`1px solid ${isMe?'#c8d8f0':C.border}`,borderRadius:isMe?'12px 4px 12px 12px':'4px 12px 12px 12px',padding:'8px 12px',fontSize:12,color:'#333',lineHeight:1.5}}>
                      {(c.content||c.message)&&<div>{c.content||c.message}</div>}
                      {(c.file_name||c.filename)&&(
                        <a href={resolveFileUrl(c.file_url||c.url)} target="_blank" rel="noreferrer"
                          style={{display:'flex',alignItems:'center',gap:6,marginTop:(c.content||c.message)?6:0,padding:'6px 9px',borderRadius:8,background:'#fff',border:`1px solid ${C.border}`,textDecoration:'none',color:C.primary,fontSize:11,fontWeight:600}}>
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
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6,padding:'5px 9px',borderRadius:8,background:'#eef3ff',border:'1px solid #c8d8f0',fontSize:11,color:C.primary,fontWeight:600}}>
                <span>{chatFileIcon(attachFile.name)}</span>
                <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{attachFile.name}</span>
                <span onClick={()=>setAttachFile(null)} style={{cursor:'pointer',color:'#aaa',fontSize:14}}>×</span>
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
                style={{width:28,height:28,borderRadius:7,border:`1.5px solid ${C.border}`,background:'#fff',color:'#7a9bbf',cursor:'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center'}}>📎</button>
              <button onClick={sendComment} disabled={sendingMsg||(!comment.trim()&&!attachFile)}
                style={{padding:'5px 14px',borderRadius:7,border:'none',background:(comment.trim()||attachFile)&&!sendingMsg?C.primary:'#ddd',color:'#fff',fontSize:11,fontWeight:600,cursor:'pointer'}}>
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

  const toggleFormAssigneeRole = (uid)=>{
    s('assignees', form.assignees.map(a=>a.user_id===uid?{...a,role:a.role==='support'?'main':'support'}:a));
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
      <div style={{padding:'10px 18px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:8,background:'#fff',flexShrink:0}}>
        <div style={{flex:1,fontSize:14,fontWeight:800,color:C.dark}}>➕ {t('req_create_title')}</div>
        <button onClick={onClose} style={{width:28,height:28,borderRadius:7,border:`1px solid ${C.border}`,background:'#fff',cursor:'pointer',fontSize:16,color:'#aaa',display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
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
          <select style={FI} onChange={e=>{ if(!e.target.value) return; const uid=+e.target.value; if(form.assignees.find(a=>a.user_id===uid)) return; const u=users.find(x=>x.id===uid); const role = form.assignees.length===0 ? 'main' : 'support'; s('assignees',[...form.assignees,{user_id:uid,role,full_name:u?.full_name,avatar_color:u?.avatar_color}]); e.target.value=''; }}>
            <option value="">{t('req_choose_person')}</option>
            {users.filter(u=>!form.assignees.find(a=>a.user_id===u.id)).map(u=><option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
          <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:8}}>
            {form.assignees.map(a=>(
              <span key={a.user_id} style={{display:'flex',alignItems:'center',gap:5,background:'#eef3ff',border:'1px solid #c8d8f0',color:C.primary,fontSize:12,padding:'4px 10px',borderRadius:20,fontWeight:600}}>
                {a.full_name}
                <RoleBadge role={a.role} clickable onClick={()=>toggleFormAssigneeRole(a.user_id)}/>
                <span onClick={()=>s('assignees',form.assignees.filter(x=>x.user_id!==a.user_id))} style={{cursor:'pointer',color:'#aaa',fontSize:14}}>×</span>
              </span>
            ))}
          </div>
        </Section>
      </div>
      <div style={{padding:'10px 16px',borderTop:`1.5px solid ${C.border}`,display:'flex',gap:8,justifyContent:'flex-end',background:'#fff',flexShrink:0}}>
        <button onClick={onClose} style={{padding:'7px 16px',borderRadius:8,border:`1.5px solid ${C.border}`,background:'#fff',fontSize:13,fontWeight:600,cursor:'pointer',color:'#555'}}>{t('cancel')}</button>
        <button onClick={submit} disabled={saving||!form.title.trim()} style={{padding:'7px 16px',borderRadius:8,border:'none',background:saving?'#aaa':C.primary,color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>
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
        <div key={f.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'#f7f8fb', borderRadius:8, border:'1px solid #e8eaed' }}>
          <span style={{ fontSize:18 }}>{getIcon(f.filename)}</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12, fontWeight:600, color:'#1e2a3a', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.filename}</div>
            <div style={{ fontSize:10, color:'#aaa' }}>{f.filesize} · {f.uploader_name||'Unknown'}</div>
          </div>
          <a href={f.url||(BASE+'/uploads/'+(f.stored_name||f.filename))}
            target="_blank" rel="noreferrer"
            style={{ fontSize:11, color:'#3a7bd5', textDecoration:'none', fontWeight:600, padding:'3px 8px', borderRadius:5, border:'1px solid #c8d8f0', background:'#eef3ff' }}>
            ⬇ {t('req_download')}
          </a>
          <button onClick={()=>handleDelete(f.id)}
            style={{ width:24, height:24, borderRadius:5, border:'1px solid #fde8e8', background:'#fde8e8', color:'#e74c3c', cursor:'pointer', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center' }}>
            ×
          </button>
        </div>
      ))}

      <input ref={fileRef} type="file" style={{ display:'none' }} onChange={handleUpload}
        accept=".jpg,.jpeg,.png,.gif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.csv,.mp4,.mov"/>

      <div onClick={()=>!uploading&&fileRef.current.click()}
        style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'10px 14px', borderRadius:8, border:'2px dashed #c0cce0', color:uploading?'#aaa':'#7a9bbf', fontSize:12, fontWeight:600, cursor:uploading?'not-allowed':'pointer', background:uploading?'#f9f9f9':'transparent' }}
        onMouseEnter={e=>{ if(!uploading){e.currentTarget.style.borderColor='#3a7bd5';e.currentTarget.style.color='#3a7bd5';e.currentTarget.style.background='#f0f4ff';}}}
        onMouseLeave={e=>{ if(!uploading){e.currentTarget.style.borderColor='#c0cce0';e.currentTarget.style.color='#7a9bbf';e.currentTarget.style.background='transparent';}}}>
        {uploading ? `⏳ ${t('req_uploading')}` : `📎 ${t('req_attach_file')}`}
      </div>
    </div>
  );
}