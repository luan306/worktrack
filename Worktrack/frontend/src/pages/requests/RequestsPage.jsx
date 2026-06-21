import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import useAuth from '../../store/authStore';

const STATUS_COLORS = { pending:'badge-gray', assigned:'badge-blue', in_progress:'badge-orange', done:'badge-green', cancelled:'badge-red' };
const PRIORITY_COLORS = { high:'badge-red', medium:'badge-orange', low:'badge-green' };

function Modal({ show, onClose, title, wide=false, children }) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className={`bg-white rounded-2xl shadow-2xl ${wide ? 'w-full max-w-2xl' : 'w-full max-w-lg'} max-h-[90vh] overflow-y-auto`}>
        <div className="px-6 py-4 border-b flex items-center justify-between sticky top-0 bg-white z-10">
          <h3 className="font-bold text-[#1e2a3a]">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 text-xl leading-none">×</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function Avatar({ color='#3a7bd5', name='?', size=22 }) {
  const initials = name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  return (
    <div className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
      style={{ background:color, width:size, height:size, fontSize: size < 24 ? 9 : 11 }}>
      {initials}
    </div>
  );
}

export default function RequestsPage() {
  const { t } = useTranslation();
  const { user, can } = useAuth();
  const isLeader = can('admin','manager','leader');

  const [tasks, setTasks]           = useState([]);
  const [groups, setGroups]         = useState([]);
  const [users, setUsers]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState('all');
  const [search, setSearch]         = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [comment, setComment]       = useState('');
  const [scoreInput, setScoreInput] = useState('');

  const [form, setForm] = useState({
    title:'', description:'', tools:'', priority:'medium',
    group_id:'', deadline:'', assignees:[],
  });

  const STATUS_TABS = ['all','pending','assigned','in_progress','done'];

  useEffect(() => { fetchTasks(); fetchGroups(); if (isLeader) fetchUsers(); }, [filter, search]);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.append('status', filter);
      if (search) params.append('search', search);
      // Non-leaders see only their tasks
      if (!isLeader) params.append('assigned_to', user.id);
      const { data } = await api.get(`/requests?${params}`);
      setTasks(data.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchGroups = async () => {
    try { const { data } = await api.get('/groups'); setGroups(data.data); } catch (_) {}
  };

  const fetchUsers = async () => {
    try { const { data } = await api.get('/users'); setUsers(data.data); } catch (_) {}
  };

  const openDetail = async (task) => {
    setShowDetail(task.id);
    setScoreInput(task.score || '');
    try {
      const { data } = await api.get(`/requests/${task.id}`);
      setDetailData(data.data);
    } catch (e) { console.error(e); }
  };

  const createTask = async () => {
    try {
      await api.post('/requests', form);
      setShowCreate(false);
      setForm({ title:'', description:'', tools:'', priority:'medium', group_id:'', deadline:'', assignees:[] });
      fetchTasks();
    } catch (e) { alert(e.response?.data?.message || e.message); }
  };

  const updateStatus = async (id, status) => {
    try {
      await api.put(`/requests/${id}`, { status, ...(status==='in_progress' ? { started_at: new Date().toISOString() } : {}), ...(status==='done' ? { completed_at: new Date().toISOString() } : {}) });
      fetchTasks();
      if (detailData?.id === id) { const { data } = await api.get(`/requests/${id}`); setDetailData(data.data); }
    } catch (e) { alert(e.message); }
  };

  const submitScore = async () => {
    if (!detailData) return;
    try {
      await api.post(`/requests/${detailData.id}/score`, { score: parseFloat(scoreInput) });
      const { data } = await api.get(`/requests/${detailData.id}`);
      setDetailData(data.data);
      fetchTasks();
    } catch (e) { alert(e.message); }
  };

  const sendComment = async () => {
    if (!comment.trim() || !detailData) return;
    try {
      await api.post(`/requests/${detailData.id}/comments`, { message: comment });
      setComment('');
      const { data } = await api.get(`/requests/${detailData.id}`);
      setDetailData(data.data);
    } catch (e) { alert(e.message); }
  };

  const fmtDate = d => d ? new Date(d).toLocaleString(undefined, { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
  const isLate = (deadline, completed_at) => deadline && completed_at && new Date(completed_at) > new Date(deadline);

  const addAssignee = () => {
    const sel = document.getElementById('new-assignee');
    if (!sel?.value) return;
    const uid = +sel.value;
    if (form.assignees.find(a=>a.user_id===uid)) return;
    const u = users.find(u=>u.id===uid);
    setForm(p=>({ ...p, assignees: [...p.assignees, { user_id: uid, role:'main', name: u?.full_name }] }));
    sel.value = '';
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Topbar */}
      <div className="px-6 py-3 bg-white border-b flex items-center gap-3 flex-shrink-0">
        <h1 className="font-bold text-[#1e2a3a] flex-1">📨 {t('requests')}</h1>
        <input className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#3a7bd5] w-52"
          placeholder="🔍 Search..." value={search} onChange={e=>{setSearch(e.target.value);}} />
        <button onClick={() => setShowCreate(true)} className="btn btn-primary text-xs">
          ＋ {t('create')}
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex border-b bg-white px-6 flex-shrink-0">
        {STATUS_TABS.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors capitalize ${
              filter===s ? 'text-[#3a7bd5] border-[#3a7bd5]' : 'text-gray-500 border-transparent hover:text-[#3a7bd5]'
            }`}>
            {s === 'all' ? `All (${tasks.length})` : t(s)}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
        {loading && <div className="text-center py-12 text-gray-400">⏳ Loading...</div>}
        {!loading && !tasks.length && (
          <div className="text-center py-12 text-gray-400 text-sm">No tasks found</div>
        )}
        {tasks.map(task => (
          <div key={task.id} onClick={() => openDetail(task)}
            className={`card p-4 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all border-l-4 ${
              task.status==='done' && isLate(task.deadline, task.completed_at) ? 'border-l-red-400 bg-red-50/30'
              : task.status==='done' ? 'border-l-green-400'
              : 'border-l-transparent'
            }`}>
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-[#1e2a3a] text-sm">{task.title}</h3>
                  <span className={`badge ${STATUS_COLORS[task.status]}`}>{t(task.status)}</span>
                  <span className={`badge ${PRIORITY_COLORS[task.priority]}`}>{t(task.priority)}</span>
                  {task.status==='done' && isLate(task.deadline, task.completed_at) && (
                    <span className="badge badge-red">⚠️ {t('late')}</span>
                  )}
                  {task.status==='done' && !isLate(task.deadline, task.completed_at) && (
                    <span className="badge badge-green">✅ {t('on_time')}</span>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500 flex-wrap">
                  <span>👤 {task.creator_name}</span>
                  {task.group_name && <span>🏭 {task.group_name}</span>}
                  {task.deadline && <span className={`${new Date(task.deadline) < new Date() && task.status!=='done' ? 'text-red-500 font-semibold' : ''}`}>⏰ {fmtDate(task.deadline)}</span>}
                  {task.score != null && <span className="font-bold text-[#3a7bd5]">⭐ {task.score}pts</span>}
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                {task.assignees?.map(a => <Avatar key={a.user_id} color="#3a7bd5" name={a.full_name} />)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Create Modal ── */}
      <Modal show={showCreate} onClose={() => setShowCreate(false)} title="➕ Create Request Task" wide>
        <div className="flex flex-col gap-4">
          <div>
            <label className="label">Title *</label>
            <input className="input" placeholder="Task title..." value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input" rows={3} placeholder="Details..." value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} />
          </div>
          <div>
            <label className="label">Tools needed</label>
            <input className="input" placeholder="Tools, resources..." value={form.tools} onChange={e=>setForm(p=>({...p,tools:e.target.value}))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Priority</label>
              <select className="input" value={form.priority} onChange={e=>setForm(p=>({...p,priority:e.target.value}))}>
                <option value="high">🔴 High</option>
                <option value="medium">🟡 Medium</option>
                <option value="low">🟢 Low</option>
              </select>
            </div>
            <div>
              <label className="label">Group</label>
              <select className="input" value={form.group_id} onChange={e=>setForm(p=>({...p,group_id:e.target.value}))}>
                <option value="">No group</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Deadline</label>
            <input type="datetime-local" className="input" value={form.deadline} onChange={e=>setForm(p=>({...p,deadline:e.target.value}))} />
          </div>
          {isLeader && (
            <div>
              <label className="label">Assignees</label>
              <div className="flex gap-2 mb-2">
                <select id="new-assignee" className="input flex-1">
                  <option value="">Select person...</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
                <button onClick={addAssignee} className="btn btn-outline px-3 text-xs">＋</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {form.assignees.map(a => (
                  <div key={a.user_id} className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-full px-3 py-1 text-xs text-blue-700">
                    {a.name}
                    <select className="bg-transparent text-xs outline-none" value={a.role}
                      onChange={e => setForm(p=>({ ...p, assignees: p.assignees.map(x=>x.user_id===a.user_id?{...x,role:e.target.value}:x) }))}>
                      <option value="main">Main</option>
                      <option value="support">Support</option>
                    </select>
                    <button onClick={() => setForm(p=>({...p,assignees:p.assignees.filter(x=>x.user_id!==a.user_id)}))} className="text-red-400 hover:text-red-600 ml-1">×</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2 justify-end pt-2">
            <button onClick={() => setShowCreate(false)} className="btn btn-outline">Cancel</button>
            <button onClick={createTask} className="btn btn-primary">Create Task</button>
          </div>
        </div>
      </Modal>

      {/* ── Detail Modal ── */}
      <Modal show={!!showDetail} onClose={() => { setShowDetail(null); setDetailData(null); }} title="📋 Task Detail" wide>
        {!detailData ? <div className="text-center py-8 text-gray-400">Loading...</div> : (
          <div className="flex flex-col gap-5">
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <h2 className="text-lg font-bold text-[#1e2a3a]">{detailData.title}</h2>
                <div className="flex gap-2 mt-1 flex-wrap">
                  <span className={`badge ${STATUS_COLORS[detailData.status]}`}>{t(detailData.status)}</span>
                  <span className={`badge ${PRIORITY_COLORS[detailData.priority]}`}>{t(detailData.priority)}</span>
                  {detailData.status==='done' && isLate(detailData.deadline, detailData.completed_at) && <span className="badge badge-red">⚠️ Late</span>}
                  {detailData.status==='done' && !isLate(detailData.deadline, detailData.completed_at) && <span className="badge badge-green">✅ On time</span>}
                </div>
              </div>
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-3"><div className="text-xs text-gray-400 mb-1">Created by</div><div className="font-medium">{detailData.creator_name}</div></div>
              <div className="bg-gray-50 rounded-lg p-3"><div className="text-xs text-gray-400 mb-1">Group</div><div className="font-medium">{detailData.group_name || '—'}</div></div>
              <div className="bg-gray-50 rounded-lg p-3"><div className="text-xs text-gray-400 mb-1">Deadline</div><div className={`font-medium ${isLate(detailData.deadline, new Date()) && detailData.status!=='done' ? 'text-red-500' : ''}`}>{fmtDate(detailData.deadline)}</div></div>
              <div className="bg-gray-50 rounded-lg p-3"><div className="text-xs text-gray-400 mb-1">Completed</div><div className="font-medium">{fmtDate(detailData.completed_at)}</div></div>
            </div>

            {detailData.description && (
              <div><div className="text-xs text-gray-400 mb-1 font-bold uppercase tracking-wide">Description</div>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{detailData.description}</p></div>
            )}
            {detailData.tools && (
              <div><div className="text-xs text-gray-400 mb-1 font-bold uppercase tracking-wide">Tools</div>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{detailData.tools}</p></div>
            )}

            {/* Assignees */}
            {detailData.assignees?.length > 0 && (
              <div>
                <div className="text-xs text-gray-400 mb-2 font-bold uppercase tracking-wide">Assignees</div>
                <div className="flex flex-wrap gap-2">
                  {detailData.assignees.map(a => (
                    <div key={a.user_id} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${a.role==='main' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-orange-50 border-orange-200 text-orange-700'}`}>
                      <Avatar color={a.avatar_color} name={a.full_name} size={20} />
                      {a.full_name} <span className="opacity-60">({a.role})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Score */}
            {isLeader && (
              <div className="bg-blue-50 rounded-xl p-4 flex items-center gap-4">
                <div className="flex-1">
                  <div className="text-xs text-blue-600 font-bold uppercase tracking-wide mb-1">Leader Score</div>
                  {detailData.score != null ? <div className="text-2xl font-black text-blue-700">{detailData.score} pts</div> : <div className="text-gray-400 text-sm">Not scored yet</div>}
                </div>
                <div className="flex items-center gap-2">
                  <input type="number" min="0" step="0.5" placeholder="score"
                    className="input w-24 text-center font-bold text-[#3a7bd5]"
                    value={scoreInput} onChange={e=>setScoreInput(e.target.value)} />
                  <button onClick={submitScore} className="btn btn-primary text-xs">Save</button>
                </div>
              </div>
            )}

            {/* Status actions */}
            <div className="flex gap-2 flex-wrap">
              {detailData.status === 'assigned' && (
                <button onClick={() => updateStatus(detailData.id,'in_progress')} className="btn btn-outline text-xs">▶ Start</button>
              )}
              {detailData.status === 'in_progress' && (
                <button onClick={() => updateStatus(detailData.id,'done')} className="btn btn-success text-xs">✅ Mark Done</button>
              )}
              {detailData.status === 'done' && isLeader && (
                <button onClick={() => updateStatus(detailData.id,'in_progress')} className="btn btn-outline text-xs">↩ Reopen</button>
              )}
            </div>

            {/* Comments */}
            <div>
              <div className="text-xs text-gray-400 mb-3 font-bold uppercase tracking-wide">
                Comments ({detailData.comments?.length || 0})
              </div>
              <div className="flex flex-col gap-3 max-h-48 overflow-y-auto mb-3">
                {detailData.comments?.map(c => (
                  <div key={c.id} className={`flex gap-2 ${c.user_id === user?.id ? 'flex-row-reverse' : ''}`}>
                    <Avatar color={c.avatar_color} name={c.full_name} size={28} />
                    <div className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${c.user_id===user?.id ? 'bg-[#3a7bd5] text-white' : 'bg-gray-100 text-gray-800'}`}>
                      <div className="text-xs opacity-70 mb-0.5 font-semibold">{c.full_name}</div>
                      {c.message}
                      <div className="text-xs opacity-50 mt-0.5 text-right">{fmtDate(c.created_at)}</div>
                    </div>
                  </div>
                ))}
                {!detailData.comments?.length && <div className="text-center text-gray-400 text-xs py-4">No comments yet</div>}
              </div>
              <div className="flex gap-2">
                <input className="input flex-1 text-sm" placeholder="Add comment..."
                  value={comment} onChange={e=>setComment(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&sendComment()} />
                <button onClick={sendComment} className="btn btn-primary text-xs px-3">➤</button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
