import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api, { downloadFile, clearApiCache } from '../../api/client';
import useAuthStore from '../../store/authStore';
import { useReasonDialog } from '../../components/ReasonDialog';
import ApprovalsPanel from './ApprovalsPanel';
import { toast, notify } from '../../components/AppToast';
import { avatarSrc } from '../../lib/avatar';
import { WithPresence } from '../../components/PresenceDot';

/* ============================================================
   Cùng ngôn ngữ "control-panel" với BoardPage / Sidebar:
   nền canvas xám xanh nhạt, header bảng màu ink đậm, chip avatar
   gradient, badge vai trò kiểu thẻ nhân viên (mono chữ hoa),
   nút hành động dạng chip tròn màu theo ngữ nghĩa.
   ============================================================ */
const C = {
  ink:        'var(--wt-ink)',
  sub:        'var(--wt-text-2)',
  faint:      'var(--wt-text-3)',
  surface:    'var(--wt-surface)',
  canvas:     'var(--wt-canvas)',
  line:       'var(--wt-line)',
  lineSoft:   'var(--wt-surface-3)',

  primary:      '#3654ff',
  primaryDeep:  '#2440d6',
  primarySoft:  'var(--wt-tint-primary)',

  success:     '#17b26a',
  successSoft: 'var(--wt-tint-success)',
  warning:     '#f59e0b',
  warningSoft: 'var(--wt-tint-warning)',
  danger:      '#e5384d',
  dangerSoft:  'var(--wt-tint-danger)',
  violet:      '#8b5cf6',
  violetSoft:  'var(--wt-tint-violet)',
};

const FONT_SANS = "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";

const ROLE_STYLE = {
  admin:   { bg:`linear-gradient(135deg, ${C.ink}, #1c2a45)`, color:'#fff',      border:C.ink,        solid:true },
  manager: { bg:C.violetSoft,  color:C.violet,  border:`${C.violet}44` },
  leader:  { bg:C.primarySoft, color:C.primary, border:`${C.primary}33` },
  user:    { bg:C.lineSoft,    color:C.sub,     border:C.line },
};

const RoleBadge = ({role})=>{
  const s = ROLE_STYLE[role] || ROLE_STYLE.user;
  return (
    <span style={{
      fontSize:9.5, fontWeight:800, padding:'3px 9px', borderRadius:8,
      background:s.bg, color:s.color, border:`1px solid ${s.border}`,
      fontFamily:FONT_MONO, letterSpacing:'.05em', textTransform:'uppercase',
      display:'inline-block', whiteSpace:'nowrap',
    }}>{role}</span>
  );
};

// uid: kèm chấm 🟢 online / 🟡 treo / ⚪ offline ở góc avatar
const Chip = ({color=C.primary,name='?',size=28,ring=false,src,uid})=>{
  if (uid) return <WithPresence userId={uid} size={Math.max(7, Math.round(size*.32))}><Chip color={color} name={name} size={size} ring={ring} src={src}/></WithPresence>;
  const ini=(name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  if (src) return <img src={avatarSrc(src)} alt="" style={{width:size,height:size,borderRadius:'50%',objectFit:'cover',flexShrink:0,
    boxShadow: ring ? `0 0 0 2px var(--wt-surface), 0 0 0 3.5px ${color}55` : '0 1px 2px rgba(15,23,41,.15)'}}/>;
  return (
    <div style={{
      width:size,height:size,borderRadius:'50%',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',
      background:`linear-gradient(135deg, ${color}, ${color}cc)`,color:'#fff',fontSize:size>24?12:9,fontWeight:700,
      fontFamily:FONT_SANS, letterSpacing:.2,
      boxShadow: ring ? `0 0 0 2px var(--wt-surface), 0 0 0 3.5px ${color}55` : '0 1px 2px rgba(15,23,41,.15)',
    }}>{ini}</div>
  );
};

const FI = {width:'100%',padding:'8px 12px',border:`1.5px solid ${C.line}`,borderRadius:9,fontSize:13,color:C.ink,outline:'none',boxSizing:'border-box',fontFamily:FONT_SANS,background:'var(--wt-surface)',transition:'border-color .15s, box-shadow .15s'};
const FL = {display:'block',fontSize:10.5,fontWeight:800,color:C.faint,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6,fontFamily:FONT_SANS};

function Modal({show,title,onClose,children,width=460}){
  if(!show) return null;
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(15,23,41,.5)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:16,backdropFilter:'blur(3px)',WebkitBackdropFilter:'blur(3px)'}}
      className="users-backdrop"
      onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="users-modal-box" style={{background:C.canvas,borderRadius:18,padding:0,width,maxWidth:'95vw',maxHeight:'90vh',overflowY:'auto',boxShadow:'0 30px 70px rgba(15,23,41,.35)'}}>
        <div style={{fontSize:15,fontWeight:800,color:C.ink,padding:'18px 22px',display:'flex',alignItems:'center',gap:10,background:'var(--wt-surface)',borderBottom:`1px solid ${C.line}`,fontFamily:FONT_SANS,position:'sticky',top:0}}>
          {title}
          <button onClick={onClose} aria-label="close" style={{marginLeft:'auto',width:30,height:30,borderRadius:9,background:C.lineSoft,border:'none',fontSize:16,cursor:'pointer',color:C.sub,lineHeight:1,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>×</button>
        </div>
        <div style={{padding:22}}>{children}</div>
      </div>
    </div>
  );
}

const TABS = [
  {key:'users',       icon:'👤', tkey:'users_tab_users',  color:C.primary},
  {key:'groups',      icon:'🏭', tkey:'users_tab_groups', color:C.success},
  {key:'import',      icon:'📥', tkey:'users_tab_import', color:C.violet},
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


// Trích thông báo lỗi THẬT SỰ từ backend
const errMsg = (e) => e.response?.data?.message || e.message;

// Nút hành động dạng chip tròn — dùng chung cho các icon trong bảng
const IconBtn = ({ onClick, title, color, bg, children }) => (
  <button onClick={onClick} title={title} className="users-icon-btn" style={{
    width:28,height:28,borderRadius:8,border:`1px solid ${bg}`,background:bg,color,
    display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:13,flexShrink:0,
  }}>{children}</button>
);

// Nhập tài khoản: đọc CSV ĐÚNG NHƯ CHỮ (không bao giờ đổi MSNV thành số)
function parseCsvLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',' || ch === ';' || ch === '\t') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(v => v.trim().replace(/^="(.*)"$/, '$1').replace(/^=/, ''));
}
// Độ dài MSNV "chuẩn" = độ dài xuất hiện nhiều nhất trong các MSNV toàn chữ số
function standardMsnvLength(values) {
  const count = {};
  values.filter(v => /^\d+$/.test(v)).forEach(v => { count[v.length] = (count[v.length] || 0) + 1; });
  const best = Object.entries(count).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  return best ? +best[0] : 0;
}

export default function UsersPage(){
  const { t, i18n } = useTranslation();
  const currentLocale = { vi:'vi-VN', en:'en-US', ja:'ja-JP' }[i18n.language] || 'vi-VN';
  const { user: currentUser, hasPerm } = useAuthStore(); // user đang đăng nhập — dùng để giới hạn quyền trên UI
  const canManageUsers = hasPerm('user.manage'), canImport = hasPerm('user.import'), canManageGroups = hasPerm('group.manage');
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
  const [padZeros,      setPadZeros]      = useState(true);  // tự thêm số 0 đầu cho MSNV bị Excel cắt
  const [importing,     setImporting]     = useState(false);
  const [importResult,  setImportResult]  = useState(null);
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
    catch(e){ notify(e); }
  };

  // Sửa / khóa tài khoản nhóm khác → server trả 202 "chờ Leader nhóm đó đồng ý"
  const [approvalTick, setApprovalTick] = useState(0);
  const afterSave = (data) => {
    if (!data?.pending) return;
    const a = data.approval || {};
    toast({
      kind: 'info', icon: '📨', title: t('users_approval_sent', 'Đã gửi yêu cầu duyệt'),
      text: a.target ? `${t('users_approval_sent_for', 'Tài khoản')}: ${a.target}` : undefined,
      rows: [
        [t('users_approval_change', 'Thay đổi'), a.what || '—'],
        [t('users_approval_group', 'Nhóm'), (a.groups || []).join(', ') || '—'],
        [t('users_approval_by', 'Người duyệt'), (a.approvers || []).join(', ') || '—'],
      ],
      note: t('users_approval_note', 'Thay đổi chỉ được áp dụng khi Leader nhóm đồng ý. Theo dõi ở mục "Yêu cầu bạn đã gửi" đầu trang.'),
    });
    setApprovalTick(n => n + 1);
  };
  const updateUser = async(id,form)=>{
    try { const { data } = await api.put(`/users/${id}`,form); setEditUser(null); fetchUsers(); afterSave(data); }
    catch(e){ notify(e); }
  };

  const toggleActive = async(u)=>{
    try { const { data } = await api.put(`/users/${u.id}`,{is_active:u.is_active?0:1}); fetchUsers(); afterSave(data); }
    catch(e){ notify(e); }
  };

  // Đặt lại mật khẩu: mở khung riêng (không dùng prompt() của trình duyệt)
  const [resetUser, setResetUser] = useState(null);
  const resetPwd = (id) => setResetUser(users.find(u => u.id === id) || { id });

  const deleteUser = async(u)=>{
    if(!confirm(t('users_confirm_delete_user',{name:u.full_name}))) return;
    try { await api.delete(`/users/${u.id}`); fetchUsers(); }
    catch(e){ notify(e); }
  };

  // ── Group CRUD ──
  const createGroup = async(form)=>{
    try { await api.post('/groups',form); setShowAddGroup(false); fetchGroups(); }
    catch(e){ notify(e); }
  };

  const updateGroup = async(id,form)=>{
    try { await api.put(`/groups/${id}`,form); setEditGroup(null); fetchGroups(); }
    catch(e){ notify(e); }
  };

  const deleteGroup = async(id)=>{
    if(!confirm(t('users_confirm_delete_group'))) return;
    try { await api.delete(`/groups/${id}`); fetchGroups(); }
    catch(e){ notify(e); }
  };

  const addMember = async(groupId,userId)=>{
    try { await api.post(`/groups/${groupId}/members`,{user_id:userId}); fetchGroups(); }
    catch(e){ notify(e); }
  };

  const removeMember = async(groupId,userId)=>{
    try { await api.delete(`/groups/${groupId}/members/${userId}`); fetchGroups(); }
    catch(e){ notify(e); }
  };

  // ── Import ──
  const handleFileChange = async(e)=>{
    const file = e.target.files[0];
    e.target.value = ''; // chọn lại cùng file vẫn chạy
    if(!file) return;
    setImportFile(file);
    const lower = file.name.toLowerCase();
    let table;
    try {
      if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        // Excel: backend đọc đúng chữ đang HIỂN THỊ trong ô (giữ số 0 ở đầu)
        const form = new FormData(); form.append('file', file);
        const { data } = await api.post('/users/import/parse', form, { headers: { 'Content-Type': 'multipart/form-data' } });
        table = data.data || [];
      } else {
        const buffer = await file.arrayBuffer();
        const bytes  = new Uint8Array(buffer);
        let text;
        if (bytes[0]===0xFF && bytes[1]===0xFE) text = new TextDecoder('utf-16le').decode(buffer);
        else {
          text = new TextDecoder('utf-8').decode(buffer);
          // Không phải UTF-8 (file ANSI của Excel cũ) → đọc bằng windows-1258/1252
          if (text.includes('\uFFFD')) text = new TextDecoder('windows-1252').decode(buffer);
        }
        text = text.replace(/^\uFEFF/, '');
        table = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 501).map(parseCsvLine);
      }
    } catch (err) { notify(err); setImportFile(null); return; }

    // Bỏ dòng tiêu đề
    const isHeader = cells => /^(h[oọ]\s*t[eê]n|full.?name|name|email|stt)/i.test((cells[0] || '').trim());
    const rows = table.filter(c => !isHeader(c)).slice(0, 500).map(c => ({
      full_name: (c[0] || '').trim(),
      email:     (c[1] || '').trim(),
      role:      (c[2] || '').trim().toLowerCase(),
      group:     (c[3] || '').trim(),
      msnvRaw:   (c[4] || '').replace(/\s+/g, ''),
      msnvEdit:  null, // MSNV người dùng tự sửa trong bảng xem trước
    }));
    setPadZeros(true);
    setImportPreview(rows);
  };

  // MSNV thực sự sẽ dùng cho từng dòng + kiểm tra hợp lệ — tính 1 lần mỗi lần render
  const stdLen = importPreview ? standardMsnvLength(importPreview.map(r => r.msnvRaw)) : 0;
  const needsPad = (r) => r.msnvEdit == null && stdLen && /^\d+$/.test(r.msnvRaw) && r.msnvRaw.length < stdLen;
  const msnvOf = (r) => r.msnvEdit != null ? r.msnvEdit.replace(/\s+/g, '')
    : padZeros && needsPad(r) ? r.msnvRaw.padStart(stdLen, '0') : r.msnvRaw;
  const shortCount = importPreview ? importPreview.filter(needsPad).length : 0;
  const msnvList = (importPreview || []).map(msnvOf);
  const msnvCounts = {};
  msnvList.forEach(m => { if (m) msnvCounts[m] = (msnvCounts[m] || 0) + 1; });
  // checked[i] = { msnv, reason } ('' = hợp lệ)
  const checked = (importPreview || []).map((r, i) => {
    const m = msnvList[i];
    const reason = r.full_name.length <= 1 ? t('users_empty_name')
      : !m ? t('users_missing_msnv', 'Thiếu MSNV')
      : msnvCounts[m] > 1 ? t('users_dup_msnv_in_file', 'MSNV bị trùng trong file') : '';
    return { msnv: m, reason };
  });
  const editMsnv = (i, v) => setImportPreview(rows => rows.map((r, j) => j === i ? { ...r, msnvEdit: v } : r));

  const doImport = async()=>{
    if(!importPreview) return;
    setImporting(true);
    try {
      const rows = importPreview.map((r,i)=>[r,checked[i]]).filter(([,c])=>!c.reason).map(([r,c])=>({
        full_name:  r.full_name,
        email:      r.email||'',
        role:       r.role||'user',
        group_name: r.group||'',
        username:   c.msnv,   // luôn là CHUỖI → giữ số 0 ở đầu
        password:   'Welcome00',
      }));
      const {data} = await api.post('/users/import',{users:rows});
      setImportResult(data.data); // khung kết quả: đã tạo / trùng / lỗi kèm lý do
      setImportPreview(null); setImportFile(null);
      fetchUsers(); fetchGroups();
    } catch(e){ notify(e); }
    finally{ setImporting(false); }
  };

  const validCount   = checked.filter(c=>!c.reason).length;
  const invalidCount = checked.length - validCount;

  return (
    <div className="users-root" style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',background:C.surface,minWidth:0,fontFamily:FONT_SANS}}>
      <style>{`
        .users-root { box-sizing: border-box; }
        .users-root *, .users-root *::before, .users-root *::after { box-sizing: border-box; min-width: 0; }

        /* ── Cảm giác chạm mượt & phản hồi khi nhấn ── */
        .users-root button { -webkit-tap-highlight-color: transparent; touch-action: manipulation; transition: transform .1s ease, background .15s, color .15s, border-color .15s, box-shadow .15s; }
        .users-root button:active { transform: scale(0.96); }
        .users-root tbody tr { -webkit-tap-highlight-color: transparent; }

        .users-root input:focus, .users-root select:focus { border-color: ${C.primary} !important; box-shadow: 0 0 0 3px ${C.primary}1f; }

        /* ── Focus rõ ràng cho bàn phím (a11y) ── */
        .users-root *:focus-visible { outline: 2px solid ${C.primary}; outline-offset: 2px; border-radius: 4px; }

        /* ── Chặn Safari iOS tự zoom khi focus input/select ── */
        @media (hover: none) and (pointer: coarse) { .users-root input, .users-root select { font-size: 16px !important; } }

        /* ── Thanh cuộn mảnh, đẹp trên desktop ── */
        .users-root ::-webkit-scrollbar { width: 8px; height: 8px; }
        .users-root ::-webkit-scrollbar-track { background: transparent; }
        .users-root ::-webkit-scrollbar-thumb { background: var(--wt-scroll); border-radius: 8px; }
        .users-root ::-webkit-scrollbar-thumb:hover { background: var(--wt-line-strong); }

        .users-root .users-icon-btn:hover { filter: brightness(0.95); transform: translateY(-1px); }
        .users-root .users-row { transition: background .12s ease; }
        .users-root .users-group-card { transition: box-shadow .15s ease, border-color .15s ease; }
        .users-root .users-group-card:hover { box-shadow: 0 8px 22px rgba(15,23,41,.07); }
        .users-root .users-tab-item { position: relative; transition: color .15s ease; }
        .users-root .users-dropzone { transition: border-color .15s ease, background .15s ease; }

        @keyframes usersFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes usersPop { from { opacity: 0; transform: translateY(10px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .users-root .users-backdrop { animation: usersFadeIn .16s ease-out; }
        .users-root .users-modal-box { animation: usersPop .18s cubic-bezier(.2,.8,.2,1); }

        @keyframes usersPulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        .users-root .users-live-dot { animation: usersPulse 1.8s ease-in-out infinite; }

        @media (prefers-reduced-motion: reduce) {
          .users-root, .users-root * { animation: none !important; transition: none !important; }
        }

        /* Điện thoại: bảng người dùng → thẻ (không phải cuộn ngang) */
        @media (max-width: 640px) {
          .users-root .users-table { min-width: 0 !important; border: none !important; box-shadow: none !important; background: transparent !important; }
          .users-root .users-table thead { display: none; }
          .users-root .users-table tbody { display: flex; flex-direction: column; gap: 10px; }
          .users-root .users-table tr.users-row { display: grid; grid-template-columns: minmax(0,1fr) auto; grid-template-areas: "emp role" "grp status" "date actions";
            align-items: center; background: var(--wt-surface) !important; border: 1px solid var(--wt-line) !important; border-radius: 14px; padding: 8px 6px; box-shadow: 0 1px 3px rgba(15,23,41,.05); }
          .users-root .users-table td { padding: 5px 8px !important; }
          .users-root .users-table .u-emp { grid-area: emp; } .users-root .users-table .u-role { grid-area: role; justify-self: end; }
          .users-root .users-table .u-grp { grid-area: grp; } .users-root .users-table .u-status { grid-area: status; justify-self: end; }
          .users-root .users-table .u-date { grid-area: date; } .users-root .users-table .u-actions { grid-area: actions; justify-self: end; }
        }
        @media (max-width: 900px) {
          .users-root .users-topbar { flex-wrap: wrap !important; padding: 10px 14px !important; gap: 8px !important; }
          .users-root .users-title { flex-basis: 100% !important; }
          .users-root .users-topbar-actions { flex: 1 1 auto !important; display: flex !important; gap: 8px !important; }
          .users-root .users-topbar-actions button { flex: 1 1 auto !important; justify-content: center !important; }

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
      <div className="users-topbar" style={{padding:'13px 20px',borderBottom:`1px solid ${C.line}`,display:'flex',alignItems:'center',gap:10,background:C.surface,flexShrink:0}}>
        <div className="users-title" style={{fontSize:15.5,fontWeight:800,color:C.ink,flex:1,minWidth:0,display:'flex',alignItems:'center',gap:9}}>
          <span style={{width:30,height:30,borderRadius:9,background:`linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,boxShadow:`0 3px 10px ${C.primary}4d`,flexShrink:0}}>👥</span>
          <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t('nav_users')}</span>
        </div>
        <div className="users-topbar-actions" style={{display:'flex',gap:8,flexShrink:0}}>
          {tab==='users'&&<>
            {canImport&&<button onClick={()=>setTab('import')}
              style={{padding:'7px 15px',borderRadius:9,border:`1.5px solid ${C.line}`,background:'var(--wt-surface)',fontSize:12,fontWeight:700,cursor:'pointer',color:C.sub,display:'flex',alignItems:'center',gap:6,fontFamily:FONT_SANS,whiteSpace:'nowrap'}}>
              📥 {t('users_import_user')}
            </button>}
            {canManageUsers&&<button onClick={()=>setShowAddUser(true)}
              style={{padding:'7px 15px',borderRadius:9,border:'none',background:`linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:6,fontFamily:FONT_SANS,boxShadow:`0 3px 10px ${C.primary}4d`,whiteSpace:'nowrap'}}>
              ➕ {t('users_add_user')}
            </button>}
          </>}
          {tab==='groups'&&canManageGroups&&(
            <button onClick={()=>setShowAddGroup(true)}
              style={{padding:'7px 15px',borderRadius:9,border:'none',background:`linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:6,fontFamily:FONT_SANS,boxShadow:`0 3px 10px ${C.primary}4d`,whiteSpace:'nowrap'}}>
              ➕ {t('users_create_group')}
            </button>
          )}
        </div>
      </div>

      {/* Sub tabs */}
      <div className="users-tabs" style={{display:'flex',borderBottom:`1px solid ${C.line}`,background:C.surface,padding:'0 20px',flexShrink:0,gap:4}}>
        {TABS.filter(x=>x.key!=='import'||canImport).map(tabItem=>{
          const active = tab===tabItem.key;
          return (
            <div key={tabItem.key} className="users-tab-item" onClick={()=>setTab(tabItem.key)} style={{
              padding:'12px 16px',fontSize:12.5,fontWeight:700,cursor:'pointer',
              borderBottom:`2.5px solid ${active?tabItem.color:'transparent'}`,
              marginBottom:-1,color:active?tabItem.color:C.faint,
              display:'flex',alignItems:'center',gap:7,fontFamily:FONT_SANS,
            }}>
              <span style={{width:20,height:20,borderRadius:6,background:active?`${tabItem.color}1f`:C.lineSoft,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,flexShrink:0}}>{tabItem.icon}</span>
              {t(tabItem.tkey)}
              {tabItem.key==='users' &&<span style={{background:active?`${tabItem.color}1f`:C.lineSoft,color:active?tabItem.color:C.faint,fontSize:10,fontWeight:800,padding:'1px 7px',borderRadius:8,fontFamily:FONT_MONO}}>{users.length}</span>}
              {tabItem.key==='groups'&&<span style={{background:active?`${tabItem.color}1f`:C.lineSoft,color:active?tabItem.color:C.faint,fontSize:10,fontWeight:800,padding:'1px 7px',borderRadius:8,fontFamily:FONT_MONO}}>{groups.length}</span>}
            </div>
          );
        })}
      </div>

      {/* ═══ PANEL: Users ═══ */}
      {tab==='users'&&(
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          {/* Yêu cầu chờ duyệt (đổi vai trò / khóa / chuyển nhóm tài khoản nhóm khác) */}
          <ApprovalsPanel key={approvalTick} openMine={approvalTick>0} onChanged={()=>{ fetchUsers(); fetchGroups(); }} focus={new URLSearchParams(location.search).has('approvals')}/>
          {/* Toolbar */}
          <div className="users-toolbar" style={{padding:'10px 20px',background:C.surface,borderBottom:`1px solid ${C.line}`,display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
            <input style={{...FI,width:220,padding:'7px 12px'}} placeholder={`🔍 ${t('users_search_placeholder')}`}
              value={search} onChange={e=>setSearch(e.target.value)}/>
            <select style={{...FI,width:160,padding:'7px 12px'}} value={groupF} onChange={e=>setGroupF(e.target.value)}>
              <option value="">{t('users_all_groups')}</option>
              {groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <select style={{...FI,width:150,padding:'7px 12px'}} value={roleF} onChange={e=>setRoleF(e.target.value)}>
              <option value="">{t('users_all_roles')}</option>
              {['admin','manager','leader','assistant','user'].map(r=><option key={r} value={r}>{r==='assistant'?`assistant — ${t('role_assistant','Trợ lý Leader')}`:r}</option>)}
            </select>
            <div style={{flex:1}}/>
            <span className="users-toolbar-count" style={{fontSize:11.5,color:C.faint,fontFamily:FONT_MONO}}>{t('users_people_count',{count:users.length})}</span>
          </div>

          {/* Table */}
          <div className="users-table-panel" style={{flex:1,overflowY:'auto',padding:'16px 20px',background:C.canvas}}>
            <div style={{overflowX:'auto',borderRadius:14,WebkitOverflowScrolling:'touch'}}>
            <table className="users-table" style={{width:'100%',borderCollapse:'collapse',background:'var(--wt-surface)',borderRadius:14,overflow:'hidden',border:`1px solid ${C.line}`,boxShadow:'0 2px 10px rgba(15,23,41,.05)',minWidth:680}}>
              <thead>
                <tr>
                  {[t('users_th_employee'),t('users_th_role'),t('group'),t('status'),t('users_th_created_at'),''].map(h=>(
                    <th key={h} style={{background:C.ink,color:'#93a7c4',fontSize:10.5,fontWeight:800,padding:'12px 16px',textAlign:'left',borderBottom:'1px solid #1c2a45',textTransform:'uppercase',letterSpacing:'0.06em',whiteSpace:'nowrap',fontFamily:FONT_MONO}}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u=>(
                  <tr key={u.id} className="users-row" style={{borderBottom:`1px solid ${C.canvas}`}}
                    onMouseEnter={e=>e.currentTarget.style.background=C.primarySoft}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <td className="u-emp" style={{padding:'11px 16px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <Chip color={u.avatar_color||C.primary} name={u.full_name} size={32} ring src={u.avatar_url} uid={u.id}/>
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:700,color:C.ink,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{u.full_name}</div>
                          <div style={{fontSize:11,color:C.faint,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                            <span style={{fontFamily:FONT_MONO,fontWeight:700,color:C.sub}}>{u.username}</span>{u.email?` · ${u.email}`:''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="u-role" style={{padding:'11px 16px'}}><RoleBadge role={u.role}/></td>
                    <td className="u-grp" style={{padding:'11px 16px'}}>
                      <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                        {u.groups?.length
                          ? u.groups.map(g=><span key={g.id} style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:6,background:C.lineSoft,color:C.sub,border:`1px solid ${C.line}`,fontFamily:FONT_SANS}}>{g.name}</span>)
                          : <span style={{color:C.faint,fontSize:12}}>—</span>
                        }
                      </div>
                    </td>
                    <td className="u-status" style={{padding:'11px 16px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <div className={u.is_active?'users-live-dot':''} style={{width:7,height:7,borderRadius:'50%',background:u.is_active?C.success:C.danger,boxShadow:u.is_active?`0 0 5px ${C.success}88`:'none',flexShrink:0}}/>
                        <span style={{fontSize:11.5,fontWeight:700,color:u.is_active?C.success:C.danger}}>{u.is_active?t('users_active'):t('users_locked')}</span>
                      </div>
                    </td>
                    <td className="u-date" style={{padding:'11px 16px',fontSize:11.5,color:C.faint,fontFamily:FONT_MONO,whiteSpace:'nowrap'}}>
                      {u.created_at?new Date(u.created_at).toLocaleDateString(currentLocale):'—'}
                    </td>
                    <td className="u-actions" style={{padding:'11px 16px'}}>
                      <div style={{display:'flex',gap:5}}>
                        <IconBtn onClick={()=>setEditUser({...u})} title={t('edit')} color={C.primary} bg={C.primarySoft}>✏️</IconBtn>
                        <IconBtn onClick={()=>resetPwd(u.id)} title={t('users_reset_password')} color={C.violet} bg={C.violetSoft}>🔑</IconBtn>
                        <IconBtn onClick={()=>toggleActive(u)} title={u.is_active?t('users_lock'):t('users_unlock')} color={u.is_active?C.danger:C.success} bg={u.is_active?C.dangerSoft:C.successSoft}>
                          {u.is_active?'🔒':'🔓'}
                        </IconBtn>
                        <IconBtn onClick={()=>deleteUser(u)} title={t('users_delete_user')} color={C.danger} bg={C.dangerSoft}>🗑️</IconBtn>
                      </div>
                    </td>
                  </tr>
                ))}
                {!users.length&&(
                  <tr><td colSpan={6} style={{textAlign:'center',padding:40,color:C.faint,fontSize:13}}>{t('users_no_users')}</td></tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══ PANEL: Groups ═══ */}
      {tab==='groups'&&(
        <div style={{flex:1,overflowY:'auto',padding:'16px 20px',background:C.canvas,display:'flex',flexDirection:'column',gap:12}}>
          {groups.map(g=>(
            <div key={g.id} className="users-group-card" style={{background:'var(--wt-surface)',borderRadius:14,border:`1px solid ${C.line}`,overflow:'hidden'}}>
              {/* Header */}
              <div className="users-group-header" style={{padding:'13px 18px',background:C.canvas,borderBottom:`1px solid ${C.line}`,display:'flex',alignItems:'center',gap:12}}>
                <span style={{width:36,height:36,borderRadius:10,background:C.successSoft,display:'flex',alignItems:'center',justifyContent:'center',fontSize:17,flexShrink:0}}>{g.icon||'🏭'}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:800,color:C.ink,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{g.name}</div>
                  <div style={{fontSize:11,color:C.faint,marginTop:2,fontFamily:FONT_MONO}}>{t('users_member_count',{count:g.member_count||g.members?.length||0})}</div>
                </div>
                {/* Leader chip */}
                {g.leader_name&&(
                  <div style={{display:'flex',alignItems:'center',gap:6,background:C.primarySoft,border:`1px solid ${C.primary}33`,padding:'4px 10px 4px 4px',borderRadius:20,fontSize:11.5,color:C.primary,fontWeight:700,flexShrink:0}}>
                    <Chip color={C.primary} name={g.leader_name} size={20}/>
                    {t('req_leader_label',{name:g.leader_name})}
                  </div>
                )}
                <button onClick={()=>setShowAddMember(g)}
                  style={{padding:'6px 13px',borderRadius:9,border:'none',background:`linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`,color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',flexShrink:0,whiteSpace:'nowrap'}}>
                  ➕ {t('users_add_member')}
                </button>
                <button onClick={()=>setEditGroup({...g})}
                  style={{padding:'6px 13px',borderRadius:9,border:`1.5px solid ${C.line}`,background:'var(--wt-surface)',fontSize:11,fontWeight:700,cursor:'pointer',color:C.sub,flexShrink:0,whiteSpace:'nowrap'}}>
                  ✏️ {t('edit')}
                </button>
                <button onClick={()=>deleteGroup(g.id)}
                  style={{padding:'6px 11px',borderRadius:9,border:`1px solid ${C.dangerSoft}`,background:C.dangerSoft,fontSize:11,fontWeight:700,cursor:'pointer',color:C.danger,flexShrink:0}}>
                  🗑
                </button>
              </div>

              {/* Members */}
              <div style={{padding:'14px 18px'}}>
                <div style={{fontSize:10.5,fontWeight:800,color:C.faint,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10,fontFamily:FONT_MONO}}>{t('users_members_label')}</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                  {(g.members||[]).map(m=>(
                    <div key={m.id} style={{display:'flex',alignItems:'center',gap:7,padding:'5px 12px 5px 5px',borderRadius:20,background:C.canvas,border:`1.5px solid ${C.line}`,fontSize:12,color:C.ink,fontWeight:600}}>
                      <Chip color={m.avatar_color||C.primary} name={m.full_name} size={22}/>
                      {m.full_name}
                      {g.leader_id===m.id&&<span style={{fontSize:9.5,background:C.successSoft,color:C.success,fontWeight:800,padding:'1px 6px',borderRadius:8,fontFamily:FONT_MONO,textTransform:'uppercase'}}>{t('users_leader_badge')}</span>}
                      <span onClick={()=>removeMember(g.id,m.id)}
                        style={{cursor:'pointer',color:C.faint,fontSize:15,marginLeft:2,lineHeight:1}}
                        onMouseEnter={e=>e.target.style.color=C.danger}
                        onMouseLeave={e=>e.target.style.color=C.faint}>×</span>
                    </div>
                  ))}
                  {!(g.members||[]).length&&<span style={{fontSize:12,color:C.faint}}>{t('users_no_members')}</span>}
                  <div onClick={()=>setShowAddMember(g)}
                    style={{display:'flex',alignItems:'center',gap:6,padding:'6px 12px',borderRadius:20,border:`1.5px dashed ${C.line}`,color:C.faint,fontSize:12,cursor:'pointer'}}
                    onMouseEnter={e=>{ e.currentTarget.style.borderColor=C.primary; e.currentTarget.style.color=C.primary; e.currentTarget.style.background=C.primarySoft; }}
                    onMouseLeave={e=>{ e.currentTarget.style.borderColor=C.line; e.currentTarget.style.color=C.faint; e.currentTarget.style.background='transparent'; }}>
                    ➕ {t('add')}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div style={{padding:'10px 18px',borderTop:`1px solid ${C.lineSoft}`,display:'flex',gap:8,justifyContent:'flex-end',background:'var(--wt-surface-2)'}}>
                <div style={{fontSize:11,color:C.primary,flex:1}}>
                  💡 {t('users_group_hint')}
                </div>
              </div>
            </div>
          ))}

          {/* Add group card */}
          <div onClick={()=>setShowAddGroup(true)} className="users-dropzone"
            style={{display:'flex',alignItems:'center',gap:10,padding:'16px 18px',background:'var(--wt-surface)',borderRadius:14,border:`2px dashed ${C.line}`,color:C.faint,fontSize:14,fontWeight:700,cursor:'pointer',justifyContent:'center'}}
            onMouseEnter={e=>{ e.currentTarget.style.borderColor=C.primary; e.currentTarget.style.color=C.primary; e.currentTarget.style.background=C.primarySoft; }}
            onMouseLeave={e=>{ e.currentTarget.style.borderColor=C.line; e.currentTarget.style.color=C.faint; e.currentTarget.style.background='var(--wt-surface)'; }}>
            ➕ {t('users_create_new_group')}
          </div>
        </div>
      )}

      {/* ═══ PANEL: Permissions ═══ */}
      {tab==='permissions'&&(
        <div style={{flex:1,overflowY:'auto',padding:'16px 20px',background:C.canvas}}>
          <div style={{background:'var(--wt-surface)',borderRadius:14,border:`1px solid ${C.line}`,overflow:'hidden'}}>
            <div style={{padding:'13px 18px',borderBottom:`1px solid ${C.line}`,fontWeight:800,color:C.ink,fontSize:13,display:'flex',alignItems:'center',gap:8}}>
              🔐 {t('users_permissions_table')}
            </div>
            <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:520}}>
              <thead>
                <tr style={{background:C.canvas}}>
                  <th style={{padding:'9px 14px',textAlign:'left',fontSize:10.5,fontWeight:800,color:C.faint,borderBottom:`1px solid ${C.line}`,minWidth:260,fontFamily:FONT_MONO,textTransform:'uppercase',letterSpacing:'.05em'}}>{t('users_th_feature')}</th>
                  {['Admin','Manager','Leader','User'].map(r=>(
                    <th key={r} style={{padding:'9px 14px',textAlign:'center',fontSize:11,fontWeight:700,color:C.faint,borderBottom:`1px solid ${C.line}`}}>
                      <RoleBadge role={r.toLowerCase()}/>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMS.map(([feat,...vals])=>(
                  <tr key={feat} style={{borderBottom:`1px solid ${C.lineSoft}`}}>
                    <td style={{padding:'9px 14px',color:C.sub}}>{t(feat)}</td>
                    {vals.map((v,i)=>(
                      <td key={i} style={{padding:'9px 14px',textAlign:'center'}}>
                        {v?<span style={{color:C.success,fontWeight:800,fontSize:14}}>✓</span>:<span style={{color:C.line,fontSize:14}}>—</span>}
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
        <div style={{flex:1,overflowY:'auto',padding:20,background:C.canvas,display:'flex',flexDirection:'column',gap:14}}>
          <div style={{background:'var(--wt-surface)',borderRadius:14,border:`1px solid ${C.line}`,padding:20}}>
            <div style={{fontSize:14,fontWeight:800,color:C.ink,marginBottom:6,display:'flex',alignItems:'center',gap:8}}>
              📥 {t('users_import_from_csv')}
            </div>
            <div style={{fontSize:12,color:C.faint,marginBottom:16,lineHeight:1.6}}>
              {t('users_csv_format')}: <code style={{background:C.lineSoft,padding:'1px 6px',borderRadius:4,fontFamily:FONT_MONO}}>{t('users_csv_columns', 'Full name,Email,Role,Group')},MSNV</code>
              
              <br/>{t('users_csv_hint')} <code style={{background:C.lineSoft,padding:'1px 6px',borderRadius:4,fontFamily:FONT_MONO}}>Welcome00</code>
            </div>

            {/* Upload zone */}
            <div onClick={()=>fileRef.current.click()} className="users-dropzone"
              style={{border:`2.5px dashed ${C.line}`,borderRadius:12,padding:28,textAlign:'center',cursor:'pointer'}}
              onMouseEnter={e=>{ e.currentTarget.style.borderColor=C.primary; e.currentTarget.style.background=C.primarySoft; }}
              onMouseLeave={e=>{ e.currentTarget.style.borderColor=C.line; e.currentTarget.style.background='transparent'; }}>
              <div style={{fontSize:36,marginBottom:10}}>📊</div>
              <div style={{fontSize:13,color:C.faint}}>
                {t('users_drop_or')} <strong style={{color:C.primary}}>{t('users_click_to_choose')}</strong>
              </div>
              <div style={{fontSize:11,color:C.faint,marginTop:6}}>{t('users_file_types_limit')}</div>
              {importFile&&<div style={{fontSize:12,color:C.primary,marginTop:8,fontWeight:700}}>📎 {importFile.name}</div>}
            </div>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{display:'none'}} onChange={handleFileChange}/>

            <button onClick={()=>downloadFile('/users/import/template', { fallbackName: 'mau_import_user.xlsx' }).catch(e=>notify(e))}
              style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 16px',borderRadius:9,border:`1.5px solid ${C.line}`,background:'var(--wt-surface)',fontSize:12,fontWeight:700,color:C.sub,cursor:'pointer',marginTop:12}}>
              ⬇️ {t('users_download_sample')} (.xlsx)
            </button>
            <div style={{fontSize:11.5,color:C.faint,marginTop:8,lineHeight:1.6}}>
              💡 {t('users_msnv_zero_hint', 'MSNV có số 0 ở đầu (VD: 019123): dùng file mẫu .xlsx — cột MSNV đã để dạng Chữ nên Excel không tự xóa số 0. Nếu file cũ đã bị mất số 0, bảng xem trước bên dưới sẽ tự thêm lại, hoặc bạn sửa trực tiếp ô MSNV.')}
            </div>

            {/* Preview */}
            {importPreview&&(
              <div style={{marginTop:16}}>
                <div style={{fontSize:12,fontWeight:800,color:C.ink,marginBottom:8,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                  {t('users_preview_data')}
                  {validCount>0&&<span style={{fontSize:10.5,background:C.successSoft,color:C.success,fontWeight:800,padding:'2px 8px',borderRadius:8,fontFamily:FONT_MONO}}>{t('users_valid_count',{count:validCount})}</span>}
                  {invalidCount>0&&<span style={{fontSize:10.5,background:C.dangerSoft,color:C.danger,fontWeight:800,padding:'2px 8px',borderRadius:8,fontFamily:FONT_MONO}}>{t('users_invalid_count',{count:invalidCount})}</span>}
                </div>
                {shortCount>0&&(
                  <label style={{display:'flex',alignItems:'flex-start',gap:9,padding:'10px 12px',borderRadius:10,background:'var(--wt-tint-warning)',border:'1px solid var(--wt-tint-warning-bd)',marginBottom:10,cursor:'pointer',fontSize:12,color:'var(--wt-warn-text)',lineHeight:1.5}}>
                    <input type="checkbox" checked={padZeros} onChange={e=>setPadZeros(e.target.checked)} style={{marginTop:2,width:16,height:16,flexShrink:0}}/>
                    <span>
                      <b>{t('users_pad_title',{count:shortCount,len:stdLen,defaultValue:`${shortCount} MSNV ngắn hơn ${stdLen} số — có thể Excel đã xóa số 0 ở đầu.`})}</b><br/>
                      {t('users_pad_desc',{len:stdLen,defaultValue:`Tự thêm số 0 ở đầu cho đủ ${stdLen} số (VD: 19123 → ${'19123'.padStart(stdLen,'0')}). Bỏ chọn nếu MSNV công ty bạn có độ dài khác nhau.`})}
                    </span>
                  </label>
                )}
                <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:640}}>
                  <thead>
                    <tr style={{background:C.canvas}}>
                      {[t('users_th_stt'),t('users_th_employee'),'Email',t('users_th_role_col'),t('group'),t('users_th_username','MSNV'),t('status')].map(h=>(
                        <th key={h} style={{padding:'6px 10px',textAlign:'left',borderBottom:`1px solid ${C.line}`,color:C.faint,fontSize:10.5,whiteSpace:'nowrap',fontFamily:FONT_MONO,textTransform:'uppercase',letterSpacing:'.05em'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.map((row,i)=>{
                      const { reason, msnv } = checked[i], valid = !reason;
                      const padded = row.msnvEdit==null && msnv!==row.msnvRaw;
                      return (
                        <tr key={i} style={{borderBottom:`1px solid ${C.lineSoft}`,background:valid?'transparent':C.dangerSoft}}>
                          <td style={{padding:'6px 10px',color:C.faint,fontSize:11,fontFamily:FONT_MONO}}>{i+1}</td>
                          <td style={{padding:'6px 10px',fontWeight:700,color:valid?C.ink:C.danger,fontSize:12}}>{row.full_name||'—'}</td>
                          <td style={{padding:'6px 10px',color:C.sub,fontSize:11}}>{row.email||<span style={{color:C.faint}}>—</span>}</td>
                          <td style={{padding:'6px 10px'}}><RoleBadge role={row.role||'user'}/></td>
                          <td style={{padding:'6px 10px',color:C.sub,fontSize:11}}>{row.group||<span style={{color:C.faint}}>—</span>}</td>
                          <td style={{padding:'4px 8px'}}>
                            <input value={msnv} onChange={e=>editMsnv(i,e.target.value)} inputMode="text" maxLength={50}
                              title={padded?t('users_msnv_padded',{raw:row.msnvRaw,defaultValue:`Đã thêm số 0 (gốc trong file: ${row.msnvRaw})`}):''}
                              style={{width:110,padding:'5px 8px',borderRadius:7,fontFamily:FONT_MONO,fontSize:12,fontWeight:700,outline:'none',
                                border:`1.5px solid ${!msnv?C.danger:padded?'#f5b041':C.line}`,background:padded?'var(--wt-tint-warning)':'var(--wt-surface)',color:msnv?C.ink:C.danger}}/>
                            {padded&&<div style={{fontSize:9.5,color:'var(--wt-warn-text)',marginTop:2,fontFamily:FONT_MONO}}>← {row.msnvRaw}</div>}
                          </td>
                          <td style={{padding:'6px 10px',color:valid?C.success:C.danger,fontWeight:800,fontSize:11}}>
                            {valid?'✓':`✗ ${reason}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
                <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:12,flexWrap:'wrap'}}>
                  <button onClick={()=>{ setImportPreview(null); setImportFile(null); }}
                    style={{padding:'7px 16px',borderRadius:9,border:`1.5px solid ${C.line}`,background:'var(--wt-surface)',fontSize:12,fontWeight:700,cursor:'pointer',color:C.sub}}>
                    ✕ {t('cancel')}
                  </button>
                  <button onClick={doImport} disabled={importing||validCount===0}
                    style={{padding:'7px 16px',borderRadius:9,border:'none',background:importing||validCount===0?C.faint:`linear-gradient(135deg, ${C.success}, #109157)`,color:'#fff',fontSize:12,fontWeight:700,cursor:importing||validCount===0?'default':'pointer'}}>
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
      <ResetPasswordModal user={resetUser} onClose={()=>setResetUser(null)}/>
      <ImportResultModal result={importResult} onClose={()=>setImportResult(null)} onViewUsers={()=>{ setImportResult(null); setTab('users'); }}/>
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

// Modal: Thêm user
function AddUserModal({show,groups,onClose,onSave}){
  const { t } = useTranslation();
  const [f,setF]=useState({username:'',email:'',full_name:'',role:'user',password:'',avatar_color:'#3654ff',group_id:''});
  const [showPw,setShowPw]=useState(false);
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const submit=()=>{
    if(!f.username||!f.full_name||!f.password) return notify(t('users_fill_all'));
    onSave(f); // server kiểm tra lại vai trò được phép gán
  };
  return (
    <Modal show={show} title={`➕ ${t('users_add_new_user')}`} onClose={onClose}>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
          <div style={{flex:'1 1 160px'}}><label style={FL}>{t('profile_fullname')} *</label><input style={FI} value={f.full_name} onChange={e=>s('full_name',e.target.value)} placeholder="Nguyễn Văn A"/></div>
          <div style={{flex:'1 1 160px'}}><label style={FL}>MSNV *</label><input style={FI} value={f.username} onChange={e=>s('username',e.target.value)} placeholder="019..."/></div>
        </div>
        <div><label style={FL}>Email *</label><input type="email" style={FI} value={f.email} onChange={e=>s('email',e.target.value)} placeholder="email@smc.com"/></div>
        <div><label style={FL}>{t('password')} *</label>
          <div style={{position:'relative'}}>
            <input type={showPw?'text':'password'} autoComplete="new-password" style={{...FI,paddingRight:44}} value={f.password} onChange={e=>s('password',e.target.value)}/>
            <button type="button" onClick={()=>setShowPw(v=>!v)} title={showPw?t('pw_hide','Ẩn mật khẩu'):t('pw_show','Hiện mật khẩu')} aria-label={showPw?t('pw_hide','Ẩn mật khẩu'):t('pw_show','Hiện mật khẩu')} aria-pressed={showPw}
              style={{position:'absolute',right:6,top:'50%',transform:'translateY(-50%)',width:32,height:32,border:'none',background:'none',cursor:'pointer',fontSize:16,lineHeight:1,borderRadius:8,opacity:showPw?1:.65}}>{showPw?'🙈':'👁'}</button>
          </div>
        </div>
        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
          <RoleSelect value={f.role} onChange={v=>s('role',v)}/>
          <div style={{flex:'1 1 140px'}}>
            <label style={FL}>{t('group')}</label>
            <select style={FI} value={f.group_id} onChange={e=>s('group_id',e.target.value)}>
              <option value="">-- {t('users_choose_group')} --</option>
              {groups.map(g=><option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}
            </select>
          </div>
        </div>
        <div><label style={FL}>{t('profile_avatar_color')}</label><input type="color" style={{...FI,height:38,cursor:'pointer',padding:4}} value={f.avatar_color} onChange={e=>s('avatar_color',e.target.value)}/></div>
        <div style={{fontSize:11,color:C.faint,background:C.canvas,padding:'9px 12px',borderRadius:9}}>
          💡 {t('users_password_hint')}
        </div>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{padding:'8px 16px',borderRadius:9,border:`1.5px solid ${C.line}`,background:'var(--wt-surface)',fontSize:13,fontWeight:700,cursor:'pointer',color:C.sub}}>{t('cancel')}</button>
          <button onClick={submit} style={{padding:'8px 16px',borderRadius:9,border:'none',background:`linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',boxShadow:`0 3px 10px ${C.primary}4d`}}>💾 {t('users_create_user_btn')}</button>
        </div>
      </div>
    </Modal>
  );
}

// Công tắc bật/tắt (dùng trong khung quyền của vai trò)
function Switch({ on, disabled, onClick, title }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={onClick} title={title}
      style={{width:40,height:22,borderRadius:22,border:'none',padding:2,flexShrink:0,cursor:disabled?'not-allowed':'pointer',
        background:on?C.success:'var(--wt-line-strong, #c5cbd8)',opacity:disabled?.55:1,transition:'background .15s',display:'flex',alignItems:'center'}}>
      <span style={{width:18,height:18,borderRadius:'50%',background:'#fff',boxShadow:'0 1px 3px rgba(0,0,0,.25)',transform:`translateX(${on?18:0}px)`,transition:'transform .15s'}}/>
    </button>
  );
}

// Chọn vai trò — chỉ hiện các vai trò người đang đăng nhập GÁN ĐƯỢC (Leader: Nhân viên / Trợ lý Leader)
// + các quyền cấp Leader dạng CÔNG TẮC cho riêng người đang sửa:
//   bấm được khi Admin đã bật "⚡ Quyền đặc biệt" (perm.delegate); chưa bật → chỉ xem
function RoleSelect({ value, onChange, lockedRole, userId, savedRole }) {
  const { t } = useTranslation();
  const [info, setInfo] = useState(null);       // { roles, switchable, can_switch }
  const [member, setMember] = useState(null);   // quyền thực tế của người đang sửa (khi được phân quyền)
  const [busy, setBusy] = useState(false);
  const [dialog, ask] = useReasonDialog();
  const loadMember = useCallback(async () => {
    try { const { data } = await api.get('/permissions/delegate', { cache: false }); setMember(data.data.members.find(m => +m.id === +userId) || false); }
    catch { setMember(false); }
  }, [userId]);
  useEffect(() => { api.get('/permissions/roles', { cache: false }).then(r => setInfo(r.data.data)).catch(() => setInfo({ roles: [], switchable: [] })); }, []);
  useEffect(() => { if (userId && info?.can_switch) loadMember(); }, [userId, info?.can_switch, loadMember]);
  if (!info) return null;
  const roles = info.roles || [];
  const cur = roles.find(r => r.role === value);
  // người đang sửa có vai trò mình không gán được (vd Leader mở tài khoản Leader khác) → chỉ xem
  if (lockedRole || (value && !cur)) return (
    <div style={{flex:'1 1 100%'}}>
      <label style={FL}>{t('users_th_role_col')}</label>
      <div style={{...FI,background:'var(--wt-surface-2)',color:C.faint}}>🔒 {value}</div>
    </div>
  );
  const roleChangedUnsaved = !!(userId && savedRole && value !== savedRole);
  const canToggle = !!(userId && info.can_switch && member && !roleChangedUnsaved);
  // Admin chưa bật "phân quyền cho nhân viên" → ẩn hẳn chỗ phân quyền, chỉ hiện quyền của vai trò
  const rows = (info.can_switch ? info.switchable || [] : []).map(p => {
    const mp = member && !roleChangedUnsaved ? member.perms.find(x => x.key === p.key) : null;
    const byRole = !!cur?.keys?.includes(p.key);
    return { ...p, on: mp ? mp.effective : byRole, byRole: mp ? mp.by_role : byRole, override: mp ? mp.override : null, locked: !!mp?.locked, set_by: mp?.set_by };
  });
  const basicOnly = !(cur?.perms?.length);
  const toggle = async (row) => {
    const want = !row.on;
    // trùng mặc định của vai trò → bỏ ngoại lệ; khác → cấp / thu hồi riêng
    const allowed = want === row.byRole ? null : want;
    const reason = await ask(`${want ? 'Bật' : 'Tắt'} quyền cho ${member.full_name}`, [`${want ? '＋ Bật' : '－ Tắt'}: "${row.label}"${allowed === null ? ' (về đúng theo vai trò)' : ''}`]);
    if (!reason) return;
    setBusy(true);
    try { await api.put('/permissions/delegate', { user_id: userId, perm: row.key, allowed, reason }); clearApiCache(); await loadMember(); }
    catch (e) { notify(e); }
    finally { setBusy(false); }
  };
  const note = !info.can_switch ? '' : !userId ? t('users_perm_after_create', 'Tạo tài khoản xong mới bật / tắt quyền riêng được')
    : roleChangedUnsaved ? t('users_perm_save_role_first', 'Bấm Lưu vai trò mới trước, rồi mới bật / tắt quyền riêng')
    : !info.can_switch ? ''
    : member === false ? t('users_perm_out_scope', 'Bạn chỉ bật / tắt quyền được cho Nhân viên / Trợ lý Leader trong nhóm mình') : '';
  return (
    <div style={{flex:'1 1 100%'}}>
      {dialog}
      <label style={FL}>{t('users_th_role_col')}</label>
      <select style={FI} value={value||'user'} onChange={e=>onChange(e.target.value)}>
        {roles.map(r=><option key={r.role} value={r.role}>{r.label}</option>)}
      </select>
      <div style={{marginTop:6,background:'var(--wt-surface)',border:`1px solid ${C.line}`,borderRadius:9,overflow:'hidden'}}>
        <div style={{padding:'8px 10px',fontSize:11.5,color:C.sub}}>
          <b style={{color:C.ink}}>{t('users_role_perms','Quyền của vai trò này')}:</b>{' '}
          {basicOnly ? <span style={{color:C.faint}}>{t('users_role_basic','Chỉ các chức năng cơ bản: ghi việc hằng ngày, nhận & làm CV được giao')}</span>
            : <span>{cur.perms.join(' · ')}</span>}
          {note && <div style={{fontSize:10.5,color:C.faint,marginTop:3}}>{note}</div>}
        </div>
        {rows.map(r => (
          <div key={r.key} style={{display:'flex',alignItems:'center',gap:10,padding:'7px 10px',borderTop:`1px solid ${C.lineSoft}`}}>
            <div style={{flex:1,minWidth:0,fontSize:12,color:r.on?C.ink:C.faint}}>
              {r.label}
              {r.override !== null && <span style={{marginLeft:6,fontSize:10,fontWeight:800,padding:'1px 6px',borderRadius:6,background:r.override?'var(--wt-tint-success)':'var(--wt-tint-danger)',color:r.override?C.success:C.danger}}>{r.override?'cấp riêng':'thu hồi riêng'}</span>}
              {r.set_by && <span style={{marginLeft:6,fontSize:10,color:C.faint}}>{r.locked?'🔒 ':''}do {r.set_by}</span>}
            </div>
            <Switch on={r.on} disabled={!canToggle || busy || r.locked} onClick={()=>toggle(r)}
              title={r.locked ? 'Do cấp cao hơn đặt — bạn không đổi được' : !canToggle ? note : (r.on ? 'Bấm để tắt' : 'Bấm để bật')}/>
          </div>
        ))}
      </div>
    </div>
  );
}

// Modal: Kết quả nhập tài khoản từ Excel — tổng kết + từng dòng trùng / lỗi kèm lý do và cách sửa
// Các khối nhỏ của khung kết quả nhập (để ngoài component → không bị tạo lại mỗi lần vẽ)
const Stat = ({ n, label, color, bg, icon }) => (
  <div style={{ flex: '1 1 120px', padding: '12px 14px', borderRadius: 12, background: bg, border: `1px solid ${color}33` }}>
    <div style={{ fontSize: 24, fontWeight: 900, color, fontFamily: FONT_MONO, lineHeight: 1 }}>{n}</div>
    <div style={{ fontSize: 11.5, color: C.sub, marginTop: 5, fontWeight: 700 }}>{icon} {label}</div>
  </div>
);
const Row = ({ name, msnv, reason, color }) => (
  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 12px', borderTop: `1px solid ${C.lineSoft}` }}>
    <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, marginTop: 6, flexShrink: 0 }} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 12.5, color: C.ink, fontWeight: 700 }}>{name}{msnv ? <span style={{ color: C.faint, fontWeight: 500, fontFamily: FONT_MONO, marginLeft: 6 }}>{msnv}</span> : null}</div>
      <div style={{ fontSize: 12, color: C.sub, marginTop: 2, overflowWrap: 'anywhere' }}>{reason}</div>
    </div>
  </div>
);
const Section = ({ title, color, bg, hint, children }) => (
  <div style={{ background: 'var(--wt-surface)', border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
    <div style={{ padding: '9px 12px', background: bg, fontSize: 12.5, fontWeight: 800, color }}>{title}</div>
    <div style={{ maxHeight: 220, overflowY: 'auto' }}>{children}</div>
    {hint && <div style={{ padding: '8px 12px', borderTop: `1px solid ${C.lineSoft}`, fontSize: 11, color: C.faint }}>💡 {hint}</div>}
  </div>
);

function ImportResultModal({ result, onClose, onViewUsers }) {
  const { t } = useTranslation();
  if (!result) return null;
  const dup = result.duplicates || [], err = result.errors || [];
  const allOk = !dup.length && !err.length;
  return (
    <Modal show title={allOk ? `✅ ${t('users_import_done', 'Nhập tài khoản thành công')}` : `📥 ${t('users_import_result', 'Kết quả nhập tài khoản')}`} onClose={onClose} width={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Stat n={result.created} label={t('users_import_stat_created', 'Đã tạo')} color={C.success} bg={C.successSoft} icon="✅" />
          {dup.length > 0 && <Stat n={dup.length} label={t('users_import_stat_dup', 'Trùng MSNV — bỏ qua')} color={C.warning} bg={C.warningSoft} icon="⚠️" />}
          {err.length > 0 && <Stat n={err.length} label={t('users_import_stat_err', 'Lỗi — chưa tạo')} color={C.danger} bg={C.dangerSoft} icon="❌" />}
        </div>
        {result.created > 0 && (
          <div style={{ fontSize: 12, color: C.sub, background: C.canvas, padding: '9px 12px', borderRadius: 9, lineHeight: 1.55 }}>
            🔑 {t('users_import_pw_hint', 'Tài khoản mới đăng nhập bằng MSNV, mật khẩu mặc định Welcome00 — lần đầu đăng nhập sẽ được yêu cầu đổi mật khẩu.')}
          </div>
        )}
        {err.length > 0 && (
          <Section title={`❌ ${t('users_import_errors', 'Lỗi')} (${err.length})`} color={C.danger} bg={C.dangerSoft}
            hint={t('users_import_err_hint', 'Sửa các dòng này trong file Excel rồi nhập lại — những dòng đã tạo sẽ tự được bỏ qua (trùng MSNV).')}>
            {err.map((e, i) => <Row key={i} name={e.name} msnv={e.username} reason={e.error} color={C.danger} />)}
          </Section>
        )}
        {dup.length > 0 && (
          <Section title={`⚠️ ${t('users_import_dup_title', 'Trùng MSNV — đã có tài khoản')} (${dup.length})`} color={C.warning} bg={C.warningSoft}>
            {dup.map((d, i) => <Row key={i} name={d.name} msnv={d.username} color={C.warning}
              reason={t('users_import_dup_reason', { existing: d.existing, defaultValue: `MSNV này đang là tài khoản của "${d.existing}"` })} />)}
          </Section>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {result.created > 0 && (
            <button onClick={onViewUsers} style={{ padding: '8px 16px', borderRadius: 9, border: `1.5px solid ${C.line}`, background: 'var(--wt-surface)', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: C.sub }}>
              👤 {t('users_import_view', 'Xem danh sách người dùng')}
            </button>
          )}
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            {t('close', 'Đóng')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Modal: Đặt lại mật khẩu — chọn về mặc định (bắt đổi khi đăng nhập) hoặc đặt mật khẩu mới; xong hiện mật khẩu để đưa cho nhân viên
const DEFAULT_PW = 'Welcome00';
const PW_MIN = 8;
function randomPassword() {
  // bỏ ký tự dễ nhầm (0/O, 1/l/I) để đọc cho nhân viên không bị sai
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '@#$%&*'];
  const all = sets.join('');
  const pick = (str) => str[(crypto.getRandomValues(new Uint32Array(1))[0]) % str.length];
  const chars = [...sets.map(pick), ...Array.from({ length: 6 }, () => pick(all))];
  for (let i = chars.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}
function ResetPasswordModal({ user, onClose }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState('default');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null); // mật khẩu đã đặt
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (user) { setMode('default'); setPw(''); setPw2(''); setShow(false); setErr(''); setDone(null); setCopied(false); } }, [user]);
  if (!user) return null;
  const custom = mode === 'custom';
  const tooShort = custom && pw.length > 0 && pw.length < PW_MIN;
  const mismatch = custom && pw2.length > 0 && pw !== pw2;
  const ready = !custom || (pw.length >= PW_MIN && pw === pw2);
  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true); setErr('');
    const password = custom ? pw : DEFAULT_PW;
    try { await api.post(`/users/${user.id}/reset-password`, { password }); setDone(password); }
    catch (e) { setErr(errMsg(e)); }
    finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(done); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* trình duyệt chặn → tự bôi đen */ }
  };
  const gen = () => { const r = randomPassword(); setPw(r); setPw2(r); setShow(true); setErr(''); };
  const Option = ({ value, icon, title, desc }) => {
    const on = mode === value;
    return (
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 12px', borderRadius: 11, cursor: 'pointer',
        border: `1.5px solid ${on ? C.primary : C.line}`, background: on ? C.primarySoft : 'var(--wt-surface)' }}>
        <input type="radio" name="pwmode" checked={on} onChange={() => { setMode(value); setErr(''); }} style={{ marginTop: 3, accentColor: C.primary }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.ink }}>{icon} {title}</div>
          <div style={{ fontSize: 11.5, color: C.sub, marginTop: 2, lineHeight: 1.5 }}>{desc}</div>
        </div>
      </label>
    );
  };
  return (
    <Modal show title={`🔑 ${t('users_reset_password', 'Đặt lại mật khẩu')}`} onClose={onClose} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--wt-surface)', borderRadius: 11, border: `1px solid ${C.line}` }}>
          <span style={{ width: 34, height: 34, borderRadius: '50%', background: user.avatar_color || C.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
            {(user.full_name || '?').split(' ').slice(-1)[0][0]}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, color: C.ink, fontSize: 13.5 }}>{user.full_name}</div>
            <div style={{ fontSize: 11.5, color: C.faint, fontFamily: FONT_MONO }}>{user.username}</div>
          </div>
        </div>

        {done ? (
          <>
            <div style={{ textAlign: 'center', padding: '6px 0 2px' }}>
              <div style={{ fontSize: 34 }}>✅</div>
              <div style={{ fontWeight: 800, color: C.ink, fontSize: 14, marginTop: 4 }}>{t('users_password_changed', 'Đã đặt lại mật khẩu')}</div>
              <div style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>Gửi mật khẩu này cho nhân viên:</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input readOnly value={done} onFocus={e => e.target.select()}
                style={{ ...FI, fontFamily: FONT_MONO, fontSize: 17, fontWeight: 800, letterSpacing: '.08em', textAlign: 'center', background: 'var(--wt-surface)' }} />
              <button onClick={copy} style={{ padding: '10px 14px', borderRadius: 9, border: `1.5px solid ${copied ? C.success : C.line}`, background: copied ? C.successSoft : 'var(--wt-surface)', color: copied ? C.success : C.sub, fontWeight: 800, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {copied ? '✓ Đã chép' : '📋 Sao chép'}
              </button>
            </div>
            <div style={{ fontSize: 11.5, color: C.sub, background: C.canvas, padding: '9px 12px', borderRadius: 9, lineHeight: 1.55 }}>
              {done === DEFAULT_PW ? '🔁 Lần đăng nhập tới, nhân viên sẽ được yêu cầu đổi sang mật khẩu riêng.' : '🔐 Nhân viên dùng mật khẩu này để đăng nhập, sau đó có thể tự đổi trong Cài đặt.'}
              {' '}Người này đã bị đăng xuất khỏi mọi thiết bị.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{t('done', 'Xong')}</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Option value="default" icon="🔁" title={`Về mật khẩu mặc định (${DEFAULT_PW})`}
                desc="Nên dùng — nhân viên đăng nhập bằng mật khẩu mặc định rồi BẮT BUỘC đổi sang mật khẩu riêng." />
              <Option value="custom" icon="✏️" title="Đặt mật khẩu mới" desc={`Tự nhập hoặc tạo ngẫu nhiên — ít nhất ${PW_MIN} ký tự.`} />
            </div>

            {custom && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <label style={{ ...FL, marginBottom: 0 }}>Mật khẩu mới</label>
                    <button type="button" onClick={gen} style={{ border: 'none', background: 'none', color: C.primary, fontSize: 12, fontWeight: 800, cursor: 'pointer', padding: 2 }}>🎲 Tạo ngẫu nhiên</button>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input autoFocus type={show ? 'text' : 'password'} autoComplete="new-password" value={pw} onChange={e => { setPw(e.target.value); setErr(''); }}
                      onKeyDown={e => e.key === 'Enter' && submit()}
                      style={{ ...FI, paddingRight: 44, fontFamily: show ? FONT_MONO : undefined, borderColor: tooShort ? C.warning : undefined }} />
                    <button type="button" onClick={() => setShow(v => !v)} aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={show}
                      style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, opacity: show ? 1 : .65 }}>{show ? '🙈' : '👁'}</button>
                  </div>
                  <div style={{ fontSize: 11, marginTop: 4, color: tooShort ? C.warning : pw.length >= PW_MIN ? C.success : C.faint }}>
                    {pw.length >= PW_MIN ? `✓ ${pw.length} ký tự` : `${pw.length}/${PW_MIN} ký tự`}
                  </div>
                </div>
                <div>
                  <label style={FL}>Nhập lại mật khẩu</label>
                  <input type={show ? 'text' : 'password'} autoComplete="new-password" value={pw2} onChange={e => { setPw2(e.target.value); setErr(''); }}
                    onKeyDown={e => e.key === 'Enter' && submit()}
                    style={{ ...FI, fontFamily: show ? FONT_MONO : undefined, borderColor: mismatch ? C.danger : undefined }} />
                  {mismatch && <div style={{ fontSize: 11, marginTop: 4, color: C.danger }}>Hai mật khẩu chưa khớp</div>}
                </div>
              </div>
            )}

            <div style={{ fontSize: 11.5, color: C.faint, background: C.canvas, padding: '9px 12px', borderRadius: 9 }}>
              ⚠️ Người này sẽ bị đăng xuất khỏi mọi thiết bị đang dùng.
            </div>
            {err && <div style={{ fontSize: 12, color: C.danger, background: C.dangerSoft, padding: '8px 12px', borderRadius: 9 }}>❌ {err}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 9, border: `1.5px solid ${C.line}`, background: 'var(--wt-surface)', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: C.sub }}>{t('cancel')}</button>
              <button onClick={submit} disabled={!ready || busy}
                style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`, color: '#fff', fontSize: 13, fontWeight: 700, cursor: ready && !busy ? 'pointer' : 'not-allowed', opacity: ready && !busy ? 1 : .5 }}>
                {busy ? '⏳' : '🔑 Đặt lại mật khẩu'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// Modal: Sửa user
function EditUserModal({show,user,groups=[],currentUserRole,onClose,onSave}){
  const { t } = useTranslation();
  const isLeader = !['admin','manager'].includes(currentUserRole); // không phải Admin/Manager: chỉ tạo/sửa nhân viên
  const [f,setF]=useState({});
  useEffect(()=>{
    if(user) setF({
      username: user.username,
      full_name:user.full_name,
      email:user.email,
      role:user.role,
      group_id: user.groups?.[0]?.id||'',
      avatar_color: user.avatar_color||'#3654ff',
    });
  },[user]);
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const submit=()=>{
    if(!f.username||!f.username.trim()) return notify(t('users_missing_msnv','Thiếu MSNV'));
    // Leader mở tài khoản có vai trò mình không gán được → không gửi role (giữ nguyên)
    onSave(isLeader && !['user','assistant'].includes(user?.role) ? {...f, role: undefined} : f);
  };
  return (
    <Modal show={show} title={`✏️ ${t('users_edit_employee')}`} onClose={onClose} width={560}>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
          <div style={{flex:'1 1 160px'}}><label style={FL}>{t('profile_fullname')}</label><input style={FI} value={f.full_name||''} onChange={e=>s('full_name',e.target.value)}/></div>
          <div style={{flex:'1 1 160px'}}><label style={FL}>MSNV *</label><input style={FI} value={f.username||''} onChange={e=>s('username',e.target.value)} placeholder="019..."/></div>
        </div>
        <div><label style={FL}>Email</label><input type="email" style={FI} value={f.email||''} onChange={e=>s('email',e.target.value)}/></div>
        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
          <RoleSelect value={f.role} onChange={v=>s('role',v)} userId={user?.id} savedRole={user?.role} lockedRole={isLeader && !['user','assistant'].includes(user?.role)}/>
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
          <input type="color" style={{...FI,height:38,cursor:'pointer',padding:4}} value={f.avatar_color||'#3654ff'} onChange={e=>s('avatar_color',e.target.value)}/>
        </div>
        {user?.avatar_url && !isLeader && (
          <div style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',border:`1px solid ${C.line}`,borderRadius:9,background:'var(--wt-surface)'}}>
            <img src={avatarSrc(user.avatar_url)} alt="" style={{width:36,height:36,borderRadius:'50%',objectFit:'cover'}}/>
            <span style={{flex:1,fontSize:12,color:C.sub}}>{t('users_has_photo','Người này đang dùng ảnh tự tải lên')}</span>
            <button type="button" onClick={async()=>{ if(!window.confirm(t('users_remove_photo_confirm','Xóa ảnh đại diện của người này?'))) return;
                try { await api.delete(`/users/${user.id}/avatar`); onClose(); toast({ kind:'success', title:t('users_photo_removed','Đã xóa ảnh đại diện') }); } catch(e){ notify(e); } }}
              style={{padding:'6px 11px',borderRadius:8,border:`1.5px solid ${C.danger}55`,background:C.dangerSoft,color:C.danger,fontSize:12,fontWeight:800,cursor:'pointer'}}>🗑 {t('users_remove_photo','Xóa ảnh')}</button>
          </div>
        )}
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{padding:'8px 16px',borderRadius:9,border:`1.5px solid ${C.line}`,background:'var(--wt-surface)',fontSize:13,fontWeight:700,cursor:'pointer',color:C.sub}}>{t('cancel')}</button>
          <button onClick={submit} style={{padding:'8px 16px',borderRadius:9,border:'none',background:`linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',boxShadow:`0 3px 10px ${C.primary}4d`}}>💾 {t('save')}</button>
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
  const submit=()=>{ if(!f.name.trim()) return notify(t('users_enter_group_name')); onSave(f); setF({name:'',icon:'🏭',leader_id:''}); };
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
        <div style={{fontSize:11,color:C.primary,background:C.primarySoft,padding:'9px 12px',borderRadius:9}}>
          💡 {t('users_group_leader_hint')}
        </div>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{padding:'8px 16px',borderRadius:9,border:`1.5px solid ${C.line}`,background:'var(--wt-surface)',fontSize:13,fontWeight:700,cursor:'pointer',color:C.sub}}>{t('cancel')}</button>
          <button onClick={submit} style={{padding:'8px 16px',borderRadius:9,border:'none',background:`linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',boxShadow:`0 3px 10px ${C.primary}4d`}}>💾 {t('users_create_group_btn')}</button>
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
          <label style={FL}>{t('users_group_leader')}</label>
          <select style={FI} value={f.leader_id||''} onChange={e=>s('leader_id',e.target.value)}>
            <option value="">-- {t('users_choose_leader')} --</option>
            {members.map(m=><option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
        </div>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{padding:'8px 16px',borderRadius:9,border:`1.5px solid ${C.line}`,background:'var(--wt-surface)',fontSize:13,fontWeight:700,cursor:'pointer',color:C.sub}}>{t('cancel')}</button>
          <button onClick={()=>onSave(f)} style={{padding:'8px 16px',borderRadius:9,border:'none',background:`linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',boxShadow:`0 3px 10px ${C.primary}4d`}}>💾 {t('save')}</button>
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
            <div key={u.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',background:C.canvas,borderRadius:9,cursor:'pointer'}}
              onMouseEnter={e=>e.currentTarget.style.background=C.primarySoft}
              onMouseLeave={e=>e.currentTarget.style.background=C.canvas}>
              <Chip color={u.avatar_color||C.primary} name={u.full_name} size={28} src={u.avatar_url}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:C.ink,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{u.full_name}</div>
                <div style={{fontSize:11,color:C.faint}}>{u.role} · {u.email}</div>
              </div>
              <button onClick={()=>{ onAdd(u.id); }}
                style={{padding:'5px 12px',borderRadius:8,border:'none',background:`linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`,color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',flexShrink:0}}>
                ➕ {t('add')}
              </button>
            </div>
          ))}
          {!filtered.length&&<div style={{textAlign:'center',padding:20,color:C.faint,fontSize:13}}>{t('users_not_found')}</div>}
        </div>
        <div style={{display:'flex',justifyContent:'flex-end',paddingTop:8,borderTop:`1px solid ${C.line}`}}>
          <button onClick={()=>{ setSearch(''); onClose(); }}
            style={{padding:'8px 16px',borderRadius:9,border:`1.5px solid ${C.line}`,background:'var(--wt-surface)',fontSize:13,fontWeight:700,cursor:'pointer',color:C.sub}}>
            {t('users_close')}
          </button>
        </div>
      </div>
    </Modal>
  );
}