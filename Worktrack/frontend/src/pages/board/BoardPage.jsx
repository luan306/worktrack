import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import useAuth from '../../store/authStore';

const C = { primary:'#3a7bd5',dark:'#1e2a3a',success:'#27ae60',warning:'#e67e22',danger:'#e74c3c',bg:'#f7f8fb',border:'#e8eaed',inner:'#f0f2f8' };
const PRI_COLOR = { high:C.danger, medium:C.warning, low:C.success };

const Chip = ({color=C.primary,name='?',size=22})=>{
  const ini=(name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  return <div style={{background:color,width:size,height:size,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:9,fontWeight:700,flexShrink:0}}>{ini}</div>;
};

const MetaRow = ({icon,label,value,vc='#444'})=>(
  <div style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#888'}}>
    <span>{icon}</span><span>{label}</span><span style={{color:vc,fontWeight:500}}>{value}</span>
  </div>
);

const Spin  = ()=><div style={{textAlign:'center',padding:32,color:'#aaa',fontSize:13}}>⏳</div>;
const Empty = ({text})=><div style={{textAlign:'center',padding:24,color:'#bbb',fontSize:12}}>{text}</div>;

// Đếm ngược deadline
function Countdown({deadline,status}) {
  const { t } = useTranslation();
  const [diff, setDiff] = useState(new Date(deadline) - new Date());
  useEffect(()=>{
    const timer = setInterval(()=>setDiff(new Date(deadline)-new Date()), 1000);
    return ()=>clearInterval(timer);
  },[deadline]);
  if (status==='done') return null;
  if (diff<=0) return <span style={{fontSize:10,fontWeight:700,color:C.danger,background:'#fde8e8',padding:'2px 6px',borderRadius:6}}>⚠ {t('late')}</span>;
  const d=Math.floor(diff/86400000), h=Math.floor(diff%86400000/3600000), m=Math.floor(diff%3600000/60000), s=Math.floor(diff%60000/1000);
  const color=diff<3600000?C.danger:diff<86400000?C.warning:C.success;
  const bg   =diff<3600000?'#fde8e8':diff<86400000?'#fff4e8':'#e8f8ee';
  const label=d>0?t('countdown_days_hours',{d,h}):`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return <span style={{fontSize:10,fontWeight:700,color,background:bg,padding:'2px 6px',borderRadius:6}}>⏱ {label}</span>;
}

function DailyCard({group,onClick}){
  const { t } = useTranslation();
  const tasks=group.tasks||[];
  const total=tasks.reduce((s,t)=>s+parseFloat(t.today_score||0),0);
  const max=tasks.reduce((s,t)=>s+(+t.max_score||0),0);
  const sc=total===0?'#aaa':total>=max*0.8?C.success:C.warning;
  return (
    <div onClick={onClick} onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 16px rgba(58,123,213,0.13)'} onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}
      style={{background:'#fff',borderRadius:10,border:`1.5px solid ${C.border}`,overflow:'hidden',cursor:'pointer'}}>
      <div style={{padding:'10px 14px',display:'flex',alignItems:'center',gap:8,borderBottom:`1px solid ${C.inner}`}}>
        <span style={{fontSize:16}}>{group.icon||'🏭'}</span>
        <div style={{fontSize:13,fontWeight:700,color:C.dark,flex:1}}>{group.name}</div>
        <span style={{fontSize:12,fontWeight:700,color:sc}}>{total.toFixed(1)}/{max}đ</span>
      </div>
      <div style={{padding:'10px 14px',display:'flex',flexDirection:'column',gap:5}}>
        {tasks.slice(0,4).map(t=>(
          <div key={t.id} style={{display:'flex',alignItems:'center',gap:7,padding:'4px 7px',borderRadius:5,background:C.bg}}>
            <div style={{width:14,height:14,borderRadius:3,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,border:`2px solid ${t.today_done?C.success:'#c0cce0'}`,background:t.today_done?C.success:'transparent',color:'#fff'}}>
              {t.today_done?'✓':''}
            </div>
            <span style={{flex:1,fontSize:11,color:t.today_done?'#bbb':'#444',textDecoration:t.today_done?'line-through':'none'}}>{t.name}</span>
            <span style={{fontSize:10,fontWeight:700,color:t.today_score>0?C.primary:'#ddd'}}>{t.today_score||0}đ</span>
          </div>
        ))}
        {tasks.length>4&&<div style={{fontSize:10,color:'#aaa',textAlign:'center'}}>{t('board_more_tasks',{count:tasks.length-4})}</div>}
        {!tasks.length&&<div style={{fontSize:11,color:'#bbb',textAlign:'center',padding:4}}>{t('board_no_tasks_today')}</div>}
      </div>
      <div style={{padding:'7px 14px',borderTop:`1px solid ${C.inner}`,display:'flex',alignItems:'center',gap:6}}>
        <span style={{fontSize:11,fontWeight:800,color:sc}}>{total.toFixed(1)}/{max}đ</span>
        <div style={{flex:1}}/>
        <div style={{display:'flex',gap:3}}>
          {(group.members||[]).slice(0,4).map((m,i)=><Chip key={m.id||i} color={m.avatar_color||C.primary} name={m.full_name||'?'} size={20}/>)}
          {(group.members||[]).length>4&&<div style={{width:20,height:20,borderRadius:'50%',background:'#e0e0e0',display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700,color:'#666'}}>+{(group.members||[]).length-4}</div>}
        </div>
      </div>
    </div>
  );
}

function RequestCard({task,onNav}){
  const { t } = useTranslation();
  const priKey = task.priority==='high'?'high':task.priority==='low'?'low':'medium';
  const priColor = PRI_COLOR[priKey];
  const assignee=task.assignees?.[0];
  const overdue=task.deadline&&new Date(task.deadline)<new Date()&&task.status!=='done';
  const fmt=d=>d?new Date(d).toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
  return (
    <div onClick={onNav} onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 16px rgba(58,123,213,0.13)'} onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}
      style={{background:'#fff',borderRadius:10,border:`1.5px solid ${C.border}`,overflow:'hidden',cursor:'pointer'}}>
      <div style={{padding:'10px 14px',display:'flex',alignItems:'center',gap:8,borderBottom:`1px solid ${C.inner}`}}>
        <span>{task.priority==='high'?'🔴':task.priority==='medium'?'🟡':'🟢'}</span>
        <div style={{fontSize:13,fontWeight:700,color:C.dark,flex:1}}>{task.title}</div>
        <span style={{fontSize:10,fontWeight:700,color:priColor}}>{t(priKey)}</span>
      </div>
      <div style={{padding:'10px 14px',display:'flex',flexDirection:'column',gap:5}}>
        <MetaRow icon="👤" label={t('label_assigned_by')} value={task.creator_name}/>
        <MetaRow icon="👷" label={t('label_assignee')} value={assignee?assignee.full_name:t('board_not_assigned')} vc={assignee?'#444':'#aaa'}/>
        {task.deadline&&<MetaRow icon="⏰" label={t('label_deadline')} value={fmt(task.deadline)} vc={overdue?C.danger:'#444'}/>}
        {task.deadline&&<Countdown deadline={task.deadline} status={task.status}/>}
      </div>
    </div>
  );
}

function CompletedCard({task,onNav}){
  const { t } = useTranslation();
  const fmt=d=>d?new Date(d).toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
  return (
    <div onClick={onNav} onMouseEnter={e=>e.currentTarget.style.boxShadow='0 3px 12px rgba(0,0,0,0.08)'} onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}
      style={{background:'#fff',borderRadius:10,border:`1.5px solid ${C.border}`,overflow:'hidden',cursor:'pointer',opacity:0.9}}>
      <div style={{padding:'10px 14px',display:'flex',alignItems:'center',gap:8,borderBottom:`1px solid ${C.inner}`}}>
        <span>✅</span>
        <div style={{fontSize:13,fontWeight:700,color:C.dark,flex:1}}>{task.title}</div>
        <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:10,background:task.is_late?'#fde8e8':'#e8f8ee',color:task.is_late?C.danger:C.success}}>
          {task.is_late?t('late'):t('on_time')}
        </span>
      </div>
      <div style={{padding:'8px 14px',display:'flex',flexDirection:'column',gap:4}}>
        <MetaRow icon="👤" label={t('label_assigned_by')} value={task.creator_name}/>
        {task.completed_at&&<MetaRow icon="✅" label={t('label_completed_at')} value={fmt(task.completed_at)} vc={C.success}/>}
        {task.score!=null&&<MetaRow icon="⭐" label={t('label_score')} value={`${task.score}đ`} vc={C.primary}/>}
      </div>
    </div>
  );
}

export default function BoardPage(){
  const { t, i18n } = useTranslation();
  const {user,can}=useAuth();
  const navigate=useNavigate();
  const isLeader=can('admin','manager','leader');
  const today=new Date().toLocaleDateString('en-CA');

  const [dailyGroups,setDailyGroups]=useState([]);
  const [requests,setRequests]=useState([]);
  const [completed,setCompleted]=useState([]);
  const [loading,setLoading]=useState(true);

  // Fetch mỗi lần mount
  useEffect(()=>{ if(user) fetchAll(); },[user]);

  const fetchAll=useCallback(async()=>{
    setLoading(true);
    try {
      const ts=Date.now();
      const [gRes,r1,r2,r3,cRes]=await Promise.all([
        api.get('/groups'),
        api.get(`/requests?status=pending&_t=${ts}`),
        api.get(`/requests?status=assigned&_t=${ts}`),
        api.get(`/requests?status=in_progress&_t=${ts}`),
        api.get(`/requests?status=done&_t=${ts}`),
      ]);

      const allReq=[...(r1.data.data||[]),...(r2.data.data||[]),...(r3.data.data||[])]
        .filter((t,i,a)=>a.findIndex(x=>x.id===t.id)===i);
      setRequests(allReq);
      setCompleted((cRes.data.data||[]).slice(0,12));

      const allGroups=gRes.data.data||[];
      const userGroupIds=user?.groups?.map(g=>g.id)||[];
      const visible=can('admin','manager')?allGroups:allGroups.filter(g=>userGroupIds.includes(g.id));
      if(!visible.length){ setDailyGroups([]); return; }

      const boardResults=await Promise.all(
        visible.map(g=>api.get(`/daily/board?group_id=${g.id}&date=${today}`).catch(()=>({data:{data:[]}})))
      );
      const d=new Date(); const dow=d.getDay()===0?7:d.getDay(); const dom=d.getDate();
      const enriched=visible.map((g,gi)=>{
        const item=(boardResults[gi].data.data||[])[0]||{};
        const tasks=(item.tasks||[]).filter(t=>{
          if(t.frequency==='daily') return true;
          if(t.frequency==='weekly') return t.frequency_day===dow;
          if(t.frequency==='monthly') return t.frequency_day===dom;
          return false;
        });
        return {...g,tasks,members:item.members||[]};
      });
      setDailyGroups(enriched);
    } catch(e){console.error(e);}
    finally{setLoading(false);}
  },[user]);

  const localeMap = { vi:'vi-VN', en:'en-US', ja:'ja-JP' };
  const currentLocale = localeMap[i18n.language] || 'vi-VN';
  const fmtDate=d=>{
    const dt=new Date(d);
    const days=t('weekdays',{returnObjects:true});
    return `📅 ${days[dt.getDay()]}, ${dt.toLocaleDateString(currentLocale)}`;
  };

  const ColHdr=({icon,title,count,countBg,countColor,extra})=>(
    <div style={{padding:'12px 16px',borderBottom:`1.5px solid ${C.border}`,display:'flex',alignItems:'center',gap:8,background:'#fff',flexShrink:0}}>
      <span style={{fontSize:16}}>{icon}</span>
      <div style={{fontSize:14,fontWeight:800,color:C.dark,flex:1}}>{title}</div>
      <span style={{background:countBg||'#eef3ff',color:countColor||C.primary,fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:10}}>{count}</span>
      {extra}
    </div>
  );

  return (
    <div className="brd-root" style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',background:'#fff',minWidth:0}}>
      <style>{`
        .brd-root { box-sizing: border-box; }
        .brd-root *, .brd-root *::before, .brd-root *::after { box-sizing: border-box; }

        @media (max-width: 900px) {
          .brd-root .brd-topbar { flex-wrap: wrap !important; padding: 10px 14px !important; gap: 8px !important; }
          .brd-root .brd-title { flex-basis: 100% !important; }
          .brd-root .brd-date { order: 3 !important; flex: 1 1 auto !important; text-align: center !important; }
          .brd-root .brd-create-btn { flex: 1 1 auto !important; text-align: center !important; }

          .brd-root .brd-hint { display: flex !important; }

          .brd-root .brd-body { overflow-x: auto !important; overflow-y: hidden !important; scroll-snap-type: x mandatory !important; -webkit-overflow-scrolling: touch; }
          .brd-root .brd-col { flex: 0 0 92% !important; max-width: 92% !important; scroll-snap-align: start !important; border-right: none !important; margin-right: 10px !important; }
          .brd-root .brd-col:last-child { margin-right: 0 !important; }
        }
        @media (max-width: 480px) {
          .brd-root .brd-col { flex: 0 0 94% !important; max-width: 94% !important; }
        }
      `}</style>

      <div className="brd-topbar" style={{padding:'12px 20px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:10,background:'#fff',flexShrink:0}}>
        <div className="brd-title" style={{fontSize:15,fontWeight:700,color:C.dark,flex:1}}>🗂 {t('board_title')}</div>
        <div className="brd-date" style={{fontSize:12,color:'#888',background:'#f5f6f8',padding:'4px 12px',borderRadius:20,border:'1px solid #e0e0e0',whiteSpace:'nowrap'}}>{fmtDate(today)}</div>
        {isLeader&&<button className="brd-create-btn" onClick={()=>navigate('/requests?create=1')} style={{padding:'6px 14px',borderRadius:7,border:'none',background:C.primary,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>＋ {t('board_create_request')}</button>}
      </div>

      {/* Gợi ý vuốt ngang — chỉ hiện trên mobile/tablet nhỏ */}
      <div className="brd-hint" style={{display:'none',padding:'6px 20px',background:C.bg,borderBottom:`1px solid ${C.border}`,alignItems:'center',justifyContent:'center',gap:6,fontSize:11,color:'#aaa',flexShrink:0}}>
        👈 {t('board_swipe_hint')} 👉
      </div>

      <div className="brd-body" style={{flex:1,display:'flex',overflow:'hidden'}}>
        {/* Col 1: Hằng ngày */}
        <div className="brd-col" style={{flex:1,display:'flex',flexDirection:'column',borderRight:`1.5px solid ${C.border}`,overflow:'hidden',minWidth:0}}>
          <ColHdr icon="📋" title={t('board_col_daily')} count={dailyGroups.length}
            extra={isLeader&&<button onClick={()=>navigate('/daily')} style={{padding:'4px 10px',borderRadius:7,border:'none',background:C.primary,color:'#fff',fontSize:11,fontWeight:600,cursor:'pointer'}}>＋</button>}/>
          <div style={{flex:1,overflowY:'auto',padding:10,background:C.bg,display:'flex',flexDirection:'column',gap:8}}>
            {loading?<Spin/>:<>
              {dailyGroups.map(g=><DailyCard key={g.id} group={g} onClick={()=>navigate('/daily')}/>)}
              {!dailyGroups.length&&<Empty text={t('board_empty_daily')}/>}
            </>}
          </div>
        </div>

        {/* Col 2: Yêu cầu */}
        <div className="brd-col" style={{flex:1,display:'flex',flexDirection:'column',borderRight:`1.5px solid ${C.border}`,overflow:'hidden',minWidth:0}}>
          <ColHdr icon="📨" title={t('board_col_requests')} count={requests.length} countBg="#fff4e8" countColor={C.warning}
            extra={isLeader&&<button onClick={()=>navigate('/requests?create=1')} style={{padding:'4px 10px',borderRadius:7,border:'none',background:C.primary,color:'#fff',fontSize:11,fontWeight:600,cursor:'pointer'}}>＋ {t('create')}</button>}/>
          <div style={{flex:1,overflowY:'auto',padding:10,background:C.bg,display:'flex',flexDirection:'column',gap:8}}>
            {loading?<Spin/>:<>
              {requests.map(t=><RequestCard key={t.id} task={t} onNav={()=>navigate(`/requests?id=${t.id}`)}/>)}
              {!requests.length&&<Empty text={t('board_empty_requests')}/>}
            </>}
          </div>
        </div>

        {/* Col 3: Hoàn thành */}
        <div className="brd-col" style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0}}>
          <ColHdr icon="✅" title={t('board_col_completed')} count={completed.length} countBg="#e8f8ee" countColor={C.success}/>
          <div style={{flex:1,overflowY:'auto',padding:10,background:C.bg,display:'flex',flexDirection:'column',gap:8}}>
            {loading?<Spin/>:<>
              {completed.map(t=><CompletedCard key={t.id} task={t} onNav={()=>navigate(`/requests?id=${t.id}`)}/>)}
              {!completed.length&&<Empty text={t('board_empty_completed')}/>}
              {completed.length>=12&&<div onClick={()=>navigate('/completed')} style={{textAlign:'center',padding:10,fontSize:12,color:'#aaa',cursor:'pointer'}}>{t('board_view_all')} →</div>}
            </>}
          </div>
        </div>
      </div>
    </div>
  );
}