import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import useAuth from '../../store/authStore';

const C = {
  primary: '#3a7bd5', dark: '#1e2a3a', success: '#27ae60',
  warning: '#e67e22', danger: '#e74c3c',
  border: '#e8eaed', bg: '#f7f8fb',
};

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
// Định dạng YYYY-MM-DD theo giờ ĐỊA PHƯƠNG (không dùng toISOString vì nó quy
// đổi sang UTC và ở múi giờ VN (+7) sẽ bị lùi lại 1 ngày quanh nửa đêm).
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}
function isWeekend(d) { const dow = d.getDay(); return dow===0||dow===6; }

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
  const { t, i18n } = useTranslation();
  const DAYS_VI = t('weekdays_mon_first', { returnObjects: true });
  const DAYS_SHORT_VI = t('weekdays_short_mon_first', { returnObjects: true, defaultValue: ['T2','T3','T4','T5','T6','T7','CN'] });
  const currentLocale = { vi:'vi-VN', en:'en-US', ja:'ja-JP' }[i18n.language] || 'vi-VN';
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
  const [scoreWarn,       setScoreWarn]      = useState({}); // {key: true} — điểm vừa nhập vượt quá điểm tối đa
  const [saving,          setSaving]         = useState(false);
  const [showAddTask,     setShowAddTask]     = useState(false);
  const [editTask,        setEditTask]       = useState(null);
  const [deleteTask,      setDeleteTask]     = useState(null);
  const [confirmDelGroup, setConfirmDelGroup]= useState(null);
  const [showCalendar,    setShowCalendar]   = useState(false);
  // Lý do sửa điểm — chỉ áp dụng khi SỬA LẠI 1 log đã được chấm trước đó
  // (is_done=1 hoặc score>0) sang giá trị khác. {key: reasonText}
  const [editReasons,     setEditReasons]    = useState({});
  const [showReasonModal, setShowReasonModal]= useState(false);
  // Xem/sửa lại lý do của 1 ô ĐÃ lưu — bấm icon 📝 trên ô để mở
  const [viewReasonTarget, setViewReasonTarget] = useState(null); // {taskId,dateStr,taskName,dateLabel}
  const [viewReasonText,   setViewReasonText]   = useState('');
  const [savingReason,     setSavingReason]     = useState(false);
  const [calMonth,        setCalMonth]       = useState(()=>{ const d=new Date(); return {y:d.getFullYear(),m:d.getMonth()}; });

  // viewDays: 7 ngày (week) hoặc toàn tháng (month) — VẪN HIỂN THỊ T7/CN,
  // nhưng các ngày này sẽ bị khoá không cho chấm điểm (xem isWeekend bên dưới).
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
      const viewStartStr = ymd(viewDays[0]);
      const viewEndStr   = ymd(viewDays[viewDays.length-1]);

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
        const dateStr = ymd(new Date(log.log_date));
        newLogs[`${log.daily_task_id}_${log.user_id}_${dateStr}`] = {
          is_done: log.is_done,
          score:   log.score,
          edit_reason: log.edit_reason || '',
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

  const setScore = (taskId, userId, dateStr, score, maxScore) => {
    if (!isLeader) return;
    const key = `${taskId}_${userId}_${dateStr}`;
    const cur = getLog(taskId,userId,dateStr);
    let val = parseFloat(score);
    if (isNaN(val)) val = 0;
    if (val < 0) val = 0;
    if (maxScore!=null && val > +maxScore) {
      val = +maxScore;
      setScoreWarn(w=>({...w,[key]:true}));
      setTimeout(()=>setScoreWarn(w=>{ if(!w[key]) return w; const n={...w}; delete n[key]; return n; }), 1600);
    }
    setPending(p=>({...p,[key]:{...cur,score:val}}));
  };

  // Có phải đang SỬA LẠI 1 log đã được chấm trước đó (is_done=1 hoặc score>0)
  // sang giá trị khác không? Nếu đúng → bắt buộc phải có lý do mới cho lưu.
  const needsReason = (key) => {
    const orig = logs[key];
    if (!orig) return false; // chưa từng chấm — không phải "sửa lại"
    if (!(orig.is_done || +orig.score>0)) return false; // trước đó đang trống/0
    const val = pending[key];
    if (val===undefined) return false;
    return !!val.is_done!==!!orig.is_done || +val.score!==+orig.score;
  };

  const doSaveLogs = async () => {
    const logsArr = Object.entries(pending).map(([key,val])=>{
      const [taskId,userId,...dp] = key.split('_');
      return { daily_task_id:+taskId, user_id:+userId, log_date:dp.join('_'), ...val, edit_reason: editReasons[key]||null };
    });
    if (!logsArr.length) return;
    setSaving(true);
    try {
      await api.post('/daily/logs',{logs:logsArr});
      await loadTasksAndLogs();
      setEditReasons({});
    }
    catch(e){ alert(e.response?.data?.message||e.message); }
    finally{ setSaving(false); }
  };

  const saveLogs = () => {
    const reasonKeys = Object.keys(pending).filter(needsReason);
    const missing = reasonKeys.filter(k=>!(editReasons[k]||'').trim());
    if (missing.length) { setShowReasonModal(true); return; }
    doSaveLogs();
  };

  // Lưu lại LÝ DO đã sửa cho 1 ô (không đổi điểm/tick — chỉ cập nhật edit_reason)
  const saveViewedReason = async () => {
    if (!viewReasonTarget || !activeMember) return;
    if (!viewReasonText.trim()) { alert(t('daily_reason_placeholder','Nhập lý do sửa điểm...')); return; }
    const key = `${viewReasonTarget.taskId}_${activeMember.id}_${viewReasonTarget.dateStr}`;
    const existing = logs[key] || { is_done:0, score:0 };
    setSavingReason(true);
    try {
      await api.post('/daily/logs',{ logs: [{
        daily_task_id: viewReasonTarget.taskId,
        user_id: activeMember.id,
        log_date: viewReasonTarget.dateStr,
        is_done: existing.is_done,
        score: existing.score,
        edit_reason: viewReasonText.trim(),
      }]});
      await loadTasksAndLogs();
      setViewReasonTarget(null);
    } catch(e){ alert(e.response?.data?.message||e.message); }
    finally{ setSavingReason(false); }
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
        return `${t('daily_month')} ${d.getMonth()+1}/${d.getFullYear()} — ${fmtDate(viewDays[0])} ${t('daily_to')} ${fmtDate(viewDays[viewDays.length-1])}`;
      })()
    : `${t('daily_week')} ${getWeekNum(weekStart)} — ${fmtDate(weekDays[0])} ${t('daily_to')} ${fmtDate(weekDays[weekDays.length-1])}/${weekDays[weekDays.length-1].getFullYear()}`;
  const hasPending = Object.keys(pending).length > 0;

  // frequency_day giờ là chuỗi (VARCHAR) — có thể là "3" (1 ngày) hoặc
  // "2,4,6" (nhiều ngày với weekly_count/monthly_count). Luôn parse ra mảng số.
  const parseFreqDays = (v) => (v==null?'':String(v)).split(',').map(s=>parseInt(s.trim(),10)).filter(n=>!isNaN(n));

  const taskShowsOnDay = (task,day) => {
    if (task.frequency==='daily') return true;
    const dow = day.getDay()===0?7:day.getDay();
    const dom = day.getDate();
    if (task.frequency==='weekly')  return parseFreqDays(task.frequency_day)[0]===dow;
    if (task.frequency==='monthly') return parseFreqDays(task.frequency_day)[0]===dom;
    // "weekly_count" = chọn sẵn NHIỀU THỨ cụ thể trong tuần (VD T2+T4+T6).
    // "monthly_count" = chọn sẵn NHIỀU NGÀY cụ thể trong tháng.
    if (task.frequency==='weekly_count')  return parseFreqDays(task.frequency_day).includes(dow);
    if (task.frequency==='monthly_count') return parseFreqDays(task.frequency_day).includes(dom);
    return false;
  };

  // Tổng điểm 1 member theo tuần
  const memberWeekTotal = (memberId) => {
    let total=0;
    tasks.forEach(t=>{
      weekDays.forEach(day=>{
        if (isWeekend(day)) return;
        if (!taskShowsOnDay(t,day)) return;
        total+=+(getLog(t.id,memberId,ymd(day)).score)||0;
      });
    });
    return total.toFixed(1);
  };

  // Tổng điểm 1 member 1 ngày (T7/CN không chấm điểm nên luôn = 0)
  const memberDayTotal = (memberId,day) => {
    if (isWeekend(day)) return 0;
    let total=0;
    const dateStr=ymd(day);
    tasks.forEach(t=>{
      if (!taskShowsOnDay(t,day)) return;
      total+=+(getLog(t.id,memberId,dateStr).score)||0;
    });
    return total;
  };

  // Tổng max 1 ngày (T7/CN không tính vì không được chấm điểm)
  const dayMax = (day) => isWeekend(day) ? 0 : tasks.filter(t=>taskShowsOnDay(t,day)).reduce((s,t)=>s+(+t.max_score||0),0);

  // Member score summary
  const pendingCount = activeMember
    ? Object.keys(pending).filter(k=>k.includes(`_${activeMember.id}_`)).length
    : 0;

  // Số cột tổng cộng trong bảng (1 cột tên công việc + N ngày + 1 cột tổng)
  const colCount = viewDays.length + 2;

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
          <span onClick={()=>navigate('/board')} style={{cursor:'pointer',color:C.primary,whiteSpace:'nowrap'}}>🗂 {t('nav_board')}</span>
          <span style={{color:'#ccc'}}>›</span>
          <span style={{color:C.primary}}>📋 {t('nav_daily')}</span>
          {selectedGroup&&<><span style={{color:'#ccc'}}>›</span><span style={{color:C.dark,fontWeight:700}}>{selectedGroup.icon||'🏭'} {selectedGroup.name}</span></>}
        </div>
        {isAdmin&&selectedGroup&&(
          <button onClick={()=>setConfirmDelGroup(selectedGroup)}
            style={{padding:'6px 14px',borderRadius:7,border:'1px solid #fde8e8',background:'#fde8e8',fontSize:12,fontWeight:600,cursor:'pointer',color:C.danger}}>
            🗑 {t('daily_delete_group')}
          </button>
        )}
        {isLeader&&selectedGroup&&(
          <button onClick={()=>setShowAddTask(true)}
            style={{padding:'6px 14px',borderRadius:7,border:`1.5px solid ${C.border}`,background:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',color:'#555'}}>
            ➕ {t('daily_add_task')}
          </button>
        )}
        <button onClick={saveLogs} disabled={saving}
          style={{padding:'6px 14px',borderRadius:7,border:'none',background:hasPending?C.primary:C.success,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',boxShadow:hasPending?'0 4px 14px rgba(58,123,213,0.35)':'none'}}>
          {saving?'...':hasPending?`💾 ${t('save')} (${Object.keys(pending).length})`:`💾 ${t('daily_save_today')}`}
        </button>
      </div>

      {/* ── Week bar + Group tabs ── */}
      <div className="dp-weekbar" style={{padding:'10px 20px',background:C.bg,borderBottom:`1.5px solid ${C.border}`,display:'flex',alignItems:'center',gap:10,flexShrink:0,flexWrap:'wrap'}}>
        <div className="dp-weeklabel" onClick={()=>setShowCalendar(p=>!p)} style={{fontSize:13,fontWeight:700,color:C.dark,cursor:'pointer',padding:'4px 10px',borderRadius:7,border:`1.5px solid ${showCalendar?C.primary:C.border}`,background:showCalendar?'#eef3ff':'#fff',display:'flex',alignItems:'center',gap:6,whiteSpace:'nowrap'}}>📅 {weekLabel} <span style={{fontSize:10,color:'#aaa'}}>▼</span></div>

        {/* View mode tabs */}
        <div style={{display:'flex',gap:3,background:'#e8eaed',borderRadius:8,padding:3}}>
          {[
            { label:t('daily_this_week'),   fn:()=>{ setViewMode('week'); setWeekStart(getWeekStart(new Date())); }},
            { label:t('daily_last_week'), fn:()=>{ setViewMode('week'); const d=getWeekStart(new Date()); d.setDate(d.getDate()-7); setWeekStart(d); }},
            { label:t('daily_this_month'),  fn:()=>{ setViewMode('month'); setWeekStart(getWeekStart(new Date())); }},
            { label:t('daily_last_month'),fn:()=>{ setViewMode('month'); const d=new Date(); d.setMonth(d.getMonth()-1); d.setDate(1); setWeekStart(getWeekStart(d)); }},
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
          {!groups.length&&<span style={{fontSize:12,color:'#bbb'}}>{t('daily_no_groups')}</span>}
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
                {t('daily_month')} {calMonth.m+1}/{calMonth.y}
              </div>
              <button onClick={()=>setCalMonth(p=>{ const d=new Date(p.y,p.m+1); return {y:d.getFullYear(),m:d.getMonth()}; })}
                style={{width:28,height:28,borderRadius:6,border:`1px solid ${C.border}`,background:'#fff',cursor:'pointer',fontSize:14}}>▶</button>
            </div>

            {/* Day names */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:4}}>
              {DAYS_VI.map(d=>(
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
                    const wsStr   = ymd(ws);
                    const curWStr = ymd(weekStart);
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
                {label:t('daily_this_week'),  fn:()=>{ setWeekStart(getWeekStart(new Date())); setViewMode('week'); setShowCalendar(false); }},
                {label:t('daily_this_month'), fn:()=>{ const d=new Date(); setWeekStart(getWeekStart(new Date(d.getFullYear(),d.getMonth(),1))); setViewMode('month'); setShowCalendar(false); }},
                {label:t('users_close'),      fn:()=>setShowCalendar(false)},
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
            👥 {t('req_section_assignees')}
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
                      {+weekPts>0?<span style={{fontWeight:700,color:C.success}}>⭐ {t('daily_points_this_week',{score:weekPts})}</span>:t('daily_no_score')}
                    </div>
                  </div>
                  {isActive&&<div style={{width:6,height:6,borderRadius:'50%',background:C.primary,flexShrink:0}}/>}
                </div>
              );
            })}
            {!members.length&&(
              <div style={{padding:20,textAlign:'center',fontSize:12,color:'#bbb'}}>
                {t('daily_no_members')}<br/>
                <span style={{fontSize:11}}>{t('daily_admin_add_to_group')}</span>
              </div>
            )}
          </div>

          {/* Tổng kết tuần */}
          {members.length>0&&(
            <div className="dp-sidebar-footer" style={{padding:'10px 14px',borderTop:`1px solid ${C.border}`,background:C.bg}}>
              <div style={{fontSize:10,color:'#aaa',fontWeight:700,textTransform:'uppercase',marginBottom:6}}>{t('daily_week_total')}</div>
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
              <div style={{fontSize:13}}>{t('daily_select_member_hint')}</div>
            </div>
          )}

          {activeMember&&selectedGroup&&(
            <>
              {/* Matrix table */}
              <div style={{width:'100%',overflowX:'auto',borderRadius:12,WebkitOverflowScrolling:'touch'}}>
              <table style={{borderCollapse:'collapse',minWidth:'100%',background:'#fff',borderRadius:12,overflow:'hidden',border:'1.5px solid #dde8ff',boxShadow:'0 2px 12px rgba(58,123,213,.07)'}}>
                <thead>
                  <tr>
                    <th className="dp-stickycol" style={{background:'#162030',borderRight:'2px solid #2d3f52',minWidth:260,position:'sticky',left:0,zIndex:2}}>
                      <div style={{padding:'14px 16px',fontSize:11,color:'#7a9bbf'}}>
                        {selectedGroup.icon||'🏭'} {selectedGroup.name} · {t('daily_th_task','Công việc')}
                      </div>
                    </th>
                    {viewDays.map((day,i)=>{
                      const today  = isToday(day);
                      const future = isFuture(day);
                      const dayOff = isWeekend(day);
                      const dTotal = memberDayTotal(activeMember.id,day);
                      const dMax   = dayMax(day);
                      const dow    = day.getDay()===0?6:day.getDay()-1; // 0=Mon
                      return (
                        <th key={i} className={viewMode==='month'?'dp-daycol-month':'dp-daycol-week'} style={{
                          background: today?'rgba(46,204,113,0.15)':'#1e2a3a',
                          border:'1px solid #2d3f52',
                          minWidth: viewMode==='month'?40:80,
                          opacity: dayOff&&!today?0.55:1,
                        }}>
                          <div style={{padding:viewMode==='month'?'4px 2px':'8px 6px',display:'flex',flexDirection:'column',alignItems:'center',gap:1}}>
                            {viewMode==='week'
                              ? <div style={{fontSize:11,fontWeight:700,color:today?'#2ecc71':'#c8d8ee'}}>{DAYS_VI[dow]}{today?' ●':''}</div>
                              : <div style={{fontSize:9,fontWeight:700,color:today?'#2ecc71':'#c8d8ee'}}>{DAYS_VI[dow]}</div>
                            }
                            <div style={{fontSize:viewMode==='month'?9:10,color:today?'#2ecc71':'#7a9bbf'}}>{fmtDate(day)}</div>
                            {dayOff
                              ? <div style={{fontSize:9,color:'#7a9bbf',marginTop:1}}>{t('daily_day_off','Nghỉ')}</div>
                              : (!future&&dTotal>0&&viewMode==='week'&&(
                                  <div style={{fontSize:10,fontWeight:700,color:dTotal>=dMax?'#2ecc71':C.warning,marginTop:1}}>
                                    {dTotal.toFixed(0)}/{dMax}đ
                                  </div>
                                ))
                            }
                          </div>
                        </th>
                      );
                    })}
                    <th className="dp-sumcol" style={{background:'#162030',borderLeft:'2px solid #3a7bd5',minWidth:70}}>
                      <div style={{padding:'8px 4px',display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                        <div style={{fontSize:11,fontWeight:700,color:'#f1c40f'}}>∑</div>
                        <div style={{fontSize:10,color:'#f1c40f'}}>{t('daily_total_label','Tổng')}</div>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map(task=>{
                    const isMultiDay = task.frequency==='weekly_count' || task.frequency==='monthly_count';
                    const selectedDays = isMultiDay ? parseFreqDays(task.frequency_day) : [];
                    const freqColor = task.frequency==='daily'  ?{bg:'#e8f8ee',color:'#27ae60'}
                                    : task.frequency==='weekly' ?{bg:'#e8f0ff',color:'#3a7bd5'}
                                    : task.frequency==='monthly'?{bg:'#fff4e8',color:'#e67e22'}
                                    :{bg:'#f3e8ff',color:'#8e44ad'}; // weekly_count / monthly_count
                    const freqLabel = task.frequency==='daily'         ?`📅 ${t('daily_freq_daily','Hằng ngày')}`
                                    : task.frequency==='weekly'        ?`📆 ${t('daily_freq_weekly','Tuần 1 lần')}`
                                    : task.frequency==='monthly'       ?`🗓 ${t('daily_freq_monthly_day',{day:task.frequency_day, defaultValue:'Tháng · ngày {{day}}'})}`
                                    : task.frequency==='weekly_count'  ?`📆 ${selectedDays.map(d=>DAYS_SHORT_VI[d-1]).join(', ')}`
                                    :`🗓 ${t('daily_freq_monthly_count_days',{days:selectedDays.join(', '), defaultValue:'Ngày {{days}}'})}`;

                    // Tổng task này của member này trong tuần (bỏ qua T7/CN vì không chấm
                    // điểm) — dùng chung 1 công thức cho MỌI loại tần suất, vì
                    // taskShowsOnDay() giờ đã tự biết chính xác ngày nào cần hiện
                    // (kể cả weekly_count/monthly_count với nhiều ngày chọn sẵn).
                    let rowTotal=0,rowMax=0,completedCount=0;
                    weekDays.forEach(day=>{
                      if (!taskShowsOnDay(task,day)) return;
                      if (isWeekend(day)) return;
                      const l=getLog(task.id,activeMember.id,ymd(day));
                      rowTotal+=+l.score||0;
                      if (!isFuture(day)) rowMax+=+task.max_score||0;
                      if (l.is_done) completedCount++;
                    });
                    const sumColor=rowTotal===0?'#ccc':rowTotal>=rowMax?C.success:C.warning;

                    return (
                      <tr key={task.id} style={{borderLeft:task.frequency==='weekly'||task.frequency==='weekly_count'?`3px solid ${C.primary}`:task.frequency==='monthly'||task.frequency==='monthly_count'?`3px solid ${C.warning}`:undefined}}>
                        <td className="dp-stickycol" style={{background:'#f8f9fc',borderRight:'2px solid #dde3f0',position:'sticky',left:0,zIndex:1}}>
                          <div style={{padding:'10px 14px',display:'flex',alignItems:'center',gap:8}}>
                            <div style={{flex:1}}>
                              <div style={{fontSize:13,color:'#2c3e50',fontWeight:500}}>{task.name}</div>
                              <div style={{display:'flex',alignItems:'center',gap:5,marginTop:3,flexWrap:'wrap'}}>
                                <span style={{fontSize:10,color:'#bbb',background:'#f0f2f8',padding:'1px 7px',borderRadius:8}}>{task.max_score}đ</span>
                                <span style={{fontSize:10,fontWeight:700,padding:'1px 7px',borderRadius:8,background:freqColor.bg,color:freqColor.color}}>{freqLabel}</span>
                                {isMultiDay&&(
                                  <span style={{fontSize:10,fontWeight:700,padding:'1px 7px',borderRadius:8,background:completedCount>=selectedDays.length?'#e8f8ee':'#fff4e8',color:completedCount>=selectedDays.length?C.success:C.warning}}>
                                    ✓ {completedCount}/{selectedDays.length} {t('daily_times_label','lần')}
                                  </span>
                                )}
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
                          const dateStr = ymd(day);
                          const shows   = taskShowsOnDay(task,day);
                          const future  = isFuture(day);
                          const today   = isToday(day);
                          const dayOff  = isWeekend(day);
                          const locked  = future || dayOff; // T7/CN không cho chấm điểm

                          if (!shows) return <td key={i} style={{background:'#f9fafb',borderColor:'#f0f2f5'}}/>;

                          const log    = getLog(task.id,activeMember.id,dateStr);
                          const isDone = !locked && log.is_done;
                          const score  = log.score;
                          const changed= !locked && pending[`${task.id}_${activeMember.id}_${dateStr}`]!==undefined;
                          const warn   = !!scoreWarn[`${task.id}_${activeMember.id}_${dateStr}`];
                          // Lý do sửa điểm đã LƯU (không lấy từ pending — chỉ hiện icon
                          // cho những gì đã thực sự ghi vào DB).
                          const savedReason = logs[`${task.id}_${activeMember.id}_${dateStr}`]?.edit_reason;

                          return (
                            <td key={i} style={{
                              background:changed?'#fffbec':dayOff?'#f7f8fa':today?'rgba(46,204,113,0.04)':undefined,
                              borderColor:changed?'#f5d8a0':'#e8edf5',
                              textAlign:'center',
                              outline:changed?`1px solid #f5d8a0`:'none',
                              opacity: dayOff?0.6:1,
                              position:'relative',
                            }}>
                              {savedReason&&(
                                <span onClick={(e)=>{
                                    e.stopPropagation();
                                    setViewReasonTarget({ taskId:task.id, dateStr, taskName:task.name, dateLabel:fmtDate(day) });
                                    setViewReasonText(savedReason);
                                  }}
                                  title={`${t('daily_reason_tooltip_prefix','Lý do sửa điểm')}: ${savedReason}`}
                                  style={{position:'absolute',top:2,right:2,fontSize:11,cursor:'pointer',opacity:0.8,padding:2}}>📝</span>
                              )}
                              <div style={{padding:'8px 6px',display:'flex',flexDirection:'column',alignItems:'center',gap:5}}>
                                {/* Tick */}
                                <div className="dp-tick" onClick={()=>!locked&&toggleTick(task.id,activeMember.id,dateStr)} style={{
                                  width:32,height:32,borderRadius:8,fontSize:16,
                                  display:'flex',alignItems:'center',justifyContent:'center',
                                  transition:'all .15s',userSelect:'none',
                                  cursor:locked?'default':isLeader?'pointer':'default',
                                  border:locked?'2px solid #e8eaed':isDone?`2px solid ${C.success}`:'2px solid #d0d8e8',
                                  background:locked?'#f5f6f8':isDone?C.success:'#fff',
                                  color:isDone?'#fff':'transparent',
                                  boxShadow:isDone?`0 2px 8px ${C.success}44`:'none',
                                }}>
                                  {isDone?'✓':''}
                                </div>
                                {/* Score */}
                                <input className="dp-score-input" type="number" inputMode="decimal" min="0" max={task.max_score} step="0.5"
                                  value={locked?'':(score||0)}
                                  disabled={locked||!isLeader}
                                  onChange={e=>setScore(task.id,activeMember.id,dateStr,e.target.value,task.max_score)}
                                  style={{
                                    width:44,textAlign:'center',borderRadius:6,padding:'3px 4px',
                                    fontSize:12,fontWeight:700,outline:'none',
                                    border:warn?`1.5px solid ${C.danger}`:(locked||!isLeader?'none':'1.5px solid #e0e4f0'),
                                    color:locked?'#ccc':isDone?C.primary:score>0?C.primary:'#ccc',
                                    background:warn?'#fdecea':(locked||!isLeader?'transparent':'#f7f9ff'),
                                  }}
                                  placeholder={dayOff?t('daily_day_off_short','nghỉ'):future?'–':'0'}
                                />
                                {warn&&(
                                  <div style={{fontSize:9,color:C.danger,fontWeight:700,whiteSpace:'nowrap'}}>
                                    {t('daily_max_score_warn',{max:task.max_score, defaultValue:'Tối đa {{max}}đ'})}
                                  </div>
                                )}
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
                      <td colSpan={colCount} style={{border:'1.5px dashed #c8d8f0'}}
                        onMouseEnter={e=>e.currentTarget.style.background='#f0f4ff'}
                        onMouseLeave={e=>e.currentTarget.style.background=''}>
                        <div style={{padding:'10px 14px',color:C.primary,fontSize:13,fontWeight:600}}>➕ {t('daily_add_task_row','Thêm công việc mới')}</div>
                      </td>
                    </tr>
                  )}
                  {tasks.length===0&&(
                    <tr><td colSpan={colCount} style={{textAlign:'center',padding:32,color:'#bbb',fontSize:13}}>
                      {isLeader?t('daily_empty_tasks_leader','Chưa có công việc. Nhấn "➕ Thêm công việc".'):t('daily_empty_tasks','Chưa có công việc.')}
                    </td></tr>
                  )}
                </tbody>
              </table>
              </div>
            </>
          )}

          {!selectedGroup&&(
            <div style={{textAlign:'center',padding:60}}>
              <div style={{fontSize:40,marginBottom:12}}>🏭</div>
              <div style={{fontSize:14,color:'#bbb'}}>
                {t('daily_admin_create_group_hint',{ defaultValue: 'Admin vào <1>Quản lý User → Nhóm</1> để tạo nhóm' })
                  .split(/<1>|<\/1>/).map((part,i)=> i===1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="dp-bottombar" style={{padding:'11px 20px',background:'#fff',borderTop:`1.5px solid ${C.border}`,display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
        <div style={{flex:1,fontSize:12,color:'#aaa'}}>
          <span style={{color:C.success,fontWeight:600}}>📅 {t('daily_freq_daily','Hằng ngày')}</span> ·&nbsp;
          <span style={{color:C.primary,fontWeight:600}}>📆 {t('daily_freq_weekly','Tuần 1 lần')}</span> ·&nbsp;
          <span style={{color:C.warning,fontWeight:600}}>🗓 {t('daily_freq_monthly','Tháng 1 lần')}</span>
          &nbsp;— {t('daily_legend_empty','Ô trống = ngày không có lịch')} · <span style={{color:C.warning}}>{t('daily_legend_unsaved','Ô vàng = chưa lưu')}</span>
        </div>
        <button onClick={saveLogs} disabled={saving}
          style={{padding:'6px 18px',borderRadius:7,border:'none',background:hasPending?C.primary:C.success,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',boxShadow:hasPending?'0 4px 14px rgba(58,123,213,0.35)':'none'}}>
          {saving?'...':hasPending?t('daily_save_n_changes',{count:Object.keys(pending).length, defaultValue:'💾 Lưu ({{count}} thay đổi)'}):t('daily_already_saved','💾 Đã lưu')}
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
          icon="🗑️" title={t('daily_delete_task_confirm_title','Xóa công việc này?')}
          desc={`«${deleteTask.name}»`}
          warn={t('daily_delete_task_confirm_warn','Toàn bộ dữ liệu điểm sẽ bị xóa!')}
          onCancel={()=>setDeleteTask(null)}
          onConfirm={doDeleteTask} confirmLabel={`🗑 ${t('daily_delete_task_confirm_btn','Xóa luôn')}`} danger/>
      )}
      {confirmDelGroup&&(
        <ConfirmModal
          icon="⚠️" title={t('daily_delete_group_confirm_title','Xóa nhóm này?')}
          desc={t('daily_delete_group_confirm_desc',{name:confirmDelGroup.name, defaultValue:'Nhóm: {{name}}'})}
          warn={t('daily_delete_group_confirm_warn','Tất cả công việc và điểm sẽ bị xóa vĩnh viễn!')}
          onCancel={()=>setConfirmDelGroup(null)}
          onConfirm={doDeleteGroup} confirmLabel={`🗑 ${t('daily_delete_group_confirm_btn','Xóa nhóm')}`} danger/>
      )}
      {showReasonModal&&(
        <EditReasonModal
          items={Object.keys(pending).filter(needsReason).map(key=>{
            const [taskId,,...dp]=key.split('_');
            const task=tasks.find(x=>x.id===+taskId);
            const orig=logs[key]||{score:0};
            const val=pending[key]||{score:0};
            return { key, taskName:task?.name||'?', dateLabel:fmtDate(new Date(dp.join('_'))), oldScore:+orig.score||0, newScore:+val.score||0 };
          })}
          reasons={editReasons}
          onChangeReason={(key,text)=>setEditReasons(p=>({...p,[key]:text}))}
          onCancel={()=>setShowReasonModal(false)}
          onConfirm={()=>{
            const stillMissing = Object.keys(pending).filter(needsReason).some(k=>!(editReasons[k]||'').trim());
            if (stillMissing) { alert(t('daily_reason_all_required','Vui lòng nhập lý do cho tất cả các mục!')); return; }
            setShowReasonModal(false);
            doSaveLogs();
          }}/>
      )}
      {viewReasonTarget&&(
        <ViewEditReasonModal
          taskName={viewReasonTarget.taskName}
          dateLabel={viewReasonTarget.dateLabel}
          reason={viewReasonText}
          saving={savingReason}
          onChangeReason={setViewReasonText}
          onCancel={()=>setViewReasonTarget(null)}
          onSave={saveViewedReason}/>
      )}
    </div>
  );
}

// Modal bắt buộc nhập lý do khi sửa lại 1 điểm ĐÃ được chấm trước đó sang giá
// trị khác — mỗi mục thay đổi có 1 ô lý do riêng, phải điền đủ mới lưu được.
// Modal xem lại + SỬA lý do của 1 ô đã lưu — mở khi bấm icon 📝 trên ô điểm.
function ViewEditReasonModal({ taskName, dateLabel, reason, saving, onChangeReason, onCancel, onSave }) {
  const { t } = useTranslation();
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.35)',zIndex:60,display:'flex',alignItems:'center',justifyContent:'center',padding:16,backdropFilter:'blur(2px)',WebkitBackdropFilter:'blur(2px)'}}>
      <div className="dp-modal" style={{background:'#fff',borderRadius:14,padding:26,width:400,maxWidth:'92vw',boxShadow:'0 8px 40px rgba(0,0,0,.18)'}}>
        <div style={{fontSize:15,fontWeight:800,color:'#1e2a3a',marginBottom:4}}>📝 {t('daily_reason_view_title','Lý do sửa điểm')}</div>
        <div style={{fontSize:12,color:'#888',marginBottom:14}}>{taskName} · {dateLabel}</div>
        <textarea value={reason} onChange={e=>onChangeReason(e.target.value)} autoFocus
          placeholder={t('daily_reason_placeholder','Nhập lý do sửa điểm...')}
          style={{width:'100%',padding:'8px 10px',border:'1.5px solid #dde3f0',borderRadius:8,fontSize:13,resize:'vertical',minHeight:80,outline:'none',boxSizing:'border-box',fontFamily:'inherit'}}/>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:18}}>
          <button onClick={onCancel} style={{padding:'8px 18px',borderRadius:8,border:'1.5px solid #dde3f0',background:'#fff',fontSize:13,fontWeight:600,cursor:'pointer',color:'#555'}}>{t('daily_cancel_btn2','Huỷ')}</button>
          <button onClick={onSave} disabled={saving} style={{padding:'8px 18px',borderRadius:8,border:'none',background:saving?'#aaa':'#3a7bd5',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>
            {saving?'...':`💾 ${t('save','Lưu')}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditReasonModal({ items, reasons, onChangeReason, onCancel, onConfirm }) {
  const { t } = useTranslation();
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.35)',zIndex:60,display:'flex',alignItems:'center',justifyContent:'center',padding:16,backdropFilter:'blur(2px)',WebkitBackdropFilter:'blur(2px)'}}>
      <div className="dp-modal" style={{background:'#fff',borderRadius:14,padding:26,width:440,maxWidth:'92vw',boxShadow:'0 8px 40px rgba(0,0,0,.18)',maxHeight:'85vh',display:'flex',flexDirection:'column'}}>
        <div style={{fontSize:15,fontWeight:800,color:'#1e2a3a',marginBottom:6}}>✏️ {t('daily_reason_modal_title','Lý do sửa điểm')}</div>
        <div style={{fontSize:12,color:'#888',marginBottom:16}}>{t('daily_reason_modal_desc','Các điểm dưới đây đã được chấm trước đó — vui lòng ghi rõ lý do khi sửa lại.')}</div>
        <div style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column',gap:14,paddingRight:2}}>
          {items.map(item=>(
            <div key={item.key}>
              <div style={{fontSize:12,fontWeight:700,color:'#1e2a3a'}}>{item.taskName} · {item.dateLabel}</div>
              <div style={{fontSize:11,color:'#aaa',marginBottom:6}}>{item.oldScore}đ → <span style={{color:'#e67e22',fontWeight:700}}>{item.newScore}đ</span></div>
              <textarea value={reasons[item.key]||''} onChange={e=>onChangeReason(item.key,e.target.value)}
                placeholder={t('daily_reason_placeholder','Nhập lý do sửa điểm...')}
                style={{width:'100%',padding:'8px 10px',border:'1.5px solid #dde3f0',borderRadius:8,fontSize:12,resize:'vertical',minHeight:50,outline:'none',boxSizing:'border-box',fontFamily:'inherit'}}/>
            </div>
          ))}
          {!items.length&&<div style={{fontSize:12,color:'#bbb',textAlign:'center',padding:20}}>{t('daily_reason_none','Không có mục nào cần lý do.')}</div>}
        </div>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:18}}>
          <button onClick={onCancel} style={{padding:'8px 18px',borderRadius:8,border:'1.5px solid #dde3f0',background:'#fff',fontSize:13,fontWeight:600,cursor:'pointer',color:'#555'}}>{t('daily_cancel_btn2','Huỷ')}</button>
          <button onClick={onConfirm} style={{padding:'8px 18px',borderRadius:8,border:'none',background:'#3a7bd5',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>✅ {t('daily_reason_confirm_btn','Xác nhận & Lưu')}</button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ icon, title, desc, warn, onCancel, onConfirm, confirmLabel, danger }) {
  const { t } = useTranslation();
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.35)',zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',padding:16,backdropFilter:'blur(2px)',WebkitBackdropFilter:'blur(2px)'}}
      onClick={e=>e.target===e.currentTarget&&onCancel()}>
      <div className="dp-modal" style={{background:'#fff',borderRadius:14,padding:28,width:380,maxWidth:'92vw',boxShadow:'0 8px 40px rgba(0,0,0,.18)',textAlign:'center'}}>
        <div style={{fontSize:40,marginBottom:12}}>{icon}</div>
        <div style={{fontSize:15,fontWeight:800,color:'#1e2a3a',marginBottom:8}}>{title}</div>
        <div style={{fontSize:13,color:'#888',marginBottom:6}}>{desc}</div>
        {warn&&<div style={{fontSize:12,color:'#e74c3c',marginBottom:20}}>{warn}</div>}
        <div style={{display:'flex',gap:10,justifyContent:'center'}}>
          <button onClick={onCancel} style={{padding:'8px 20px',borderRadius:8,border:'1.5px solid #dde3f0',background:'#fff',fontSize:13,fontWeight:600,cursor:'pointer',color:'#555'}}>{t('daily_cancel_btn','Huỷ bỏ')}</button>
          <button onClick={onConfirm} style={{padding:'8px 20px',borderRadius:8,border:'none',background:danger?'#e74c3c':'#3a7bd5',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function TaskModal({ task, onClose, onSave }) {
  const { t } = useTranslation();
  const [form,setForm]=useState({name:task?.name||'',max_score:task?.max_score||3,frequency:task?.frequency||'daily',frequency_day:task?.frequency_day||''});
  const set=(k,v)=>setForm(p=>({...p,[k]:v}));
  const selectedDaysArr = (form.frequency_day||'').toString().split(',').map(s=>parseInt(s.trim(),10)).filter(n=>!isNaN(n));
  const toggleDay = (dayNum) => {
    const next = selectedDaysArr.includes(dayNum)
      ? selectedDaysArr.filter(x=>x!==dayNum)
      : [...selectedDaysArr, dayNum];
    set('frequency_day', next.sort((a,b)=>a-b).join(','));
  };
  const submit=()=>{
    if (!form.name.trim()) { alert(t('daily_alert_need_name','Nhập tên!')); return; }
    if (!form.max_score)   { alert(t('daily_alert_need_score','Nhập điểm!')); return; }
    if (form.frequency==='weekly'&&!form.frequency_day)  { alert(t('daily_alert_need_weekday','Chọn ngày trong tuần!')); return; }
    if (form.frequency==='monthly'&&!form.frequency_day) { alert(t('daily_alert_need_monthday','Nhập ngày trong tháng!')); return; }
    if (form.frequency==='weekly_count'&&!form.frequency_day)  { alert(t('daily_alert_need_weekly_days','Chọn ít nhất 1 thứ trong tuần!')); return; }
    if (form.frequency==='monthly_count'&&!form.frequency_day) { alert(t('daily_alert_need_monthly_days','Chọn ít nhất 1 ngày trong tháng!')); return; }
    // ⚠️ KHÔNG dùng +form.frequency_day nữa — với weekly_count/monthly_count,
    // giá trị là chuỗi nhiều ngày (VD "2,4,6"), ép +Number sẽ ra NaN.
    onSave({name:form.name,max_score:+form.max_score,frequency:form.frequency,frequency_day:form.frequency!=='daily'?form.frequency_day:null});
  };
  const FI={width:'100%',padding:'8px 12px',border:'1.5px solid #dde3f0',borderRadius:8,fontSize:13,color:'#1e2a3a',outline:'none',boxSizing:'border-box'};
  const FL={display:'block',fontSize:11,fontWeight:700,color:'#888',textTransform:'uppercase',letterSpacing:'0.4px',marginBottom:6};
  const FREQS=[
    {key:'daily',         icon:'📅', label:t('daily_freq_daily','Hằng ngày'),           sub:t('daily_freq_daily_sub','Mỗi ngày')},
    {key:'weekly_count',  icon:'🔁', label:t('daily_freq_weekly_count_opt','Nhiều thứ/tuần'),  sub:t('daily_freq_weekly_count_sub','Chọn sẵn nhiều thứ')},
    {key:'monthly_count', icon:'🔁', label:t('daily_freq_monthly_count_opt','Nhiều ngày/tháng'), sub:t('daily_freq_monthly_count_sub','Chọn sẵn nhiều ngày')},
  ];
  const DAYS=t('weekdays_short_mon_first',{returnObjects:true, defaultValue:['T2','T3','T4','T5','T6','T7','CN']});
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.35)',zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',padding:16,backdropFilter:'blur(2px)',WebkitBackdropFilter:'blur(2px)'}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="dp-modal" style={{background:'#fff',borderRadius:14,padding:28,width:460,maxWidth:'92vw',boxShadow:'0 8px 40px rgba(0,0,0,.18)',maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{fontSize:15,fontWeight:800,color:'#1e2a3a',marginBottom:20}}>{task?`✏️ ${t('daily_edit_task_title','Sửa công việc')}`:`➕ ${t('daily_add_task_title','Thêm công việc mới')}`}</div>
        <div style={{marginBottom:16}}><label style={FL}>{t('daily_field_task_name','Tên công việc')} *</label><input style={FI} value={form.name} onChange={e=>set('name',e.target.value)} autoFocus placeholder={t('daily_field_task_name_placeholder','Vd: Kiểm tra máy đầu ca')}/></div>
        <div style={{marginBottom:16}}><label style={FL}>{t('daily_field_max_score','Điểm tối đa')} *</label><input type="number" inputMode="numeric" min="1" max="100" style={FI} value={form.max_score} onChange={e=>set('max_score',e.target.value)}/></div>
        <div style={{marginBottom:16}}>
          <label style={FL}>{t('daily_field_frequency','Tần suất')} *</label>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {FREQS.map(f=>(
              <div key={f.key} onClick={()=>{ set('frequency',f.key); set('frequency_day',''); }} style={{flex:'1 1 100px',padding:10,borderRadius:9,cursor:'pointer',textAlign:'center',border:`2px solid ${form.frequency===f.key?'#3a7bd5':'#e8eaed'}`,background:form.frequency===f.key?'#eef3ff':'#fff'}}>
                <div style={{fontSize:20,marginBottom:4}}>{f.icon}</div>
                <div style={{fontSize:12,fontWeight:700,color:form.frequency===f.key?'#3a7bd5':'#333'}}>{f.label}</div>
                <div style={{fontSize:10,color:'#888',marginTop:2}}>{f.sub}</div>
              </div>
            ))}
          </div>
        </div>
        {form.frequency==='weekly_count'&&(
          <div style={{marginBottom:16}}>
            <label style={FL}>{t('daily_field_weekly_days','Chọn các thứ trong tuần')} *</label>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {DAYS.map((d,i)=>{
                const dayNum=i+1;
                const selected=selectedDaysArr.includes(dayNum);
                return (
                  <div key={d} onClick={()=>toggleDay(dayNum)} style={{width:38,height:38,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,cursor:'pointer',border:`2px solid ${selected?'#3a7bd5':'#e8eaed'}`,background:selected?'#3a7bd5':'#fff',color:selected?'#fff':'#888'}}>{d}</div>
                );
              })}
            </div>
            <div style={{fontSize:11,color:'#aaa',marginTop:5}}>{t('daily_field_weekly_days_hint','Công việc chỉ hiện ra và tính điểm đúng vào những thứ đã chọn — bấm để chọn/bỏ chọn.')}</div>
          </div>
        )}
        {form.frequency==='monthly_count'&&(
          <div style={{marginBottom:16}}>
            <label style={FL}>{t('daily_field_monthly_days','Chọn các ngày trong tháng')} *</label>
            <div style={{display:'flex',gap:5,flexWrap:'wrap',maxHeight:150,overflowY:'auto',padding:'6px 2px'}}>
              {Array.from({length:31},(_,i)=>i+1).map(dayNum=>{
                const selected=selectedDaysArr.includes(dayNum);
                return (
                  <div key={dayNum} onClick={()=>toggleDay(dayNum)} style={{width:30,height:30,borderRadius:7,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,cursor:'pointer',border:`2px solid ${selected?'#3a7bd5':'#e8eaed'}`,background:selected?'#3a7bd5':'#fff',color:selected?'#fff':'#888'}}>{dayNum}</div>
                );
              })}
            </div>
            <div style={{fontSize:11,color:'#aaa',marginTop:5}}>{t('daily_field_monthly_days_hint','Công việc chỉ hiện ra và tính điểm đúng vào những ngày đã chọn — bấm để chọn/bỏ chọn.')}</div>
          </div>
        )}
        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:22}}>
          <button onClick={onClose} style={{padding:'8px 20px',borderRadius:8,border:'1.5px solid #dde3f0',background:'#fff',fontSize:13,fontWeight:600,cursor:'pointer',color:'#555'}}>{t('daily_cancel_btn2','Huỷ')}</button>
          <button onClick={submit} style={{padding:'8px 20px',borderRadius:8,border:'none',background:'#3a7bd5',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>💾 {t('daily_save_task_btn','Lưu công việc')}</button>
        </div>
      </div>
    </div>
  );
}