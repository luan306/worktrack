import { useState } from 'react';
import api from '../../api/client';
import useAuth from '../../store/authStore';

const C = {
  primary:'#3a7bd5', dark:'#1e2a3a', success:'#27ae60',
  danger:'#e74c3c', border:'#e8eaed', bg:'#f7f8fb',
};

const FI = { width:'100%', padding:'9px 12px', border:'1.5px solid #dde3f0', borderRadius:8, fontSize:13, color:'#1e2a3a', outline:'none', boxSizing:'border-box' };
const FL = { display:'block', fontSize:11, fontWeight:700, color:'#777', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:5 };

const COLORS = ['#3a7bd5','#27ae60','#e67e22','#e74c3c','#8e44ad','#16a085','#2980b9','#c0392b','#d35400','#1abc9c'];
const ROLE_LABEL = { admin:'Administrator', manager:'Manager', leader:'Leader', user:'User' };

export default function ProfilePage() {
  const { user, fetchMe } = useAuth();
  const ini = user?.full_name?.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() || 'U';

  const [tab,       setTab]       = useState('info');
  const [info,      setInfo]      = useState({ full_name:user?.full_name||'', email:user?.email||'', avatar_color:user?.avatar_color||'#3a7bd5' });
  const [savingInfo,setSavingInfo]= useState(false);
  const [infoMsg,   setInfoMsg]   = useState('');
  const [pwd,       setPwd]       = useState({ old_password:'', new_password:'', confirm:'' });
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdMsg,    setPwdMsg]    = useState('');

  const saveInfo = async () => {
    setSavingInfo(true); setInfoMsg('');
    try {
      await api.put(`/users/${user.id}`, { full_name:info.full_name, email:info.email, avatar_color:info.avatar_color });
      await fetchMe();
      setInfoMsg('success');
    } catch(e) { setInfoMsg('error:' + (e.response?.data?.message||e.message)); }
    finally { setSavingInfo(false); }
  };

  const savePwd = async () => {
    if (!pwd.old_password||!pwd.new_password) { setPwdMsg('error:Nhập đủ mật khẩu!'); return; }
    if (pwd.new_password !== pwd.confirm)      { setPwdMsg('error:Mật khẩu mới không khớp!'); return; }
    if (pwd.new_password.length < 6)           { setPwdMsg('error:Mật khẩu tối thiểu 6 ký tự!'); return; }
    setSavingPwd(true); setPwdMsg('');
    try {
      await api.post('/auth/change-password', { old_password:pwd.old_password, new_password:pwd.new_password });
      setPwd({ old_password:'', new_password:'', confirm:'' });
      setPwdMsg('success');
    } catch(e) { setPwdMsg('error:' + (e.response?.data?.message||e.message)); }
    finally { setSavingPwd(false); }
  };

  const Msg = ({msg}) => {
    if (!msg) return null;
    const ok = msg==='success';
    return (
      <div style={{ padding:'10px 14px', borderRadius:8, fontSize:13, fontWeight:600,
        background:ok?'#e8f8ee':'#fde8e8', color:ok?C.success:C.danger }}>
        {ok ? '✅ Đã lưu thành công!' : '❌ ' + msg.replace('error:','')}
      </div>
    );
  };

  if (!user) return null;

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#fff' }}>
      <div style={{ padding:'12px 20px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', background:'#fff', flexShrink:0 }}>
        <div style={{ fontSize:15, fontWeight:800, color:C.dark }}>👤 Thông tin cá nhân</div>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:24, background:C.bg, display:'flex', gap:20, alignItems:'flex-start', flexWrap:'wrap' }}>

        {/* Avatar card */}
        <div style={{ width:220, flexShrink:0, background:'#fff', borderRadius:14, border:`1.5px solid ${C.border}`, overflow:'hidden' }}>
          <div style={{ padding:28, display:'flex', flexDirection:'column', alignItems:'center', gap:12, background:C.dark }}>
            <div style={{ width:80, height:80, borderRadius:'50%', background:info.avatar_color, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:28, fontWeight:800, boxShadow:'0 0 0 4px rgba(255,255,255,0.2)' }}>
              {ini}
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:14, fontWeight:700, color:'#fff' }}>{user.full_name}</div>
              <div style={{ fontSize:11, color:'#7a9bbf', marginTop:3 }}>{ROLE_LABEL[user.role]||user.role}</div>
            </div>
          </div>

          <div style={{ padding:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#888', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:8 }}>Màu avatar</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {COLORS.map(c=>(
                <div key={c} onClick={()=>setInfo(p=>({...p,avatar_color:c}))}
                  style={{ width:28, height:28, borderRadius:'50%', background:c, cursor:'pointer', outline:info.avatar_color===c?`3px solid ${C.dark}`:'none', outlineOffset:2, transition:'all .15s' }}/>
              ))}
            </div>
          </div>

          <div style={{ padding:'0 16px 16px', display:'flex', flexDirection:'column', gap:7 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#888', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:2 }}>Tài khoản</div>
            <div style={{ fontSize:12, color:'#555' }}><span style={{ color:'#aaa' }}>Username: </span><strong>{user.username}</strong></div>
            <div style={{ fontSize:12, color:'#555' }}>
              <span style={{ color:'#aaa' }}>Quyền: </span>
              <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background:C.primary, color:'#fff' }}>{user.role}</span>
            </div>
            {user.groups?.length>0&&(
              <div style={{ fontSize:12, color:'#555' }}>
                <span style={{ color:'#aaa' }}>Nhóm: </span>
                {user.groups.map(g=><span key={g.id} style={{ fontSize:10, background:'#f0f2f8', padding:'2px 7px', borderRadius:6, marginRight:4 }}>{g.name}</span>)}
              </div>
            )}
          </div>
        </div>

        {/* Main card */}
        <div style={{ flex:1, minWidth:300, background:'#fff', borderRadius:14, border:`1.5px solid ${C.border}`, overflow:'hidden' }}>
          <div style={{ display:'flex', borderBottom:`2px solid ${C.border}`, padding:'0 20px' }}>
            {[{key:'info',label:'📝 Thông tin'},{key:'pwd',label:'🔑 Đổi mật khẩu'}].map(t=>(
              <div key={t.key} onClick={()=>{ setInfoMsg(''); setPwdMsg(''); setTab(t.key); }} style={{
                padding:'12px 18px', fontSize:13, fontWeight:600, cursor:'pointer',
                borderBottom:`2.5px solid ${tab===t.key?C.primary:'transparent'}`,
                marginBottom:-2, color:tab===t.key?C.primary:'#888',
              }}>{t.label}</div>
            ))}
          </div>

          {tab==='info'&&(
            <div style={{ padding:24, display:'flex', flexDirection:'column', gap:16 }}>
              <div><label style={FL}>Họ tên *</label><input style={FI} value={info.full_name} onChange={e=>setInfo(p=>({...p,full_name:e.target.value}))} placeholder="Nguyễn Văn A"/></div>
              <div><label style={FL}>Email</label><input type="email" style={FI} value={info.email} onChange={e=>setInfo(p=>({...p,email:e.target.value}))} placeholder="email@company.com"/></div>
              <div>
                <label style={FL}>Username</label>
                <input style={{...FI,background:'#f5f6f8',color:'#aaa'}} value={user.username} disabled/>
                <div style={{ fontSize:11, color:'#bbb', marginTop:4 }}>Username không thể thay đổi</div>
              </div>
              <Msg msg={infoMsg}/>
              <div style={{ display:'flex', justifyContent:'flex-end' }}>
                <button onClick={saveInfo} disabled={savingInfo}
                  style={{ padding:'9px 24px', borderRadius:8, border:'none', background:savingInfo?'#aaa':C.primary, color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                  {savingInfo?'...':'💾 Lưu thông tin'}
                </button>
              </div>
            </div>
          )}

          {tab==='pwd'&&(
            <div style={{ padding:24, display:'flex', flexDirection:'column', gap:16 }}>
              <div><label style={FL}>Mật khẩu hiện tại *</label><input type="password" style={FI} value={pwd.old_password} onChange={e=>setPwd(p=>({...p,old_password:e.target.value}))} placeholder="••••••••"/></div>
              <div><label style={FL}>Mật khẩu mới *</label><input type="password" style={FI} value={pwd.new_password} onChange={e=>setPwd(p=>({...p,new_password:e.target.value}))} placeholder="Tối thiểu 6 ký tự"/></div>
              <div>
                <label style={FL}>Xác nhận mật khẩu mới *</label>
                <input type="password"
                  style={{...FI, borderColor:pwd.confirm&&pwd.new_password!==pwd.confirm?C.danger:'#dde3f0'}}
                  value={pwd.confirm} onChange={e=>setPwd(p=>({...p,confirm:e.target.value}))} placeholder="Nhập lại mật khẩu mới"/>
                {pwd.confirm&&pwd.new_password!==pwd.confirm&&<div style={{ fontSize:11, color:C.danger, marginTop:4 }}>Mật khẩu không khớp</div>}
              </div>
              <Msg msg={pwdMsg}/>
              <div style={{ display:'flex', justifyContent:'flex-end' }}>
                <button onClick={savePwd} disabled={savingPwd}
                  style={{ padding:'9px 24px', borderRadius:8, border:'none', background:savingPwd?'#aaa':C.primary, color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                  {savingPwd?'...':'🔑 Đổi mật khẩu'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}