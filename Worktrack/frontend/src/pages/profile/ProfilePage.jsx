import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import useAuth from '../../store/authStore';

const C = {
  primary:'#3a7bd5', dark:'#1e2a3a', success:'#27ae60',
  danger:'#e74c3c', border:'#e8eaed', bg:'#f7f8fb',
};

const FI = { width:'100%', padding:'9px 12px', border:'1.5px solid #dde3f0', borderRadius:8, fontSize:13, color:'#1e2a3a', outline:'none', boxSizing:'border-box' };
const FL = { display:'block', fontSize:11, fontWeight:700, color:'#777', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:5 };

const COLORS = ['#3a7bd5','#27ae60','#e67e22','#e74c3c','#8e44ad','#16a085','#2980b9','#c0392b','#d35400','#1abc9c'];
const ROLE_KEY = { admin:'role_admin', manager:'role_manager', leader:'role_leader', user:'role_user' };

export default function ProfilePage() {
  const { t } = useTranslation();
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
    if (!pwd.old_password||!pwd.new_password) { setPwdMsg('error:'+t('profile_err_fill_all')); return; }
    if (pwd.new_password !== pwd.confirm)      { setPwdMsg('error:'+t('profile_err_mismatch')); return; }
    if (pwd.new_password.length < 6)           { setPwdMsg('error:'+t('profile_err_min_length')); return; }
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
        {ok ? `✅ ${t('profile_saved')}` : '❌ ' + msg.replace('error:','')}
      </div>
    );
  };

  if (!user) return null;

  return (
    <div className="prof-root" style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#fff', minWidth:0 }}>
      <style>{`
        .prof-root { box-sizing: border-box; }
        .prof-root *, .prof-root *::before, .prof-root *::after { box-sizing: border-box; }

        /* ── Cảm giác chạm mượt & phản hồi khi nhấn ── */
        .prof-root button { -webkit-tap-highlight-color: transparent; touch-action: manipulation; transition: transform .1s ease, background .15s, color .15s, border-color .15s; }
        .prof-root button:active { transform: scale(0.96); }
        .prof-root .prof-swatch { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
        .prof-root .prof-swatch:active { transform: scale(0.88) !important; }
        .prof-root .prof-tab { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }

        /* ── Card nổi nhẹ khi hover (desktop) ── */
        .prof-root .prof-avatar-card, .prof-root .prof-main-card { transition: box-shadow .2s ease, transform .2s ease; }
        @media (hover: hover) {
          .prof-root .prof-avatar-card:hover, .prof-root .prof-main-card:hover { box-shadow: 0 6px 24px rgba(30,42,58,0.08); }
        }

        /* ── Focus rõ ràng cho bàn phím (a11y) ── */
        .prof-root *:focus-visible { outline: 2px solid ${C.primary}; outline-offset: 2px; border-radius: 4px; }

        /* ── Chặn Safari iOS tự zoom khi focus input ── */
        .prof-root input:focus { font-size: 16px !important; }

        /* ── Thanh cuộn mảnh, đẹp trên desktop ── */
        .prof-root ::-webkit-scrollbar { width: 8px; height: 8px; }
        .prof-root ::-webkit-scrollbar-track { background: transparent; }
        .prof-root ::-webkit-scrollbar-thumb { background: #c8d4e6; border-radius: 8px; }
        .prof-root ::-webkit-scrollbar-thumb:hover { background: #aebedb; }

        @keyframes profFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .prof-root .prof-avatar-card { animation: profFadeIn .2s ease-out; }
        .prof-root .prof-main-card { animation: profFadeIn .25s ease-out; }

        @media (prefers-reduced-motion: reduce) {
          .prof-root, .prof-root * { animation: none !important; transition: none !important; }
        }

        @media (max-width: 700px) {
          .prof-root .prof-topbar { padding: 10px 14px !important; }
          .prof-root .prof-body { padding: 14px !important; gap: 14px !important; }
          .prof-root .prof-avatar-card { width: 100% !important; }
          .prof-root .prof-main-card { min-width: 0 !important; width: 100% !important; }
          .prof-root .prof-avatar-header { padding: 20px !important; }
          .prof-root .prof-tab-content { padding: 16px !important; }
        }
      `}</style>

      <div className="prof-topbar" style={{ padding:'12px 20px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', background:'#fff', flexShrink:0 }}>
        <div style={{ fontSize:15, fontWeight:800, color:C.dark }}>👤 {t('profile_title')}</div>
      </div>

      <div className="prof-body" style={{ flex:1, overflowY:'auto', padding:24, background:C.bg, display:'flex', gap:20, alignItems:'flex-start', flexWrap:'wrap' }}>

        {/* Avatar card */}
        <div className="prof-avatar-card" style={{ width:220, flexShrink:0, background:'#fff', borderRadius:14, border:`1.5px solid ${C.border}`, overflow:'hidden' }}>
          <div className="prof-avatar-header" style={{ padding:28, display:'flex', flexDirection:'column', alignItems:'center', gap:12, background:C.dark }}>
            <div style={{ width:80, height:80, borderRadius:'50%', background:info.avatar_color, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:28, fontWeight:800, boxShadow:'0 0 0 4px rgba(255,255,255,0.2)' }}>
              {ini}
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:14, fontWeight:700, color:'#fff' }}>{user.full_name}</div>
              <div style={{ fontSize:11, color:'#7a9bbf', marginTop:3 }}>{t(ROLE_KEY[user.role]) || user.role}</div>
            </div>
          </div>

          <div style={{ padding:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#888', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:8 }}>{t('profile_avatar_color')}</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {COLORS.map(c=>(
                <div key={c} className="prof-swatch" onClick={()=>setInfo(p=>({...p,avatar_color:c}))}
                  style={{ width:28, height:28, borderRadius:'50%', background:c, cursor:'pointer', outline:info.avatar_color===c?`3px solid ${C.dark}`:'none', outlineOffset:2, transition:'all .15s' }}/>
              ))}
            </div>
          </div>

          <div style={{ padding:'0 16px 16px', display:'flex', flexDirection:'column', gap:7 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#888', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:2 }}>{t('profile_account')}</div>
            <div style={{ fontSize:12, color:'#555' }}><span style={{ color:'#aaa' }}>{t('profile_username_label')} </span><strong>{user.username}</strong></div>
            <div style={{ fontSize:12, color:'#555' }}>
              <span style={{ color:'#aaa' }}>{t('profile_role_label')} </span>
              <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background:C.primary, color:'#fff' }}>{user.role}</span>
            </div>
            {user.groups?.length>0&&(
              <div style={{ fontSize:12, color:'#555' }}>
                <span style={{ color:'#aaa' }}>{t('group')}: </span>
                {user.groups.map(g=><span key={g.id} style={{ fontSize:10, background:'#f0f2f8', padding:'2px 7px', borderRadius:6, marginRight:4 }}>{g.name}</span>)}
              </div>
            )}
          </div>
        </div>

        {/* Main card */}
        <div className="prof-main-card" style={{ flex:1, minWidth:300, background:'#fff', borderRadius:14, border:`1.5px solid ${C.border}`, overflow:'hidden' }}>
          <div style={{ display:'flex', borderBottom:`2px solid ${C.border}`, padding:'0 20px' }}>
            {[{key:'info',label:`📝 ${t('profile_tab_info')}`},{key:'pwd',label:`🔑 ${t('profile_tab_password')}`}].map(tb=>(
              <div key={tb.key} className="prof-tab" onClick={()=>{ setInfoMsg(''); setPwdMsg(''); setTab(tb.key); }} style={{
                padding:'12px 18px', fontSize:13, fontWeight:600, cursor:'pointer',
                borderBottom:`2.5px solid ${tab===tb.key?C.primary:'transparent'}`,
                marginBottom:-2, color:tab===tb.key?C.primary:'#888',
              }}>{tb.label}</div>
            ))}
          </div>

          {tab==='info'&&(
            <div className="prof-tab-content" style={{ padding:24, display:'flex', flexDirection:'column', gap:16 }}>
              <div><label style={FL}>{t('profile_fullname')} *</label><input style={FI} value={info.full_name} onChange={e=>setInfo(p=>({...p,full_name:e.target.value}))} placeholder="Nguyễn Văn A"/></div>
              <div><label style={FL}>Email</label><input type="email" style={FI} value={info.email} onChange={e=>setInfo(p=>({...p,email:e.target.value}))} placeholder="email@company.com"/></div>
              <div>
                <label style={FL}>Username</label>
                <input style={{...FI,background:'#f5f6f8',color:'#aaa'}} value={user.username} disabled/>
                <div style={{ fontSize:11, color:'#bbb', marginTop:4 }}>{t('profile_username_immutable')}</div>
              </div>
              <Msg msg={infoMsg}/>
              <div style={{ display:'flex', justifyContent:'flex-end' }}>
                <button onClick={saveInfo} disabled={savingInfo}
                  style={{ padding:'9px 24px', borderRadius:8, border:'none', background:savingInfo?'#aaa':C.primary, color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                  {savingInfo?'...':`💾 ${t('profile_save_info')}`}
                </button>
              </div>
            </div>
          )}

          {tab==='pwd'&&(
            <div className="prof-tab-content" style={{ padding:24, display:'flex', flexDirection:'column', gap:16 }}>
              <div><label style={FL}>{t('profile_current_password')} *</label><input type="password" style={FI} value={pwd.old_password} onChange={e=>setPwd(p=>({...p,old_password:e.target.value}))} placeholder="••••••••"/></div>
              <div><label style={FL}>{t('profile_new_password')} *</label><input type="password" style={FI} value={pwd.new_password} onChange={e=>setPwd(p=>({...p,new_password:e.target.value}))} placeholder={t('profile_min_chars')}/></div>
              <div>
                <label style={FL}>{t('profile_confirm_password')} *</label>
                <input type="password"
                  style={{...FI, borderColor:pwd.confirm&&pwd.new_password!==pwd.confirm?C.danger:'#dde3f0'}}
                  value={pwd.confirm} onChange={e=>setPwd(p=>({...p,confirm:e.target.value}))} placeholder={t('profile_reenter_password')}/>
                {pwd.confirm&&pwd.new_password!==pwd.confirm&&<div style={{ fontSize:11, color:C.danger, marginTop:4 }}>{t('profile_err_mismatch')}</div>}
              </div>
              <Msg msg={pwdMsg}/>
              <div style={{ display:'flex', justifyContent:'flex-end' }}>
                <button onClick={savePwd} disabled={savingPwd}
                  style={{ padding:'9px 24px', borderRadius:8, border:'none', background:savingPwd?'#aaa':C.primary, color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                  {savingPwd?'...':`🔑 ${t('profile_change_password')}`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}