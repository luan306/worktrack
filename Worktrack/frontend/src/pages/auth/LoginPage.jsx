import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useAuth from '../../store/authStore';
import i18n from '../../i18n';

const LANGS = [{ c:'en', l:'🇬🇧 EN' }, { c:'ja', l:'🇯🇵 JP' }, { c:'vi', l:'🇻🇳 VI' }];

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const login = useAuth(s => s.login);
  const [form, setForm]   = useState({ username:'', password:'' });
  const [show, setShow]   = useState(false);
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState('');
  const [lang, setLang]   = useState(localStorage.getItem('lang') || 'en');

  const switchLang = c => { setLang(c); i18n.changeLanguage(c); localStorage.setItem('lang', c); };

  // Xóa lỗi khi người dùng bắt đầu sửa lại thông tin — nhưng lỗi vẫn hiển thị
  // liên tục cho đến lúc đó, không tự động biến mất sau vài giây.
  const updateField = (key, value) => {
    setForm(p => ({ ...p, [key]: value }));
    if (err) setErr('');
  };

  const submit = async e => {
    e.preventDefault();
    if (!form.username || !form.password) { setErr(t('login_fill_required')); return; }
    setBusy(true); setErr('');
    try { await login(form.username, form.password); navigate('/'); }
    catch { setErr(t('bad_creds')); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 py-8">
      <div className="flex w-full max-w-3xl flex-col md:flex-row bg-white rounded-2xl shadow-xl overflow-hidden md:min-h-[520px]">

        {/* Branding */}
        <div className="md:flex-1 bg-[#1e2a3a] p-6 sm:p-8 md:p-10 flex flex-col justify-center relative overflow-hidden">
          <div className="absolute w-40 h-40 md:w-64 md:h-64 rounded-full bg-blue-500/10 -top-10 -right-10 md:-top-16 md:-right-16" />
          <div className="absolute w-28 h-28 md:w-44 md:h-44 rounded-full bg-blue-500/10 -bottom-6 -left-6 md:-bottom-10 md:-left-10" />
          <div className="relative z-10">
            <div className="mb-4 flex justify-start">
              <div className="bg-white px-3 py-2 rounded">
                <img
                  src="./src/assets/smc_logo.png"
                  alt="Logo"
                  className="h-8 md:h-10 w-auto"
                />
              </div>
            </div>
            <h1 className="text-xl md:text-2xl font-black text-white">WorkTrack</h1>
            <p className="text-[#7a9bbf] text-sm mt-1 leading-relaxed">{t('sidebar_tagline')}<br/>{t('brand_subtitle')}</p>
            <div className="w-8 h-0.5 bg-[#3a7bd5] rounded my-5" />
            <div className="hidden sm:block">
              {[
                ['📋', t('nav_board_short')],
                ['📨', t('nav_requests_short')],
              ].map(([icon, text]) => (
                <div key={text} className="flex items-center gap-3 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center text-sm flex-shrink-0">{icon}</div>
                  <span className="text-[#9db8d2] text-xs">{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="w-full md:w-96 p-6 sm:p-8 md:p-10 flex flex-col justify-center">
          {/* Lang */}
          <div className="flex gap-2 mb-6 flex-wrap">
            {LANGS.map(l => (
              <button key={l.c} onClick={() => switchLang(l.c)}
                className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                  lang===l.c ? 'bg-[#1e2a3a] text-white border-[#1e2a3a]' : 'bg-white text-gray-500 border-gray-200 hover:border-[#3a7bd5] hover:text-[#3a7bd5]'
                }`}>{l.l}</button>
            ))}
          </div>

          <h2 className="text-xl font-black text-[#1e2a3a] mb-1">{t('sign_in')}</h2>
          <p className="text-gray-400 text-sm mb-3">{t('welcome')}</p>

          {/* Banner lỗi — to, rõ, đứng yên cho đến khi người dùng sửa lại thông tin */}
          {err && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-600 text-sm font-medium rounded-lg px-3 py-2.5 mb-4">
              <span className="flex-shrink-0">⚠️</span>
              <span>{err}</span>
            </div>
          )}

          <form onSubmit={submit} className="flex flex-col gap-4">
            <div>
              <label className="label">{t('username')}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">👤</span>
                <input className={`input pl-9 w-full ${err ? 'border-red-400' : ''}`}
                  value={form.username} onChange={e => updateField('username', e.target.value)}
                  placeholder="username or email" autoComplete="username" />
              </div>
            </div>
            <div>
              <label className="label">{t('password')}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔑</span>
                <input className={`input pl-9 pr-9 w-full ${err ? 'border-red-400' : ''}`}
                  type={show ? 'text' : 'password'} value={form.password}
                  onChange={e => updateField('password', e.target.value)}
                  placeholder="••••••••" autoComplete="current-password" />
                <button type="button" onClick={() => setShow(p=>!p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#3a7bd5] text-sm">
                  {show ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <div className="text-right -mt-2">
              <span className="text-xs text-[#3a7bd5] cursor-pointer hover:underline">{t('forgot')}</span>
            </div>

            <button type="submit" disabled={busy}
              className="btn btn-primary w-full justify-center py-3">
              {busy ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  {t('login_signing_in')}
                </span>
              ) : t('login_btn')}
            </button>


          </form>

          <p className="text-center text-xs text-gray-300 mt-8">© 2026 WorkTrack</p>
        </div>
      </div>
    </div>
  );
}