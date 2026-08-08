import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api, { clearApiCache } from '../../api/client';
import useAuth from '../../store/authStore';
import { getSocket } from '../../lib/socket';

const PAGE_SIZE = 10;

// ── Design tokens (cùng bảng màu với Board/Daily/Requests) ──
const PRIMARY = '#3654ff';
const PRIMARY_DEEP = '#2440d6';

function Avatar({ color='#3654ff', name='?', size=26, ring=false }) {
  const initials = name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  return (
    <div className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 shadow-sm"
      style={{
        background:`linear-gradient(135deg, ${color}, ${color}cc)`, width:size, height:size,
        fontSize: size>24?11:9, fontFamily:"'Inter',ui-sans-serif,system-ui,sans-serif",
        boxShadow: ring ? `0 0 0 2px #fff, 0 0 0 3.5px ${color}55` : undefined,
      }}>
      {initials}
    </div>
  );
}

// Badge Chính/Hỗ trợ — bản gọn dùng lại logic giống RequestsPage, không cần import chéo file
function RoleBadge({ role }) {
  const isSupport = role==='support';
  return (
    <span className={`inline-flex items-center text-[9px] font-extrabold px-1.5 py-0.5 rounded-md whitespace-nowrap ${
      isSupport ? 'bg-amber-50 text-amber-600' : 'bg-[#eaefff] text-[#3654ff]'
    }`}>
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
  const btn=(active,disabled)=>`min-w-[28px] h-[28px] px-2 rounded-lg border text-xs font-bold flex items-center justify-center flex-shrink-0 font-mono transition-all ${
    active ? 'text-white border-transparent shadow-[0_3px_8px_rgba(54,84,255,.4)]' : disabled ? 'border-gray-200 text-gray-300' : 'border-gray-200 text-gray-500 hover:border-[#3654ff] hover:text-[#3654ff]'
  }`;
  const style = active => active ? { background:`linear-gradient(135deg, ${PRIMARY}, ${PRIMARY_DEEP})` } : undefined;
  return (
    <div className="flex items-center justify-center gap-1 flex-wrap py-4">
      <button disabled={page===1} onClick={()=>onChange(page-1)} className={btn(false,page===1)}>‹</button>
      {start>1 && <>
        <button onClick={()=>onChange(1)} className={btn(false,false)}>1</button>
        {start>2 && <span className="text-gray-300 text-xs">···</span>}
      </>}
      {nums.map(p=><button key={p} onClick={()=>onChange(p)} className={btn(p===page,false)} style={style(p===page)}>{p}</button>)}
      {end<totalPages && <>
        {end<totalPages-1 && <span className="text-gray-300 text-xs">···</span>}
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

  // 📡 Realtime — CV vừa được duyệt hoàn thành ở nơi khác thì tự hiện lên
  // đây ngay, không cần F5. Xóa cache client trước khi fetch lại (cache GET
  // chỉ tự xóa khi CHÍNH tab này gọi POST/PUT/DELETE, không biết gì về thay
  // đổi từ tab/người khác).
  useEffect(() => {
    if (!user?.id) return;
    const socket = getSocket(user.id);
    const onUpdate = () => { clearApiCache(); fetchCompleted(); };
    socket.on('requests:updated', onUpdate);
    return () => socket.off('requests:updated', onUpdate);
  }, [user?.id, filter, dateFrom, dateTo, search]);

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
    <div className="flex-1 flex flex-col overflow-hidden bg-[#eef1f8]">
      <style>{`
        @keyframes cpSpin { to { transform: rotate(360deg); } }
        @keyframes cpRise { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      {/* Topbar */}
      <div className="px-4 sm:px-6 py-3.5 bg-white border-b border-[#e6e9f2] flex items-center gap-3 flex-shrink-0 flex-wrap">
        <h1 className="font-extrabold text-[#0f1729] basis-full sm:basis-auto sm:flex-1 flex items-center gap-2.5 text-[15px]">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center text-[15px] shadow-[0_3px_10px_rgba(54,84,255,.3)]"
            style={{ background:`linear-gradient(135deg, ${PRIMARY}, ${PRIMARY_DEEP})` }}>✅</span>
          {t('completed')}
        </h1>

        <div className="flex items-center gap-2 flex-1 sm:flex-none min-w-0">
          <input type="date" className="border border-[#e6e9f2] bg-[#eef1f8] rounded-xl px-2 sm:px-3 py-1.5 text-sm outline-none flex-1 sm:flex-none sm:w-auto min-w-0 font-mono focus:border-[#3654ff] focus:bg-white transition-colors" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} />
          <span className="text-xs text-gray-400 flex-shrink-0">{t('completed_to')}</span>
          <input type="date" className="border border-[#e6e9f2] bg-[#eef1f8] rounded-xl px-2 sm:px-3 py-1.5 text-sm outline-none flex-1 sm:flex-none sm:w-auto min-w-0 font-mono focus:border-[#3654ff] focus:bg-white transition-colors" value={dateTo} onChange={e=>setDateTo(e.target.value)} />
        </div>

        <input className="border border-[#e6e9f2] rounded-xl px-3 py-1.5 text-sm outline-none focus:border-[#3654ff] w-full sm:w-48 transition-colors"
          placeholder={`🔍 ${t('search')}...`} value={search} onChange={e=>setSearch(e.target.value)} />
      </div>

      {/* Summary */}
      <div className="px-4 sm:px-6 py-3.5 bg-white border-b border-[#e6e9f2] flex gap-3 flex-shrink-0 flex-wrap">
        {[
          { label:t('completed_total'), val: tasks.length, color:'#0f1729', bg:'#eef1f8', border:'#e6e9f2', icon:'📊' },
          { label:`${t('on_time')}`, val: ontime, color:'#17b26a', bg:'#e8f9f0', border:'#b8e8c8', icon:'✅' },
          { label:`${t('late')}`,    val: late,   color:'#e5384d', bg:'#fdeaec', border:'#f5c0c0', icon:'⚠️' },
        ].map(s => (
          <div key={s.label} className="border rounded-2xl px-4 sm:px-5 py-3 flex items-center gap-3 flex-1 min-w-[130px] sm:flex-none transition-transform hover:-translate-y-0.5"
            style={{ background:s.bg, borderColor:s.border, animation:'cpRise .2s ease both' }}>
            <span className="text-xl">{s.icon}</span>
            <div>
              <div className="text-2xl font-black font-mono leading-none" style={{ color:s.color }}>{s.val}</div>
              <div className="text-[11px] text-gray-500 whitespace-nowrap mt-1 font-semibold">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 border-b border-[#e6e9f2] bg-white px-4 sm:px-6 py-2.5 flex-shrink-0 overflow-x-auto">
        {[['all',t('completed_filter_all')],['ontime',`✅ ${t('on_time')}`],['late',`⚠️ ${t('late')}`]].map(([k,l]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap flex-shrink-0 border transition-all ${
              filter===k ? 'text-white border-transparent shadow-[0_3px_10px_rgba(54,84,255,.35)]' : 'text-gray-500 border-[#e6e9f2] bg-white hover:border-[#3654ff] hover:text-[#3654ff]'
            }`}
            style={filter===k ? { background:`linear-gradient(135deg, ${PRIMARY}, ${PRIMARY_DEEP})` } : undefined}
          >{l}</button>
        ))}
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-5 flex flex-col gap-3">
        {loading && (
          <div className="text-center py-16">
            <div className="w-8 h-8 mx-auto rounded-full border-[3px] border-[#e6e9f2] border-t-[#3654ff]" style={{ animation:'cpSpin .7s linear infinite' }} />
          </div>
        )}

        {/* On time section */}
        {!loading && filter !== 'late' && pageOntime.length > 0 && (
          <>
            <div className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-xl border border-[#e6e9f2] shadow-sm">
              <span className="w-6 h-6 rounded-lg bg-[#e8f9f0] flex items-center justify-center text-[13px]">✅</span>
              <span className="font-bold text-[#17b26a] flex-1 text-sm">{t('on_time')}</span>
              <span className="text-[11px] font-bold bg-[#e8f9f0] text-[#17b26a] px-2.5 py-0.5 rounded-full font-mono">{t('completed_task_count',{count:tasks.filter(t=>!t.is_late).length})}</span>
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
            <div className="flex items-center gap-2 px-4 py-2.5 bg-[#fdeaec]/50 rounded-xl border border-[#f5c0c0] shadow-sm">
              <span className="w-6 h-6 rounded-lg bg-[#fdeaec] flex items-center justify-center text-[13px]">⚠️</span>
              <span className="font-bold text-[#e5384d] flex-1 text-sm">{t('late')}</span>
              <span className="text-[11px] font-bold bg-[#fdeaec] text-[#e5384d] px-2.5 py-0.5 rounded-full font-mono">{t('completed_task_count',{count:tasks.filter(t=>t.is_late).length})}</span>
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
          <div className="text-center py-16 text-gray-400 text-sm flex flex-col items-center gap-2">
            <span className="text-3xl opacity-50">🔍</span>
            {t('completed_not_found')}
          </div>
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
    <div className={`relative bg-white rounded-2xl border border-[#e6e9f2] p-3 sm:p-4 pl-4 sm:pl-5 cursor-pointer overflow-hidden transition-all hover:shadow-[0_10px_24px_rgba(15,23,41,.09)] hover:-translate-y-0.5 ${late ? 'bg-[#fdeaec]/10' : ''}`}
      style={{ animation:'cpRise .2s ease both' }}
      onClick={onToggle}>
      {/* Sọc trái — vạch cảnh báo chéo (hazard stripe) cho trễ hạn, đồng bộ với
          BoardPage/RequestsPage; đúng hạn dùng dải xanh trơn. */}
      <div className="absolute left-0 top-0 bottom-0 w-[5px]"
        style={{ background: late ? 'repeating-linear-gradient(135deg, #e5384d 0 6px, #ffb3ba 6px 12px)' : 'linear-gradient(180deg, #17b26a, #12995a)' }} />

      <div className="flex items-start gap-3 flex-wrap sm:flex-nowrap">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs flex-shrink-0 mt-0.5 shadow-sm`}
          style={{ background: late ? 'linear-gradient(135deg,#e5384d,#c72d3f)' : 'linear-gradient(135deg,#17b26a,#12995a)' }}>✓</div>
        <div className="flex-1 min-w-0 basis-full sm:basis-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-[#0f1729] text-sm">{task.title}</h3>
            {late
              ? <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#fdeaec] text-[#e5384d]">⚠️ {t('late')}</span>
              : <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#e8f9f0] text-[#17b26a]">✅ {t('on_time')}</span>}
            {task.score != null && <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#eaefff] text-[#3654ff] font-mono">⭐ {t('completed_pts',{score:task.score})}</span>}
          </div>
          <div className="flex gap-x-4 gap-y-1 mt-1.5 text-xs text-gray-500 flex-wrap">
            <span>👤 {task.creator_name}</span>
            {task.group_name && <span>🏭 {task.group_name}</span>}
            <span className="font-mono">📥 {fmtDate(task.created_at)}</span>
            {task.completed_at && <span className={`font-mono font-semibold ${late ? 'text-[#e5384d]' : 'text-[#17b26a]'}`}>✅ {fmtDate(task.completed_at)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-9 sm:ml-0">
          <div className="flex">
            {task.assignees?.slice(0,4).map((a,i) => (
              <div key={a.user_id} className={i===0?'':'-ml-1.5'}>
                <Avatar color={a.avatar_color||'#3654ff'} name={a.full_name||'?'} size={24} ring/>
              </div>
            ))}
          </div>
          <span className={`text-gray-300 text-xs transition-transform duration-200 ${expanded?'rotate-180':''}`}>▾</span>
        </div>
      </div>

      {/* Chi tiết mở rộng ngay tại chỗ — không điều hướng sang trang khác */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-[#f0f2f8]" onClick={e=>e.stopPropagation()}>
          {detailLoading && !detail && (
            <div className="text-center py-6 text-gray-400 text-xs">
              <div className="w-5 h-5 mx-auto rounded-full border-2 border-[#e6e9f2] border-t-[#3654ff]" style={{ animation:'cpSpin .6s linear infinite' }} />
            </div>
          )}
          {detail && (
            <div className="flex flex-col gap-3">
              {detail.description && (
                <div className="text-xs text-gray-600 bg-[#eef1f8] rounded-xl p-3 whitespace-pre-wrap leading-relaxed">{detail.description}</div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="bg-[#eef1f8] rounded-xl p-2.5 border border-[#e6e9f2]">
                  <div className="text-[10px] text-gray-400 uppercase font-bold mb-0.5 tracking-wide">{t('deadline')}</div>
                  <div className="text-[#0f1729] font-semibold font-mono">{fmtDate(detail.deadline)}</div>
                </div>
                <div className="bg-[#eef1f8] rounded-xl p-2.5 border border-[#e6e9f2]">
                  <div className="text-[10px] text-gray-400 uppercase font-bold mb-0.5 tracking-wide">{t('req_time_started')}</div>
                  <div className="text-[#0f1729] font-semibold font-mono">{fmtDate(detail.started_at)}</div>
                </div>
                <div className="bg-[#e8f9f0] rounded-xl p-2.5 border border-[#b8e8c8]">
                  <div className="text-[10px] text-gray-400 uppercase font-bold mb-0.5 tracking-wide">{t('req_time_completed')}</div>
                  <div className="text-[#17b26a] font-semibold font-mono">{fmtDate(detail.completed_at)}</div>
                </div>
                <div className="bg-[#eaefff] rounded-xl p-2.5 border border-[#c8d8f0]">
                  <div className="text-[10px] text-gray-400 uppercase font-bold mb-0.5 tracking-wide">{t('score')}</div>
                  <div className="text-[#3654ff] font-semibold font-mono">{detail.score!=null?`${detail.score}đ`:t('req_not_scored')}</div>
                </div>
              </div>

              {(detail.assignees||[]).length>0 && (
                <div>
                  <div className="text-[10px] text-gray-400 uppercase font-bold mb-1.5 tracking-wide">{t('req_assignees_section')}</div>
                  <div className="flex flex-wrap gap-2">
                    {detail.assignees.map(a=>(
                      <span key={a.user_id} className="flex items-center gap-1.5 bg-[#eaefff] border border-[#c8d8f0] rounded-full pl-1 pr-2.5 py-0.5 text-xs text-[#2440d6] font-semibold">
                        <Avatar color={a.avatar_color||'#3654ff'} name={a.full_name||'?'} size={18}/>
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
                    <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wide">{t('req_files_section')}</div>
                    {detail.files.length>3 && (
                      <input value={fileSearch} onChange={e=>setFileSearch(e.target.value)}
                        placeholder={`🔍 ${t('req_search_title')}`}
                        onClick={e=>e.stopPropagation()}
                        className="border border-[#e6e9f2] rounded-lg px-2 py-0.5 text-[11px] outline-none focus:border-[#3654ff] flex-1 max-w-[160px] transition-colors"/>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {filteredFiles.map(f=>{
                      const url = f.url||resolveFileUrl('/uploads/'+(f.stored_name||f.filename));
                      if (isImageFile(f.filename)) {
                        return (
                          <div key={f.id} onClick={e=>{e.stopPropagation();setLightbox(url);}}
                            className="cursor-pointer group relative w-16 h-16 rounded-xl overflow-hidden border border-[#c8d8f0] shadow-sm transition-transform hover:scale-105">
                            <img src={url} alt={f.filename} className="w-full h-full object-cover group-hover:opacity-80 transition-opacity"/>
                          </div>
                        );
                      }
                      return (
                        <a key={f.id} href={url} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}
                          className="flex items-center gap-2 text-xs text-[#2440d6] bg-[#eaefff] border border-[#c8d8f0] rounded-xl px-2.5 py-1.5 no-underline font-semibold w-fit transition-colors hover:bg-[#dbe4ff]">
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
          style={{cursor:'zoom-out'}}>
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-xl shadow-2xl" onClick={e=>e.stopPropagation()}/>
          <button onClick={e=>{e.stopPropagation();setLightbox(null);}}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/90 text-gray-700 text-lg font-bold flex items-center justify-center hover:bg-white transition-colors">×</button>
        </div>
      )}
    </div>
  );
}