import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import useAuth from '../../store/authStore';

const C = {
  primary: '#3a7bd5', dark: '#1e2a3a', success: '#27ae60',
  warning: '#e67e22', danger: '#e74c3c',
  border: '#e8eaed', bg: '#f7f8fb',
};

const DAYS_VI = ['T2','T3','T4','T5','T6','T7','CN'];

function getWeekStart(d) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - (day===0?6:day-1));
  date.setHours(0,0,0,0);
  return date;
}
function getWeekDays(ws) {
  return Array.from({length:7},(_,i)=>{ const d=new Date(ws); d.setDate(d.getDate()+i); return d; });
}
function fmtDate(d) { return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`; }
function isToday(d) { const t=new Date(); return d.getDate()===t.getDate()&&d.getMonth()===t.getMonth()&&d.getFullYear()===t.getFullYear(); }
function isFuture(d) { const t=new Date(); t.setHours(0,0,0,0); return d>t; }
function getWeekNum(d) {
  const date=new Date(d); date.setHours(0,0,0,0);
  date.setDate(date.getDate()+3-(date.getDay()+6)%7);
  const w1=new Date(date.getFullYear(),0,4);
  return 1+Math.round(((date.getTime()-w1.getTime())/86400000-3+(w1.getDay()+6)%7)/7);
}

function Chip({ color=C.primary, name='?', size=32, active=false }) {
  const ini=name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  return (
    <div style={{
      width:size, height:size, borderRadius:'50%', flexShrink:0,
      display:'flex', alignItems:'center', justifyContent:'center',
      background:color, color:'#fff', fontSize:size>28?12:10, fontWeight:700,
      outline: active?`3px solid ${C.primary}`:'none',
      outlineOffset:2, transition:'all .15s',
    }}>{ini}</div>
  );
}

export default function DailyPage() {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const isAdmin  = can('admin');
  const isLeader = can('admin','manager','leader');

  const [groups,          setGroups]         = useState([]);
  const [selectedGroup,   setSelectedGroup]  = useState(null);
  const [tasks,           setTasks]          = useState([]);
  const [members,         setMembers]        = useState([]);
  const [activeMember,    setActiveMember]   = useState(null); // member đang chấm
  const [weekStart,       setWeekStart]      = useState(()=>getWeekStart(new Date()));
  const [viewMode,        setViewMode]       = useState('week'); // 'week' | 'month'
  const [logs,            setLogs]           = useState({});
  const [pending,         setPending]        = useState({});
  const [saving,          setSaving]         = useState(false);
  const [showAddTask,     setShowAddTask]     = useState(false);
  const [editTask,        setEditTask]       = useState(null);
  const [deleteTask,      setDeleteTask]     = useState(null);
  const [confirmDelGroup, setConfirmDelGroup]= useState(null);
  const [showCalendar,    setShowCalendar]   = useState(false);
  const [calMonth,        setCalMonth]       = useState(()=>{ const d=new Date(); return {y:d.getFullYear(),m:d.getMonth()}; });

  // viewDays: 7 ngày (week) hoặc toàn tháng (month)
  const viewDays = viewMode === 'month'
    ? (() => {
        const d = new Date(weekStart);
        const year = d.getFullYear();
        const month = d.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay  = new Date(year, month + 1, 0);
        const start = getWeekStart(firstDay);
        const days = [];
        let cur = new Date(start);
        while (cur <= lastDay || days.length % 7 !== 0) {
          days.push(new Date(cur));
          cur.setDate(cur.getDate() + 1);
          if (days.length > 42) break; // max 6 tuần
        }
        return days;
      })()
    : getWeekDays(weekStart);

  const weekDays = viewDays; // alias để không phải đổi hết code bên dưới

  useEffect(()=>{ if(user) loadGroups(); },[user]);
  useEffect(()=>{ if(selectedGroup&&user) loadTasksAndLogs(); },[selectedGroup,weekStart,viewMode,user]);

  const loadGroups = async () => {
    try {
      const { data } = await api.get('/groups');
      const all = data.data;
      const userGroupIds = user?.groups?.map(g=>g.id)||[];
      const visible = can('admin','manager') ? all : all.filter(g=>userGroupIds.includes(g.id));
      setGroups(visible);
      if (visible.length) setSelectedGroup(visible[0]);
    } catch(e){ console.error(e); }
  };

  const loadTasksAndLogs = async () => {
    if (!selectedGroup||!user) return;
    try {
      // 2 calls song song: page-data (tasks+members) + week logs
      const viewStartStr = viewDays[0].toISOString().slice(0,10);
      const viewEndStr   = viewDays[viewDays.length-1].toISOString().slice(0,10);

      const [pageRes, weekLogsRes] = await Promise.all([
        api.get(`/daily/page-data?group_id=${selectedGroup.id}`),
        api.get(`/daily/logs/week?group_id=${selectedGroup.id}&week_start=${viewStartStr}&week_end=${viewEndStr}`),
      ]);

      setTasks(pageRes.data.data?.tasks || []);
      const m = pageRes.data.data?.members || [];

      // Phân quyền chấm điểm:
      // - Admin: chấm được cho tất cả thành viên trong nhóm.
      // - Manager / Leader: chỉ chấm được cho "user" (không chấm cho leader,
      //   manager, admin khác, và không tự chấm cho chính mình).
      const scorableMembers = isAdmin
        ? m
        : m.filter(x =>
            x.id !== user?.id &&
            !['admin', 'manager', 'leader'].includes(x.role)
          );

      setMembers(scorableMembers);
      if (scorableMembers.length) {
        setActiveMember(prev => {
          if (prev && scorableMembers.find(x=>x.id===prev.id)) return prev;
          return scorableMembers[0];
        });
      } else {
        setActiveMember(null);
      }

      // Logs — dùng week endpoint thay vì 7 request riêng lẻ
      const newLogs = {};
      const weekLogs = weekLogsRes.data.data?.logs||[];
      weekLogs.forEach(log => {
        const dateStr = new Date(log.log_date).toISOString().slice(0,10);
        newLogs[`${log.daily_task_id}_${log.user_id}_${dateStr}`] = {
          is_done: log.is_done,
          score:   log.score,
        };
      });
      setLogs(newLogs);
      setPending({});
    } catch(e){ console.error(e); }
  };

  const getLog = (taskId, userId, dateStr) => {
    const key = `${taskId}_${userId}_${dateStr}`;
    return pending[key]!==undefined ? pending[key] : (logs[key]||{is_done:0,score:0});
  };

  const toggleTick = (taskId, userId, dateStr) => {
    if (!isLeader) return;
    const key = `${taskId}_${userId}_${dateStr}`;
    const cur = getLog(taskId,userId,dateStr);
    setPending(p=>({...p,[key]:cur.is_done?{is_done:0,score:0}:{is_done:1,score:cur.score||0}}));
  };

  const setScore = (taskId, userId, dateStr, score) => {
    if (!isLeader) return;
    const key = `${taskId}_${userId}_${dateStr}`;
    const cur = getLog(taskId,userId,dateStr);
    setPending(p=>({...p,[key]:{...cur,score:parseFloat(score)||0}}));
  };

  const saveLogs = async () => {
    const logsArr = Object.entries(pending).map(([key,val])=>{
      const [taskId,userId,...dp] = key.split('_');
      return { daily_task_id:+taskId, user_id:+userId, log_date:dp.join('_'), ...val };
    });
    if (!logsArr.length) return;
    setSaving(true);
    try { await api.post('/daily/logs',{logs:logsArr}); await loadTasksAndLogs(); }
    catch(e){ alert(e.message); }
    finally{ setSaving(false); }
  };

  const createTask = async (form) => {
    try {
      const { data: tgData } = await api.get(`/daily/task-groups?group_id=${selectedGroup.id}`);
      let tgId;
      if (tgData.data.length) { tgId = tgData.data[0].id; }
      else {
        const { data: newTg } = await api.post('/daily/task-groups',{group_id:selectedGroup.id,name:selectedGroup.name,icon:selectedGroup.icon||'📋'});
        tgId = newTg.data.id;
      }
      await api.post(`/daily/task-groups/${tgId}/tasks`,form);
      setShowAddTask(false);
      loadTasksAndLogs();
    } catch(e){ alert(e.response?.data?.message||e.message); }
  };

  const updateTask = async (id,form) => {
    try { await api.put(`/daily/tasks/${id}`,form); setEditTask(null); loadTasksAndLogs(); }
    catch(e){ alert(e.message); }
  };

  const doDeleteTask = async () => {
    try { await api.delete(`/daily/tasks/${deleteTask.id}`); setDeleteTask(null); loadTasksAndLogs(); }
    catch(e){ alert(e.message); }
  };

  const doDeleteGroup = async () => {
    try {
      const { data: tgData } = await api.get(`/daily/task-groups?group_id=${confirmDelGroup.id}`);
      for (const tg of tgData.data) await api.delete(`/daily/task-groups/${tg.id}`);
      await api.delete(`/groups/${confirmDelGroup.id}`);
      setConfirmDelGroup(null); setSelectedGroup(null); setActiveMember(null); loadGroups();
    } catch(e){ alert(e.message); }
  };

  const prevWeek = () => { const d=new Date(weekStart); d.setDate(d.getDate()-7); setWeekStart(d); };
  const nextWeek = () => { const d=new Date(weekStart); d.setDate(d.getDate()+7); setWeekStart(d); };
  const weekLabel = viewMode === 'month'
    ? (() => {
        const d = new Date(weekStart);
        return `Tháng ${d.getMonth()+1}/${d.getFullYear()} — ${fmtDate(viewDays[0])} đến ${fmtDate(viewDays[viewDays.length-1])}`;
      })()
    : `Tuần ${getWeekNum(weekStart)} — ${fmtDate(weekDays[0])} đến ${fmtDate(weekDays[6])}/${weekDays[6].getFullYear()}`;
  const hasPending = Object.keys(pending).length > 0;

  const taskShowsOnDay = (task,day) => {
    if (task.frequency==='daily') return true;
    if (task.frequency==='weekly') return task.frequency_day===(day.getDay()===0?7:day.getDay());
    if (task.frequency==='monthly') return task.frequency_day===day.getDate();
    return false;
  };

  // Tổng điểm 1 member theo tuần
  const memberWeekTotal = (memberId) => {
    let total=0;
    tasks.forEach(t=>{
      weekDays.forEach(day=>{
        if (!taskShowsOnDay(t,day)) return;
        total+=+(getLog(t.id,memberId,day.toISOString().slice(0,10)).score)||0;
      });
    });
    return total.toFixed(1);
  };

  // Tổng điểm 1 member 1 ngày
  const memberDayTotal = (memberId,day) => {
    let total=0;
    const dateStr=day.toISOString().slice(0,10);
    tasks.forEach(t=>{
      if (!taskShowsOnDay(t,day)) return;
      total+=+(getLog(t.id,memberId,dateStr).score)||0;
    });
    return total;
  };

  // Tổng max 1 ngày
  const dayMax = (day) => tasks.filter(t=>taskShowsOnDay(t,day)).reduce((s,t)=>s+(+t.max_score||0),0);

  // Member score summary
  const pendingCount = activeMember
    ? Object.keys(pending).filter(k=>k.includes(`_${activeMember.id}_`)).length
    : 0;

  if (!user) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}><div>⏳</div></div>;

  return (
    <div className="dp-root" style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',background:'#fff',minWidth:0}}>
      <style>{`
        .dp-root { box-sizing: border-box; }
        .dp-root *, .dp-root *::before, .dp-root *::after { box-sizing: border-box; }
        .dp-root input[type="number"]::-webkit-outer-spin-button,
        .dp-root input[type="number"]::-webkit-inner-spin-button { margin: 0; }

        /* ── Cảm giác chạm mượt & phản hồi khi nhấn (mobile/touch) ── */
        .dp-root button { -webkit-tap-highlight-color: transparent; touch-action: manipulation; transition: transform .1s ease, background .15s, color .15s, border-color .15s; }
        .dp-root button:active { transform: scale(0.96); }
        .dp-root .dp-tick { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
        .dp-root .dp-tick:active { transform: scale(0.88) !important; }
        .dp-root .dp-member-item { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
        .dp-root .dp-member-item:active { transform: scale(0.97); }

        /* ── Focus rõ ràng cho bàn phím (a11y) ── */
        .dp-root *:focus-visible { outline: 2px solid ${C.primary}; outline-offset: 2px; border-radius: 4px; }

        /* ── Chặn Safari iOS tự zoom khi focus input chữ/số lớn ── */
        .dp-root input:not(.dp-score-input):focus { font-size: 16px !important; }
        .dp-root .dp-score-input:focus { font-size: 16px !important; }

        /* ── Thanh cuộn mảnh, đẹp trên desktop ── */
        .dp-root ::-webkit-scrollbar { width: 8px; height: 8px; }
        .dp-root ::-webkit-scrollbar-track { background: transparent; }
        .dp-root ::-webkit-scrollbar-thumb { background: #c8d4e6; border-radius: 8px; }
        .dp-root ::-webkit-scrollbar-thumb:hover { background: #aebedb; }

        /* ── Hiệu ứng mở nhẹ cho popup / modal ── */
        @keyframes dpFadeIn { from { opacity: 0; transform: translateY(-4px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .dp-root .dp-calendar-popup, .dp-root .dp-modal { animation: dpFadeIn .16s ease-out; }

        /* ── Tôn trọng cài đặt giảm chuyển động của người dùng ── */
        @media (prefers-reduced-motion: reduce) {
          .dp-root, .dp-root * { animation: none !important; transition: none !important; }
        }

        @media (max-width: 768px) {
          .dp-root .dp-topbar { flex-wrap: wrap !important; padding: 8px 12px !important; gap: 6px !important; }
          .dp-root .dp-breadcrumb { font-size: 11px !important; min-width: 0 !important; }
          .dp-root .dp-weekbar { padding: 8px 12px !important; gap: 6px !important; }
          .dp-root .dp-weeklabel { font-size: 12px !important; padding: 4px 8px !important; }
          .dp-root .dp-body { flex-direction: column !important; overflow: auto !important; }
          .dp-root .dp-sidebar { position: relative; width: 100% !important; border-right: none !important; border-bottom: 1.5px solid ${C.border} !important; max-height: 140px !important; }
          .dp-root .dp-sidebar::after { content: ''; position: absolute; top: 34px; right: 0; bottom: 0; width: 28px; background: linear-gradient(to left, rgba(255,255,255,0.95), rgba(255,255,255,0)); pointer-events: none; z-index: 4; }
          .dp-root .dp-members-list { display: flex !important; flex-direction: row !important; overflow-x: auto !important; overflow-y: hidden !important; padding: 8px 10px !important; gap: 8px !important; -webkit-overflow-scrolling: touch; scroll-snap-type: x proximity; }
          .dp-root .dp-member-item { scroll-snap-align: start; flex-direction: column !important; align-items: center !important; text-align: center !important; min-width: 84px !important; flex-shrink: 0 !important; border-left: none !important; border-bottom: none !important; border-radius: 12px !important; padding: 8px !important; gap: 4px !important; }
          .dp-root .dp-member-name { max-width: 76px !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }
          .dp-root .dp-sidebar-footer { display: none !important; }
          .dp-root .dp-matrix-panel { padding: 10px 8px !important; }
          .dp-root .dp-member-header { flex-wrap: wrap !important; padding: 10px 12px !important; row-gap: 8px !important; }
          .dp-root .dp-stickycol { min-width: 150px !important; }
          .dp-root .dp-daycol-week { min-width: 54px !important; }
          .dp-root .dp-daycol-month { min-width: 30px !important; }
          .dp-root .dp-sumcol { min-width: 54px !important; }
          .dp-root .dp-modal { width: calc(100vw - 32px) !important; padding: 18px !important; max-height: 88vh !important; }
          .dp-root .dp-calendar-popup { left: 8px !important; width: calc(100vw - 16px) !important; }
          .dp-root .dp-bottombar { padding-bottom: calc(11px + env(safe-area-inset-bottom)) !important; }
        }
        @media (max-width: 480px) {
          .dp-root .dp-stickycol { min-width: 122px !important; }
          .dp-root .dp-tick { width: 26px !important; height: 26px !important; font-size: 13px !important; }
          .dp-root .dp-score-input { width: 34px !important; font-size: 11px !important; }
          .dp-root .dp-modal { padding: 14px !important; }
          .dp-root .dp-member-item { min-width: 76px !important; }
          .dp-root .dp-topbar button, .dp-root .dp-topbar { font-size: 11px !important; }
        }
        @media (min-width: 1440px) {
          .dp-root .dp-sidebar { width: 240px !important; }
          .dp-root .dp-matrix-panel { padding: 20px 28px !important; }
        }
      `}</style>

      {/* ── Topbar ── */}
      <div className="dp-topbar" style={{padding:'12px 20px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:10,background:'#fff',flexShrink:0}}>
        <div className="dp-breadcrumb" style={{flex:1,display:'flex',alignItems:'center',gap:6,fontSize:13,color:'#888',flexWrap:'wrap',minWidth:0}}>
          <span onClick={()=>navigate('/board')} style={{cursor:'pointer',color:C.primary,whiteSpace:'nowrap'}}>🗂 Bảng CV</span>
          <span style={{color:'#ccc'}}>›</span>
          <span style={{color:C.primary}}>📋 CV Hằng ngày</span>
          {selectedGroup&&<><span style={{color:'#ccc'}}>›</span><span style={{color:C.dark,fontWeight:700}}>{selectedGroup.icon||'🏭'} {selectedGroup.name}</span></>}
        </div>
        {isAdmin&&selectedGroup&&(
          <button onClick={()=>setConfirmDelGroup(selectedGroup)}
            style={{padding:'6px 14px',borderRadius:7,border:'1px solid #fde8e8',background:'#fde8e8',fontSize:12,fontWeight:600,cursor:'pointer',color:C.danger}}>
            🗑 Xóa nhóm
          </button>
        )}
        {isLeader&&selectedGroup&&(
          <button onClick={()=>setShowAddTask(true)}
            style={{padding:'6px 14px',borderRadius:7,border:`1.5px solid ${C.border}`,background:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',color:'#555'}}>
            ➕ Thêm công việc
          </button>
        )}
        <button onClick={saveLogs} disabled={saving}
          style={{padding:'6px 14px',borderRadius:7,border:'none',background:hasPending?C.primary:C.success,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',boxShadow:hasPending?'0 4px 14px rgba(58,123,213,0.35)':'none'}}>
          {saving?'...':hasPending?`💾 Lưu (${Object.keys(pending).length})`:'💾 Lưu hôm nay'}
        </button>
      </div>

      {/* ── Week bar + Group tabs ── */}
      <div className="dp-weekbar" style={{padding:'10px 20px',background:C.bg,borderBottom:`1.5px solid ${C.border}`,display:'flex',alignItems:'center',gap:10,flexShrink:0,flexWrap:'wrap'}}>
        <div className="dp-weeklabel" onClick={()=>setShowCalendar(p=>!p)} style={{fontSize:13,fontWeight:700,color:C.dark,cursor:'pointer',padding:'4px 10px',borderRadius:7,border:`1.5px solid ${showCalendar?C.primary:C.border}`,background:showCalendar?'#eef3ff':'#fff',display:'flex',alignItems:'center',gap:6,whiteSpace:'nowrap'}}>📅 {weekLabel} <span style={{fontSize:10,color:'#aaa'}}>▼</span></div>

        {/* View mode tabs */}
        <div style={{display:'flex',gap:3,background:'#e8eaed',borderRadius:8,padding:3}}>
          {[
            { label:'Tuần này',   fn:()=>{ setViewMode('week'); setWeekStart(getWeekStart(new Date())); }},
            { label:'Tuần trước', fn:()=>{ setViewMode('week'); const d=getWeekStart(new Date()); d.setDate(d.getDate()-7); setWeekStart(d); }},
            { label:'Tháng này',  fn:()=>{ setViewMode('month'); setWeekStart(getWeekStart(new Date())); }},
            { label:'Tháng trước',fn:()=>{ setViewMode('month'); const d=new Date(); d.setMonth(d.getMonth()-1); d.setDate(1); setWeekStart(getWeekStart(d)); }},
          ].map(b=>(
            <button key={b.label} onClick={b.fn} style={{
              padding:'4px 10px',borderRadius:6,border:'none',fontSize:11,fontWeight:600,cursor:'pointer',
              background:'#fff',color:'#555',whiteSpace:'nowrap',
            }}>
              {b.label}
            </button>
          ))}
        </div>

        {viewMode==='week'&&<>
          <button onClick={prevWeek} style={{padding:'4px 8px',borderRadius:7,border:`1.5px solid ${C.border}`,background:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',color:'#555'}}>◀</button>
          <button onClick={nextWeek} style={{padding:'4px 8px',borderRadius:7,border:`1.5px solid ${C.border}`,background:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',color:'#555'}}>▶</button>
        </>}
        <div style={{width:1,height:20,background:C.border}}/>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',flex:1}}>
          {groups.map(g=>(
            <button key={g.id} onClick={()=>{setSelectedGroup(g);setActiveMember(null);}} style={{
              padding:'5px 14px',borderRadius:20,fontSize:12,fontWeight:600,cursor:'pointer',
              border:`1.5px solid ${selectedGroup?.id===g.id?C.primary:C.border}`,
              background:selectedGroup?.id===g.id?C.primary:'#fff',
              color:selectedGroup?.id===g.id?'#fff':'#888',
              display:'flex',alignItems:'center',gap:5,
            }}>
              <span>{g.icon||'🏭'}</span><span>{g.name}</span>
            </button>
          ))}
          {!groups.length&&<span style={{fontSize:12,color:'#bbb'}}>Chưa có nhóm — Admin vào Quản lý User → Nhóm để tạo</span>}
        </div>
      </div>

      {/* ── Calendar Popup ── */}
      {showCalendar && (
        <div style={{position:'relative',zIndex:20,flexShrink:0}}>
          <div className="dp-calendar-popup" style={{
            position:'absolute',top:0,left:20,
            background:'#fff',borderRadius:12,border:`1.5px solid ${C.border}`,
            boxShadow:'0 8px 32px rgba(0,0,0,0.15)',
            padding:16,width:300,maxWidth:'calc(100vw - 16px)',
          }}>
            {/* Cal header */}
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
              <button onClick={()=>setCalMonth(p=>{ const d=new Date(p.y,p.m-1); return {y:d.getFullYear(),m:d.getMonth()}; })}
                style={{width:28,height:28,borderRadius:6,border:`1px solid ${C.border}`,background:'#fff',cursor:'pointer',fontSize:14}}>◀</button>
              <div style={{flex:1,textAlign:'center',fontSize:14,fontWeight:700,color:C.dark}}>
                Tháng {calMonth.m+1}/{calMonth.y}
              </div>
              <button onClick={()=>setCalMonth(p=>{ const d=new Date(p.y,p.m+1); return {y:d.getFullYear(),m:d.getMonth()}; })}
                style={{width:28,height:28,borderRadius:6,border:`1px solid ${C.border}`,background:'#fff',cursor:'pointer',fontSize:14}}>▶</button>
            </div>

            {/* Day names */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:4}}>
              {['T2','T3','T4','T5','T6','T7','CN'].map(d=>(
                <div key={d} style={{textAlign:'center',fontSize:10,fontWeight:700,color:'#aaa',padding:'2px 0'}}>{d}</div>
              ))}
            </div>

            {/* Days grid */}
            {(() => {
              const firstDay = new Date(calMonth.y, calMonth.m, 1);
              const lastDay  = new Date(calMonth.y, calMonth.m+1, 0);
              const startDow = firstDay.getDay()===0 ? 6 : firstDay.getDay()-1;
              const days = [];
              // Empty cells before
              for(let i=0;i<startDow;i++) days.push(null);
              // Days
              for(let i=1;i<=lastDay.getDate();i++) days.push(new Date(calMonth.y,calMonth.m,i));

              return (
                <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2}}>
                  {days.map((day,i)=>{
                    if (!day) return <div key={`e${i}`}/>;
                    const ws      = getWeekStart(day);
                    const wsStr   = ws.toISOString().slice(0,10);
                    const curWStr = weekStart.toISOString().slice(0,10);
                    const isSelected = wsStr===curWStr;
                    const isTod   = isToday(day);
                    const dow     = day.getDay();
                    const isWE    = dow===0||dow===6;
                    return (
                      <div key={i} onClick={()=>{
                        setWeekStart(ws);
                        setViewMode('week');
                        setShowCalendar(false);
                      }}
                        style={{
                          textAlign:'center',padding:'5px 2px',borderRadius:6,
                          fontSize:12,fontWeight:isSelected||isTod?700:400,
                          cursor:'pointer',
                          background: isSelected?C.primary:isTod?'#eef3ff':'transparent',
                          color: isSelected?'#fff':isTod?C.primary:isWE?C.warning:'#444',
                          border: isSelected?`1px solid ${C.primary}`:isTod?`1px solid ${C.primary}`:'1px solid transparent',
                        }}
                        onMouseEnter={e=>{ if(!isSelected) e.currentTarget.style.background='#f0f4ff'; }}
                        onMouseLeave={e=>{ if(!isSelected) e.currentTarget.style.background=isTod?'#eef3ff':'transparent'; }}
                      >
                        {day.getDate()}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Footer shortcuts */}
            <div style={{display:'flex',gap:6,marginTop:12,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
              {[
                {label:'Tuần này',  fn:()=>{ setWeekStart(getWeekStart(new Date())); setViewMode('week'); setShowCalendar(false); }},
                {label:'Tháng này', fn:()=>{ const d=new Date(); setWeekStart(getWeekStart(new Date(d.getFullYear(),d.getMonth(),1))); setViewMode('month'); setShowCalendar(false); }},
                {label:'Đóng',      fn:()=>setShowCalendar(false)},
              ].map(b=>(
                <button key={b.label} onClick={b.fn} style={{
                  flex:1,padding:'5px 0',borderRadius:7,fontSize:11,fontWeight:600,cursor:'pointer',
                  border:`1px solid ${C.border}`,background:'#fff',color:'#555',
                }}>{b.label}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Body: 2 panel ── */}
      <div className="dp-body" style={{flex:1,display:'flex',overflow:'hidden'}}>

        {/* LEFT: Danh sách thành viên */}
        <div className="dp-sidebar" style={{width:200,flexShrink:0,borderRight:`1.5px solid ${C.border}`,display:'flex',flexDirection:'column',overflow:'hidden',background:'#fff'}}>
          <div style={{padding:'10px 14px',borderBottom:`1px solid ${C.border}`,fontSize:11,fontWeight:700,color:'#888',textTransform:'uppercase',letterSpacing:'0.4px'}}>
            👥 Thành viên
          </div>
          <div className="dp-members-list" style={{flex:1,overflowY:'auto'}}>
            {members.map(m=>{
              const isActive = activeMember?.id===m.id;
              const weekPts  = memberWeekTotal(m.id);
              const hasPend  = Object.keys(pending).some(k=>k.includes(`_${m.id}_`));
              return (
                <div key={m.id} className="dp-member-item" onClick={()=>setActiveMember(m)}
                  style={{
                    padding:'10px 14px',display:'flex',alignItems:'center',gap:8,cursor:'pointer',
                    borderLeft:`3px solid ${isActive?C.primary:'transparent'}`,
                    background:isActive?'#eef3ff':'transparent',
                    borderBottom:`1px solid ${C.border}`,
                    transition:'all .1s',
                  }}
                  onMouseEnter={e=>{ if(!isActive) e.currentTarget.style.background='#f7f8fb'; }}
                  onMouseLeave={e=>{ if(!isActive) e.currentTarget.style.background='transparent'; }}
                >
                  <div style={{position:'relative'}}>
                    <Chip color={m.avatar_color||C.primary} name={m.full_name} size={34} active={isActive}/>
                    {hasPend&&<div style={{position:'absolute',top:-2,right:-2,width:8,height:8,borderRadius:'50%',background:C.warning,border:'2px solid #fff'}}/>}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div className="dp-member-name" style={{fontSize:12,fontWeight:600,color:isActive?C.primary:C.dark,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {m.full_name}
                    </div>
                    <div style={{fontSize:10,color:isActive?C.primary:'#aaa',marginTop:2}}>
                      {+weekPts>0?<span style={{fontWeight:700,color:C.success}}>⭐ {weekPts}đ tuần này</span>:'Chưa có điểm'}
                    </div>
                  </div>
                  {isActive&&<div style={{width:6,height:6,borderRadius:'50%',background:C.primary,flexShrink:0}}/>}
                </div>
              );
            })}
            {!members.length&&(
              <div style={{padding:20,textAlign:'center',fontSize:12,color:'#bbb'}}>
                Chưa có thành viên<br/>
                <span style={{fontSize:11}}>Admin thêm vào nhóm</span>
              </div>
            )}
          </div>

          {/* Tổng kết tuần */}
          {members.length>0&&(
            <div className="dp-sidebar-footer" style={{padding:'10px 14px',borderTop:`1px solid ${C.border}`,background:C.bg}}>
              <div style={{fontSize:10,color:'#aaa',fontWeight:700,textTransform:'uppercase',marginBottom:6}}>Tổng tuần</div>
              {members.map(m=>(
                <div key={m.id} style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                  <Chip color={m.avatar_color||C.primary} name={m.full_name} size={18}/>
                  <span style={{fontSize:11,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'#555'}}>{m.full_name.split(' ').pop()}</span>
                  <span style={{fontSize:11,fontWeight:700,color:+memberWeekTotal(m.id)>0?C.success:'#ccc'}}>
                    {memberWeekTotal(m.id)}đ
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: Matrix của member đang chọn */}
        <div className="dp-matrix-panel" style={{flex:1,overflow:'auto',padding:'16px 20px',background:C.bg,minWidth:0}}>
          {!activeMember&&selectedGroup&&(
            <div style={{textAlign:'center',padding:40,color:'#aaa'}}>
              <div style={{fontSize:32,marginBottom:8}}>👈</div>
              <div style={{fontSize:13}}>Chọn thành viên bên trái để chấm điểm</div>
            </div>
          )}

          {activeMember&&selectedGroup&&(
            <>
              {/* Member header */}
              <div className="dp-member-header" style={{display:'flex',alignItems:'center',gap:12,marginBottom:16,background:'#fff',padding:'12px 16px',borderRadius:10,border:`1.5px solid ${C.border}`}}>
                <Chip color={activeMember.avatar_color||C.primary} name={activeMember.full_name} size={42}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:700,color:C.dark}}>{activeMember.full_name}</div>
                  <div style={{fontSize:11,color:'#aaa',marginTop:2}}>
                    Đang chấm điểm tuần này · {hasPending?<span style={{color:C.warning,fontWeight:600}}>⚠ {Object.keys(pending).length} thay đổi chưa lưu</span>:<span style={{color:C.success}}>✓ Đã lưu</span>}
                  </div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:22,fontWeight:900,color:C.success}}>{memberWeekTotal(activeMember.id)}đ</div>
                  <div style={{fontSize:10,color:'#aaa'}}>tổng tuần này</div>
                </div>
                {/* Nút prev/next member */}
                {members.length>1&&(
                  <div style={{display:'flex',gap:4}}>
                    <button onClick={()=>{
                      const idx=members.findIndex(m=>m.id===activeMember.id);
                      setActiveMember(members[(idx-1+members.length)%members.length]);
                    }} style={{padding:'4px 8px',borderRadius:6,border:`1.5px solid ${C.border}`,background:'#fff',cursor:'pointer',fontSize:12}}>◀</button>
                    <button onClick={()=>{
                      const idx=members.findIndex(m=>m.id===activeMember.id);
                      setActiveMember(members[(idx+1)%members.length]);
                    }} style={{padding:'4px 8px',borderRadius:6,border:`1.5px solid ${C.border}`,background:'#fff',cursor:'pointer',fontSize:12}}>▶</button>
                  </div>
                )}
              </div>

              {/* Matrix table */}
              <div style={{width:'100%',overflowX:'auto',borderRadius:12,WebkitOverflowScrolling:'touch'}}>
              <table style={{borderCollapse:'collapse',minWidth:'100%',background:'#fff',borderRadius:12,overflow:'hidden',border:'1.5px solid #dde8ff',boxShadow:'0 2px 12px rgba(58,123,213,.07)'}}>
                <thead>
                  <tr>
                    <th className="dp-stickycol" style={{background:'#162030',borderRight:'2px solid #2d3f52',minWidth:260,position:'sticky',left:0,zIndex:2}}>
                      <div style={{padding:'14px 16px',fontSize:11,color:'#7a9bbf'}}>
                        {selectedGroup.icon||'🏭'} {selectedGroup.name} · Công việc
                      </div>
                    </th>
                    {viewDays.map((day,i)=>{
                      const today  = isToday(day);
                      const future = isFuture(day);
                      const dTotal = memberDayTotal(activeMember.id,day);
                      const dMax   = dayMax(day);
                      const dow    = day.getDay()===0?6:day.getDay()-1; // 0=Mon
                      const isWeekend = day.getDay()===0||day.getDay()===6;
                      return (
                        <th key={i} className={viewMode==='month'?'dp-daycol-month':'dp-daycol-week'} style={{
                          background: today?'rgba(46,204,113,0.15)':'#1e2a3a',
                          border:'1px solid #2d3f52',
                          minWidth: viewMode==='month'?40:80,
                          opacity: isWeekend&&!today?0.7:1,
                        }}>
                          <div style={{padding:viewMode==='month'?'4px 2px':'8px 6px',display:'flex',flexDirection:'column',alignItems:'center',gap:1}}>
                            {viewMode==='week'
                              ? <div style={{fontSize:11,fontWeight:700,color:today?'#2ecc71':'#c8d8ee'}}>{DAYS_VI[dow]}{today?' ●':''}</div>
                              : <div style={{fontSize:9,fontWeight:700,color:today?'#2ecc71':isWeekend?'#e67e22':'#c8d8ee'}}>{DAYS_VI[dow]}</div>
                            }
                            <div style={{fontSize:viewMode==='month'?9:10,color:today?'#2ecc71':'#7a9bbf'}}>{fmtDate(day)}</div>
                            {!future&&dTotal>0&&viewMode==='week'&&(
                              <div style={{fontSize:10,fontWeight:700,color:dTotal>=dMax?'#2ecc71':C.warning,marginTop:1}}>
                                {dTotal.toFixed(0)}/{dMax}đ
                              </div>
                            )}
                          </div>
                        </th>
                      );
                    })}
                    <th className="dp-sumcol" style={{background:'#162030',borderLeft:'2px solid #3a7bd5',minWidth:70}}>
                      <div style={{padding:'8px 4px',display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                        <div style={{fontSize:11,fontWeight:700,color:'#f1c40f'}}>∑</div>
                        <div style={{fontSize:10,color:'#f1c40f'}}>Tổng</div>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map(task=>{
                    const freqColor = task.frequency==='daily'  ?{bg:'#e8f8ee',color:'#27ae60'}
                                    : task.frequency==='weekly' ?{bg:'#e8f0ff',color:'#3a7bd5'}
                                    :{bg:'#fff4e8',color:'#e67e22'};
                    const freqLabel = task.frequency==='daily'  ?'📅 Hằng ngày'
                                    : task.frequency==='weekly' ?'📆 Tuần 1 lần'
                                    :`🗓 Tháng · ngày ${task.frequency_day}`;

                    // Tổng task này của member này trong tuần
                    let rowTotal=0,rowMax=0;
                    weekDays.forEach(day=>{
                      if (!taskShowsOnDay(task,day)) return;
                      const l=getLog(task.id,activeMember.id,day.toISOString().slice(0,10));
                      rowTotal+=+l.score||0;
                      if (!isFuture(day)) rowMax+=+task.max_score||0;
                    });
                    const sumColor=rowTotal===0?'#ccc':rowTotal>=rowMax?C.success:C.warning;

                    return (
                      <tr key={task.id} style={{borderLeft:task.frequency==='weekly'?`3px solid ${C.primary}`:task.frequency==='monthly'?`3px solid ${C.warning}`:undefined}}>
                        <td className="dp-stickycol" style={{background:'#f8f9fc',borderRight:'2px solid #dde3f0',position:'sticky',left:0,zIndex:1}}>
                          <div style={{padding:'10px 14px',display:'flex',alignItems:'center',gap:8}}>
                            <div style={{flex:1}}>
                              <div style={{fontSize:13,color:'#2c3e50',fontWeight:500}}>{task.name}</div>
                              <div style={{display:'flex',alignItems:'center',gap:5,marginTop:3}}>
                                <span style={{fontSize:10,color:'#bbb',background:'#f0f2f8',padding:'1px 7px',borderRadius:8}}>{task.max_score}đ</span>
                                <span style={{fontSize:10,fontWeight:700,padding:'1px 7px',borderRadius:8,background:freqColor.bg,color:freqColor.color}}>{freqLabel}</span>
                              </div>
                            </div>
                            {isLeader&&(
                              <div style={{display:'flex',gap:4}}>
                                <button onClick={()=>setEditTask(task)} style={{width:24,height:24,borderRadius:5,border:`1px solid ${C.border}`,background:'#fff',cursor:'pointer',fontSize:11}}>✏️</button>
                                <button onClick={()=>setDeleteTask(task)} style={{width:24,height:24,borderRadius:5,border:`1px solid ${C.border}`,background:'#fff',cursor:'pointer',fontSize:11}}>🗑</button>
                              </div>
                            )}
                          </div>
                        </td>

                        {weekDays.map((day,i)=>{
                          const dateStr = day.toISOString().slice(0,10);
                          const shows   = taskShowsOnDay(task,day);
                          const future  = isFuture(day);
                          const today   = isToday(day);

                          if (!shows) return <td key={i} style={{background:'#f9fafb',borderColor:'#f0f2f5'}}/>;

                          const log    = getLog(task.id,activeMember.id,dateStr);
                          const isDone = log.is_done;
                          const score  = log.score;
                          const changed= pending[`${task.id}_${activeMember.id}_${dateStr}`]!==undefined;

                          return (
                            <td key={i} style={{
                              background:changed?'#fffbec':today?'rgba(46,204,113,0.04)':undefined,
                              borderColor:changed?'#f5d8a0':'#e8edf5',
                              textAlign:'center',
                              outline:changed?`1px solid #f5d8a0`:'none',
                            }}>
                              <div style={{padding:'8px 6px',display:'flex',flexDirection:'column',alignItems:'center',gap:5}}>
                                {/* Tick */}
                                <div className="dp-tick" onClick={()=>!future&&toggleTick(task.id,activeMember.id,dateStr)} style={{
                                  width:32,height:32,borderRadius:8,fontSize:16,
                                  display:'flex',alignItems:'center',justifyContent:'center',
                                  transition:'all .15s',userSelect:'none',
                                  cursor:future?'default':isLeader?'pointer':'default',
                                  border:future?'2px solid #e8eaed':isDone?`2px solid ${C.success}`:'2px solid #d0d8e8',
                                  background:future?'#f5f6f8':isDone?C.success:'#fff',
                                  color:isDone?'#fff':'transparent',
                                  boxShadow:isDone?`0 2px 8px ${C.success}44`:'none',
                                }}>
                                  {!future&&isDone?'✓':''}
                                </div>
                                {/* Score */}
                                <input className="dp-score-input" type="number" inputMode="decimal" min="0" max={task.max_score} step="0.5"
                                  value={future?'':(score||0)}
                                  disabled={future||!isLeader}
                                  onChange={e=>setScore(task.id,activeMember.id,dateStr,e.target.value)}
                                  style={{
                                    width:44,textAlign:'center',borderRadius:6,padding:'3px 4px',
                                    fontSize:12,fontWeight:700,outline:'none',
                                    border:future||!isLeader?'none':'1.5px solid #e0e4f0',
                                    color:future?'#ccc':isDone?C.primary:score>0?C.primary:'#ccc',
                                    background:future||!isLeader?'transparent':'#f7f9ff',
                                  }}
                                  placeholder={future?'–':'0'}
                                />
                              </div>
                            </td>
                          );
                        })}

                        {/* Sum */}
                        <td style={{background:'#f0f4ff',borderLeft:'2px solid #3a7bd5',textAlign:'center'}}>
                          <div style={{fontSize:14,fontWeight:800,color:sumColor}}>{rowTotal.toFixed(1)}</div>
                          <div style={{fontSize:10,color:'#aaa'}}>/ {rowMax}đ</div>
                        </td>
                      </tr>
                    );
                  })}

                  {isLeader&&(
                    <tr onClick={()=>setShowAddTask(true)} style={{cursor:'pointer'}}>
                      <td colSpan={9} style={{border:'1.5px dashed #c8d8f0'}}
                        onMouseEnter={e=>e.currentTarget.style.background='#f0f4ff'}
                        onMouseLeave={e=>e.currentTarget.style.background=''}>
                        <div style={{padding:'10px 14px',color:C.primary,fontSize:13,fontWeight:600}}>➕ Thêm công việc mới</div>
                      </td>
                    </tr>
                  )}
                  {tasks.length===0&&(
                    <tr><td colSpan={9} style={{textAlign:'center',padding:32,color:'#bbb',fontSize:13}}>
                      {isLeader?'Chưa có công việc. Nhấn "➕ Thêm công việc".':'Chưa có công việc.'}
                    </td></tr>
                  )}
                </tbody>

                <tfoot>
                  <tr>
                    <td className="dp-stickycol" style={{background:'#1e2a3a',color:'#9db8d2',padding:'10px 16px',fontSize:11,textAlign:'left',borderColor:'#2d3f52',position:'sticky',left:0}}>
                      🏆 Tổng {activeMember.full_name.split(' ').pop()}
                    </td>
                    {weekDays.map((day,i)=>{
                      const future = isFuture(day);
                      const today  = isToday(day);
                      const total  = memberDayTotal(activeMember.id,day);
                      const max    = dayMax(day);
                      const color  = future?'#555':total>=max&&max>0?'#2ecc71':total>0?C.warning:'#555';
                      return (
                        <td key={i} style={{background:today?'rgba(46,204,113,0.08)':'#1e2a3a',borderColor:'#2d3f52',textAlign:'center',padding:'10px 6px'}}>
                          <div style={{fontSize:16,fontWeight:900,color}}>{future?'–':total.toFixed(0)}</div>
                          {!future&&max>0&&<div style={{fontSize:9,color:'#7a9bbf'}}>/{max}đ</div>}
                        </td>
                      );
                    })}
                    <td style={{background:'#162030',borderLeft:'2px solid #3a7bd5',textAlign:'center',padding:'10px 6px'}}>
                      <div style={{fontSize:10,color:'#7a9bbf'}}>Tuần này</div>
                      <div style={{fontSize:18,fontWeight:900,color:'#2ecc71'}}>{memberWeekTotal(activeMember.id)}đ</div>
                    </td>
                  </tr>
                </tfoot>
              </table>
              </div>
            </>
          )}

          {!selectedGroup&&(
            <div style={{textAlign:'center',padding:60}}>
              <div style={{fontSize:40,marginBottom:12}}>🏭</div>
              <div style={{fontSize:14,color:'#bbb'}}>Admin vào <strong>Quản lý User → Nhóm</strong> để tạo nhóm</div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="dp-bottombar" style={{padding:'11px 20px',background:'#fff',borderTop:`1.5px solid ${C.border}`,display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
        <div style={{flex:1,fontSize:12,color:'#aaa'}}>
          <span style={{color:C.success,fontWeight:600}}>📅 Hằng ngày</span> ·&nbsp;
          <span style={{color:C.primary,fontWeight:600}}>📆 Tuần 1 lần</span> ·&nbsp;
          <span style={{color:C.warning,fontWeight:600}}>🗓 Tháng 1 lần</span>
          &nbsp;— Ô trống = ngày không có lịch · <span style={{color:C.warning}}>Ô vàng = chưa lưu</span>
        </div>
        <button onClick={saveLogs} disabled={saving}
          style={{padding:'6px 18px',borderRadius:7,border:'none',background:hasPending?C.primary:C.success,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',boxShadow:hasPending?'0 4px 14px rgba(58,123,213,0.35)':'none'}}>
          {saving?'...':hasPending?`💾 Lưu (${Object.keys(pending).length} thay đổi)`:'💾 Đã lưu'}
        </button>
      </div>

      {/* Modals */}
      {(showAddTask||editTask)&&(
        <TaskModal task={editTask}
          onClose={()=>{setShowAddTask(false);setEditTask(null);}}
          onSave={form=>editTask?updateTask(editTask.id,form):createTask(form)}/>
      )}
      {deleteTask&&(
        <ConfirmModal
          icon="🗑️" title="Xóa công việc này?"
          desc={`«${deleteTask.name}»`}
          warn="Toàn bộ dữ liệu điểm sẽ bị xóa!"
          onCancel={()=>setDeleteTask(null)}
          onConfirm={doDeleteTask} confirmLabel="🗑 Xóa luôn" danger/>
      )}
      {confirmDelGroup&&(
        <ConfirmModal
          icon="⚠️" title="Xóa nhóm này?"
          desc={`Nhóm: ${confirmDelGroup.name}`}
          warn="Tất cả công việc và điểm sẽ bị xóa vĩnh viễn!"
          onCancel={()=>setConfirmDelGroup(null)}
          onConfirm={doDeleteGroup} confirmLabel="🗑 Xóa nhóm" danger/>
      )}
    </div>
  );
}

function ConfirmModal({ icon, title, desc, warn, onCancel, onConfirm, confirmLabel, danger }) {
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.35)',zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',padding:16,backdropFilter:'blur(2px)',WebkitBackdropFilter:'blur(2px)'}}
      onClick={e=>e.target===e.currentTarget&&onCancel()}>
      <div className="dp-modal" style={{background:'#fff',borderRadius:14,padding:28,width:380,maxWidth:'92vw',boxShadow:'0 8px 40px rgba(0,0,0,.18)',textAlign:'center'}}>
        <div style={{fontSize:40,marginBottom:12}}>{icon}</div>
        <div style={{fontSize:15,fontWeight:800,color:'#1e2a3a',marginBottom:8}}>{title}</div>
        <div style={{fontSize:13,color:'#888',marginBottom:6}}>{desc}</div>
        {warn&&<div style={{fontSize:12,color:'#e74c3c',marginBottom:20}}>{warn}</div>}
        <div style={{display:'flex',gap:10,justifyContent:'center'}}>
          <button onClick={onCancel} style={{padding:'8px 20px',borderRadius:8,border:'1.5px solid #dde3f0',background:'#fff',fontSize:13,fontWeight:600,cursor:'pointer',color:'#555'}}>Huỷ bỏ</button>
          <button onClick={onConfirm} style={{padding:'8px 20px',borderRadius:8,border:'none',background:danger?'#e74c3c':'#3a7bd5',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function TaskModal({ task, onClose, onSave }) {
  const [form,setForm]=useState({name:task?.name||'',max_score:task?.max_score||3,frequency:task?.frequency||'daily',frequency_day:task?.frequency_day||''});
  const set=(k,v)=>setForm(p=>({...p,[k]:v}));
  const submit=()=>{
    if (!form.name.trim()) { alert('Nhập tên!'); return; }
    if (!form.max_score)   { alert('Nhập điểm!'); return; }
    if (form.frequency==='weekly'&&!form.frequency_day)  { alert('Chọn ngày trong tuần!'); return; }
    if (form.frequency==='monthly'&&!form.frequency_day) { alert('Nhập ngày trong tháng!'); return; }
    onSave({name:form.name,max_score:+form.max_score,frequency:form.frequency,frequency_day:form.frequency!=='daily'?+form.frequency_day:null});
  };
  const FI={width:'100%',padding:'8px 12px',border:'1.5px solid #dde3f0',borderRadius:8,fontSize:13,color:'#1e2a3a',outline:'none',boxSizing:'border-box'};
  const FL={display:'block',fontSize:11,fontWeight:700,color:'#888',textTransform:'uppercase',letterSpacing:'0.4px',marginBottom:6};
  const FREQS=[{key:'daily',icon:'📅',label:'Hằng ngày',sub:'Mỗi ngày'},{key:'weekly',icon:'📆',label:'Tuần 1 lần',sub:'Chọn ngày/tuần'},{key:'monthly',icon:'🗓',label:'Tháng 1 lần',sub:'Chọn ngày/tháng'}];
  const DAYS=['T2','T3','T4','T5','T6','T7','CN'];
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.35)',zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',padding:16,backdropFilter:'blur(2px)',WebkitBackdropFilter:'blur(2px)'}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="dp-modal" style={{background:'#fff',borderRadius:14,padding:28,width:460,maxWidth:'92vw',boxShadow:'0 8px 40px rgba(0,0,0,.18)',maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{fontSize:15,fontWeight:800,color:'#1e2a3a',marginBottom:20}}>{task?'✏️ Sửa công việc':'➕ Thêm công việc mới'}</div>
        <div style={{marginBottom:16}}><label style={FL}>Tên công việc *</label><input style={FI} value={form.name} onChange={e=>set('name',e.target.value)} autoFocus placeholder="Vd: Kiểm tra máy đầu ca"/></div>
        <div style={{marginBottom:16}}><label style={FL}>Điểm tối đa *</label><input type="number" inputMode="numeric" min="1" max="100" style={FI} value={form.max_score} onChange={e=>set('max_score',e.target.value)}/></div>
        <div style={{marginBottom:16}}>
          <label style={FL}>Tần suất *</label>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {FREQS.map(f=>(
              <div key={f.key} onClick={()=>set('frequency',f.key)} style={{flex:'1 1 100px',padding:10,borderRadius:9,cursor:'pointer',textAlign:'center',border:`2px solid ${form.frequency===f.key?'#3a7bd5':'#e8eaed'}`,background:form.frequency===f.key?'#eef3ff':'#fff'}}>
                <div style={{fontSize:20,marginBottom:4}}>{f.icon}</div>
                <div style={{fontSize:12,fontWeight:700,color:form.frequency===f.key?'#3a7bd5':'#333'}}>{f.label}</div>
                <div style={{fontSize:10,color:'#888',marginTop:2}}>{f.sub}</div>
              </div>
            ))}
          </div>
        </div>
        {form.frequency==='weekly'&&(
          <div style={{marginBottom:16}}><label style={FL}>Ngày trong tuần *</label>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {DAYS.map((d,i)=>(
                <div key={d} onClick={()=>set('frequency_day',i+1)} style={{width:38,height:38,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,cursor:'pointer',border:`2px solid ${form.frequency_day===(i+1)?'#3a7bd5':'#e8eaed'}`,background:form.frequency_day===(i+1)?'#3a7bd5':'#fff',color:form.frequency_day===(i+1)?'#fff':'#888'}}>{d}</div>
              ))}
            </div>
          </div>
        )}
        {form.frequency==='monthly'&&(
          <div style={{marginBottom:16}}><label style={FL}>Ngày trong tháng *</label><input type="number" inputMode="numeric" min="1" max="31" style={FI} value={form.frequency_day} onChange={e=>set('frequency_day',e.target.value)} placeholder="Vd: 1, 15..."/></div>
        )}
        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:22}}>
          <button onClick={onClose} style={{padding:'8px 20px',borderRadius:8,border:'1.5px solid #dde3f0',background:'#fff',fontSize:13,fontWeight:600,cursor:'pointer',color:'#555'}}>Huỷ</button>
          <button onClick={submit} style={{padding:'8px 20px',borderRadius:8,border:'none',background:'#3a7bd5',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>💾 Lưu công việc</button>
        </div>
      </div>
    </div>
  );
}