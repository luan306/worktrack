import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import useAuth from '../../store/authStore';

const PAGE_SIZE = 10;

function Avatar({ color='#3a7bd5', name='?', size=26 }) {
  const initials = name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  return (
    <div className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
      style={{ background:color, width:size, height:size, fontSize: 9 }}>
      {initials}
    </div>
  );
}

// Badge Chính/Hỗ trợ — bản gọn dùng lại logic giống RequestsPage, không cần import chéo file
function RoleBadge({ role }) {
  const isSupport = role==='support';
  return (
    <span style={{fontSize:9,fontWeight:700,padding:'1px 6px',borderRadius:6,
      background:isSupport?'#fff4e8':'#eef3ff',color:isSupport?'#e67e22':'#3a7bd5',whiteSpace:'nowrap'}}>
      {isSupport?'🤝 Hỗ trợ':'⭐ Chính'}
    </span>
  );
}

// Thanh phân trang dùng chung — chỉ hiện khi có hơn 1 trang
function Pagination({ page, totalPages, onChange }) {
  if (totalPages<=1) return null;
  let start=Math.max(1,page-2), end=Math.min(totalPages,start+4);
  start=Math.max(1,end-4);
  const nums=[]; for(let p=start;p<=end;p++) nums.push(p);
  const btn=(active,disabled)=>`min-w-[26px] h-[26px] px-2 rounded-md border text-xs font-bold flex items-center justify-center flex-shrink-0 ${
    active ? 'bg-[#3a7bd5] border-[#3a7bd5] text-white' : disabled ? 'border-gray-200 text-gray-300' : 'border-gray-200 text-gray-500 hover:border-[#3a7bd5] hover:text-[#3a7bd5]'
  }`;
  return (
    <div className="flex items-center justify-center gap-1 flex-wrap py-3">
      <button disabled={page===1} onClick={()=>onChange(page-1)} className={btn(false,page===1)}>‹</button>
      {start>1 && <>
        <button onClick={()=>onChange(1)} className={btn(false,false)}>1</button>
        {start>2 && <span className="text-gray-300 text-xs">…</span>}
      </>}
      {nums.map(p=><button key={p} onClick={()=>onChange(p)} className={btn(p===page,false)}>{p}</button>)}
      {end<totalPages && <>
        {end<totalPages-1 && <span className="text-gray-300 text-xs">…</span>}
        <button onClick={()=>onChange(totalPages)} className={btn(false,false)}>{totalPages}</button>
      </>}
      <button disabled={page===totalPages} onClick={()=>onChange(page+1)} className={btn(false,page===totalPages)}>›</button>
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
  const [page, setPage]       = useState(1);

  // Chi tiết mở rộng ngay tại chỗ khi bấm vào 1 thẻ — cache theo id để không
  // gọi lại API mỗi lần đóng/mở cùng 1 CV.
  const [expandedId, setExpandedId] = useState(null);
  const [detailCache, setDetailCache] = useState({});
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => { fetchCompleted(); }, [filter, dateFrom, dateTo, search]);
  // Đổi filter/tìm kiếm/ngày → về lại trang 1, tránh đứng ở trang trống
  useEffect(() => { setPage(1); }, [filter, dateFrom, dateTo, search]);

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

  const toggleExpand = async (taskId) => {
    if (expandedId === taskId) { setExpandedId(null); return; }
    setExpandedId(taskId);
    if (!detailCache[taskId]) {
      setDetailLoading(true);
      try {
        const { data } = await api.get(`/requests/${taskId}`);
        setDetailCache(prev => ({ ...prev, [taskId]: data.data }));
      } catch (e) { console.error(e); }
      finally { setDetailLoading(false); }
    }
  };

  const ontime = tasks.filter(t => !t.is_late).length;
  const late   = tasks.filter(t =>  t.is_late).length;
  const localeMap = { vi:'vi-VN', en:'en-US', ja:'ja-JP' };
  const currentLocale = localeMap[i18n.language] || 'vi-VN';
  const fmtDate = d => d ? new Date(d).toLocaleString(currentLocale, { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';

  // Phân trang trên toàn bộ danh sách đã lọc (giữ nguyên 2 nhóm đúng hạn/trễ
  // bên trong trang hiện tại, thay vì tách trang riêng cho từng nhóm)
  const totalPages = Math.max(1, Math.ceil(tasks.length / PAGE_SIZE));
  const pageTasks = tasks.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
  const pageOntime = pageTasks.filter(t=>!t.is_late);
  const pageLate   = pageTasks.filter(t=>t.is_late);

  const BASE = (import.meta.env.VITE_API_URL||'http://localhost:3001/api').replace('/api','');
  const resolveFileUrl = (url) => url && url.startsWith('/') ? BASE + url : url;

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
        {!loading && filter !== 'late' && pageOntime.length > 0 && (
          <>
            <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-gray-200">
              <span className="text-base">✅</span>
              <span className="font-bold text-green-700 flex-1">{t('on_time')}</span>
              <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{t('completed_task_count',{count:tasks.filter(t=>!t.is_late).length})}</span>
            </div>
            {pageOntime.map(task => (
              <TaskCard key={task.id} task={task} fmtDate={fmtDate}
                expanded={expandedId===task.id} onToggle={()=>toggleExpand(task.id)}
                detail={detailCache[task.id]} detailLoading={detailLoading&&expandedId===task.id}
                resolveFileUrl={resolveFileUrl} t={t}/>
            ))}
          </>
        )}

        {/* Late section */}
        {!loading && filter !== 'ontime' && pageLate.length > 0 && (
          <>
            <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-red-200 bg-red-50/50">
              <span className="text-base">⚠️</span>
              <span className="font-bold text-red-600 flex-1">{t('late')}</span>
              <span className="text-xs font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{t('completed_task_count',{count:tasks.filter(t=>t.is_late).length})}</span>
            </div>
            {pageLate.map(task => (
              <TaskCard key={task.id} task={task} fmtDate={fmtDate} late
                expanded={expandedId===task.id} onToggle={()=>toggleExpand(task.id)}
                detail={detailCache[task.id]} detailLoading={detailLoading&&expandedId===task.id}
                resolveFileUrl={resolveFileUrl} t={t}/>
            ))}
          </>
        )}

        {!loading && !tasks.length && (
          <div className="text-center py-12 text-gray-400 text-sm">{t('completed_not_found')}</div>
        )}

        {!loading && tasks.length>0 && <Pagination page={page} totalPages={totalPages} onChange={setPage}/>}
      </div>
    </div>
  );
}

const isImageFile = (name)=> ['jpg','jpeg','png','gif','webp'].includes((name||'').split('.').pop().toLowerCase());
const fileIconOf = (name)=>{
  const ext=(name||'').split('.').pop().toLowerCase();
  if (ext==='pdf') return '📄';
  if (['doc','docx'].includes(ext)) return '📝';
  if (['xls','xlsx'].includes(ext)) return '📊';
  if (['zip','rar'].includes(ext)) return '🗜';
  if (['mp4','mov'].includes(ext)) return '🎬';
  return '📎';
};

function TaskCard({ task, fmtDate, late=false, expanded, onToggle, detail, detailLoading, resolveFileUrl, t }) {
  const [fileSearch, setFileSearch] = useState('');
  const [lightbox, setLightbox] = useState(null); // url ảnh đang xem phóng to, null = đóng

  const filteredFiles = (detail?.files||[]).filter(f =>
    !fileSearch.trim() || (f.filename||'').toLowerCase().includes(fileSearch.trim().toLowerCase())
  );

  return (
    <div className={`card p-3 sm:p-4 border-l-4 cursor-pointer transition-shadow hover:shadow-md ${late ? 'border-l-red-400 bg-red-50/20' : 'border-l-green-400'}`}
      onClick={onToggle}>
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
        <div className="flex items-center gap-2 flex-shrink-0 ml-9 sm:ml-0">
          <div className="flex gap-1">
            {task.assignees?.slice(0,4).map(a => (
              <div key={a.user_id} className="rounded-full w-6 h-6 bg-[#3a7bd5] flex items-center justify-center text-white text-[9px] font-bold border-2 border-white"
                style={{background:'#3a7bd5'}}>
                {a.full_name?.charAt(0)}
              </div>
            ))}
          </div>
          <span className={`text-gray-300 text-xs transition-transform ${expanded?'rotate-180':''}`}>▾</span>
        </div>
      </div>

      {/* Chi tiết mở rộng ngay tại chỗ — không điều hướng sang trang khác */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-100" onClick={e=>e.stopPropagation()}>
          {detailLoading && !detail && (
            <div className="text-center py-6 text-gray-400 text-xs">⏳ {t('loading')}</div>
          )}
          {detail && (
            <div className="flex flex-col gap-3">
              {detail.description && (
                <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2.5 whitespace-pre-wrap">{detail.description}</div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="bg-gray-50 rounded-lg p-2">
                  <div className="text-[10px] text-gray-400 uppercase font-bold mb-0.5">{t('deadline')}</div>
                  <div className="text-[#1e2a3a] font-semibold">{fmtDate(detail.deadline)}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-2">
                  <div className="text-[10px] text-gray-400 uppercase font-bold mb-0.5">{t('req_time_started')}</div>
                  <div className="text-[#1e2a3a] font-semibold">{fmtDate(detail.started_at)}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-2">
                  <div className="text-[10px] text-gray-400 uppercase font-bold mb-0.5">{t('req_time_completed')}</div>
                  <div className="text-green-600 font-semibold">{fmtDate(detail.completed_at)}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-2">
                  <div className="text-[10px] text-gray-400 uppercase font-bold mb-0.5">{t('score')}</div>
                  <div className="text-[#3a7bd5] font-semibold">{detail.score!=null?`${detail.score}đ`:t('req_not_scored')}</div>
                </div>
              </div>

              {(detail.assignees||[]).length>0 && (
                <div>
                  <div className="text-[10px] text-gray-400 uppercase font-bold mb-1.5">{t('req_assignees_section')}</div>
                  <div className="flex flex-wrap gap-2">
                    {detail.assignees.map(a=>(
                      <span key={a.user_id} className="flex items-center gap-1.5 bg-[#eef3ff] border border-[#c8d8f0] rounded-full pl-1 pr-2 py-0.5 text-xs text-[#3a7bd5] font-semibold">
                        <Avatar color={a.avatar_color||'#3a7bd5'} name={a.full_name||'?'} size={18}/>
                        {a.full_name}
                        <RoleBadge role={a.role}/>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(detail.files||[]).length>0 && (
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="text-[10px] text-gray-400 uppercase font-bold">{t('req_files_section')}</div>
                    {detail.files.length>3 && (
                      <input value={fileSearch} onChange={e=>setFileSearch(e.target.value)}
                        placeholder={`🔍 ${t('req_search_title')}`}
                        onClick={e=>e.stopPropagation()}
                        className="border border-gray-200 rounded-md px-2 py-0.5 text-[11px] outline-none focus:border-[#3a7bd5] flex-1 max-w-[160px]"/>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {filteredFiles.map(f=>{
                      const url = f.url||resolveFileUrl('/uploads/'+(f.stored_name||f.filename));
                      if (isImageFile(f.filename)) {
                        return (
                          <div key={f.id} onClick={e=>{e.stopPropagation();setLightbox(url);}}
                            className="cursor-pointer group relative w-16 h-16 rounded-lg overflow-hidden border border-[#c8d8f0]">
                            <img src={url} alt={f.filename} className="w-full h-full object-cover group-hover:opacity-80 transition-opacity"/>
                          </div>
                        );
                      }
                      return (
                        <a key={f.id} href={url} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}
                          className="flex items-center gap-2 text-xs text-[#3a7bd5] bg-[#eef3ff] border border-[#c8d8f0] rounded-lg px-2.5 py-1.5 no-underline font-semibold w-fit">
                          {fileIconOf(f.filename)} {f.filename}
                        </a>
                      );
                    })}
                    {!filteredFiles.length && (
                      <div className="text-xs text-gray-400 py-2">{t('req_no_files_found', { defaultValue:'Không tìm thấy file' })}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Lightbox xem ảnh phóng to */}
      {lightbox && (
        <div onClick={e=>{e.stopPropagation();setLightbox(null);}}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          style={{cursor:'zoom-out'}}>
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-lg shadow-2xl" onClick={e=>e.stopPropagation()}/>
          <button onClick={e=>{e.stopPropagation();setLightbox(null);}}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/90 text-gray-700 text-lg font-bold flex items-center justify-center">×</button>
        </div>
      )}
    </div>
  );
}