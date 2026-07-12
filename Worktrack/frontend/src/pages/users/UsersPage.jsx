import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import useAuthStore from '../../store/authStore';

const C = {
  primary:'#3a7bd5', dark:'#1e2a3a', success:'#27ae60',
  warning:'#e67e22', danger:'#e74c3c', border:'#e8eaed', bg:'#f7f8fb',
};

const ROLE_STYLE = {
  admin:   { bg:'#1e2a3a', color:'#fff', border:'#1e2a3a' },
  manager: { bg:'#8e44ad22', color:'#8e44ad', border:'#8e44ad44' },
  leader:  { bg:'#eef3ff', color:'#3a7bd5', border:'#c8d8f0' },
  user:    { bg:'#f5f6f8', color:'#888', border:'#e0e0e0' },
};

const RoleBadge = ({role})=>{
  const s=ROLE_STYLE[role]||ROLE_STYLE.user;
  return <span style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:8,background:s.bg,color:s.color,border:`1px solid ${s.border}`}}>{role}</span>;
};

const Chip = ({color=C.primary,name='?',size=28})=>{
  const ini=name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  return <div style={{width:size,height:size,borderRadius:'50%',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',background:color,color:'#fff',fontSize:size>24?12:9,fontWeight:700}}>{ini}</div>;
};

const FI = {width:'100%',padding:'8px 12px',border:'1.5px solid #dde3f0',borderRadius:8,fontSize:13,color:C.dark,outline:'none',boxSizing:'border-box'};
const FL = {display:'block',fontSize:11,fontWeight:700,color:'#777',textTransform:'uppercase',letterSpacing:'0.4px',marginBottom:5};

function Modal({show,title,onClose,children,width=460}){
  if(!show) return null;
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.4)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:16,backdropFilter:'blur(2px)',WebkitBackdropFilter:'blur(2px)'}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="users-modal-box" style={{background:'#fff',borderRadius:14,padding:26,width,maxWidth:'95vw',maxHeight:'90vh',overflowY:'auto',boxShadow:'0 10px 40px rgba(0,0,0,.2)'}}>
        <div style={{fontSize:15,fontWeight:800,color:C.dark,marginBottom:18,display:'flex',alignItems:'center',gap:8}}>
          {title}
          <button onClick={onClose} style={{marginLeft:'auto',background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#aaa',lineHeight:1}}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const TABS = [
  {key:'users',       icon:'👤', tkey:'users_tab_users'},
  {key:'groups',      icon:'🏭', tkey:'users_tab_groups'},
  {key:'permissions', icon:'🔐', tkey:'users_tab_permissions'},
  {key:'import',      icon:'📥', tkey:'users_tab_import'},
];

const PERMS = [
  ['users_perm_1', true, true, true, true ],
  ['users_perm_2', true, true, true, false],
  ['users_perm_3', true, true, true, false],
  ['users_perm_4', true, true, true, true ],
  ['users_perm_5', true, true, true, false],
  ['users_perm_6', true, true, false,false],
  ['users_perm_7', true, true, false,false],
  ['users_perm_8', true, false,false,false],
  ['users_perm_9', true, false,false,false],
];


// Gen username: Nguyễn Văn A → a.nv (tên đầu + viết tắt họ đệm)
const genUsername = (fullName) => {
  const parts = fullName.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().split(/\s+/);
  if (!parts.length) return '';
  const firstName = parts[parts.length - 1]; // tên
  const initials  = parts.slice(0, parts.length - 1).map(p => p[0]).join(''); // viết tắt họ + đệm
  return (firstName + (initials ? '.' + initials : '')).replace(/[^a-z0-9.]/g, '');
};

export default function UsersPage(){
  const { t, i18n } = useTranslation();
  const currentLocale = { vi:'vi-VN', en:'en-US', ja:'ja-JP' }[i18n.language] || 'vi-VN';
  const { user: currentUser } = useAuthStore(); // user đang đăng nhập — dùng để giới hạn quyền trên UI
  const [tab,      setTab]      = useState('users');
  const [users,    setUsers]    = useState([]);
  const [groups,   setGroups]   = useState([]);
  const [search,   setSearch]   = useState('');
  const [roleF,    setRoleF]    = useState('');
  const [groupF,   setGroupF]   = useState('');

  // Modals
  const [showAddUser,   setShowAddUser]   = useState(false);
  const [showAddGroup,  setShowAddGroup]  = useState(false);
  const [showAddMember, setShowAddMember] = useState(null);
  const [editUser,      setEditUser]      = useState(null);
  const [editGroup,     setEditGroup]     = useState(null);

  // Import
  const [importFile,    setImportFile]    = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importing,     setImporting]     = useState(false);
  const fileRef = useRef();

  useEffect(()=>{ fetchUsers(); fetchGroups(); },[search,roleF,groupF]);

  const fetchUsers = async()=>{
    try {
      const p = new URLSearchParams();
      if(search)  p.append('search',search);
      if(roleF)   p.append('role',roleF);
      if(groupF)  p.append('group_id',groupF);
      const {data} = await api.get(`/users?${p}`);
      setUsers(data.data||[]);
    } catch(e){ console.error(e); }
  };

  const fetchGroups = async()=>{
    try {
      const {data} = await api.get('/groups');
      setGroups(data.data||[]);
    } catch(e){ console.error(e); }
  };

  // ── User CRUD ──
  const createUser = async(form)=>{
    try { await api.post('/users',form); setShowAddUser(false); fetchUsers(); }
    catch(e){ alert(e.response?.data?.message||e.message); }
  };

  const updateUser = async(id,form)=>{
    try { await api.put(`/users/${id}`,form); setEditUser(null); fetchUsers(); }
    catch(e){ alert(e.message); }
  };

  const toggleActive = async(u)=>{
    try { await api.put(`/users/${u.id}`,{is_active:u.is_active?0:1}); fetchUsers(); }
    catch(e){ alert(e.message); }
  };

  const resetPwd = async(id)=>{
    const pw = prompt(t('users_prompt_new_password'));
    if(!pw) return;
    try { await api.post(`/users/${id}/reset-password`,{password:pw}); alert(`✅ ${t('users_password_changed')}`); }
    catch(e){ alert(e.message); }
  };

  const deleteUser = async(u)=>{
    if(!confirm(t('users_confirm_delete_user',{name:u.full_name}))) return;
    try { await api.delete(`/users/${u.id}`); fetchUsers(); }
    catch(e){ alert(e.response?.data?.message||e.message); }
  };

  // ── Group CRUD ──
  const createGroup = async(form)=>{
    try { await api.post('/groups',form); setShowAddGroup(false); fetchGroups(); }
    catch(e){ alert(e.response?.data?.message||e.message); }
  };

  const updateGroup = async(id,form)=>{
    try { await api.put(`/groups/${id}`,form); setEditGroup(null); fetchGroups(); }
    catch(e){ alert(e.message); }
  };

  const deleteGroup = async(id)=>{
    if(!confirm(t('users_confirm_delete_group'))) return;
    try { await api.delete(`/groups/${id}`); fetchGroups(); }
    catch(e){ alert(e.message); }
  };

  const addMember = async(groupId,userId)=>{
    try { await api.post(`/groups/${groupId}/members`,{user_id:userId}); fetchGroups(); }
    catch(e){ alert(e.message); }
  };

  const removeMember = async(groupId,userId)=>{
    try { await api.delete(`/groups/${groupId}/members/${userId}`); fetchGroups(); }
    catch(e){ alert(e.message); }
  };

  // ── Import ──
  const handleFileChange = async(e)=>{
    const file = e.target.files[0];
    if(!file) return;
    setImportFile(file);
    // Đọc file — hỗ trợ UTF-8, UTF-8 BOM, Windows-1252 (Excel mặc định)
    const readFile = (f, enc) => new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload  = e => res(e.target.result);
      reader.onerror = rej;
      reader.readAsText(f, enc);
    });

    const buffer = await file.arrayBuffer();
    const bytes  = new Uint8Array(buffer);

    // Detect BOM
    let text = '';
    if (bytes[0]===0xEF && bytes[1]===0xBB && bytes[2]===0xBF) {
      // UTF-8 BOM
      text = await readFile(file, 'utf-8');
    } else if (bytes[0]===0xFF && bytes[1]===0xFE) {
      // UTF-16 LE BOM
      text = new TextDecoder('utf-16le').decode(buffer);
    } else {
      // Thử UTF-8 trước
      const utf8 = new TextDecoder('utf-8').decode(buffer);
      // Kiểm tra có ký tự lỗi không (dấu hiệu ANSI)
      const hasGarbled = /[�Ãáà]/.test(utf8.slice(0,200));
      if (hasGarbled) {
        text = await readFile(file, 'windows-1252');
      } else {
        text = utf8;
      }
    }
    text = text.replace(/^\uFEFF/, ''); // strip BOM
    const lines = text.trim().split(/\r?\n/).map(l=>l.trim()).filter(Boolean).slice(0, 500);

    // Bỏ qua dòng header
    const isHeader = l => /^(h[oọ]\s*t[eê]n|full.?name|name|email|stt)/i.test(l.split(',')[0].trim());
    const dataLines = lines.filter(l => !isHeader(l));

    const rows = dataLines.map(line => {
      const parts = line.split(',').map(s => s.trim());
      const full_name = parts[0] || '';
      const email     = parts[1] || '';
      const role      = parts[2] || '';
      const group     = parts[3] || '';
      const valid     = full_name.length > 1;
      return { full_name, email, role: role||'user', group, valid };
    });
    setImportPreview(rows);
  };

  const doImport = async()=>{
    if(!importPreview) return;
    setImporting(true);
    try {
      const rows = importPreview.filter(r=>r.valid).map(r=>({
        full_name:  r.full_name,
        email:      r.email||'',
        role:       r.role||'user',
        group_name: r.group||'',
        username:   genUsername(r.full_name),
        password:   'Welcome00',
      }));
      const {data} = await api.post('/users/import',{users:rows});
      const res = data.data;
      let msg = `✅ ${t('users_import_created',{count:res.created})}`;
      if (res.duplicates?.length) msg += `\n⚠️ ${t('users_import_duplicates',{count:res.duplicates.length})}:`;
      res.duplicates?.forEach(d => { msg += `\n  • ${t('users_import_duplicate_line',{name:d.name, username:d.username, existing:d.existing})}`; });
      if (res.errors?.length)     msg += `\n❌ ${t('users_import_errors')}: ${res.errors.map(e=>e.name).join(', ')}`;
      alert(msg);
      setImportPreview(null); setImportFile(null);
      fetchUsers(); fetchGroups();
    } catch(e){ alert(e.message); }
    finally{ setImporting(false); }
  };

  const validCount   = importPreview?.filter(r=>r.valid).length||0;
  const invalidCount = importPreview?.filter(r=>!r.valid).length||0;

  return (
    <div className="users-root" style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',background:'#fff',minWidth:0}}>
      <style>{`
        .users-root { box-sizing: border-box; }
        .users-root *, .users-root *::before, .users-root *::after { box-sizing: border-box; }

        /* ── Cảm giác chạm mượt & phản hồi khi nhấn ── */
        .users-root button { -webkit-tap-highlight-color: transparent; touch-action: manipulation; transition: transform .1s ease, background .15s, color .15s, border-color .15s; }
        .users-root button:active { transform: scale(0.96); }
        .users-root tbody tr { -webkit-tap-highlight-color: transparent; }

        /* ── Focus rõ ràng cho bàn phím (a11y) ── */
        .users-root *:focus-visible { outline: 2px solid ${C.primary}; outline-offset: 2px; border-radius: 4px; }

        /* ── Chặn Safari iOS tự zoom khi focus input/select ── */
        .users-root input:focus, .users-root select:focus { font-size: 16px !important; }

        /* ── Thanh cuộn mảnh, đẹp trên desktop ── */
        .users-root ::-webkit-scrollbar { width: 8px; height: 8px; }
        .users-root ::-webkit-scrollbar-track { background: transparent; }
        .users-root ::-webkit-scrollbar-thumb { background: #c8d4e6; border-radius: 8px; }
        .users-root ::-webkit-scrollbar-thumb:hover { background: #aebedb; }

        @keyframes usersFadeIn { from { opacity: 0; transform: translateY(-6px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .users-root .users-modal-box { animation: usersFadeIn .16s ease-out; }

        @media (prefers-reduced-motion: reduce) {
          .users-root, .users-root * { animation: none !important; transition: none !important; }
        }

        @media (max-width: 900px) {
          .users-root .users-topbar { flex-wrap: wrap !important; padding: 10px 14px !important; gap: 8px !important; }
          .users-root .users-title { flex-basis: 100% !important; }
          .users-root .users-topbar button { flex: 1 1 auto !important; justify-content: center !important; }

          .users-root .users-tabs { overflow-x: auto !important; padding: 0 10px !important; }
          .users-root .users-tab-item { flex-shrink: 0 !important; white-space: nowrap !important; }

          .users-root .users-toolbar { flex-wrap: wrap !important; padding: 10px 14px !important; }
          .users-root .users-toolbar input, .users-root .users-toolbar select { width: auto !important; flex: 1 1 130px !important; }
          .users-root .users-toolbar-count { flex-basis: 100% !important; text-align: right !important; }

          .users-root .users-table-panel { padding: 10px 12px !important; }
          .users-root .users-group-header { flex-wrap: wrap !important; row-gap: 8px !important; }
        }
      `}</style>

      {/* Topbar */}
      <div className="users-topbar" style={{padding:'12px 20px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:10,background:'#fff',flexShrink:0}}>
        <div className="users-title" style={{fontSize:15,fontWeight:800,color:C.dark,flex:1}}>👥 {t('nav_users')}</div>
        {tab==='users'&&<>
          <button onClick={()=>setTab('import')}
            style={{padding:'6px 14px',borderRadius:7,border:`1.5px solid ${C.border}`,background:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',color:'#555',display:'flex',alignItems:'center',gap:5}}>
            📥 {t('users_import_user')}
          </button>
          <button onClick={()=>setShowAddUser(true)}
            style={{padding:'6px 14px',borderRadius:7,border:'none',background:C.primary,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:5}}>
            ➕ {t('users_add_user')}
          </button>
        </>}
        {tab==='groups'&&(
          <button onClick={()=>setShowAddGroup(true)}
            style={{padding:'6px 14px',borderRadius:7,border:'none',background:C.primary,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:5}}>
            ➕ {t('users_create_group')}
          </button>
        )}
      </div>

      {/* Sub tabs */}
      <div className="users-tabs" style={{display:'flex',borderBottom:`2px solid ${C.border}`,background:'#fff',padding:'0 20px',flexShrink:0}}>
        {TABS.map(tabItem=>(
          <div key={tabItem.key} className="users-tab-item" onClick={()=>setTab(tabItem.key)} style={{
            padding:'11px 20px',fontSize:13,fontWeight:600,cursor:'pointer',
            borderBottom:`2.5px solid ${tab===tabItem.key?C.primary:'transparent'}`,
            marginBottom:-2,color:tab===tabItem.key?C.primary:'#888',
            display:'flex',alignItems:'center',gap:6,
          }}>
            {tabItem.icon} {t(tabItem.tkey)}
            {tabItem.key==='users' &&<span style={{background:'#eef3ff',color:C.primary,fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:8}}>{users.length}</span>}
            {tabItem.key==='groups'&&<span style={{background:'#eef3ff',color:C.primary,fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:8}}>{groups.length}</span>}
          </div>
        ))}
      </div>

      {/* ═══ PANEL: Users ═══ */}
      {tab==='users'&&(
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          {/* Toolbar */}
          <div className="users-toolbar" style={{padding:'10px 20px',background:'#fff',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
            <input style={{...FI,width:220,padding:'7px 12px'}} placeholder={`🔍 ${t('users_search_placeholder')}`}
              value={search} onChange={e=>setSearch(e.target.value)}/>
            <select style={{...FI,width:160,padding:'7px 12px'}} value={groupF} onChange={e=>setGroupF(e.target.value)}>
              <option value="">{t('users_all_groups')}</option>
              {groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <select style={{...FI,width:150,padding:'7px 12px'}} value={roleF} onChange={e=>setRoleF(e.target.value)}>
              <option value="">{t('users_all_roles')}</option>
              {['admin','manager','leader','user'].map(r=><option key={r} value={r}>{r}</option>)}
            </select>
            <div style={{flex:1}}/>
            <span className="users-toolbar-count" style={{fontSize:12,color:'#aaa'}}>{t('users_people_count',{count:users.length})}</span>
          </div>

          {/* Table */}
          <div className="users-table-panel" style={{flex:1,overflowY:'auto',padding:'16px 20px',background:C.bg}}>
            <div style={{overflowX:'auto',borderRadius:12,WebkitOverflowScrolling:'touch'}}>
            <table style={{width:'100%',borderCollapse:'collapse',background:'#fff',borderRadius:12,overflow:'hidden',border:`1.5px solid ${C.border}`,boxShadow:'0 2px 8px rgba(0,0,0,.05)',minWidth:680}}>
              <thead>
                <tr>
                  {[t('users_th_employee'),t('users_th_role'),t('group'),t('status'),t('users_th_created_at'),''].map(h=>(
                    <th key={h} style={{background:'#1e2a3a',color:'#9db8d2',fontSize:11,fontWeight:700,padding:'12px 16px',textAlign:'left',borderBottom:'1px solid #2d3f52',textTransform:'uppercase',letterSpacing:'0.4px',whiteSpace:'nowrap'}}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u=>(
                  <tr key={u.id} style={{borderBottom:`1px solid ${C.bg}`}}
                    onMouseEnter={e=>e.currentTarget.style.background='#f0f4ff'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <td style={{padding:'11px 16px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <Chip color={u.avatar_color||C.primary} name={u.full_name} size={32}/>
                        <div>
                          <div style={{fontSize:13,fontWeight:700,color:C.dark}}>{u.full_name}</div>
                          <div style={{fontSize:11,color:'#aaa'}}>{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{padding:'11px 16px'}}><RoleBadge role={u.role}/></td>
                    <td style={{padding:'11px 16px'}}>
                      <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                        {u.groups?.length
                          ? u.groups.map(g=><span key={g.id} style={{fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:6,background:'#f0f2f8',color:'#555',border:`1px solid ${C.border}`}}>{g.name}</span>)
                          : <span style={{color:'#ccc',fontSize:12}}>—</span>
                        }
                      </div>
                    </td>
                    <td style={{padding:'11px 16px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:5}}>
                        <div style={{width:8,height:8,borderRadius:'50%',background:u.is_active?C.success:C.danger}}/>
                        <span style={{fontSize:12,color:u.is_active?C.success:C.danger}}>{u.is_active?t('users_active'):t('users_locked')}</span>
                      </div>
                    </td>
                    <td style={{padding:'11px 16px',fontSize:12,color:'#aaa'}}>
                      {u.created_at?new Date(u.created_at).toLocaleDateString(currentLocale):'—'}
                    </td>
                    <td style={{padding:'11px 16px'}}>
                      <div style={{display:'flex',gap:5}}>
                        <button onClick={()=>setEditUser({...u})} title={t('edit')}
                          style={{width:28,height:28,borderRadius:6,border:`1px solid ${C.border}`,background:'#fff',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:13}}>✏️</button>
                        <button onClick={()=>resetPwd(u.id)} title={t('users_reset_password')}
                          style={{width:28,height:28,borderRadius:6,border:`1px solid ${C.border}`,background:'#fff',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:13}}>🔑</button>
                        <button onClick={()=>toggleActive(u)} title={u.is_active?t('users_lock'):t('users_unlock')}
                          style={{width:28,height:28,borderRadius:6,border:`1px solid ${u.is_active?'#fde8e8':'#e8f8ee'}`,background:u.is_active?'#fde8e8':'#e8f8ee',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:13}}>
                          {u.is_active?'🔒':'🔓'}
                        </button>
                        <button onClick={()=>deleteUser(u)} title={t('users_delete_user')}
                          style={{width:28,height:28,borderRadius:6,border:'1px solid #fde8e8',background:'#fde8e8',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:13}}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!users.length&&(
                  <tr><td colSpan={6} style={{textAlign:'center',padding:40,color:'#bbb',fontSize:13}}>{t('users_no_users')}</td></tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══ PANEL: Groups ═══ */}
      {tab==='groups'&&(
        <div style={{flex:1,overflowY:'auto',padding:'16px 20px',background:C.bg,display:'flex',flexDirection:'column',gap:12}}>
          {groups.map(g=>(
            <div key={g.id} style={{background:'#fff',borderRadius:12,border:`1.5px solid ${C.border}`,overflow:'hidden'}}>
              {/* Header */}
              <div className="users-group-header" style={{padding:'13px 18px',background:C.bg,borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:12}}>
                <span style={{fontSize:20}}>{g.icon||'🏭'}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:800,color:C.dark}}>{g.name}</div>
                  <div style={{fontSize:11,color:'#aaa',marginTop:2}}>{t('users_member_count',{count:g.member_count||g.members?.length||0})}</div>
                </div>
                {/* Leader chip */}
                {g.leader_name&&(
                  <div style={{display:'flex',alignItems:'center',gap:6,background:'#eef3ff',border:'1px solid #c8d8f0',padding:'4px 10px',borderRadius:20,fontSize:12,color:C.primary,fontWeight:600}}>
                    <div style={{width:20,height:20,borderRadius:'50%',background:C.primary,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:9,fontWeight:700}}>
                      {g.leader_name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                    </div>
                    {t('req_leader_label')}: {g.leader_name}
                  </div>
                )}
                <button onClick={()=>setShowAddMember(g)}
                  style={{padding:'5px 12px',borderRadius:7,border:'none',background:C.primary,color:'#fff',fontSize:11,fontWeight:600,cursor:'pointer'}}>
                  ➕ {t('users_add_member')}
                </button>
                <button onClick={()=>setEditGroup({...g})}
                  style={{padding:'5px 12px',borderRadius:7,border:`1.5px solid ${C.border}`,background:'#fff',fontSize:11,fontWeight:600,cursor:'pointer',color:'#555'}}>
                  ✏️ {t('edit')}
                </button>
                <button onClick={()=>deleteGroup(g.id)}
                  style={{padding:'5px 10px',borderRadius:7,border:'1px solid #fde8e8',background:'#fde8e8',fontSize:11,fontWeight:600,cursor:'pointer',color:C.danger}}>
                  🗑
                </button>
              </div>

              {/* Members */}
              <div style={{padding:'14px 18px'}}>
                <div style={{fontSize:11,fontWeight:700,color:'#888',textTransform:'uppercase',letterSpacing:'0.4px',marginBottom:10}}>{t('users_members_label')}</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                  {(g.members||[]).map(m=>(
                    <div key={m.id} style={{display:'flex',alignItems:'center',gap:7,padding:'6px 12px',borderRadius:20,background:C.bg,border:`1.5px solid ${C.border}`,fontSize:12,color:'#333',fontWeight:500}}>
                      <Chip color={m.avatar_color||C.primary} name={m.full_name} size={22}/>
                      {m.full_name}
                      {g.leader_id===m.id&&<span style={{fontSize:10,background:'#e8f8ee',color:C.success,fontWeight:700,padding:'1px 6px',borderRadius:8}}>{t('req_leader_label')}</span>}
                      <span onClick={()=>removeMember(g.id,m.id)}
                        style={{cursor:'pointer',color:'#bbb',fontSize:14,marginLeft:2,lineHeight:1}}
                        onMouseEnter={e=>e.target.style.color=C.danger}
                        onMouseLeave={e=>e.target.style.color='#bbb'}>×</span>
                    </div>
                  ))}
                  {!(g.members||[]).length&&<span style={{fontSize:12,color:'#bbb'}}>{t('users_no_members')}</span>}
                  <div onClick={()=>setShowAddMember(g)}
                    style={{display:'flex',alignItems:'center',gap:6,padding:'6px 12px',borderRadius:20,border:'1.5px dashed #c0cce0',color:'#7a9bbf',fontSize:12,cursor:'pointer'}}
                    onMouseEnter={e=>{ e.currentTarget.style.borderColor=C.primary; e.currentTarget.style.color=C.primary; e.currentTarget.style.background='#f0f4ff'; }}
                    onMouseLeave={e=>{ e.currentTarget.style.borderColor='#c0cce0'; e.currentTarget.style.color='#7a9bbf'; e.currentTarget.style.background='transparent'; }}>
                    ➕ {t('add')}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div style={{padding:'10px 18px',borderTop:`1px solid #f0f2f8`,display:'flex',gap:8,justifyContent:'flex-end',background:'#fafbfc'}}>
                <div style={{fontSize:11,color:C.primary,flex:1}}>
                  💡 {t('users_group_hint')}
                </div>
              </div>
            </div>
          ))}

          {/* Add group card */}
          <div onClick={()=>setShowAddGroup(true)}
            style={{display:'flex',alignItems:'center',gap:10,padding:'16px 18px',background:'#fff',borderRadius:12,border:'2px dashed #c0cce0',color:'#7a9bbf',fontSize:14,fontWeight:600,cursor:'pointer',justifyContent:'center'}}
            onMouseEnter={e=>{ e.currentTarget.style.borderColor=C.primary; e.currentTarget.style.color=C.primary; e.currentTarget.style.background='#f0f4ff'; }}
            onMouseLeave={e=>{ e.currentTarget.style.borderColor='#c0cce0'; e.currentTarget.style.color='#7a9bbf'; e.currentTarget.style.background='#fff'; }}>
            ➕ {t('users_create_new_group')}
          </div>
        </div>
      )}

      {/* ═══ PANEL: Permissions ═══ */}
      {tab==='permissions'&&(
        <div style={{flex:1,overflowY:'auto',padding:'16px 20px',background:C.bg}}>
          <div style={{background:'#fff',borderRadius:12,border:`1.5px solid ${C.border}`,overflow:'hidden'}}>
            <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`,fontWeight:700,color:C.dark,fontSize:13}}>
              🔐 {t('users_permissions_table')}
            </div>
            <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:520}}>
              <thead>
                <tr style={{background:C.bg}}>
                  <th style={{padding:'8px 12px',textAlign:'left',fontSize:11,fontWeight:700,color:'#888',borderBottom:`1px solid ${C.border}`,minWidth:260}}>{t('users_th_feature')}</th>
                  {['Admin','Manager','Leader','User'].map(r=>(
                    <th key={r} style={{padding:'8px 12px',textAlign:'center',fontSize:11,fontWeight:700,color:'#888',borderBottom:`1px solid ${C.border}`}}>
                      <RoleBadge role={r.toLowerCase()}/>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMS.map(([feat,...vals])=>(
                  <tr key={feat} style={{borderBottom:`1px solid #f5f6f8`}}>
                    <td style={{padding:'9px 12px',color:'#555'}}>{t(feat)}</td>
                    {vals.map((v,i)=>(
                      <td key={i} style={{padding:'9px 12px',textAlign:'center'}}>
                        {v?<span style={{color:C.success,fontWeight:700,fontSize:14}}>✓</span>:<span style={{color:'#ddd',fontSize:14}}>—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══ PANEL: Import ═══ */}
      {tab==='import'&&(
        <div style={{flex:1,overflowY:'auto',padding:20,background:C.bg,display:'flex',flexDirection:'column',gap:14}}>
          <div style={{background:'#fff',borderRadius:12,border:`1.5px solid ${C.border}`,padding:20}}>
            <div style={{fontSize:14,fontWeight:800,color:C.dark,marginBottom:6,display:'flex',alignItems:'center',gap:8}}>
              📥 {t('users_import_from_csv')}
            </div>
            <div style={{fontSize:12,color:'#888',marginBottom:16,lineHeight:1.6}}>
              {t('users_csv_format')}: <code style={{background:'#f0f2f8',padding:'1px 6px',borderRadius:4}}>{t('users_csv_columns')}</code>
              <br/>{t('users_csv_hint')} <code style={{background:'#f0f2f8',padding:'1px 6px',borderRadius:4}}>Welcome00</code>
            </div>

            {/* Upload zone */}
            <div onClick={()=>fileRef.current.click()}
              style={{border:'2.5px dashed #c0cce0',borderRadius:10,padding:28,textAlign:'center',cursor:'pointer',transition:'all .15s'}}
              onMouseEnter={e=>{ e.currentTarget.style.borderColor=C.primary; e.currentTarget.style.background='#f0f4ff'; }}
              onMouseLeave={e=>{ e.currentTarget.style.borderColor='#c0cce0'; e.currentTarget.style.background='transparent'; }}>
              <div style={{fontSize:36,marginBottom:10}}>📊</div>
              <div style={{fontSize:13,color:'#888'}}>
                {t('users_drop_or')} <strong style={{color:C.primary}}>{t('users_click_to_choose')}</strong>
              </div>
              <div style={{fontSize:11,color:'#bbb',marginTop:6}}>{t('users_file_types_limit')}</div>
              {importFile&&<div style={{fontSize:12,color:C.primary,marginTop:8,fontWeight:600}}>📎 {importFile.name}</div>}
            </div>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{display:'none'}} onChange={handleFileChange}/>

            <button onClick={()=>{
                const csv = [
                  t('users_csv_columns'),
                  'Nguyễn Văn A,nva@company.com,user,MES',
                  'Trần Thị B,,,',
                  'Lê Văn C,lvc@company.com,leader,Bảo trì',
                ].join('\n');
                const BOM = '\uFEFF';
                const blob = new Blob([BOM + csv], {type:'text/csv;charset=utf-8;'});
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement('a');
                a.href     = url;
                a.download = 'mau_import_user.csv';
                a.click();
                URL.revokeObjectURL(url);
              }}
              style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 16px',borderRadius:8,border:`1.5px solid ${C.border}`,background:'#fff',fontSize:12,fontWeight:600,color:'#555',cursor:'pointer',marginTop:12}}>
              ⬇️ {t('users_download_sample')}
            </button>

            {/* Preview */}
            {importPreview&&(
              <div style={{marginTop:16}}>
                <div style={{fontSize:12,fontWeight:700,color:C.dark,marginBottom:8,display:'flex',alignItems:'center',gap:8}}>
                  {t('users_preview_data')}
                  {validCount>0&&<span style={{fontSize:11,background:'#e8f8ee',color:C.success,fontWeight:700,padding:'2px 8px',borderRadius:8}}>{t('users_valid_count',{count:validCount})}</span>}
                  {invalidCount>0&&<span style={{fontSize:11,background:'#fde8e8',color:C.danger,fontWeight:700,padding:'2px 8px',borderRadius:8}}>{t('users_invalid_count',{count:invalidCount})}</span>}
                </div>
                <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:640}}>
                  <thead>
                    <tr style={{background:C.bg}}>
                      {[t('users_th_stt'),t('users_th_employee'),'Email',t('users_th_role_col'),t('group'),t('users_th_username'),t('status')].map(h=>(
                        <th key={h} style={{padding:'6px 10px',textAlign:'left',borderBottom:`1px solid ${C.border}`,color:'#888',fontSize:11,whiteSpace:'nowrap'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.map((row,i)=>{
                      const uname = genUsername(row.full_name||'');
                      return (
                        <tr key={i} style={{borderBottom:`1px solid #f5f6f8`,background:row.valid?'transparent':'#fffafa'}}>
                          <td style={{padding:'6px 10px',color:'#aaa',fontSize:11}}>{i+1}</td>
                          <td style={{padding:'6px 10px',fontWeight:600,color:row.valid?C.dark:C.danger,fontSize:12}}>{row.full_name||'—'}</td>
                          <td style={{padding:'6px 10px',color:'#555',fontSize:11}}>{row.email||<span style={{color:'#ccc'}}>—</span>}</td>
                          <td style={{padding:'6px 10px'}}><RoleBadge role={row.role||'user'}/></td>
                          <td style={{padding:'6px 10px',color:'#555',fontSize:11}}>{row.group||<span style={{color:'#ccc'}}>—</span>}</td>
                          <td style={{padding:'6px 10px',color:'#555',fontSize:11,fontFamily:'monospace'}}>{uname}</td>
                          <td style={{padding:'6px 10px',color:row.valid?C.success:C.danger,fontWeight:700,fontSize:11}}>
                            {row.valid?'✓':`✗ ${t('users_empty_name')}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
                <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:12,flexWrap:'wrap'}}>
                  <button onClick={()=>{ setImportPreview(null); setImportFile(null); }}
                    style={{padding:'7px 16px',borderRadius:8,border:`1.5px solid ${C.border}`,background:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',color:'#555'}}>
                    ✕ {t('cancel')}
                  </button>
                  <button onClick={doImport} disabled={importing||validCount===0}
                    style={{padding:'7px 16px',borderRadius:8,border:'none',background:importing||validCount===0?'#aaa':C.success,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                    {importing?'...':`✓ ${t('users_import_valid_btn',{count:validCount})}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ Modal: Thêm user ══ */}
      <AddUserModal show={showAddUser} groups={groups} currentUserRole={currentUser?.role} onClose={()=>setShowAddUser(false)} onSave={createUser}/>

      {/* ══ Modal: Sửa user ══ */}
      <EditUserModal show={!!editUser} user={editUser} groups={groups} currentUserRole={currentUser?.role} onClose={()=>setEditUser(null)} onSave={f=>updateUser(editUser.id,f)}/>

      {/* ══ Modal: Tạo nhóm ══ */}
      <AddGroupModal show={showAddGroup} users={users} onClose={()=>setShowAddGroup(false)} onSave={createGroup}/>

      {/* ══ Modal: Sửa nhóm ══ */}
      <EditGroupModal show={!!editGroup} group={editGroup} users={users} onClose={()=>setEditGroup(null)}
        onSave={f=>updateGroup(editGroup.id,f)}/>

      {/* ══ Modal: Thêm member ══ */}
      <AddMemberModal show={!!showAddMember} group={showAddMember} users={users} onClose={()=>setShowAddMember(null)}
        onAdd={(uid)=>addMember(showAddMember.id,uid)}/>
    </div>
  );
}

// ── Modal: Thêm user ──
// currentUserRole: role của người đang thao tác — nếu là 'leader' thì ẩn hẳn dropdown role
// và luôn khóa cứng role='user' khi gửi lên server (double-check, backend cũng đã chặn).
function AddUserModal({show,groups,currentUserRole,onClose,onSave}){
  const { t } = useTranslation();
  const isLeader = currentUserRole === 'leader';
  const [f,setF]=useState({username:'',email:'',full_name:'',role:'user',password:'',avatar_color:'#3a7bd5',group_id:''});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const submit=()=>{
    if(!f.username||!f.full_name||!f.password) return alert(t('users_fill_all'));
    onSave(isLeader ? {...f, role:'user'} : f);
  };
  return (
    <Modal show={show} title={`➕ ${t('users_add_new_user')}`} onClose={onClose}>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
          <div style={{flex:'1 1 160px'}}><label style={FL}>{t('profile_fullname')} *</label><input style={FI} value={f.full_name} onChange={e=>s('full_name',e.target.value)} placeholder="Nguyễn Văn A"/></div>
          <div style={{flex:'1 1 160px'}}><label style={FL}>Username *</label><input style={FI} value={f.username} onChange={e=>s('username',e.target.value)} placeholder="nguyenvana"/></div>
        </div>
        <div><label style={FL}>Email *</label><input type="email" style={FI} value={f.email} onChange={e=>s('email',e.target.value)} placeholder="email@company.com"/></div>
        <div><label style={FL}>{t('password')} *</label><input type="password" style={FI} value={f.password} onChange={e=>s('password',e.target.value)}/></div>
        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
          {/* Leader không thấy dropdown role — luôn tạo với quyền 'user' */}
          {!isLeader && (
            <div style={{flex:'1 1 140px'}}>
              <label style={FL}>{t('users_th_role_col')}</label>
              <select style={FI} value={f.role} onChange={e=>s('role',e.target.value)}>
                {['user','leader','manager','admin'].map(r=><option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}
          <div style={{flex:'1 1 140px'}}>
            <label style={FL}>{t('group')}</label>
            <select style={FI} value={f.group_id} onChange={e=>s('group_id',e.target.value)}>
              <option value="">-- {t('users_choose_group')} --</option>
              {groups.map(g=><option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}
            </select>
          </div>
        </div>
        <div><label style={FL}>{t('profile_avatar_color')}</label><input type="color" style={{...FI,height:38,cursor:'pointer'}} value={f.avatar_color} onChange={e=>s('avatar_color',e.target.value)}/></div>
        <div style={{fontSize:11,color:'#aaa',background:C.bg,padding:'8px 12px',borderRadius:8}}>
          💡 {t('users_password_hint')}
        </div>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{padding:'7px 16px',borderRadius:8,border:`1.5px solid ${C.border}`,background:'#fff',fontSize:13,fontWeight:600,cursor:'pointer',color:'#555'}}>{t('cancel')}</button>
          <button onClick={submit} style={{padding:'7px 16px',borderRadius:8,border:'none',background:C.primary,color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>💾 {t('users_create_user_btn')}</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Modal: Sửa user ──
// currentUserRole: nếu là 'leader', cũng ẩn dropdown role như AddUserModal (phòng khi
// sau này leader được cấp quyền vào danh sách user để sửa thông tin).
function EditUserModal({show,user,groups=[],currentUserRole,onClose,onSave}){
  const { t } = useTranslation();
  const isLeader = currentUserRole === 'leader';
  const [f,setF]=useState({});
  useEffect(()=>{
    if(user) setF({
      full_name:user.full_name,
      email:user.email,
      role:user.role,
      group_id: user.groups?.[0]?.id||'',
      avatar_color: user.avatar_color||'#3a7bd5',
    });
  },[user]);
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const submit=()=>{
    onSave(isLeader ? {...f, role:f.role} : f); // leader không có UI đổi role nên giữ nguyên role gốc
  };
  return (
    <Modal show={show} title={`✏️ ${t('users_edit_employee')}`} onClose={onClose}>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <div><label style={FL}>{t('profile_fullname')}</label><input style={FI} value={f.full_name||''} onChange={e=>s('full_name',e.target.value)}/></div>
        <div><label style={FL}>Email</label><input type="email" style={FI} value={f.email||''} onChange={e=>s('email',e.target.value)}/></div>
        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
          {!isLeader && (
            <div style={{flex:'1 1 140px'}}>
              <label style={FL}>{t('users_th_role_col')}</label>
              <select style={FI} value={f.role||'user'} onChange={e=>s('role',e.target.value)}>
                {['user','leader','manager','admin'].map(r=><option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}
          <div style={{flex:'1 1 140px'}}>
            <label style={FL}>{t('group')}</label>
            <select style={FI} value={f.group_id||''} onChange={e=>s('group_id',e.target.value)}>
              <option value="">-- {t('users_no_group')} --</option>
              {groups.map(g=><option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label style={FL}>{t('profile_avatar_color')}</label>
          <input type="color" style={{...FI,height:38,cursor:'pointer'}} value={f.avatar_color||'#3a7bd5'} onChange={e=>s('avatar_color',e.target.value)}/>
        </div>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{padding:'7px 16px',borderRadius:8,border:`1.5px solid ${C.border}`,background:'#fff',fontSize:13,fontWeight:600,cursor:'pointer',color:'#555'}}>{t('cancel')}</button>
          <button onClick={submit} style={{padding:'7px 16px',borderRadius:8,border:'none',background:C.primary,color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>💾 {t('save')}</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Modal: Tạo nhóm ──
function AddGroupModal({show,users,onClose,onSave}){
  const { t } = useTranslation();
  const [f,setF]=useState({name:'',icon:'🏭',leader_id:''});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const leaders=users.filter(u=>['admin','manager','leader'].includes(u.role));
  const submit=()=>{ if(!f.name.trim()) return alert(t('users_enter_group_name')); onSave(f); setF({name:'',icon:'🏭',leader_id:''}); };
  return (
    <Modal show={show} title={`🏭 ${t('users_create_new_group')}`} onClose={onClose}>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <div><label style={FL}>{t('users_group_name')} *</label><input style={FI} value={f.name} onChange={e=>s('name',e.target.value)} placeholder={t('users_group_name_placeholder')} autoFocus/></div>
        <div><label style={FL}>Icon</label><input style={FI} value={f.icon} onChange={e=>s('icon',e.target.value)} placeholder={t('users_icon_placeholder')}/></div>
        <div>
          <label style={FL}>{t('users_group_leader')} *</label>
          <select style={FI} value={f.leader_id} onChange={e=>s('leader_id',e.target.value)}>
            <option value="">-- {t('users_choose_leader')} --</option>
            {leaders.map(u=><option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
          </select>
        </div>
        <div style={{fontSize:11,color:C.primary,background:'#eef3ff',padding:'8px 12px',borderRadius:8}}>
          💡 {t('users_group_leader_hint')}
        </div>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{padding:'7px 16px',borderRadius:8,border:`1.5px solid ${C.border}`,background:'#fff',fontSize:13,fontWeight:600,cursor:'pointer',color:'#555'}}>{t('cancel')}</button>
          <button onClick={submit} style={{padding:'7px 16px',borderRadius:8,border:'none',background:C.primary,color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>💾 {t('users_create_group_btn')}</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Modal: Sửa nhóm ──
function EditGroupModal({show,group,users,onClose,onSave}){
  const { t } = useTranslation();
  const [f,setF]=useState({});
  useEffect(()=>{ if(group) setF({name:group.name,icon:group.icon,leader_id:group.leader_id||''}); },[group]);
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const members=group?.members||[];
  return (
    <Modal show={show} title={`✏️ ${t('users_edit_group')}`} onClose={onClose}>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <div><label style={FL}>{t('users_group_name')}</label><input style={FI} value={f.name||''} onChange={e=>s('name',e.target.value)}/></div>
        <div><label style={FL}>Icon</label><input style={FI} value={f.icon||''} onChange={e=>s('icon',e.target.value)}/></div>
        <div>
          <label style={FL}>{t('req_leader_label')}</label>
          <select style={FI} value={f.leader_id||''} onChange={e=>s('leader_id',e.target.value)}>
            <option value="">-- {t('users_choose_leader')} --</option>
            {members.map(m=><option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
        </div>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{padding:'7px 16px',borderRadius:8,border:`1.5px solid ${C.border}`,background:'#fff',fontSize:13,fontWeight:600,cursor:'pointer',color:'#555'}}>{t('cancel')}</button>
          <button onClick={()=>onSave(f)} style={{padding:'7px 16px',borderRadius:8,border:'none',background:C.primary,color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>💾 {t('save')}</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Modal: Thêm member ──
function AddMemberModal({show,group,users,onClose,onAdd}){
  const { t } = useTranslation();
  const [search,setSearch]=useState('');
  const existing=new Set((group?.members||[]).map(m=>m.id));
  const filtered=users.filter(u=>!existing.has(u.id)&&u.full_name.toLowerCase().includes(search.toLowerCase()));
  return (
    <Modal show={show} title={`➕ ${t('users_add_member_to',{name:group?.name||''})}`} width={500} onClose={()=>{ setSearch(''); onClose(); }}>
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        <input style={FI} placeholder={`🔍 ${t('users_search_by_name_email')}`} value={search} onChange={e=>setSearch(e.target.value)} autoFocus/>
        <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:240,overflowY:'auto'}}>
          {filtered.map(u=>(
            <div key={u.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',background:C.bg,borderRadius:8,cursor:'pointer'}}
              onMouseEnter={e=>e.currentTarget.style.background='#eef3ff'}
              onMouseLeave={e=>e.currentTarget.style.background=C.bg}>
              <Chip color={u.avatar_color||C.primary} name={u.full_name} size={28}/>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:C.dark}}>{u.full_name}</div>
                <div style={{fontSize:11,color:'#aaa'}}>{u.role} · {u.email}</div>
              </div>
              <button onClick={()=>{ onAdd(u.id); }}
                style={{padding:'4px 12px',borderRadius:7,border:'none',background:C.primary,color:'#fff',fontSize:11,fontWeight:600,cursor:'pointer'}}>
                ➕ {t('add')}
              </button>
            </div>
          ))}
          {!filtered.length&&<div style={{textAlign:'center',padding:20,color:'#bbb',fontSize:13}}>{t('users_not_found')}</div>}
        </div>
        <div style={{display:'flex',justifyContent:'flex-end',paddingTop:8,borderTop:`1px solid ${C.border}`}}>
          <button onClick={()=>{ setSearch(''); onClose(); }}
            style={{padding:'7px 16px',borderRadius:8,border:`1.5px solid ${C.border}`,background:'#fff',fontSize:13,fontWeight:600,cursor:'pointer',color:'#555'}}>
            {t('users_close')}
          </button>
        </div>
      </div>
    </Modal>
  );
}