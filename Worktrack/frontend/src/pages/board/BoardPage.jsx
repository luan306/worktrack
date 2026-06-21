import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import useAuth from '../../store/authStore';

const C = { primary:'#3a7bd5',dark:'#1e2a3a',success:'#27ae60',warning:'#e67e22',danger:'#e74c3c',bg:'#f7f8fb',border:'#e8eaed',inner:'#f0f2f8' };
const PRI = { high:{label:'Cao',color:C.danger}, medium:{label:'Trung bình',color:C.warning}, low:{label:'Thấp',color:C.success} };

const Chip = ({color=C.primary,name='?',size=22})=>{
  const ini=name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  return <div style={{background:color,width:size,height:size,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:9,fontWeight:700,flexShrink:0}}>{ini}</div>;
};

const MetaRow = ({icon,label,value,vc='#444'})=>(
  <div style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#888'}}>
    <span>{icon}</span><span>{label}</span><span style={{color:vc,fontWeight:500}}>{value}</span>
  </div>
);

const Spin  = ()=><div style={{textAlign:'center',padding:32,color:'#aaa',fontSize:13}}>⏳</div>;
const Empty = ({text})=><div style={{textAlign:'center',padding:24,color:'#bbb',fontSize:12}}>{text}</div>;

function DailyCard({group,onClick}){
  const tasks=group.tasks||[];
  const total=tasks.reduce((s,t)=>s+(+t.today_score||0),0);
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
        {tasks.length>4&&<div style={{fontSize:10,color:'#aaa',textAlign:'center'}}>+{tasks.length-4} việc nữa</div>}
        {!tasks.length&&<div style={{fontSize:11,color:'#bbb',textAlign:'center',padding:4}}>Không có việc hôm nay</div>}
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
  const p=PRI[task.priority]||PRI.medium;
  const assignee=task.assignees?.[0];
  const overdue=task.deadline&&new Date(task.deadline)<new Date()&&task.status!=='done';
  const fmt=d=>d?new Date(d).toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
  return (
    <div onClick={onNav} onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 16px rgba(58,123,213,0.13)'} onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}
      style={{background:'#fff',borderRadius:10,border:`1.5px solid ${C.border}`,overflow:'hidden',cursor:'pointer'}}>
      <div style={{padding:'10px 14px',display:'flex',alignItems:'center',gap:8,borderBottom:`1px solid ${C.inner}`}}>
        <span>{task.priority==='high'?'🔴':task.priority==='medium'?'🟡':'🟢'}</span>
        <div style={{fontSize:13,fontWeight:700,color:C.dark,flex:1}}>{task.title}</div>
        <span style={{fontSize:10,fontWeight:700,color:p.color}}>{p.label}</span>
      </div>
      <div style={{padding:'10px 14px',display:'flex',flexDirection:'column',gap:5}}>
        <MetaRow icon="👤" label="Giao bởi:" value={task.creator_name}/>
        <MetaRow icon="👷" label="Thực hiện:" value={assignee?assignee.full_name:'Chưa assign'} vc={assignee?'#444':'#aaa'}/>
        {task.deadline&&<MetaRow icon="⏰" label="Deadline:" value={fmt(task.deadline)} vc={overdue?C.danger:'#444'}/>}
      </div>
    </div>
  );
}

function CompletedCard({task,onNav}){
  const fmt=d=>d?new Date(d).toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
  return (
    <div onClick={onNav} onMouseEnter={e=>e.currentTarget.style.boxShadow='0 3px 12px rgba(0,0,0,0.08)'} onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}
      style={{background:'#fff',borderRadius:10,border:`1.5px solid ${C.border}`,overflow:'hidden',cursor:'pointer',opacity:0.9}}>
      <div style={{padding:'10px 14px',display:'flex',alignItems:'center',gap:8,borderBottom:`1px solid ${C.inner}`}}>
        <span>✅</span>
        <div style={{fontSize:13,fontWeight:700,color:C.dark,flex:1}}>{task.title}</div>
        <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:10,background:task.is_late?'#fde8e8':'#e8f8ee',color:task.is_late?C.danger:C.success}}>
          {task.is_late?'Quá hạn':'Đúng hạn'}
        </span>
      </div>
      <div style={{padding:'8px 14px',display:'flex',flexDirection:'column',gap:4}}>
        <MetaRow icon="👤" label="Giao bởi:" value={task.creator_name}/>
        {task.completed_at&&<MetaRow icon="✅" label="Hoàn thành:" value={fmt(task.completed_at)} vc={C.success}/>}
        {task.score!=null&&<MetaRow icon="⭐" label="Điểm:" value={`${task.score}đ`} vc={C.primary}/>}
      </div>
    </div>
  );
}

export default function BoardPage(){
  const {user,can}=useAuth();
  const navigate=useNavigate();
  const isLeader=can('admin','manager','leader');
  const today=new Date().toISOString().slice(0,10);

  const [dailyGroups,setDailyGroups]=useState([]);
  const [requests,setRequests]=useState([]);
  const [completed,setCompleted]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showCreate,setShowCreate]=useState(false);

  // Cache — chỉ fetch 1 lần khi mount
  const fetched=useRef(false);

  useEffect(()=>{
    if(fetched.current||!user) return;
    fetched.current=true;
    fetchAll();
  },[user]);

  const fetchAll=useCallback(async()=>{
    setLoading(true);
    try {
      // Gọi song song tất cả
      const [gRes,rRes,cRes]=await Promise.all([
        api.get('/groups'),
        api.get('/requests?status=pending&status2=assigned&status3=in_progress'),
        api.get('/requests?status=done'),
      ]);

      // Requests — gộp các status vào 1 call nếu backend hỗ trợ, fallback parallel
      let allReq=[];
      if(rRes.data.data){
        allReq=rRes.data.data;
      } else {
        const [r1,r2,r3]=await Promise.all([
          api.get('/requests?status=pending'),
          api.get('/requests?status=assigned'),
          api.get('/requests?status=in_progress'),
        ]);
        allReq=[...r1.data.data,...r2.data.data,...r3.data.data];
      }
      const uniqueReq=allReq.filter((t,i,a)=>a.findIndex(x=>x.id===t.id)===i);
      setRequests(uniqueReq);
      setCompleted((cRes.data.data||[]).slice(0,12));

      // Daily groups — lấy work groups rồi enrich song song
      const allGroups=gRes.data.data||[];
      const userGroupIds=user?.groups?.map(g=>g.id)||[];
      const visible=can('admin','manager')?allGroups:allGroups.filter(g=>userGroupIds.includes(g.id));

      if(!visible.length){ setDailyGroups([]); return; }

      // 1 call duy nhất lấy tất cả — nhanh hơn N×3 calls
      const boardResults = await Promise.all(
        visible.map(g => api.get(`/daily/board?group_id=${g.id}&date=${today}`).catch(()=>({data:{data:[]}})))
      );
      const enriched = visible.map((g, gi) => {
        const boardData = boardResults[gi].data.data || [];
        const item = boardData[0] || {};
        const d = new Date(today);
        const dow = d.getDay()===0?7:d.getDay();
        const dom = d.getDate();
        const tasks = (item.tasks||[]).filter(t=>{
          if(t.frequency==='daily') return true;
          if(t.frequency==='weekly') return t.frequency_day===dow;
          if(t.frequency==='monthly') return t.frequency_day===dom;
          return false;
        });
        return {...g, tasks, members: item.members||[]};
      });
      setDailyGroups(enriched);
    } catch(e){console.error(e);}
    finally{setLoading(false);}
  },[user]);

  const fmtDate=d=>{
    const dt=new Date(d);
    return `📅 ${['CN','T2','T3','T4','T5','T6','T7'][dt.getDay()]}, ${dt.toLocaleDateString('vi-VN')}`;
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
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',background:'#fff'}}>
      {/* Topbar */}
      <div style={{padding:'12px 20px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:10,background:'#fff',flexShrink:0}}>
        <div style={{fontSize:15,fontWeight:700,color:C.dark,flex:1}}>🗂 Bảng công việc</div>
        <div style={{fontSize:12,color:'#888',background:'#f5f6f8',padding:'4px 12px',borderRadius:20,border:'1px solid #e0e0e0'}}>{fmtDate(today)}</div>
        <button onClick={()=>setShowCreate(true)} style={{padding:'6px 14px',borderRadius:7,border:'none',background:C.primary,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>＋ Tạo yêu cầu</button>
      </div>

      {/* 3 cols */}
      <div style={{flex:1,display:'flex',overflow:'hidden'}}>
        {/* Col 1 */}
        <div style={{flex:1,display:'flex',flexDirection:'column',borderRight:`1.5px solid ${C.border}`,overflow:'hidden'}}>
          <ColHdr icon="📋" title="CV Hằng ngày" count={dailyGroups.length}
            extra={isLeader&&<button onClick={()=>navigate('/daily')} style={{padding:'4px 10px',borderRadius:7,border:'none',background:C.primary,color:'#fff',fontSize:11,fontWeight:600,cursor:'pointer'}}>＋</button>}/>
          <div style={{flex:1,overflowY:'auto',padding:10,background:C.bg,display:'flex',flexDirection:'column',gap:8}}>
            {loading?<Spin/>:<>
              {dailyGroups.map(g=><DailyCard key={g.id} group={g} onClick={()=>navigate('/daily')}/>)}
              {!dailyGroups.length&&<Empty text="Chưa có nhóm CV hằng ngày"/>}
            </>}
          </div>
        </div>

        {/* Col 2 */}
        <div style={{flex:1,display:'flex',flexDirection:'column',borderRight:`1.5px solid ${C.border}`,overflow:'hidden'}}>
          <ColHdr icon="📨" title="CV Yêu cầu" count={requests.length} countBg="#fff4e8" countColor={C.warning}
            extra={<button onClick={()=>setShowCreate(true)} style={{padding:'4px 10px',borderRadius:7,border:'none',background:C.primary,color:'#fff',fontSize:11,fontWeight:600,cursor:'pointer'}}>＋ Tạo</button>}/>
          <div style={{flex:1,overflowY:'auto',padding:10,background:C.bg,display:'flex',flexDirection:'column',gap:8}}>
            {loading?<Spin/>:<>
              {requests.map(t=><RequestCard key={t.id} task={t} onNav={()=>navigate('/requests')}/>)}
              {!requests.length&&<Empty text="Không có yêu cầu đang chờ"/>}
            </>}
          </div>
        </div>

        {/* Col 3 */}
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <ColHdr icon="✅" title="CV Hoàn thành" count={completed.length} countBg="#e8f8ee" countColor={C.success}/>
          <div style={{flex:1,overflowY:'auto',padding:10,background:C.bg,display:'flex',flexDirection:'column',gap:8}}>
            {loading?<Spin/>:<>
              {completed.map(t=><CompletedCard key={t.id} task={t} onNav={()=>navigate('/completed')}/>)}
              {!completed.length&&<Empty text="Chưa có CV hoàn thành"/>}
              {completed.length>=12&&<div onClick={()=>navigate('/completed')} style={{textAlign:'center',padding:10,fontSize:12,color:'#aaa',cursor:'pointer'}}>Xem tất cả →</div>}
            </>}
          </div>
        </div>
      </div>

      {showCreate&&<CreateModal onClose={()=>setShowCreate(false)} onSuccess={()=>{setShowCreate(false);fetched.current=false;fetchAll();}}/>}
    </div>
  );
}

function CreateModal({onClose,onSuccess}){
  const [groups,setGroups]=useState([]);
  const [users,setUsers]=useState([]);
  const [form,setForm]=useState({title:'',description:'',priority:'medium',group_id:'',deadline:'',assignees:[]});
  const [saving,setSaving]=useState(false);

  useEffect(()=>{
    Promise.all([api.get('/groups'),api.get('/users')]).then(([g,u])=>{ setGroups(g.data.data); setUsers(u.data.data); }).catch(()=>{});
  },[]);

  const submit=async()=>{
    if(!form.title.trim()) return;
    setSaving(true);
    try{ await api.post('/requests',form); onSuccess(); }
    catch(e){ alert(e.response?.data?.message||e.message); }
    finally{ setSaving(false); }
  };

  const FI={width:'100%',padding:'8px 12px',border:'1.5px solid #dde3f0',borderRadius:8,fontSize:13,color:C.dark,outline:'none',boxSizing:'border-box'};
  const FL={display:'block',fontSize:10,fontWeight:700,color:'#888',textTransform:'uppercase',letterSpacing:'0.4px',marginBottom:5};

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:'#fff',borderRadius:16,width:'100%',maxWidth:460,maxHeight:'90vh',overflow:'hidden',display:'flex',flexDirection:'column',boxShadow:'0 10px 40px rgba(0,0,0,.2)'}}>
        <div style={{padding:'16px 20px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{fontSize:15,fontWeight:700,color:C.dark}}>＋ Tạo yêu cầu mới</div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#aaa'}}>×</button>
        </div>
        <div style={{padding:20,overflowY:'auto',display:'flex',flexDirection:'column',gap:14}}>
          <div><label style={FL}>Tiêu đề *</label><input style={FI} autoFocus placeholder="Tên công việc..." value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))}/></div>
          <div><label style={FL}>Mô tả</label><textarea style={{...FI,height:56,resize:'none'}} value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))}/></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div><label style={FL}>Ưu tiên</label>
              <select style={FI} value={form.priority} onChange={e=>setForm(p=>({...p,priority:e.target.value}))}>
                <option value="high">🔴 Cao</option><option value="medium">🟡 TB</option><option value="low">🟢 Thấp</option>
              </select>
            </div>
            <div><label style={FL}>Nhóm</label>
              <select style={FI} value={form.group_id} onChange={e=>setForm(p=>({...p,group_id:e.target.value}))}>
                <option value="">Không có</option>
                {groups.map(g=><option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}
              </select>
            </div>
          </div>
          <div><label style={FL}>Deadline</label><input type="datetime-local" style={FI} value={form.deadline} onChange={e=>setForm(p=>({...p,deadline:e.target.value}))}/></div>
          <div>
            <label style={FL}>Assign cho</label>
            <select style={FI} onChange={e=>{ if(!e.target.value) return; const uid=+e.target.value; if(form.assignees.find(a=>a.user_id===uid)) return; const u=users.find(x=>x.id===uid); setForm(p=>({...p,assignees:[...p.assignees,{user_id:uid,role:'main',name:u?.full_name}]})); e.target.value=''; }}>
              <option value="">Chọn người...</option>
              {users.map(u=><option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
            <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:8}}>
              {form.assignees.map(a=>(
                <span key={a.user_id} style={{display:'flex',alignItems:'center',gap:5,background:'#eef3ff',border:'1px solid #c8d8f0',color:C.primary,fontSize:12,padding:'3px 10px',borderRadius:20}}>
                  {a.name}<span onClick={()=>setForm(p=>({...p,assignees:p.assignees.filter(x=>x.user_id!==a.user_id)}))} style={{cursor:'pointer',color:'#aaa',fontSize:14}}>×</span>
                </span>
              ))}
            </div>
          </div>
        </div>
        <div style={{padding:'12px 20px',borderTop:`1px solid ${C.border}`,display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{padding:'7px 16px',borderRadius:8,border:'1.5px solid #dde3f0',background:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',color:'#555'}}>Huỷ</button>
          <button onClick={submit} disabled={saving||!form.title.trim()} style={{padding:'7px 16px',borderRadius:8,border:'none',background:saving?'#aaa':C.primary,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>
            {saving?'...':'✓ Tạo yêu cầu'}
          </button>
        </div>
      </div>
    </div>
  );
}