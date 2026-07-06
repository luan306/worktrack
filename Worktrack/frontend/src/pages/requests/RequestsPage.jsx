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
    searchParams.get('create')==='1' ? 'new' :
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

  const filtered = tasks
    .filter(t=>{
      if (filter!=='all' && t.status!==filter) return false;
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a,b)=>{
      // done/cancelled xuống dưới
      const doneA = ['done','cancelled'].includes(a.status);
      const doneB = ['done','cancelled'].includes(b.status);
      if (doneA !== doneB) return doneA ? 1 : -1;
      // có deadline lên trên, sort theo deadline gần nhất
      if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline);
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return new Date(b.created_at) - new Date(a.created_at);
    });

  const counts = {};
  tasks.forEach(t=>{ counts[t.status]=(counts[t.status]||0)+1; });

  return (
    <div className="req-root" style={{flex:1,display:'flex',overflow:'hidden',background:'#fff',minWidth:0}}>
      <style>{`
        .req-root { box-sizing: border-box; }
        .req-root *, .req-root *::before, .req-root *::after { box-sizing: border-box; }

        /* ── Cảm giác chạm mượt & phản hồi khi nhấn ── */
        .req-root button { -webkit-tap-highlight-color: transparent; touch-action: manipulation; transition: transform .1s ease, background .15s, color .15s, border-color .15s; }
        .req-root button:active { transform: scale(0.96); }
        .req-root .req-list-item { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
        .req-root .req-list-item:active { background: #e5edff !important; }

        /* ── Focus rõ ràng cho bàn phím (a11y) ── */
        .req-root *:focus-visible { outline: 2px solid ${C.primary}; outline-offset: 2px; border-radius: 4px; }

        /* ── Chặn Safari iOS tự zoom khi focus input/select/textarea ── */
        .req-root input:focus, .req-root select:focus, .req-root textarea:focus { font-size: 16px !important; }

        /* ── Thanh cuộn mảnh, đẹp trên desktop ── */
        .req-root ::-webkit-scrollbar { width: 8px; height: 8px; }
        .req-root ::-webkit-scrollbar-track { background: transparent; }
        .req-root ::-webkit-scrollbar-thumb { background: #c8d4e6; border-radius: 8px; }
        .req-root ::-webkit-scrollbar-thumb:hover { background: #aebedb; }

        @media (prefers-reduced-motion: reduce) {
          .req-root, .req-root * { animation: none !important; transition: none !important; }
        }

        @media (max-width: 900px) {
          /* Ẩn danh sách khi đã chọn 1 CV — cho detail chiếm toàn màn hình */
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
      <div className={`req-list-panel${selected ? ' req-list-selected' : ''}`} style={{width:selected?300:undefined,flex:selected?undefined:1,flexShrink:0,display:'flex',flexDirection:'column',borderRight:`1.5px solid ${C.border}`,overflow:'hidden'}}>
        <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:8,background:'#fff',flexShrink:0}}>
          <div style={{fontSize:14,fontWeight:800,color:C.dark,flex:1}}>📨 {t('requests')}</div>
          <button onClick={()=>setSelected('new')} style={{padding:'6px 12px',borderRadius:7,border:'none',background:C.primary,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>➕ {t('create')}</button>
        </div>

        <div className="req-filter-toolbar" style={{padding:'8px 12px',borderBottom:`1px solid ${C.border}`,background:C.bg,flexShrink:0}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={`🔍 ${t('req_search_title')}`}
            style={{...FI,padding:'6px 10px',fontSize:12,marginBottom:8}}/>
          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
            {[['all',t('req_filter_all'),tasks.length],['pending',t('req_filter_pending'),counts.pending||0],['assigned',t('req_filter_assigned'),counts.assigned||0],['in_progress',t('req_filter_in_progress'),counts.in_progress||0],['scoring',t('req_filter_scoring'),counts.scoring||0],['done',t('req_filter_done'),counts.done||0]].map(([k,l,c])=>(
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
            return (
              <div key={t2.id} className="req-list-item" onClick={()=>setSelected(t2)}
                style={{padding:'12px 14px',borderBottom:`1px solid #f0f2f8`,cursor:'pointer',background:isActive?'#eef3ff':'transparent',borderLeft:`3px solid ${isActive?C.primary:'transparent'}`}}
                onMouseEnter={e=>{if(!isActive)e.currentTarget.style.background='#f7f8fb';}}
                onMouseLeave={e=>{if(!isActive)e.currentTarget.style.background='transparent';}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}>
                  <span style={{fontSize:11,fontWeight:700,padding:'2px 7px',borderRadius:8,background:pr.bg,color:pr.color}}>{pr.icon}</span>
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
          <div style={{fontSize:14,color:'#bbb'}}>Chọn CV để xem chi tiết</div>
          <button onClick={()=>setSelected('new')} style={{padding:'8px 20px',borderRadius:8,border:'none',background:C.primary,color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer',marginTop:4}}>➕ Tạo CV mới</button>
        </div>
      )}
    </div>
  );
}

// ── Detail Panel ──
function DetailPanel({taskId,users,isLeader,user,onClose,onSaved}){
  const [task,    setTask]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [comment, setComment] = useState('');
  const [tab,     setTab]     = useState('chat');
  const [scoreInput,  setScoreInput]  = useState('');
  const [showAddUser, setShowAddUser] = useState(false);
  const feedRef = useRef();

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
    if(!comment.trim()) return;
    try{await api.post(`/requests/${taskId}/comments`,{content:comment});setComment('');loadTask();}
    catch(e){alert(e.message);}
  };

  const addAssignee = async uid=>{
    try{await api.post(`/requests/${taskId}/assign`,{user_id:uid,role:'main'});loadTask();setShowAddUser(false);}
    catch(e){alert(e.message);}
  };

  const removeAssignee = async uid=>{
    try{await api.delete(`/requests/${taskId}/assign/${uid}`);loadTask();}
    catch(e){alert(e.message);}
  };

  const markDone = async()=>{
    await save({status:'done',completed_at:new Date().toISOString()});
  };

  const deleteTask = async()=>{
    if(!confirm('Xóa CV này?')) return;
    try{await api.delete(`/requests/${taskId}`);onSaved?.();onClose();}
    catch(e){alert(e.message);}
  };

  if(loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'#aaa'}}>⏳</div>;
  if(!task)   return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'#aaa'}}>Không tìm thấy</div>;

  const st=STATUS[task.status]||STATUS.pending;
  const pr=PRIORITY[task.priority]||PRIORITY.medium;
  const curIdx=STEPS.findIndex(s=>s.key===task.status);
  const isAdmin    = ['admin','manager'].includes(user?.role);
  const isCreator  = task.created_by === user?.id;
  const isAssignee = (task.assignees||[]).some(a=>a.user_id===user?.id);
  const overdue=task.deadline&&new Date(task.deadline)<new Date()&&task.status!=='done';
  const existingIds=new Set((task.assignees||[]).map(a=>a.user_id));
  const chatItems=(task.comments||[]).filter(c=>!c.type||c.type==='comment');
  const histItems=(task.comments||[]).filter(c=>c.type&&c.type!=='comment');

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>

      {/* Topbar */}
      <div className="req-detail-topbar" style={{padding:'10px 18px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:8,background:'#fff',flexShrink:0}}>
        <div className="req-detail-crumb" style={{flex:1,fontSize:13,color:'#888',display:'flex',alignItems:'center',gap:5,minWidth:0}}>
          <span style={{color:C.primary,cursor:'pointer',whiteSpace:'nowrap'}} onClick={onClose}>📨 CV Yêu cầu</span>
          <span style={{color:'#ccc'}}>›</span>
          <span style={{color:C.dark,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{task.title}</span>
        </div>
        <span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:8,background:st.bg,color:st.color,whiteSpace:'nowrap'}}>{st.icon} {st.label}</span>
        {/* Assignee: Bắt đầu làm */}
        {task.status==='assigned'&&isAssignee&&!isAdmin&&(
          <button onClick={()=>save({status:'in_progress'})} style={{padding:'6px 12px',borderRadius:7,border:'none',background:C.warning,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>🔄 Bắt đầu làm</button>
        )}
        {/* Assignee/leader: Submit hoàn thành → chờ manager duyệt */}
        {(task.status==='in_progress'||(task.status==='assigned'&&isAssignee))&&!isAdmin&&(
          <button onClick={markDone} style={{padding:'6px 12px',borderRadius:7,border:'none',background:C.success,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>✅ Hoàn thành</button>
        )}
        {/* Manager/admin: Duyệt hoàn thành */}
        {task.status==='scoring'&&isAdmin&&(
          <button onClick={()=>save({status:'done'})} style={{padding:'6px 12px',borderRadius:7,border:'none',background:C.success,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>✅ Duyệt hoàn thành</button>
        )}
        <button onClick={()=>save({})} disabled={saving} style={{padding:'6px 12px',borderRadius:7,border:'none',background:saving?'#aaa':C.primary,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>💾 Lưu</button>
        <button onClick={onClose} style={{width:28,height:28,borderRadius:7,border:`1px solid ${C.border}`,background:'#fff',cursor:'pointer',fontSize:16,color:'#aaa',display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
      </div>

      {/* Status bar — user thấy đơn giản, leader/manager thấy đầy đủ */}
      <div className="req-steps-bar" style={{padding:'9px 18px',background:C.bg,borderBottom:`1.5px solid ${C.border}`,display:'flex',alignItems:'center',gap:4,flexShrink:0,flexWrap:'wrap'}}>
        {(isAdmin||isCreator||isLeader ? STEPS : [
          {key:'in_progress',label:'Đang thực hiện'},
          {key:'done',       label:'Hoàn thành'},
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
                {s.label}
              </div>
              {i<arr.length-1&&<div style={{width:20,height:2,background:done||isDone?C.success:'#e8eaed',borderRadius:2,margin:'0 3px'}}/>}
            </div>
          );
        })}
      </div>

      {/* Body */}
      <div className="req-detail-body" style={{flex:1,display:'flex',overflow:'hidden'}}>

        {/* LEFT: Form */}
        <div className="req-form-panel" style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',borderRight:`1.5px solid ${C.border}`}}>
          <div className="req-form-scroll" style={{flex:1,overflowY:'auto',padding:16}}>

            {/* Thông tin chung */}
            <Section icon="📋" title="Thông tin công việc"
              extra={<span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:8,background:pr.bg,color:pr.color}}>{pr.icon} {pr.label}</span>}>
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <div><label style={FL}>Tiêu đề</label>
                  <input style={{...FI,background:(isCreator||isAdmin)?'#fff':'#f7f8fb',color:(isCreator||isAdmin)?C.dark:'#888'}}
                    defaultValue={task.title}
                    readOnly={!isCreator&&!isAdmin}
                    onBlur={e=>(isCreator||isAdmin)&&e.target.value!==task.title&&save({title:e.target.value})}/>
                </div>
                <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
                  <div style={{flex:'1 1 160px'}}><label style={FL}>CV do ai giao</label>
                    <input style={{...FI,background:'#f7f8fb',color:'#888'}} value={task.creator_name||'—'} readOnly/>
                  </div>
                  <div style={{flex:'1 1 160px'}}><label style={FL}>Điểm (Leader chấm)</label>
                    <input style={{...FI,background:'#f7f8fb',color:task.score!=null?C.success:'#bbb'}} value={task.score!=null?`${task.score}đ`:'Chưa chấm'} readOnly/>
                  </div>
                </div>
                <div><label style={FL}>Mô tả / Tools cần dùng</label>
                  <textarea style={{...FI,minHeight:72,resize:'vertical',background:(isCreator||isAdmin)?'#fff':'#f7f8fb',color:(isCreator||isAdmin)?C.dark:'#888'}}
                    defaultValue={task.description||''}
                    readOnly={!isCreator&&!isAdmin}
                    onBlur={e=>(isCreator||isAdmin)&&e.target.value!==(task.description||'')&&save({description:e.target.value})}/>
                </div>
                <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
                  <div style={{flex:'1 1 160px'}}><label style={FL}>Ưu tiên</label>
                    <select style={{...FI,background:(isCreator||isAdmin)?'#fff':'#f7f8fb'}}
                      value={task.priority||'medium'}
                      disabled={!isCreator&&!isAdmin}
                      onChange={e=>(isCreator||isAdmin)&&save({priority:e.target.value})}>
                      <option value="high">🔴 Cao</option><option value="medium">🟡 Trung bình</option><option value="low">🟢 Thấp</option>
                    </select>
                  </div>
                  <div style={{flex:'1 1 160px'}}><label style={FL}>Trạng thái</label>
                    <select style={FI} value={task.status} onChange={e=>save({status:e.target.value})}
                      disabled={!isAdmin&&!isCreator}>
                      {Object.entries(STATUS)
                        .filter(([k])=>{
                          if (['pending','assigned'].includes(k)) return false;
                          // User chỉ thấy in_progress và done
                          if (!isAdmin&&!isCreator) return ['in_progress','done','cancelled'].includes(k);
                          return true;
                        })
                        .map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </Section>

            {/* Thời gian */}
            <Section icon="⏱" title="Thời gian">
              <div style={{display:'grid',gridTemplateColumns:'repeat(2, minmax(0,1fr))',gap:12,marginBottom:12}}>
                <div style={{background:C.bg,borderRadius:8,padding:'9px 12px',border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#aaa',textTransform:'uppercase',marginBottom:4}}>Thời gian nhận</div>
                  <div style={{fontSize:13,fontWeight:600,color:C.dark}}>{fmtDt(task.created_at)}</div>
                </div>
                <div style={{background:task.started_at?'#e8f8ee':C.bg,borderRadius:8,padding:'9px 12px',border:`1px solid ${task.started_at?'#b8e8c8':C.border}`}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#aaa',textTransform:'uppercase',marginBottom:4}}>Thời gian bắt đầu</div>
                  {task.started_at
                    ? <div style={{fontSize:13,fontWeight:600,color:C.success}}>{fmtDt(task.started_at)}</div>
                    : <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span style={{fontSize:12,color:'#bbb'}}>Chưa bắt đầu</span>
                        {(isAssignee||isAdmin)&&task.status!=='done'&&(
                          <button onClick={()=>save({status:'in_progress'})}
                            style={{padding:'3px 10px',borderRadius:6,border:'none',background:C.warning,color:'#fff',fontSize:11,fontWeight:600,cursor:'pointer'}}>
                            🔄 Bắt đầu
                          </button>
                        )}
                      </div>
                  }
                </div>
                <div style={{background:overdue?'#fde8e8':C.bg,borderRadius:8,padding:'9px 12px',border:`1px solid ${overdue?'#f5c0c0':C.border}`}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#aaa',textTransform:'uppercase',marginBottom:4}}>Thời gian dự kiến xong</div>
                  <div style={{fontSize:13,fontWeight:600,color:overdue?C.danger:C.dark}}>{fmtDt(task.deadline)}</div>
                  {task.deadline&&<div style={{marginTop:4}}><Countdown deadline={task.deadline} status={task.status}/></div>}
                </div>
                <div style={{background:task.completed_at?'#e8f8ee':C.bg,borderRadius:8,padding:'9px 12px',border:`1px solid ${task.completed_at?'#b8e8c8':C.border}`}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#aaa',textTransform:'uppercase',marginBottom:4}}>Thời gian hoàn thành</div>
                  <div style={{fontSize:13,fontWeight:600,color:task.completed_at?C.success:'#bbb'}}>
                    {task.completed_at?fmtDt(task.completed_at):'Chưa hoàn thành'}
                  </div>
                </div>
              </div>
              <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
                <div style={{flex:'1 1 200px'}}><label style={FL}>
                    Deadline (đổi)
                    {!isCreator&&!isAdmin&&<span style={{color:'#bbb',fontSize:10,marginLeft:6}}>🔒 chỉ người tạo/admin</span>}
                  </label>
                  <input type="datetime-local"
                    style={{...FI,background:(!isCreator&&!isAdmin)?'#f7f8fb':'#fff',color:(!isCreator&&!isAdmin)?'#aaa':'#1e2a3a'}}
                    defaultValue={task.deadline?new Date(task.deadline).toISOString().slice(0,16):''}
                    disabled={!isCreator&&!isAdmin}
                    onBlur={e=>(isCreator||isAdmin)&&save({deadline:e.target.value})}/>
                </div>
                <div style={{flex:'1 1 160px'}}><label style={FL}>Giờ thực hiện (log)</label>
                  <input type="number" style={FI} defaultValue={task.hours_spent||''} placeholder="Giờ đã làm..."
                    onBlur={e=>save({hours_spent:+e.target.value})}/>
                </div>
              </div>
            </Section>

            {/* Người thực hiện */}
            <Section icon="👥" title="Người thực hiện" extra={<span style={{fontSize:11,color:'#aaa'}}>Tối đa 12 người</span>}>
              <div style={{display:'flex',flexWrap:'wrap',gap:8,alignItems:'center'}}>
                {(task.assignees||[]).map(a=>(
                  <div key={a.user_id} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px',borderRadius:20,background:'#eef3ff',border:'1.5px solid #c8d8f0',fontSize:12,color:C.primary,fontWeight:600}}>
                    <div style={{width:20,height:20,borderRadius:'50%',background:a.avatar_color||C.primary,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:9,fontWeight:700}}>
                      {(a.full_name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                    </div>
                    {a.full_name}
                    {(isAdmin||isLeader)&&<span onClick={()=>removeAssignee(a.user_id)} style={{cursor:'pointer',color:'#aaa',fontSize:15,lineHeight:1}} onMouseEnter={e=>e.target.style.color=C.danger} onMouseLeave={e=>e.target.style.color='#aaa'}>×</span>}
                  </div>
                ))}
                {(isAdmin||isLeader)&&(task.assignees||[]).length<12&&(
                  <div onClick={()=>setShowAddUser(p=>!p)} style={{display:'flex',alignItems:'center',gap:5,padding:'5px 10px',borderRadius:20,border:'1.5px dashed #c0cce0',color:'#7a9bbf',fontSize:12,cursor:'pointer'}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=C.primary;e.currentTarget.style.color=C.primary;}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor='#c0cce0';e.currentTarget.style.color='#7a9bbf';}}>
                    ＋ Thêm người
                  </div>
                )}
              </div>
              {showAddUser&&(
                <div style={{marginTop:8,background:'#fff',border:`1.5px solid ${C.border}`,borderRadius:8,maxHeight:160,overflowY:'auto'}}>
                  {users.filter(u=>!existingIds.has(u.id)).map(u=>(
                    <div key={u.id} onClick={()=>addAssignee(u.id)}
                      style={{display:'flex',alignItems:'center',gap:8,padding:'7px 12px',cursor:'pointer',fontSize:12}}
                      onMouseEnter={e=>e.currentTarget.style.background='#eef3ff'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <Chip color={u.avatar_color||C.primary} name={u.full_name} size={22}/>
                      <span style={{flex:1,color:C.dark,fontWeight:500}}>{u.full_name}</span>
                      <span style={{color:'#aaa',fontSize:11}}>{u.role}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* File đính kèm */}
            <Section icon="📎" title="Tài liệu / File nộp">
              <FileSection taskId={task.id} files={task.files||[]} user={user} onReload={loadTask}/>
            </Section>

            {/* Leader chấm điểm */}
            {isLeader&&(
              <Section icon="🏆" title="Leader chấm điểm"
                extra={<span style={{fontSize:11,fontWeight:700,color:task.score!=null?C.success:C.warning}}>{task.score!=null?`Đã chấm ${task.score}đ`:'Chờ hoàn thành'}</span>}>
                <div style={{display:'flex',alignItems:'center',gap:14,background:'#f0f4ff',padding:'14px 16px',borderRadius:10,border:'1.5px solid #c8d8f0',flexWrap:'wrap'}}>
                  <div style={{flex:'1 1 160px'}}>
                    <div style={{fontSize:13,fontWeight:700,color:C.primary}}>Điểm đánh giá</div>
                    <div style={{fontSize:11,color:'#7a9bbf',marginTop:3}}>Leader: {user?.full_name} · {task.score!=null?'đã chấm':'chưa chấm'}</div>
                  </div>
                  <input type="number" min="0" max="10" step="0.5" value={scoreInput}
                    onChange={e=>setScoreInput(e.target.value)}
                    placeholder="–"
                    style={{width:70,textAlign:'center',border:'2px solid #3a7bd5',borderRadius:10,padding:'8px',fontSize:20,fontWeight:900,color:C.primary,background:'#fff',outline:'none'}}/>
                  <div style={{fontSize:13,color:'#aaa'}}>/ 10</div>
                  <button onClick={()=>save({score:+scoreInput})} style={{padding:'7px 14px',borderRadius:8,border:'none',background:C.primary,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>Lưu điểm</button>
                </div>
              </Section>
            )}

          </div>

          {/* Footer */}
          <div style={{padding:'10px 16px',borderTop:`1.5px solid ${C.border}`,display:'flex',gap:8,alignItems:'center',background:'#fff',flexShrink:0}}>
            <div style={{flex:1,fontSize:12,color:'#aaa'}}>Tạo lúc {fmtDt(task.created_at)} bởi {task.creator_name}</div>
            {isLeader&&<button onClick={deleteTask} style={{padding:'6px 12px',borderRadius:7,border:'1px solid #fde8e8',background:'#fde8e8',color:C.danger,fontSize:12,fontWeight:600,cursor:'pointer'}}>🗑 Xóa</button>}
            {task.status==='scoring'&&isAdmin&&<button onClick={()=>save({status:'done'})} style={{padding:'6px 12px',borderRadius:7,border:'none',background:C.success,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>✅ Duyệt hoàn thành</button>}
            {(task.status==='in_progress'||task.status==='assigned')&&<button onClick={markDone} style={{padding:'6px 12px',borderRadius:7,border:'1px solid #fff4e8',background:'#fff4e8',color:C.warning,fontSize:12,fontWeight:600,cursor:'pointer'}}>✅ Submit hoàn thành</button>}
            <button onClick={()=>save({})} disabled={saving} style={{padding:'6px 14px',borderRadius:7,border:'none',background:saving?'#aaa':C.success,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>💾 Lưu</button>
          </div>
        </div>

        {/* RIGHT: Chat + History */}
        <div className="req-chat-panel" style={{width:300,flexShrink:0,display:'flex',flexDirection:'column',overflow:'hidden',background:'#fafbfc'}}>
          <div style={{display:'flex',borderBottom:`2px solid ${C.border}`,flexShrink:0}}>
            {[['chat','💬 Tin nhắn'],['history','📋 Lịch sử']].map(([k,l])=>(
              <div key={k} onClick={()=>setTab(k)} style={{flex:1,padding:'11px',textAlign:'center',fontSize:12,fontWeight:600,cursor:'pointer',color:tab===k?C.primary:'#888',borderBottom:`2.5px solid ${tab===k?C.primary:'transparent'}`,marginBottom:-2}}>{l}</div>
            ))}
          </div>

          <div ref={feedRef} style={{flex:1,overflowY:'auto',padding:12,display:'flex',flexDirection:'column',gap:10}}>
            {tab==='chat'&&<>
              {chatItems.length===0&&<div style={{textAlign:'center',padding:20,color:'#bbb',fontSize:12}}>Chưa có tin nhắn</div>}
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
                        {c.content||c.message}
                      </div>
                    </div>
                  </div>
                );
              })}
            </>}
            {tab==='history'&&<>
              {histItems.length===0&&<div style={{textAlign:'center',padding:20,color:'#bbb',fontSize:12}}>Chưa có lịch sử</div>}
              {histItems.map((h,i)=>(
                <div key={i} style={{display:'flex',gap:8}}>
                  <div style={{width:26,height:26,borderRadius:'50%',background:'#95a5a6',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:12,flexShrink:0}}>⚙</div>
                  <div style={{flex:1,background:'#f5f5f5',border:'1px solid #ebebeb',borderRadius:10,padding:'8px 12px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
                      <span style={{fontSize:11,fontWeight:700,color:'#888'}}>Hệ thống</span>
                      <span style={{fontSize:10,color:'#bbb',marginLeft:'auto'}}>{fmtDt(h.created_at)}</span>
                    </div>
                    <div style={{fontSize:12,color:'#555'}}>{h.content||h.message}</div>
                  </div>
                </div>
              ))}
            </>}
          </div>

          <div style={{padding:'10px 12px',borderTop:`1.5px solid ${C.border}`,flexShrink:0}}>
            <textarea value={comment} onChange={e=>setComment(e.target.value)}
              placeholder="Nhập tin nhắn / ghi chú..."
              onKeyDown={e=>e.ctrlKey&&e.key==='Enter'&&sendComment()}
              style={{width:'100%',padding:'8px 10px',border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:12,resize:'none',outline:'none',fontFamily:'inherit',boxSizing:'border-box'}}
              rows={3}/>
            <div style={{display:'flex',justifyContent:'flex-end',gap:6,marginTop:6}}>

              <button onClick={sendComment} disabled={!comment.trim()} style={{padding:'5px 14px',borderRadius:7,border:'none',background:comment.trim()?C.primary:'#ddd',color:'#fff',fontSize:11,fontWeight:600,cursor:'pointer'}}>➤ Gửi</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Create Panel ──
function CreatePanel({groups,users,onClose,onSaved}){
  const [form,setForm]=useState({title:'',description:'',priority:'medium',deadline:'',group_id:'',assignees:[]});
  const [saving,setSaving]=useState(false);
  const s=(k,v)=>setForm(p=>({...p,[k]:v}));

  const submit=async()=>{
    if(!form.title.trim()) return alert('Nhập tiêu đề!');
    setSaving(true);
    try{const{data}=await api.post('/requests',form);onSaved(data.data?.id);}
    catch(e){alert(e.response?.data?.message||e.message);}
    finally{setSaving(false);}
  };

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{padding:'10px 18px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:8,background:'#fff',flexShrink:0}}>
        <div style={{flex:1,fontSize:14,fontWeight:800,color:C.dark}}>➕ Tạo CV yêu cầu mới</div>
        <button onClick={onClose} style={{width:28,height:28,borderRadius:7,border:`1px solid ${C.border}`,background:'#fff',cursor:'pointer',fontSize:16,color:'#aaa',display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:16}}>
        <Section icon="📋" title="Thông tin">
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div><label style={FL}>Tiêu đề *</label><input style={FI} value={form.title} onChange={e=>s('title',e.target.value)} autoFocus placeholder="Tên công việc..."/></div>
            <div><label style={FL}>Mô tả</label><textarea style={{...FI,minHeight:72,resize:'vertical'}} value={form.description} onChange={e=>s('description',e.target.value)}/></div>
            <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
              <div style={{flex:'1 1 140px'}}><label style={FL}>Ưu tiên</label>
                <select style={FI} value={form.priority} onChange={e=>s('priority',e.target.value)}>
                  <option value="high">🔴 Cao</option><option value="medium">🟡 TB</option><option value="low">🟢 Thấp</option>
                </select>
              </div>
              <div style={{flex:'1 1 140px'}}><label style={FL}>Nhóm</label>
                <select style={FI} value={form.group_id} onChange={e=>s('group_id',e.target.value)}>
                  <option value="">-- Không có --</option>
                  {groups.map(g=><option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}
                </select>
              </div>
            </div>
            <div><label style={FL}>Deadline</label><input type="datetime-local" style={FI} value={form.deadline} onChange={e=>s('deadline',e.target.value)}/></div>
          </div>
        </Section>
        <Section icon="👥" title="Assign cho">
          <select style={FI} onChange={e=>{ if(!e.target.value) return; const uid=+e.target.value; if(form.assignees.find(a=>a.user_id===uid)) return; const u=users.find(x=>x.id===uid); s('assignees',[...form.assignees,{user_id:uid,role:'main',full_name:u?.full_name,avatar_color:u?.avatar_color}]); e.target.value=''; }}>
            <option value="">Chọn người...</option>
            {users.filter(u=>!form.assignees.find(a=>a.user_id===u.id)).map(u=><option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
          <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:8}}>
            {form.assignees.map(a=>(
              <span key={a.user_id} style={{display:'flex',alignItems:'center',gap:5,background:'#eef3ff',border:'1px solid #c8d8f0',color:C.primary,fontSize:12,padding:'4px 10px',borderRadius:20,fontWeight:600}}>
                {a.full_name}
                <span onClick={()=>s('assignees',form.assignees.filter(x=>x.user_id!==a.user_id))} style={{cursor:'pointer',color:'#aaa',fontSize:14}}>×</span>
              </span>
            ))}
          </div>
        </Section>
      </div>
      <div style={{padding:'10px 16px',borderTop:`1.5px solid ${C.border}`,display:'flex',gap:8,justifyContent:'flex-end',background:'#fff',flexShrink:0}}>
        <button onClick={onClose} style={{padding:'7px 16px',borderRadius:8,border:`1.5px solid ${C.border}`,background:'#fff',fontSize:13,fontWeight:600,cursor:'pointer',color:'#555'}}>Huỷ</button>
        <button onClick={submit} disabled={saving||!form.title.trim()} style={{padding:'7px 16px',borderRadius:8,border:'none',background:saving?'#aaa':C.primary,color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>
          {saving?'...':'✓ Tạo CV'}
        </button>
      </div>
    </div>
  );
}

// ── File Section ──
function FileSection({ taskId, files, user, onReload }) {
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
      alert(err.response?.data?.message || 'Upload thất bại');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (fileId) => {
    if (!confirm('Xóa file này?')) return;
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
            ⬇ Tải
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
        {uploading ? '⏳ Đang upload...' : '📎 Đính kèm file (tối đa 20MB)'}
      </div>
    </div>
  );
}