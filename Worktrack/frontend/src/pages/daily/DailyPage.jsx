import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api, { clearApiCache } from '../../api/client';
import useAuth from '../../store/authStore';
import { getSocket } from '../../lib/socket';

/* ============================================================
   DESIGN TOKENS — cùng hệ thống với BoardPage (control-panel):
   xanh tín hiệu làm màu chủ đạo, chữ số/điểm dùng font mono kiểu
   màn hình điện tử, ô "chưa lưu" có viền hổ phách nổi bật.
   ============================================================ */
const C = {
  ink:        '#0f1729',
  sub:        '#6b7280',
  faint:      '#9aa3b2',
  surface:    '#ffffff',
  canvas:     '#eef1f8',
  line:       '#e6e9f2',
  lineSoft:   '#f0f2f8',

  primary:      '#3654ff',
  primaryDeep:  '#2440d6',
  primarySoft:  '#eaefff',

  success:     '#17b26a',
  successSoft: '#e8f9f0',
  warning:     '#f59e0b',
  warningSoft: '#fef3e2',
  danger:      '#e5384d',
  dangerSoft:  '#fdeaec',
  violet:      '#8b5cf6',
  violetSoft:  '#f2ecfe',

  panelDark:    '#0f1729',
  panelDark2:   '#1a2540',
};

const FONT_SANS = "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";

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
      background:`linear-gradient(135deg, ${color}, ${color}cc)`, color:'#fff',
      fontSize:size>28?12:10, fontWeight:700, fontFamily:FONT_SANS,
      boxShadow: active?`0 0 0 3px #fff, 0 0 0 5px ${C.primary}55, 0 2px 6px rgba(15,23,41,.2)`:'0 1px 3px rgba(15,23,41,.18)',
      transition:'box-shadow .15s ease, transform .15s ease',
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
  const [searchParams] = useSearchParams();
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
  // Import nhanh công việc Daily từ CSV
  const [showImport,      setShowImport]      = useState(false);
  const [importFile,      setImportFile]      = useState(null);
  const [importPreview,   setImportPreview]   = useState(null);
  const [importing,       setImporting]       = useState(false);
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
  // Lịch sử TẤT CẢ lần chấm/sửa của đúng 1 ô — mỗi người từng ghi lý do gì,
  // giữ nguyên riêng biệt (không bị người sau ghi đè mất như trước).
  const [noteHistory,      setNoteHistory]      = useState([]);
  const [viewScoreValue,   setViewScoreValue]   = useState(0);
  const [loadingHistory,   setLoadingHistory]   = useState(false);
  const [calMonth,        setCalMonth]       = useState(()=>{ const d=new Date(); return {y:d.getFullYear(),m:d.getMonth()}; });

  // viewDays: 7 ngày (week) hoặc toàn tháng (month) — VẪN HIỂN THỊ T7/CN,
  // nhưng các ngày này sẽ bị khoá không cho chấm điểm (xem isWeekend bên dưới).
  // ⚠️ TỐI ƯU: bọc useMemo — trước đây tính lại TOÀN BỘ mảng ngày (tạo mới
  // 7-42 object Date) mỗi lần component render, kể cả khi chỉ gõ điểm 1 ô
  // (không liên quan gì tới ngày tháng). Giờ chỉ tính lại khi weekStart/viewMode
  // thực sự đổi.
  const viewDays = useMemo(() => (viewMode === 'month'
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
    : getWeekDays(weekStart)
  ), [weekStart, viewMode]);

  const weekDays = viewDays; // alias để không phải đổi hết code bên dưới

  useEffect(()=>{ if(user) loadGroups(); },[user]);

  // 📍 Nhảy đúng tuần chứa ngày trong link thông báo (VD: /daily?date=2026-08-12)
  // — chỉ chạy 1 lần lúc mở trang từ link, không chạy lại khi user tự đổi tuần.
  useEffect(()=>{
    const dateParam = searchParams.get('date');
    if (dateParam) {
      const d = new Date(dateParam);
      if (!isNaN(d)) { setViewMode('week'); setWeekStart(getWeekStart(d)); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(()=>{ if(selectedGroup&&user) loadTasksAndLogs(); },[selectedGroup,weekStart,viewMode,user]);

  // 📡 Realtime — tự tải lại khi có ai chấm/sửa điểm Daily ở bất kỳ đâu,
  // không cần F5. Xóa cache client trước khi fetch lại (cache GET chỉ tự
  // xóa khi CHÍNH tab này gọi POST/PUT/DELETE, không biết gì về thay đổi
  // từ tab/người khác — xem giải thích tương tự ở RequestsPage.jsx).
  useEffect(()=>{
    if (!user?.id) return;
    const socket = getSocket(user.id);
    const onUpdate = () => { clearApiCache(); loadTasksAndLogs(); };
    socket.on('daily:updated', onUpdate);
    return () => socket.off('daily:updated', onUpdate);
  }, [user?.id, selectedGroup]);

  const loadGroups = async () => {
    try {
      const { data } = await api.get('/groups');
      const all = data.data;
      const userGroupIds = user?.groups?.map(g=>g.id)||[];
      const visible = can('admin','manager') ? all : all.filter(g=>userGroupIds.includes(g.id));
      setGroups(visible);
      // ⚠️ Nhảy đúng nhóm khi mở từ link thông báo (VD: /daily?group_id=3&date=2026-08-12)
      // — thay vì luôn mặc định chọn nhóm ĐẦU TIÊN như trước.
      const gidParam = searchParams.get('group_id');
      const target = gidParam ? visible.find(g => String(g.id) === gidParam) : null;
      if (target) setSelectedGroup(target);
      else if (visible.length) setSelectedGroup(visible[0]);
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

  // Lưu điểm + lý do từ panel bên phải — CHO PHÉP sửa cả điểm ngay tại đây,
  // không chỉ ghi lý do suông nữa. Nếu điểm thực sự đổi so với trước và ô đó
  // đã từng được chấm, bắt buộc phải có lý do (khớp luật phía backend).
  const saveViewedReason = async () => {
    if (!viewReasonTarget || !activeMember) return;
    const key = `${viewReasonTarget.taskId}_${activeMember.id}_${viewReasonTarget.dateStr}`;
    const existing = logs[key] || { is_done:0, score:0 };
    const newScore = +viewScoreValue || 0;
    const scoreChanged = +existing.score !== newScore;
    const wasScored = existing.is_done || +existing.score > 0;
    if (wasScored && scoreChanged && !viewReasonText.trim()) {
      alert(t('daily_reason_placeholder','Nhập lý do sửa điểm...')); return;
    }
    setSavingReason(true);
    try {
      await api.post('/daily/logs',{ logs: [{
        daily_task_id: viewReasonTarget.taskId,
        user_id: activeMember.id,
        log_date: viewReasonTarget.dateStr,
        is_done: newScore > 0 ? 1 : existing.is_done,
        score: newScore,
        // ⚠️ Để trống ô lý do → GIỮ NGUYÊN lý do cũ (nếu có), không ghi đè
        // thành rỗng/null — trước đây cứ Lưu mà không gõ gì là mất luôn lý
        // do đã lưu trước đó.
        edit_reason: viewReasonText.trim() || (existing.edit_reason && existing.edit_reason!=='null' ? existing.edit_reason : null),
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

  // ── Import nhanh công việc Daily từ CSV ──
  // Format cột: Tên công việc, Điểm tối đa, Tần suất, Ngày áp dụng, Giao cho
  //   - Tần suất: "Hằng ngày" / "Nhiều thứ/tuần" / "Nhiều ngày/tháng" (hoặc
  //     daily/weekly_count/monthly_count viết thẳng cũng được)
  //   - Ngày áp dụng: bỏ trống nếu Hằng ngày; "2,4,6" (T2=1..CN=7) nếu Nhiều
  //     thứ/tuần; "1,15" nếu Nhiều ngày/tháng
  //   - Giao cho: bỏ trống = Tất cả mọi người; hoặc gõ đúng Họ tên 1 thành
  //     viên trong nhóm đang chọn để giao RIÊNG cho người đó
  const FREQ_ALIASES = {
    'hằng ngày':'daily', 'hang ngay':'daily', 'daily':'daily',
    'nhiều thứ/tuần':'weekly_count', 'nhieu thu/tuan':'weekly_count', 'weekly_count':'weekly_count',
    'nhiều ngày/tháng':'monthly_count', 'nhieu ngay/thang':'monthly_count', 'monthly_count':'monthly_count',
  };

  const handleImportFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImportFile(file);

    const readFile = (f, enc) => new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload  = ev => res(ev.target.result);
      reader.onerror = rej;
      reader.readAsText(f, enc);
    });
    const buffer = await file.arrayBuffer();
    const bytes  = new Uint8Array(buffer);
    let text = '';
    if (bytes[0]===0xEF && bytes[1]===0xBB && bytes[2]===0xBF) {
      text = await readFile(file, 'utf-8');
    } else if (bytes[0]===0xFF && bytes[1]===0xFE) {
      text = new TextDecoder('utf-16le').decode(buffer);
    } else {
      const utf8 = new TextDecoder('utf-8').decode(buffer);
      const hasGarbled = /[�Ãáà]/.test(utf8.slice(0,200));
      text = hasGarbled ? await readFile(file, 'windows-1252') : utf8;
    }
    text = text.replace(/^\uFEFF/, '');
    const lines = text.trim().split(/\r?\n/).map(l=>l.trim()).filter(Boolean).slice(0, 300);

    // ⚠️ TỐI ƯU/SỬA LỖI: parser CSV chuẩn — tôn trọng dấu ngoặc kép. Trước đây
    // dùng line.split(',') đơn giản, nên cột dạng "2,4,6" (có phẩy BÊN TRONG
    // dấu ngoặc kép) bị tách vỡ thành nhiều cột sai lệch hết các cột phía sau.
    const parseCsvLine = (line) => {
      const out = [];
      let cur = '', inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
          if (ch === '"') {
            if (line[i+1] === '"') { cur += '"'; i++; } // "" → 1 dấu " thật
            else inQuotes = false;
          } else cur += ch;
        } else {
          if (ch === '"') inQuotes = true;
          else if (ch === ',') { out.push(cur); cur = ''; }
          else cur += ch;
        }
      }
      out.push(cur);
      return out.map(s => s.trim());
    };

    const isHeader = l => /^(t[eê]n|name|c[oô]ng vi[eệ]c)/i.test(parseCsvLine(l)[0]||'');
    const dataLines = lines.filter(l => !isHeader(l));

    const rows = dataLines.map(line => {
      const parts = parseCsvLine(line);
      const name       = parts[0] || '';
      const max_score  = parts[1] || '';
      const freqRaw    = (parts[2] || 'daily').toLowerCase();
      const days       = parts[3] || '';
      const assignee   = parts[4] || '';
      const frequency  = FREQ_ALIASES[freqRaw] || 'daily';
      const member     = assignee ? members.find(m => m.full_name.toLowerCase() === assignee.toLowerCase()) : null;
      // ⚠️ Ghi rõ LÝ DO lỗi cho từng dòng thay vì chỉ báo ✗ trơn — người
      // import biết chính xác cần sửa gì trong file, không phải đoán.
      let error = '';
      if (!name || name.length <= 1)              error = t('daily_import_err_name','Thiếu/sai tên công việc');
      else if (!max_score || +max_score <= 0)      error = t('daily_import_err_score','Điểm tối đa phải > 0');
      else if (frequency!=='daily' && !days.length) error = t('daily_import_err_days','Thiếu "Ngày áp dụng" (bắt buộc với tần suất không phải Hằng ngày)');
      else if (assignee && !member)                error = t('daily_import_err_assignee',`Không tìm thấy "${assignee}" trong nhóm đang chọn`,{name:assignee});
      const valid = !error;
      return { name, max_score: +max_score||0, frequency, frequency_day: frequency==='daily'?null:days, assignee, member, valid, error };
    });
    setImportPreview(rows);
  };

  const downloadImportTemplate = () => {
    const csv = [
      'Tên công việc,Điểm tối đa,Tần suất,Ngày áp dụng,Giao cho',
      'Kiểm tra máy đầu ca,3,Hằng ngày,,',
      'Vệ sinh khu vực,2,Nhiều thứ/tuần,"2,4,6",',
      'Báo cáo tồn kho,5,Nhiều ngày/tháng,"1,15",',
    ].join('\n');
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], {type:'text/csv;charset=utf-8;'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'mau_import_cong_viec_daily.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImportTasks = async () => {
    if (!importPreview || !selectedGroup) return;
    const validRows = importPreview.filter(r=>r.valid);
    if (!validRows.length) return;
    setImporting(true);
    try {
      const { data: tgData } = await api.get(`/daily/task-groups?group_id=${selectedGroup.id}`);
      let tgId;
      if (tgData.data.length) { tgId = tgData.data[0].id; }
      else {
        const { data: newTg } = await api.post('/daily/task-groups',{group_id:selectedGroup.id,name:selectedGroup.name,icon:selectedGroup.icon||'📋'});
        tgId = newTg.data.id;
      }
      let created = 0, failed = 0;
      for (const row of validRows) {
        try {
          await api.post(`/daily/task-groups/${tgId}/tasks`, {
            name: row.name, max_score: row.max_score, frequency: row.frequency,
            frequency_day: row.frequency_day, assigned_user_id: row.member?.id || null,
          });
          created++;
        } catch { failed++; }
      }
      alert(`✅ Đã import ${created} công việc${failed?`, ${failed} lỗi`:''}`);
      setShowImport(false); setImportFile(null); setImportPreview(null);
      loadTasksAndLogs();
    } catch(e){ alert(e.response?.data?.message||e.message); }
    finally{ setImporting(false); }
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

  // Task này có hiện với memberId không — null/không gán = hiện cho tất cả;
  // có gán = chỉ hiện đúng người đó. Dùng chung cho cả bảng ma trận lẫn các
  // hàm tính tổng điểm bên dưới, để tổng không bị lẫn công việc riêng của người khác.
  const taskVisibleToMember = (task, memberId) => !task.assigned_user_id || +task.assigned_user_id === +memberId;

  // Tổng điểm 1 member theo tuần
  const memberWeekTotal = (memberId) => {
    let total=0;
    tasks.filter(t=>taskVisibleToMember(t,memberId)).forEach(t=>{
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
    tasks.filter(t=>taskVisibleToMember(t,memberId)).forEach(t=>{
      if (!taskShowsOnDay(t,day)) return;
      total+=+(getLog(t.id,memberId,dateStr).score)||0;
    });
    return total;
  };

  // Tổng max 1 ngày — CHO ĐÚNG activeMember (T7/CN không tính vì không được chấm điểm)
  const dayMax = (day) => isWeekend(day) ? 0 : tasks.filter(t=>taskShowsOnDay(t,day)&&taskVisibleToMember(t,activeMember?.id)).reduce((s,t)=>s+(+t.max_score||0),0);

  // Member score summary
  const pendingCount = activeMember
    ? Object.keys(pending).filter(k=>k.includes(`_${activeMember.id}_`)).length
    : 0;

  // Số cột tổng cộng trong bảng (1 cột tên công việc + N ngày + 1 cột tổng)
  const colCount = viewDays.length + 2;

  if (!user) return (
    <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',background:C.canvas}}>
      <div style={{width:36,height:36,border:`3px solid ${C.line}`,borderTopColor:C.primary,borderRadius:'50%',animation:'dpSpin .7s linear infinite'}}/>
    </div>
  );

  return (
    <div className="dp-root" style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',background:C.canvas,minWidth:0,fontFamily:FONT_SANS}}>
      <style>{`
        .dp-root { box-sizing: border-box; }
        .dp-root *, .dp-root *::before, .dp-root *::after { box-sizing: border-box; }
        .dp-root input[type="number"]::-webkit-outer-spin-button,
        .dp-root input[type="number"]::-webkit-inner-spin-button { margin: 0; }

        @keyframes dpSpin { to { transform: rotate(360deg); } }
        @keyframes dpPulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes dpRise { from{opacity:0; transform:translateY(4px)} to{opacity:1; transform:translateY(0)} }

        /* ── Cảm giác chạm mượt & phản hồi khi nhấn (mobile/touch) ── */
        .dp-root button { -webkit-tap-highlight-color: transparent; touch-action: manipulation; transition: transform .1s ease, background .15s, color .15s, border-color .15s, box-shadow .15s; }
        .dp-root button:active { transform: scale(0.96); }
        .dp-root .dp-tick { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
        .dp-root .dp-tick:active { transform: scale(0.88) !important; }
        .dp-root .dp-member-item { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
        .dp-root .dp-member-item:active { transform: scale(0.98); }
        .dp-root .dp-member-item:hover { background: ${C.canvas} !important; }
        .dp-root .dp-member-item.active:hover { background: ${C.primarySoft} !important; }

        .dp-root .dp-btn-primary { transition: transform .12s ease, box-shadow .12s ease; }
        .dp-root .dp-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 18px ${C.primary}55; }

        .dp-root .dp-taskrow:hover td { background: #fbfcff; }
        .dp-root tbody tr { animation: dpRise .2s ease both; }

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
          .dp-root .dp-sidebar { position: relative; width: 100% !important; border-right: none !important; border-bottom: 1.5px solid ${C.line} !important; max-height: 140px !important; }
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
      <div className="dp-topbar" style={{padding:'13px 20px',borderBottom:`1px solid ${C.line}`,display:'flex',alignItems:'center',gap:10,background:C.surface,flexShrink:0}}>
        <div className="dp-breadcrumb" style={{flex:1,display:'flex',alignItems:'center',gap:6,fontSize:13,color:C.sub,flexWrap:'wrap',minWidth:0}}>
          <span onClick={()=>navigate('/board')} style={{cursor:'pointer',color:C.primary,whiteSpace:'nowrap',fontWeight:600}}>🗂 {t('nav_board')}</span>
          <span style={{color:C.faint}}>›</span>
          <span style={{color:C.primary,fontWeight:600}}>📋 {t('nav_daily')}</span>
          {selectedGroup&&<><span style={{color:C.faint}}>›</span><span style={{color:C.ink,fontWeight:700}}>{selectedGroup.icon||'🏭'} {selectedGroup.name}</span></>}
        </div>
        {isAdmin&&selectedGroup&&(
          <button onClick={()=>setConfirmDelGroup(selectedGroup)}
            style={{padding:'6px 14px',borderRadius:9,border:`1.5px solid ${C.dangerSoft}`,background:C.dangerSoft,fontSize:12,fontWeight:700,cursor:'pointer',color:C.danger}}>
            🗑 {t('daily_delete_group')}
          </button>
        )}
        {isLeader&&selectedGroup&&(
          <button onClick={()=>setShowAddTask(true)}
            style={{padding:'6px 14px',borderRadius:9,border:`1.5px solid ${C.line}`,background:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',color:C.sub}}>
            ➕ {t('daily_add_task')}
          </button>
        )}
        {isLeader&&selectedGroup&&(
          <button onClick={()=>setShowImport(true)}
            style={{padding:'6px 14px',borderRadius:9,border:`1.5px solid ${C.line}`,background:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',color:C.sub}}>
            📥 {t('daily_import_btn','Import')}
          </button>
        )}
        <button onClick={saveLogs} disabled={saving} className="dp-btn-primary"
          style={{padding:'7px 15px',borderRadius:9,border:'none',background:hasPending?`linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`:`linear-gradient(135deg, ${C.success}, #12995a)`,color:'#fff',fontSize:12.5,fontWeight:700,cursor:'pointer',boxShadow:hasPending?`0 4px 14px ${C.primary}55`:`0 4px 14px ${C.success}44`,fontFamily:FONT_SANS}}>
          {saving?'...':hasPending?`💾 ${t('save')} (${Object.keys(pending).length})`:`💾 ${t('daily_save_today')}`}
        </button>
      </div>

      {/* ── Week bar + Group tabs ── */}
      <div className="dp-weekbar" style={{padding:'10px 20px',background:C.surface,borderBottom:`1px solid ${C.line}`,display:'flex',alignItems:'center',gap:10,flexShrink:0,flexWrap:'wrap'}}>
        <div className="dp-weeklabel" onClick={()=>setShowCalendar(p=>!p)} style={{fontSize:13,fontWeight:700,color:C.ink,cursor:'pointer',padding:'5px 11px',borderRadius:9,border:`1.5px solid ${showCalendar?C.primary:C.line}`,background:showCalendar?C.primarySoft:'#fff',display:'flex',alignItems:'center',gap:6,whiteSpace:'nowrap',fontFamily:FONT_MONO}}>📅 {weekLabel} <span style={{fontSize:10,color:C.faint}}>▼</span></div>

        {/* View mode tabs */}
        <div style={{display:'flex',gap:3,background:C.canvas,borderRadius:9,padding:3}}>
          {[
            { label:t('daily_this_week'),   fn:()=>{ setViewMode('week'); setWeekStart(getWeekStart(new Date())); }},
            { label:t('daily_last_week'), fn:()=>{ setViewMode('week'); const d=getWeekStart(new Date()); d.setDate(d.getDate()-7); setWeekStart(d); }},
            { label:t('daily_this_month'),  fn:()=>{ setViewMode('month'); setWeekStart(getWeekStart(new Date())); }},
            { label:t('daily_last_month'),fn:()=>{ setViewMode('month'); const d=new Date(); d.setMonth(d.getMonth()-1); d.setDate(1); setWeekStart(getWeekStart(d)); }},
          ].map(b=>(
            <button key={b.label} onClick={b.fn} style={{
              padding:'5px 11px',borderRadius:7,border:'none',fontSize:11,fontWeight:700,cursor:'pointer',
              background:'#fff',color:C.sub,whiteSpace:'nowrap',
            }}>
              {b.label}
            </button>
          ))}
        </div>

        {viewMode==='week'&&<>
          <button onClick={prevWeek} style={{padding:'5px 9px',borderRadius:9,border:`1.5px solid ${C.line}`,background:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',color:C.sub}}>‹</button>
          <button onClick={nextWeek} style={{padding:'5px 9px',borderRadius:9,border:`1.5px solid ${C.line}`,background:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',color:C.sub}}>›</button>
        </>}
        <div style={{width:1,height:20,background:C.line}}/>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',flex:1}}>
          {groups.map(g=>(
            <button key={g.id} onClick={()=>{setSelectedGroup(g);setActiveMember(null);}} style={{
              padding:'6px 15px',borderRadius:20,fontSize:12,fontWeight:700,cursor:'pointer',
              border:`1.5px solid ${selectedGroup?.id===g.id?C.primary:C.line}`,
              background:selectedGroup?.id===g.id?`linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`:'#fff',
              color:selectedGroup?.id===g.id?'#fff':C.sub,
              display:'flex',alignItems:'center',gap:5,
              boxShadow:selectedGroup?.id===g.id?`0 3px 10px ${C.primary}44`:'none',
            }}>
              <span>{g.icon||'🏭'}</span><span>{g.name}</span>
            </button>
          ))}
          {!groups.length&&<span style={{fontSize:12,color:C.faint}}>{t('daily_no_groups')}</span>}
        </div>
      </div>

      {/* ── Calendar Popup ── */}
      {showCalendar && (
        <div style={{position:'relative',zIndex:20,flexShrink:0}}>
          <div className="dp-calendar-popup" style={{
            position:'absolute',top:0,left:20,
            background:C.surface,borderRadius:16,border:`1px solid ${C.line}`,
            boxShadow:'0 16px 44px rgba(15,23,41,.18)',
            padding:16,width:300,maxWidth:'calc(100vw - 16px)',
          }}>
            {/* Cal header */}
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
              <button onClick={()=>setCalMonth(p=>{ const d=new Date(p.y,p.m-1); return {y:d.getFullYear(),m:d.getMonth()}; })}
                style={{width:28,height:28,borderRadius:8,border:`1px solid ${C.line}`,background:'#fff',cursor:'pointer',fontSize:14,color:C.sub}}>‹</button>
              <div style={{flex:1,textAlign:'center',fontSize:14,fontWeight:800,color:C.ink,fontFamily:FONT_MONO}}>
                {t('daily_month')} {calMonth.m+1}/{calMonth.y}
              </div>
              <button onClick={()=>setCalMonth(p=>{ const d=new Date(p.y,p.m+1); return {y:d.getFullYear(),m:d.getMonth()}; })}
                style={{width:28,height:28,borderRadius:8,border:`1px solid ${C.line}`,background:'#fff',cursor:'pointer',fontSize:14,color:C.sub}}>›</button>
            </div>

            {/* Day names */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:4}}>
              {DAYS_VI.map(d=>(
                <div key={d} style={{textAlign:'center',fontSize:10,fontWeight:700,color:C.faint,padding:'2px 0'}}>{d}</div>
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
                          textAlign:'center',padding:'6px 2px',borderRadius:8,
                          fontSize:12,fontWeight:isSelected||isTod?700:400,fontFamily:FONT_MONO,
                          cursor:'pointer',transition:'background .12s ease',
                          background: isSelected?`linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`:isTod?C.primarySoft:'transparent',
                          color: isSelected?'#fff':isTod?C.primary:isWE?C.warning:C.ink,
                          border: isSelected?`1px solid ${C.primary}`:isTod?`1px solid ${C.primary}`:'1px solid transparent',
                        }}
                        onMouseEnter={e=>{ if(!isSelected) e.currentTarget.style.background='#f0f4ff'; }}
                        onMouseLeave={e=>{ if(!isSelected) e.currentTarget.style.background=isTod?C.primarySoft:'transparent'; }}
                      >
                        {day.getDate()}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Footer shortcuts */}
            <div style={{display:'flex',gap:6,marginTop:12,paddingTop:10,borderTop:`1px solid ${C.lineSoft}`}}>
              {[
                {label:t('daily_this_week'),  fn:()=>{ setWeekStart(getWeekStart(new Date())); setViewMode('week'); setShowCalendar(false); }},
                {label:t('daily_this_month'), fn:()=>{ const d=new Date(); setWeekStart(getWeekStart(new Date(d.getFullYear(),d.getMonth(),1))); setViewMode('month'); setShowCalendar(false); }},
                {label:t('users_close'),      fn:()=>setShowCalendar(false)},
              ].map(b=>(
                <button key={b.label} onClick={b.fn} style={{
                  flex:1,padding:'6px 0',borderRadius:8,fontSize:11,fontWeight:700,cursor:'pointer',
                  border:`1px solid ${C.line}`,background:'#fff',color:C.sub,
                }}>{b.label}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Body: 2 panel ── */}
      <div className="dp-body" style={{flex:1,display:'flex',overflow:'hidden'}}>

        {/* LEFT: Danh sách thành viên */}
        <div className="dp-sidebar" style={{width:210,flexShrink:0,borderRight:`1px solid ${C.line}`,display:'flex',flexDirection:'column',overflow:'hidden',background:C.surface}}>
          <div style={{padding:'11px 14px',borderBottom:`1px solid ${C.line}`,fontSize:11,fontWeight:800,color:C.faint,textTransform:'uppercase',letterSpacing:'0.5px'}}>
            👥 {t('req_section_assignees')}
          </div>
          <div className="dp-members-list" style={{flex:1,overflowY:'auto',padding:'6px 0'}}>
            {members.map(m=>{
              const isActive = activeMember?.id===m.id;
              const weekPts  = memberWeekTotal(m.id);
              const hasPend  = Object.keys(pending).some(k=>k.includes(`_${m.id}_`));
              return (
                <div key={m.id} className={`dp-member-item${isActive?' active':''}`} onClick={()=>setActiveMember(m)}
                  style={{
                    margin:'2px 8px',padding:'9px 10px',display:'flex',alignItems:'center',gap:9,cursor:'pointer',
                    borderLeft:`3px solid ${isActive?C.primary:'transparent'}`,
                    borderRadius:11,
                    background:isActive?C.primarySoft:'transparent',
                    transition:'all .12s ease',
                  }}
                >
                  <div style={{position:'relative'}}>
                    <Chip color={m.avatar_color||C.primary} name={m.full_name} size={34} active={isActive}/>
                    {hasPend&&<div style={{position:'absolute',top:-2,right:-2,width:9,height:9,borderRadius:'50%',background:C.warning,border:'2px solid #fff',animation:'dpPulse 1.3s ease-in-out infinite'}}/>}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div className="dp-member-name" style={{fontSize:12.5,fontWeight:700,color:isActive?C.primaryDeep:C.ink,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontFamily:FONT_SANS}}>
                      {m.full_name}
                    </div>
                    <div style={{fontSize:10,color:isActive?C.primary:C.faint,marginTop:2,fontFamily:FONT_MONO}}>
                      {+weekPts>0?<span style={{fontWeight:700,color:C.success}}>⭐ {t('daily_points_this_week',{score:weekPts})}</span>:t('daily_no_score')}
                    </div>
                  </div>
                  {isActive&&<div style={{width:6,height:6,borderRadius:'50%',background:C.primary,flexShrink:0}}/>}
                </div>
              );
            })}
            {!members.length&&(
              <div style={{padding:20,textAlign:'center',fontSize:12,color:C.faint}}>
                {t('daily_no_members')}<br/>
                <span style={{fontSize:11}}>{t('daily_admin_add_to_group')}</span>
              </div>
            )}
          </div>

          {/* Tổng kết tuần */}
          {members.length>0&&(
            <div className="dp-sidebar-footer" style={{padding:'10px 14px',borderTop:`1px solid ${C.line}`,background:C.canvas}}>
              <div style={{fontSize:10,color:C.faint,fontWeight:800,textTransform:'uppercase',marginBottom:7,letterSpacing:.4}}>{t('daily_week_total')}</div>
              {members.map(m=>(
                <div key={m.id} style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}>
                  <Chip color={m.avatar_color||C.primary} name={m.full_name} size={18}/>
                  <span style={{fontSize:11,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:C.sub}}>{m.full_name.split(' ').pop()}</span>
                  <span style={{fontSize:11,fontWeight:700,color:+memberWeekTotal(m.id)>0?C.success:C.faint,fontFamily:FONT_MONO}}>
                    {memberWeekTotal(m.id)}đ
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: Matrix của member đang chọn */}
        <div className="dp-matrix-panel" style={{flex:1,overflow:'auto',padding:'16px 20px',background:C.canvas,minWidth:0}}>
          {!activeMember&&selectedGroup&&(
            <div style={{textAlign:'center',padding:40,color:C.faint}}>
              <div style={{fontSize:32,marginBottom:8}}>👈</div>
              <div style={{fontSize:13}}>{t('daily_select_member_hint')}</div>
            </div>
          )}

          {activeMember&&selectedGroup&&(
            <>
              {/* Matrix table */}
              <div style={{width:'100%',overflowX:'auto',borderRadius:16,WebkitOverflowScrolling:'touch'}}>
              <table style={{borderCollapse:'collapse',minWidth:'100%',background:C.surface,borderRadius:16,overflow:'hidden',border:`1px solid ${C.line}`,boxShadow:'0 8px 28px rgba(15,23,41,.06)'}}>
                <thead>
                  <tr>
                    <th className="dp-stickycol" style={{background:`linear-gradient(160deg, ${C.panelDark}, ${C.panelDark2})`,borderRight:'2px solid #2d3f52',minWidth:260,position:'sticky',left:0,zIndex:2}}>
                      <div style={{padding:'14px 16px',fontSize:11,color:'#8fa8c9',fontWeight:600}}>
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
                          background: today?'rgba(23,177,106,0.18)':C.panelDark2,
                          border:'1px solid #2d3f52',
                          minWidth: viewMode==='month'?40:80,
                          opacity: dayOff&&!today?0.55:1,
                        }}>
                          <div style={{padding:viewMode==='month'?'4px 2px':'9px 6px',display:'flex',flexDirection:'column',alignItems:'center',gap:1}}>
                            {viewMode==='week'
                              ? <div style={{fontSize:11,fontWeight:700,color:today?C.success:'#c8d8ee'}}>{DAYS_VI[dow]}{today?' ●':''}</div>
                              : <div style={{fontSize:9,fontWeight:700,color:today?C.success:'#c8d8ee'}}>{DAYS_VI[dow]}</div>
                            }
                            <div style={{fontSize:viewMode==='month'?9:10,color:today?C.success:'#8fa8c9',fontFamily:FONT_MONO}}>{fmtDate(day)}</div>
                            {dayOff
                              ? <div style={{fontSize:9,color:'#8fa8c9',marginTop:1}}>{t('daily_day_off','Nghỉ')}</div>
                              : (!future&&dTotal>0&&viewMode==='week'&&(
                                  <div style={{fontSize:10,fontWeight:700,color:dTotal>=dMax?C.success:C.warning,marginTop:1,fontFamily:FONT_MONO}}>
                                    {dTotal.toFixed(0)}/{dMax}đ
                                  </div>
                                ))
                            }
                          </div>
                        </th>
                      );
                    })}
                    <th className="dp-sumcol" style={{background:C.panelDark,borderLeft:`2px solid ${C.primary}`,minWidth:70}}>
                      <div style={{padding:'9px 4px',display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                        <div style={{fontSize:11,fontWeight:700,color:'#f1c40f'}}>∑</div>
                        <div style={{fontSize:10,color:'#f1c40f'}}>{t('daily_total_label','Tổng')}</div>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* ⚠️ Lọc theo assigned_user_id — task không gán riêng ai (null) thì
                    hiện cho tất cả; task gán riêng 1 người thì CHỈ hiện khi đang
                    xem đúng người đó. */}
                {tasks.filter(task => taskVisibleToMember(task, activeMember.id)).map(task=>{
                    const isMultiDay = task.frequency==='weekly_count' || task.frequency==='monthly_count';
                    const selectedDays = isMultiDay ? parseFreqDays(task.frequency_day) : [];
                    const freqColor = task.frequency==='daily'  ?{bg:C.successSoft,color:C.success}
                                    : task.frequency==='weekly' ?{bg:C.primarySoft,color:C.primary}
                                    : task.frequency==='monthly'?{bg:C.warningSoft,color:C.warning}
                                    :{bg:C.violetSoft,color:C.violet}; // weekly_count / monthly_count
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
                    const sumColor=rowTotal===0?C.faint:rowTotal>=rowMax?C.success:C.warning;

                    return (
                      <tr key={task.id} className="dp-taskrow" style={{borderLeft:task.frequency==='weekly'||task.frequency==='weekly_count'?`3px solid ${C.primary}`:task.frequency==='monthly'||task.frequency==='monthly_count'?`3px solid ${C.warning}`:undefined}}>
                        <td className="dp-stickycol" style={{background:'#f8f9fc',borderRight:`2px solid ${C.line}`,position:'sticky',left:0,zIndex:1}}>
                          <div style={{padding:'10px 14px',display:'flex',alignItems:'center',gap:8}}>
                            <div style={{flex:1}}>
                              <div style={{fontSize:13,color:C.ink,fontWeight:600,fontFamily:FONT_SANS}}>{task.name}</div>
                              <div style={{display:'flex',alignItems:'center',gap:5,marginTop:4,flexWrap:'wrap'}}>
                                <span style={{fontSize:10,color:C.faint,background:C.lineSoft,padding:'1.5px 7px',borderRadius:8,fontFamily:FONT_MONO,fontWeight:700}}>{task.max_score}đ</span>
                                <span style={{fontSize:10,fontWeight:700,padding:'1.5px 7px',borderRadius:8,background:freqColor.bg,color:freqColor.color}}>{freqLabel}</span>
                                {isMultiDay&&(
                                  <span style={{fontSize:10,fontWeight:700,padding:'1.5px 7px',borderRadius:8,background:completedCount>=selectedDays.length?C.successSoft:C.warningSoft,color:completedCount>=selectedDays.length?C.success:C.warning,fontFamily:FONT_MONO}}>
                                    ✓ {completedCount}/{selectedDays.length} {t('daily_times_label','lần')}
                                  </span>
                                )}
                              </div>
                            </div>
                            {isLeader&&(
                              <div style={{display:'flex',gap:4}}>
                                <button onClick={()=>setEditTask(task)} style={{width:25,height:25,borderRadius:7,border:`1px solid ${C.line}`,background:'#fff',cursor:'pointer',fontSize:11}}>✏️</button>
                                <button onClick={()=>setDeleteTask(task)} style={{width:25,height:25,borderRadius:7,border:`1px solid ${C.line}`,background:'#fff',cursor:'pointer',fontSize:11}}>🗑</button>
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

                          if (!shows) return <td key={i} style={{background:'#f9fafb',borderColor:C.lineSoft}}/>;

                          const log    = getLog(task.id,activeMember.id,dateStr);
                          const isDone = !locked && log.is_done;
                          const score  = log.score;
                          const changed= !locked && pending[`${task.id}_${activeMember.id}_${dateStr}`]!==undefined;
                          const warn   = !!scoreWarn[`${task.id}_${activeMember.id}_${dateStr}`];
                          // Lý do sửa điểm đã LƯU (không lấy từ pending — chỉ hiện icon
                          // cho những gì đã thực sự ghi vào DB).
                          const savedReason = logs[`${task.id}_${activeMember.id}_${dateStr}`]?.edit_reason;
                          const hasReason = savedReason && savedReason !== 'null';

                          return (
                            <td key={i} style={{
                              background:changed?C.warningSoft:dayOff?'#f7f8fa':today?'rgba(23,177,106,0.05)':undefined,
                              borderColor:changed?'#f5d8a0':C.lineSoft,
                              textAlign:'center',
                              outline:changed?`1px solid #f5d8a0`:'none',
                              opacity: dayOff?0.6:1,
                              position:'relative',
                              transition:'background .15s ease',
                            }}>
                              {!locked&&isLeader&&(
                                <span onClick={(e)=>{
                                    e.stopPropagation();
                                    const isNew = !logs[`${task.id}_${activeMember.id}_${dateStr}`];
                                    setViewReasonTarget({ taskId:task.id, dateStr, taskName:task.name, dateLabel:fmtDate(day), isNew, maxScore:task.max_score });
                                    setViewReasonText(''); // luôn trống — mỗi người ghi lý do MỚI của riêng mình, không hiện lý do của người trước
                                    setViewScoreValue(getLog(task.id,activeMember.id,dateStr).score||0);
                                    setNoteHistory([]);
                                    setLoadingHistory(true);
                                    api.get(`/daily/note-history?task_id=${task.id}&user_id=${activeMember.id}&log_date=${dateStr}`)
                                      .then(r=>setNoteHistory(r.data.data||[]))
                                      .catch(()=>setNoteHistory([]))
                                      .finally(()=>setLoadingHistory(false));
                                  }}
                                  title={hasReason ? `${t('daily_reason_tooltip_prefix','Lý do')}: ${savedReason}` : t('daily_reason_add_hint','Ghi lý do cho điểm...')}
                                  style={{position:'absolute',top:2,right:2,fontSize:11,cursor:'pointer',opacity:hasReason?0.9:0.35,padding:2}}>📝</span>
                              )}
                              <div style={{padding:'8px 6px',display:'flex',flexDirection:'column',alignItems:'center',gap:5}}>
                                {/* Tick */}
                                <div className="dp-tick" onClick={()=>!locked&&toggleTick(task.id,activeMember.id,dateStr)} style={{
                                  width:32,height:32,borderRadius:9,fontSize:16,
                                  display:'flex',alignItems:'center',justifyContent:'center',
                                  transition:'all .15s',userSelect:'none',
                                  cursor:locked?'default':isLeader?'pointer':'default',
                                  border:locked?`2px solid ${C.line}`:isDone?`2px solid ${C.success}`:`2px solid #d0d8e8`,
                                  background:locked?'#f5f6f8':isDone?`linear-gradient(135deg, ${C.success}, #12995a)`:'#fff',
                                  color:isDone?'#fff':'transparent',
                                  boxShadow:isDone?`0 3px 10px ${C.success}44`:'none',
                                }}>
                                  {isDone?'✓':''}
                                </div>
                                {/* Score — ⚠️ TỐI ƯU: đổi từ input CÓ ĐIỀU KHIỂN (value=...) sang
                                    KHÔNG ĐIỀU KHIỂN (defaultValue=...) — trước đây mỗi ký tự gõ vào
                                    đều gọi setScore() → setPending() → re-render LẠI TOÀN BỘ bảng
                                    (mọi task × mọi ngày), rất giật khi bảng nhiều dòng. Giờ gõ chỉ
                                    thay đổi trong chính ô đó (trình duyệt tự xử lý, không qua React),
                                    chỉ đẩy lên state chung lúc rời ô (blur) hoặc bấm Enter.
                                    `key` đảm bảo ô tự "làm mới" đúng giá trị khi đổi người/ngày. */}
                                <input key={`${task.id}_${activeMember.id}_${dateStr}_${score||0}`}
                                  className="dp-score-input" type="number" inputMode="decimal" min="0" max={task.max_score} step="0.5"
                                  defaultValue={locked?'':(score||0)}
                                  disabled={locked||!isLeader}
                                  onBlur={e=>setScore(task.id,activeMember.id,dateStr,e.target.value,task.max_score)}
                                  onKeyDown={e=>{ if(e.key==='Enter') e.target.blur(); }}
                                  style={{
                                    width:44,textAlign:'center',borderRadius:7,padding:'3px 4px',
                                    fontSize:12,fontWeight:700,outline:'none',fontFamily:FONT_MONO,
                                    border:warn?`1.5px solid ${C.danger}`:(locked||!isLeader?'none':`1.5px solid ${C.line}`),
                                    color:locked?C.faint:isDone?C.primary:score>0?C.primary:C.faint,
                                    background:warn?C.dangerSoft:(locked||!isLeader?'transparent':'#f7f9ff'),
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
                        <td style={{background:'#f0f4ff',borderLeft:`2px solid ${C.primary}`,textAlign:'center'}}>
                          <div style={{fontSize:14,fontWeight:800,color:sumColor,fontFamily:FONT_MONO}}>{rowTotal.toFixed(1)}</div>
                          <div style={{fontSize:10,color:C.faint,fontFamily:FONT_MONO}}>/ {rowMax}đ</div>
                        </td>
                      </tr>
                    );
                  })}

                  {isLeader&&(
                    <tr onClick={()=>setShowAddTask(true)} style={{cursor:'pointer'}}>
                      <td colSpan={colCount} style={{border:`1.5px dashed #c8d8f0`}}
                        onMouseEnter={e=>e.currentTarget.style.background=C.primarySoft}
                        onMouseLeave={e=>e.currentTarget.style.background=''}>
                        <div style={{padding:'11px 14px',color:C.primary,fontSize:13,fontWeight:700}}>➕ {t('daily_add_task_row','Thêm công việc mới')}</div>
                      </td>
                    </tr>
                  )}
                  {tasks.length===0&&(
                    <tr><td colSpan={colCount} style={{textAlign:'center',padding:32,color:C.faint,fontSize:13}}>
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
              <div style={{fontSize:14,color:C.faint}}>
                {t('daily_admin_create_group_hint',{ defaultValue: 'Admin vào <1>Quản lý User → Nhóm</1> để tạo nhóm' })
                  .split(/<1>|<\/1>/).map((part,i)=> i===1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="dp-bottombar" style={{padding:'11px 20px',background:C.surface,borderTop:`1px solid ${C.line}`,display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
        <div style={{flex:1,fontSize:12,color:C.faint}}>
          <span style={{color:C.success,fontWeight:700}}>📅 {t('daily_freq_daily','Hằng ngày')}</span> ·&nbsp;
          <span style={{color:C.primary,fontWeight:700}}>📆 {t('daily_freq_weekly','Tuần 1 lần')}</span> ·&nbsp;
          <span style={{color:C.warning,fontWeight:700}}>🗓 {t('daily_freq_monthly','Tháng 1 lần')}</span>
          &nbsp;— {t('daily_legend_empty','Ô trống = ngày không có lịch')} · <span style={{color:C.warning,fontWeight:700}}>{t('daily_legend_unsaved','Ô vàng = chưa lưu')}</span>
        </div>
        <button onClick={saveLogs} disabled={saving} className="dp-btn-primary"
          style={{padding:'7px 18px',borderRadius:9,border:'none',background:hasPending?`linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`:`linear-gradient(135deg, ${C.success}, #12995a)`,color:'#fff',fontSize:12.5,fontWeight:700,cursor:'pointer',boxShadow:hasPending?`0 4px 14px ${C.primary}55`:`0 4px 14px ${C.success}44`,fontFamily:FONT_SANS}}>
          {saving?'...':hasPending?t('daily_save_n_changes',{count:Object.keys(pending).length, defaultValue:'💾 Lưu ({{count}} thay đổi)'}):t('daily_already_saved','💾 Đã lưu')}
        </button>
      </div>

      {/* Modals */}
      {(showAddTask||editTask)&&(
        <TaskModal task={editTask} members={members} activeMember={activeMember}
          onClose={()=>{setShowAddTask(false);setEditTask(null);}}
          onSave={form=>editTask?updateTask(editTask.id,form):createTask(form)}/>
      )}
      {showImport&&(
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,41,.5)',zIndex:60,display:'flex',alignItems:'center',justifyContent:'center',padding:16,backdropFilter:'blur(3px)',WebkitBackdropFilter:'blur(3px)'}}
          onClick={e=>{ if(e.target===e.currentTarget){ setShowImport(false); setImportFile(null); setImportPreview(null); } }}>
          <div className="dp-modal" style={{background:'#fff',borderRadius:18,padding:28,width:620,maxWidth:'94vw',maxHeight:'88vh',overflowY:'auto',boxShadow:'0 30px 70px rgba(15,23,41,.3)',fontFamily:FONT_SANS}}>
            <div style={{fontSize:15,fontWeight:800,color:C.ink,marginBottom:6}}>📥 {t('daily_import_title','Import nhanh công việc Daily')}</div>
            <div style={{fontSize:12,color:C.sub,marginBottom:16,lineHeight:1.6}}>
              {t('daily_import_desc','Định dạng CSV')}: <code style={{background:C.canvas,padding:'1px 6px',borderRadius:4,fontFamily:FONT_MONO}}>Tên công việc, Điểm tối đa, Tần suất, Ngày áp dụng, Giao cho</code>
              <br/>{t('daily_import_hint','Cột "Giao cho" để trống = công việc chung cả nhóm; gõ đúng Họ tên 1 thành viên để giao riêng cho người đó.')}
            </div>

            <button onClick={downloadImportTemplate}
              style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',borderRadius:9,border:`1.5px solid ${C.line}`,background:'#fff',fontSize:12,fontWeight:700,color:C.sub,cursor:'pointer',marginBottom:14}}>
              ⬇️ {t('daily_import_download_template','Tải file mẫu')}
            </button>

            <label style={{display:'block',border:`2.5px dashed ${C.line}`,borderRadius:12,padding:22,textAlign:'center',cursor:'pointer'}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=C.primary;e.currentTarget.style.background=C.primarySoft;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=C.line;e.currentTarget.style.background='transparent';}}>
              <div style={{fontSize:30,marginBottom:8}}>📊</div>
              <div style={{fontSize:12,color:C.sub}}>{t('daily_import_click_choose','Bấm để chọn file CSV')}</div>
              {importFile&&<div style={{fontSize:12,color:C.primary,marginTop:8,fontWeight:700}}>📎 {importFile.name}</div>}
              <input type="file" accept=".csv" style={{display:'none'}} onChange={handleImportFile}/>
            </label>

            {importPreview&&(()=>{
              const validCount = importPreview.filter(r=>r.valid).length;
              const invalidCount = importPreview.length - validCount;
              return (
                <div style={{marginTop:16}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.ink,marginBottom:8,display:'flex',alignItems:'center',gap:8}}>
                    {t('daily_import_preview','Xem trước dữ liệu')}
                    {validCount>0&&<span style={{fontSize:11,background:C.successSoft,color:C.success,fontWeight:700,padding:'2px 8px',borderRadius:8}}>{validCount} {t('daily_import_valid','hợp lệ')}</span>}
                    {invalidCount>0&&<span style={{fontSize:11,background:C.dangerSoft,color:C.danger,fontWeight:700,padding:'2px 8px',borderRadius:8}}>{invalidCount} {t('daily_import_invalid','lỗi')}</span>}
                  </div>
                  <div style={{overflowX:'auto',border:`1px solid ${C.line}`,borderRadius:10}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:11.5,minWidth:680}}>
                      <thead>
                        <tr style={{background:C.canvas}}>
                          {['Tên','Điểm','Tần suất','Ngày','Giao cho','Trạng thái'].map(h=>(
                            <th key={h} style={{padding:'6px 10px',textAlign:'left',color:C.faint,fontWeight:700,whiteSpace:'nowrap',borderBottom:`1px solid ${C.line}`,minWidth:h==='Trạng thái'?200:undefined}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.map((row,i)=>(
                          <tr key={i} style={{borderBottom:`1px solid ${C.lineSoft}`,background:row.valid?'transparent':'#fffafa'}}>
                            <td style={{padding:'6px 10px',fontWeight:600,color:row.valid?C.ink:C.danger}}>{row.name||'—'}</td>
                            <td style={{padding:'6px 10px',fontFamily:FONT_MONO}}>{row.max_score||'—'}</td>
                            <td style={{padding:'6px 10px'}}>{row.frequency}</td>
                            <td style={{padding:'6px 10px',fontFamily:FONT_MONO}}>{row.frequency_day||'—'}</td>
                            <td style={{padding:'6px 10px'}}>{row.assignee||<span style={{color:C.faint}}>{t('daily_field_assignee_all_short','Tất cả')}</span>}</td>
                            <td style={{padding:'6px 10px',color:row.valid?C.success:C.danger,fontWeight:700,whiteSpace:'normal',lineHeight:1.4}}>
                              {row.valid ? '✓' : <span title={row.error}>✗ {row.error}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:16}}>
                    <ModalBtn onClick={()=>{setImportPreview(null);setImportFile(null);}}>{t('daily_cancel_btn2','Huỷ')}</ModalBtn>
                    <ModalBtn onClick={doImportTasks} variant="primary">
                      {importing?'...':`✓ ${t('daily_import_confirm_btn',{count:validCount, defaultValue:`Import ${validCount} công việc`})}`}
                    </ModalBtn>
                  </div>
                </div>
              );
            })()}

            {!importPreview&&(
              <div style={{display:'flex',justifyContent:'flex-end',marginTop:16}}>
                <ModalBtn onClick={()=>{setShowImport(false);setImportFile(null);setImportPreview(null);}}>{t('daily_cancel_btn2','Huỷ')}</ModalBtn>
              </div>
            )}
          </div>
        </div>
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
        <ViewEditReasonPanel
          taskName={viewReasonTarget.taskName}
          dateLabel={viewReasonTarget.dateLabel}
          isNew={viewReasonTarget.isNew}
          maxScore={viewReasonTarget.maxScore}
          score={viewScoreValue}
          onChangeScore={setViewScoreValue}
          reason={viewReasonText}
          saving={savingReason}
          history={noteHistory}
          loadingHistory={loadingHistory}
          currentLocale={currentLocale}
          onChangeReason={setViewReasonText}
          onCancel={()=>setViewReasonTarget(null)}
          onSave={saveViewedReason}/>
      )}
    </div>
  );
}

/* ---------------- modal dùng chung ---------------- */

const ModalShell = ({ children, width=400, onBackdropClick }) => (
  <div style={{position:'fixed',inset:0,background:'rgba(15,23,41,.5)',zIndex:60,display:'flex',alignItems:'center',justifyContent:'center',padding:16,backdropFilter:'blur(3px)',WebkitBackdropFilter:'blur(3px)'}}
    onClick={e=>{ if(e.target===e.currentTarget && onBackdropClick) onBackdropClick(); }}>
    <div className="dp-modal" style={{background:'#fff',borderRadius:18,padding:26,width,maxWidth:'92vw',boxShadow:'0 30px 70px rgba(15,23,41,.3)',fontFamily:FONT_SANS}}>
      {children}
    </div>
  </div>
);

const ModalBtn = ({ children, onClick, disabled, variant='ghost' }) => {
  const styles = {
    ghost:   { border:`1.5px solid ${C.line}`, background:'#fff', color:C.sub },
    primary: { border:'none', background: disabled?'#aaa':`linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`, color:'#fff', boxShadow: disabled?'none':`0 3px 10px ${C.primary}44` },
    danger:  { border:'none', background:`linear-gradient(135deg, ${C.danger}, #c72d3f)`, color:'#fff', boxShadow:`0 3px 10px ${C.danger}44` },
  }[variant];
  return (
    <button onClick={onClick} disabled={disabled} style={{padding:'8px 18px',borderRadius:10,fontSize:13,fontWeight:700,cursor:disabled?'default':'pointer',fontFamily:FONT_SANS,...styles}}>
      {children}
    </button>
  );
};

// Panel trượt ra từ BÊN TRÁI (không phải popup giữa màn hình nữa) — xem/ghi
// lý do cho MỌI ô điểm, mở khi bấm icon 📝. Tự đổi nhãn theo ngữ cảnh:
//   - isNew=true  → "Lý do cho điểm" (lần đầu chấm, chưa có gì trước đó)
//   - isNew=false → "Lý do sửa điểm" (ô này đã từng có điểm/tick trước rồi)
function ViewEditReasonPanel({ taskName, dateLabel, isNew, maxScore, score, onChangeScore, reason, saving, history=[], loadingHistory, currentLocale='vi-VN', onChangeReason, onCancel, onSave }) {
  const { t } = useTranslation();
  const title = isNew
    ? t('daily_reason_new_title','Lý do cho điểm')
    : t('daily_reason_edit_title','Lý do sửa điểm');
  const fmtDt = (d) => new Date(d).toLocaleString(currentLocale, { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
  // ⚠️ Render thẳng vào document.body qua Portal — né hoàn toàn trường hợp 1
  // phần tử cha nào đó (Layout, wrapper card...) có transform/filter/overflow
  // khiến position:fixed bị bó vùng theo phần tử cha thay vì theo cả màn hình
  // (đây là hành vi CSS chuẩn: transform/filter tạo containing block mới).
  return createPortal(
    <div style={{position:'fixed',inset:0,zIndex:70,display:'flex'}}>
      <div onClick={onCancel} style={{flex:1,background:'rgba(15,23,41,.4)',backdropFilter:'blur(2px)',WebkitBackdropFilter:'blur(2px)'}}/>
      <div className="dp-reason-panel" style={{
        width:340,maxWidth:'88vw',height:'100%',background:'#fff',boxShadow:'-8px 0 40px rgba(15,23,41,.25)',
        display:'flex',flexDirection:'column',fontFamily:FONT_SANS,
      }}>
        <div style={{padding:'18px 20px',borderBottom:`1px solid ${C.line}`}}>
          <div style={{fontSize:15,fontWeight:800,color:C.ink,marginBottom:4}}>📝 {t('daily_reason_panel_title','Sửa điểm & ghi chú')}</div>
          <div style={{fontSize:12,color:C.faint}}>{taskName} · {dateLabel}</div>
        </div>
        <div style={{padding:'16px 20px',flex:1,overflowY:'auto',display:'flex',flexDirection:'column',gap:14}}>
          {/* Điểm — giờ SỬA được ngay tại đây thay vì chỉ hiện tĩnh */}
          <div style={{background:C.canvas,borderRadius:10,padding:'10px 13px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
            <span style={{fontSize:11,color:C.faint,fontWeight:700,textTransform:'uppercase',letterSpacing:.3}}>{t('daily_reason_current_score','Điểm')}</span>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <input type="number" min={0} max={maxScore||undefined} step="0.5" value={score}
                onChange={e=>onChangeScore(e.target.value)}
                style={{width:70,padding:'6px 8px',border:`1.5px solid ${C.line}`,borderRadius:8,fontSize:15,fontWeight:800,color:C.primary,fontFamily:FONT_MONO,textAlign:'right',outline:'none'}}/>
              <span style={{fontSize:13,color:C.faint,fontWeight:700}}>/ {maxScore||0}đ</span>
            </div>
          </div>

          {/* Lịch sử ghi chú — MỖI người từng chấm/sửa giữ NGUYÊN ghi chú
              riêng của họ, không bị người sau ghi đè mất. */}
          <div>
            <label style={{display:'block',fontSize:11,fontWeight:800,color:C.faint,textTransform:'uppercase',letterSpacing:.4,marginBottom:7}}>
              {t('daily_reason_history_label','Lịch sử ghi chú')}
            </label>
            {loadingHistory&&<div style={{fontSize:12,color:C.faint,padding:'8px 0'}}>⏳</div>}
            {!loadingHistory&&!history.length&&(
              <div style={{fontSize:12,color:C.faint,padding:'8px 0'}}>{t('daily_reason_history_empty','Chưa có ghi chú nào cho ô này.')}</div>
            )}
            {!loadingHistory&&history.length>0&&(
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {history.map(h=>(
                  <div key={h.id} style={{background:C.canvas,borderRadius:10,padding:'9px 12px',border:`1px solid ${C.line}`}}>
                    <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:4}}>
                      <div style={{width:18,height:18,borderRadius:'50%',background:h.actor_color||C.primary,color:'#fff',fontSize:8,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                        {(h.actor_name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                      </div>
                      <span style={{fontSize:11.5,fontWeight:700,color:C.ink,flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{h.actor_name||'?'}</span>
                      <span style={{fontSize:10,color:C.faint,fontFamily:FONT_MONO,flexShrink:0}}>{fmtDt(h.created_at)}</span>
                    </div>
                    {h.action_type==='daily_score_edited'&&(
                      <div style={{fontSize:10.5,color:C.warning,fontFamily:FONT_MONO,marginBottom:3}}>
                        {(+h.new_score > +h.old_score)
                          ? t('daily_reason_history_up','Sửa từ {{old}}đ lên {{new}}đ',{old:h.old_score,new:h.new_score})
                          : t('daily_reason_history_down','Sửa từ {{old}}đ xuống {{new}}đ',{old:h.old_score,new:h.new_score})}
                      </div>
                    )}
                    {/* ⚠️ Guard: một số bản MySQL trả về chuỗi literal "null" khi
                        JSON_UNQUOTE trên field JSON null thay vì SQL NULL thật —
                        kiểm tra thêm cả trường hợp đó để không lọt chữ "null" ra
                        giao diện khi người chấm không ghi chú gì. */}
                    {(h.reason && h.reason!=='null')
                      ? <div style={{fontSize:12,color:C.ink,lineHeight:1.5,whiteSpace:'pre-wrap'}}>{h.reason}</div>
                      : <div style={{fontSize:11.5,color:C.faint,fontStyle:'italic'}}>{t('daily_reason_history_no_note','(không ghi chú)')}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label style={{display:'block',fontSize:11,fontWeight:800,color:C.faint,textTransform:'uppercase',letterSpacing:.4,marginBottom:7}}>{title}</label>
            <textarea value={reason} onChange={e=>onChangeReason(e.target.value)} autoFocus
              placeholder={isNew ? t('daily_reason_new_placeholder','Vd: hoàn thành đúng tiêu chuẩn, đúng giờ...') : t('daily_reason_placeholder','Nhập lý do sửa điểm...')}
              style={{width:'100%',padding:'10px 12px',border:`1.5px solid ${C.line}`,borderRadius:10,fontSize:13,resize:'vertical',minHeight:90,outline:'none',boxSizing:'border-box',fontFamily:'inherit'}}/>
            <div style={{fontSize:11,color:C.faint,marginTop:6,lineHeight:1.5}}>
              {isNew
                ? t('daily_reason_new_hint','Không bắt buộc — ghi chú ngắn về lý do cho điểm này để sau dễ tra lại.')
                : t('daily_reason_edit_hint','Bắt buộc khi đổi điểm đã từng chấm — giúp minh bạch khi có ai hỏi lại.')}
            </div>
          </div>
        </div>
        <div style={{padding:'14px 20px',borderTop:`1px solid ${C.line}`,display:'flex',gap:8,justifyContent:'flex-end'}}>
          <ModalBtn onClick={onCancel}>{t('daily_cancel_btn2','Huỷ')}</ModalBtn>
          <ModalBtn onClick={onSave} disabled={saving} variant="primary">{saving?'...':`💾 ${t('save','Lưu')}`}</ModalBtn>
        </div>
      </div>
    </div>,
    document.body
  );
}

function EditReasonModal({ items, reasons, onChangeReason, onCancel, onConfirm }) {
  const { t } = useTranslation();
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(15,23,41,.5)',zIndex:60,display:'flex',alignItems:'center',justifyContent:'center',padding:16,backdropFilter:'blur(3px)',WebkitBackdropFilter:'blur(3px)'}}>
      <div className="dp-modal" style={{background:'#fff',borderRadius:18,padding:26,width:440,maxWidth:'92vw',boxShadow:'0 30px 70px rgba(15,23,41,.3)',maxHeight:'85vh',display:'flex',flexDirection:'column',fontFamily:FONT_SANS}}>
        <div style={{fontSize:15,fontWeight:800,color:C.ink,marginBottom:6}}>✏️ {t('daily_reason_modal_title','Lý do sửa điểm')}</div>
        <div style={{fontSize:12,color:C.faint,marginBottom:16}}>{t('daily_reason_modal_desc','Các điểm dưới đây đã được chấm trước đó — vui lòng ghi rõ lý do khi sửa lại.')}</div>
        <div style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column',gap:14,paddingRight:2}}>
          {items.map(item=>(
            <div key={item.key}>
              <div style={{fontSize:12,fontWeight:700,color:C.ink}}>{item.taskName} · {item.dateLabel}</div>
              <div style={{fontSize:11,color:C.faint,marginBottom:6,fontFamily:FONT_MONO}}>{item.oldScore}đ → <span style={{color:C.warning,fontWeight:700}}>{item.newScore}đ</span></div>
              <textarea value={reasons[item.key]||''} onChange={e=>onChangeReason(item.key,e.target.value)}
                placeholder={t('daily_reason_placeholder','Nhập lý do sửa điểm...')}
                style={{width:'100%',padding:'8px 10px',border:`1.5px solid ${C.line}`,borderRadius:9,fontSize:12,resize:'vertical',minHeight:50,outline:'none',boxSizing:'border-box',fontFamily:'inherit'}}/>
            </div>
          ))}
          {!items.length&&<div style={{fontSize:12,color:C.faint,textAlign:'center',padding:20}}>{t('daily_reason_none','Không có mục nào cần lý do.')}</div>}
        </div>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:18}}>
          <ModalBtn onClick={onCancel}>{t('daily_cancel_btn2','Huỷ')}</ModalBtn>
          <ModalBtn onClick={onConfirm} variant="primary">✅ {t('daily_reason_confirm_btn','Xác nhận & Lưu')}</ModalBtn>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ icon, title, desc, warn, onCancel, onConfirm, confirmLabel, danger }) {
  const { t } = useTranslation();
  return (
    <ModalShell width={380} onBackdropClick={onCancel}>
      <div style={{textAlign:'center'}}>
        <div style={{width:64,height:64,borderRadius:'50%',background:danger?C.dangerSoft:C.primarySoft,display:'flex',alignItems:'center',justifyContent:'center',fontSize:30,margin:'0 auto 14px'}}>{icon}</div>
        <div style={{fontSize:15,fontWeight:800,color:C.ink,marginBottom:8}}>{title}</div>
        <div style={{fontSize:13,color:C.sub,marginBottom:6}}>{desc}</div>
        {warn&&<div style={{fontSize:12,color:C.danger,marginBottom:20,fontWeight:600}}>{warn}</div>}
        <div style={{display:'flex',gap:10,justifyContent:'center',marginTop:warn?0:20}}>
          <ModalBtn onClick={onCancel}>{t('daily_cancel_btn','Huỷ bỏ')}</ModalBtn>
          <ModalBtn onClick={onConfirm} variant={danger?'danger':'primary'}>{confirmLabel}</ModalBtn>
        </div>
      </div>
    </ModalShell>
  );
}

function TaskModal({ task, members=[], activeMember, onClose, onSave }) {
  const { t } = useTranslation();
  // Đang TẠO MỚI (không phải sửa) → tự điền sẵn "Giao cho" = người Leader
  // đang chọn ở sidebar, đỡ phải chọn lại lần nữa cho mất công. Đang SỬA 1
  // task có sẵn thì vẫn giữ đúng giá trị đã lưu của nó (kể cả khi đó là
  // "Tất cả" / rỗng), không tự ý đổi theo activeMember.
  const [form,setForm]=useState({name:task?.name||'',max_score:task?.max_score||3,frequency:task?.frequency||'daily',frequency_day:task?.frequency_day||'',assigned_user_id: task ? (task.assigned_user_id||'') : (activeMember?.id||'')});
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
    onSave({name:form.name,max_score:+form.max_score,frequency:form.frequency,frequency_day:form.frequency!=='daily'?form.frequency_day:null,assigned_user_id:form.assigned_user_id||null});
  };
  const FI={width:'100%',padding:'9px 12px',border:`1.5px solid ${C.line}`,borderRadius:9,fontSize:13,color:C.ink,outline:'none',boxSizing:'border-box',fontFamily:FONT_SANS};
  const FL={display:'block',fontSize:11,fontWeight:800,color:C.faint,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6};
  const FREQS=[
    {key:'daily',         icon:'📅', label:t('daily_freq_daily','Hằng ngày'),           sub:t('daily_freq_daily_sub','Mỗi ngày')},
    {key:'weekly_count',  icon:'🔁', label:t('daily_freq_weekly_count_opt','Nhiều thứ/tuần'),  sub:t('daily_freq_weekly_count_sub','Chọn sẵn nhiều thứ')},
    {key:'monthly_count', icon:'🔁', label:t('daily_freq_monthly_count_opt','Nhiều ngày/tháng'), sub:t('daily_freq_monthly_count_sub','Chọn sẵn nhiều ngày')},
  ];
  const DAYS=t('weekdays_short_mon_first',{returnObjects:true, defaultValue:['T2','T3','T4','T5','T6','T7','CN']});
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(15,23,41,.5)',zIndex:60,display:'flex',alignItems:'center',justifyContent:'center',padding:16,backdropFilter:'blur(3px)',WebkitBackdropFilter:'blur(3px)'}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="dp-modal" style={{background:'#fff',borderRadius:18,padding:28,width:460,maxWidth:'92vw',boxShadow:'0 30px 70px rgba(15,23,41,.3)',maxHeight:'90vh',overflowY:'auto',fontFamily:FONT_SANS}}>
        <div style={{fontSize:15,fontWeight:800,color:C.ink,marginBottom:20}}>{task?`✏️ ${t('daily_edit_task_title','Sửa công việc')}`:`➕ ${t('daily_add_task_title','Thêm công việc mới')}`}</div>
        <div style={{marginBottom:16}}><label style={FL}>{t('daily_field_task_name','Tên công việc')} *</label><input style={FI} value={form.name} onChange={e=>set('name',e.target.value)} autoFocus placeholder={t('daily_field_task_name_placeholder','Vd: Kiểm tra máy đầu ca')}/></div>
        <div style={{marginBottom:16}}><label style={FL}>{t('daily_field_max_score','Điểm tối đa')} *</label><input type="number" inputMode="numeric" min="1" max="100" style={{...FI,fontFamily:FONT_MONO}} value={form.max_score} onChange={e=>set('max_score',e.target.value)}/></div>
        <div style={{marginBottom:16}}>
          <label style={FL}>{t('daily_field_frequency','Tần suất')} *</label>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {FREQS.map(f=>(
              <div key={f.key} onClick={()=>{ set('frequency',f.key); set('frequency_day',''); }} style={{flex:'1 1 100px',padding:11,borderRadius:12,cursor:'pointer',textAlign:'center',border:`2px solid ${form.frequency===f.key?C.primary:C.line}`,background:form.frequency===f.key?C.primarySoft:'#fff',transition:'all .12s ease'}}>
                <div style={{fontSize:20,marginBottom:4}}>{f.icon}</div>
                <div style={{fontSize:12,fontWeight:700,color:form.frequency===f.key?C.primary:C.ink}}>{f.label}</div>
                <div style={{fontSize:10,color:C.faint,marginTop:2}}>{f.sub}</div>
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
                  <div key={d} onClick={()=>toggleDay(dayNum)} style={{width:38,height:38,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,cursor:'pointer',border:`2px solid ${selected?C.primary:C.line}`,background:selected?`linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`:'#fff',color:selected?'#fff':C.sub,transition:'all .12s ease'}}>{d}</div>
                );
              })}
            </div>
            <div style={{fontSize:11,color:C.faint,marginTop:5}}>{t('daily_field_weekly_days_hint','Công việc chỉ hiện ra và tính điểm đúng vào những thứ đã chọn — bấm để chọn/bỏ chọn.')}</div>
          </div>
        )}
        {form.frequency==='monthly_count'&&(
          <div style={{marginBottom:16}}>
            <label style={FL}>{t('daily_field_monthly_days','Chọn các ngày trong tháng')} *</label>
            <div style={{display:'flex',gap:5,flexWrap:'wrap',maxHeight:150,overflowY:'auto',padding:'6px 2px'}}>
              {Array.from({length:31},(_,i)=>i+1).map(dayNum=>{
                const selected=selectedDaysArr.includes(dayNum);
                return (
                  <div key={dayNum} onClick={()=>toggleDay(dayNum)} style={{width:30,height:30,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,cursor:'pointer',border:`2px solid ${selected?C.primary:C.line}`,background:selected?`linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`:'#fff',color:selected?'#fff':C.sub,transition:'all .12s ease',fontFamily:FONT_MONO}}>{dayNum}</div>
                );
              })}
            </div>
            <div style={{fontSize:11,color:C.faint,marginTop:5}}>{t('daily_field_monthly_days_hint','Công việc chỉ hiện ra và tính điểm đúng vào những ngày đã chọn — bấm để chọn/bỏ chọn.')}</div>
          </div>
        )}
        {/* Giao cho — mặc định "Tất cả" (công việc chung cả nhóm, hành vi cũ).
            Chọn 1 người cụ thể → công việc RIÊNG, chỉ hiện khi xem đúng người đó. */}
        <div style={{marginBottom:16}}>
          <label style={FL}>{t('daily_field_assignee','Giao cho')}</label>
          <select style={FI} value={form.assigned_user_id} onChange={e=>set('assigned_user_id',e.target.value)}>
            <option value="">{t('daily_field_assignee_all','👥 Tất cả mọi người trong nhóm')}</option>
            {members.map(m=>(
              <option key={m.id} value={m.id}>{m.full_name}</option>
            ))}
          </select>
          <div style={{fontSize:11,color:C.faint,marginTop:5}}>{t('daily_field_assignee_hint','Nếu chọn 1 người cụ thể, công việc này chỉ hiện ra khi bạn đang xem đúng người đó — người khác trong nhóm sẽ không thấy.')}</div>
        </div>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:22}}>
          <ModalBtn onClick={onClose}>{t('daily_cancel_btn2','Huỷ')}</ModalBtn>
          <ModalBtn onClick={submit} variant="primary">💾 {t('daily_save_task_btn','Lưu công việc')}</ModalBtn>
        </div>
      </div>
    </div>
  );
}