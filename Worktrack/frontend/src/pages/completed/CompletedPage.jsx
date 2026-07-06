import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import useAuth from '../../store/authStore';

function Avatar({ color='#3a7bd5', name='?', size=26 }) {
  const initials = name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  return (
    <div className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
      style={{ background:color, width:size, height:size, fontSize: 9 }}>
      {initials}
    </div>
  );
}

export default function CompletedPage() {
  const { t, i18n } = useTranslation();
  const { user, can } = useAuth();
  const [tasks, setTasks]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('all'); // all | ontime | late
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]   = useState('');
  const [search, setSearch]   = useState('');

  useEffect(() => { fetchCompleted(); }, [filter, dateFrom, dateTo, search]);

  const fetchCompleted = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status:'done' });
      if (search) params.append('search', search);
      if (!can('admin','manager','leader')) params.append('assigned_to', user.id);
      const { data } = await api.get(`/requests?${params}`);
      let list = data.data;
      if (filter==='ontime') list = list.filter(t => !t.is_late);
      if (filter==='late')   list = list.filter(t => t.is_late);
      if (dateFrom) list = list.filter(t => t.completed_at && new Date(t.completed_at) >= new Date(dateFrom));
      if (dateTo)   list = list.filter(t => t.completed_at && new Date(t.completed_at) <= new Date(dateTo+'T23:59:59'));
      setTasks(list);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const ontime = tasks.filter(t => !t.is_late).length;
  const late   = tasks.filter(t =>  t.is_late).length;
  const localeMap = { vi:'vi-VN', en:'en-US', ja:'ja-JP' };
  const currentLocale = localeMap[i18n.language] || 'vi-VN';
  const fmtDate = d => d ? new Date(d).toLocaleString(currentLocale, { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Topbar */}
      <div className="px-4 sm:px-6 py-3 bg-white border-b flex items-center gap-3 flex-shrink-0 flex-wrap">
        <h1 className="font-bold text-[#1e2a3a] basis-full sm:basis-auto sm:flex-1">✅ {t('completed')}</h1>

        <div className="flex items-center gap-2 flex-1 sm:flex-none min-w-0">
          <input type="date" className="border border-gray-200 rounded-lg px-2 sm:px-3 py-1.5 text-sm outline-none flex-1 sm:flex-none sm:w-auto min-w-0" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} />
          <span className="text-xs text-gray-400 flex-shrink-0">{t('completed_to')}</span>
          <input type="date" className="border border-gray-200 rounded-lg px-2 sm:px-3 py-1.5 text-sm outline-none flex-1 sm:flex-none sm:w-auto min-w-0" value={dateTo} onChange={e=>setDateTo(e.target.value)} />
        </div>

        <input className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#3a7bd5] w-full sm:w-44"
          placeholder={`🔍 ${t('search')}...`} value={search} onChange={e=>setSearch(e.target.value)} />
      </div>

      {/* Summary */}
      <div className="px-4 sm:px-6 py-3 bg-gray-50 border-b flex gap-3 flex-shrink-0 flex-wrap">
        {[
          { label:t('completed_total'), val: tasks.length, color:'text-[#1e2a3a]', bg:'bg-white' },
          { label:`✅ ${t('on_time')}`, val: ontime, color:'text-green-700', bg:'bg-green-50 border-green-200' },
          { label:`⚠️ ${t('late')}`,    val: late,   color:'text-red-600',   bg:'bg-red-50 border-red-200' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} border rounded-xl px-4 sm:px-5 py-3 flex items-center gap-3 flex-1 min-w-[110px] sm:flex-none`}>
            <div className={`text-2xl font-black ${s.color}`}>{s.val}</div>
            <div className="text-xs text-gray-500 whitespace-nowrap">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex border-b bg-white px-4 sm:px-6 flex-shrink-0 overflow-x-auto">
        {[['all',t('completed_filter_all')],['ontime',`✅ ${t('on_time')}`],['late',`⚠️ ${t('late')}`]].map(([k,l]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
              filter===k ? 'text-[#3a7bd5] border-[#3a7bd5]' : 'text-gray-500 border-transparent hover:text-[#3a7bd5]'
            }`}>{l}</button>
        ))}
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-5 flex flex-col gap-3">
        {loading && <div className="text-center py-12 text-gray-400">⏳ {t('loading')}</div>}

        {/* On time section */}
        {!loading && filter !== 'late' && tasks.filter(t=>!t.is_late).length > 0 && (
          <>
            <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-gray-200">
              <span className="text-base">✅</span>
              <span className="font-bold text-green-700 flex-1">{t('on_time')}</span>
              <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{t('completed_task_count',{count:tasks.filter(t=>!t.is_late).length})}</span>
            </div>
            {tasks.filter(t=>!t.is_late).map(task => <TaskCard key={task.id} task={task} fmtDate={fmtDate} />)}
          </>
        )}

        {/* Late section */}
        {!loading && filter !== 'ontime' && tasks.filter(t=>t.is_late).length > 0 && (
          <>
            <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-red-200 bg-red-50/50">
              <span className="text-base">⚠️</span>
              <span className="font-bold text-red-600 flex-1">{t('late')}</span>
              <span className="text-xs font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{t('completed_task_count',{count:tasks.filter(t=>t.is_late).length})}</span>
            </div>
            {tasks.filter(t=>t.is_late).map(task => <TaskCard key={task.id} task={task} fmtDate={fmtDate} late />)}
          </>
        )}

        {!loading && !tasks.length && (
          <div className="text-center py-12 text-gray-400 text-sm">{t('completed_not_found')}</div>
        )}
      </div>
    </div>
  );
}

function TaskCard({ task, fmtDate, late=false }) {
  const { t } = useTranslation();
  return (
    <div className={`card p-3 sm:p-4 border-l-4 ${late ? 'border-l-red-400 bg-red-50/20' : 'border-l-green-400'}`}>
      <div className="flex items-start gap-3 flex-wrap sm:flex-nowrap">
        <div className={`w-6 h-6 rounded-md flex items-center justify-center text-white text-xs flex-shrink-0 mt-0.5 ${late ? 'bg-red-500' : 'bg-green-500'}`}>✓</div>
        <div className="flex-1 min-w-0 basis-full sm:basis-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-[#1e2a3a] text-sm">{task.title}</h3>
            {late ? <span className="badge badge-red">⚠️ {t('late')}</span> : <span className="badge badge-green">✅ {t('on_time')}</span>}
            {task.score != null && <span className="badge badge-blue">⭐ {t('completed_pts',{score:task.score})}</span>}
          </div>
          <div className="flex gap-x-4 gap-y-1 mt-1.5 text-xs text-gray-500 flex-wrap">
            <span>👤 {task.creator_name}</span>
            {task.group_name && <span>🏭 {task.group_name}</span>}
            <span>📥 {fmtDate(task.created_at)}</span>
            {task.completed_at && <span className={late ? 'text-red-500 font-semibold' : 'text-green-600 font-semibold'}>✅ {fmtDate(task.completed_at)}</span>}
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0 ml-9 sm:ml-0">
          {task.assignees?.slice(0,4).map(a => (
            <div key={a.user_id} className="rounded-full w-6 h-6 bg-[#3a7bd5] flex items-center justify-center text-white text-[9px] font-bold border-2 border-white"
              style={{background:'#3a7bd5'}}>
              {a.full_name?.charAt(0)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}