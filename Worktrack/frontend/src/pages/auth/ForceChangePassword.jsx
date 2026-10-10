// Màn BẮT BUỘC đổi mật khẩu: hiện thay cho toàn bộ ứng dụng khi tài khoản còn dùng mật khẩu mặc định
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import useAuth from '../../store/authStore';

const MIN_PASSWORD = 8; // khớp MIN_PASSWORD ở backend

const field = {
  width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 10, fontSize: 14,
  border: '1.5px solid var(--wt-line)', background: 'var(--wt-surface)', color: 'var(--wt-ink)', outline: 'none', fontFamily: 'inherit',
};
const label = { display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--wt-text-3)', marginBottom: 6 };

export default function ForceChangePassword() {
  const { t } = useTranslation();
  const { user, login, logout } = useAuth();
  const [form, setForm] = useState({ old_password: '', new_password: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => { setForm(f => ({ ...f, [k]: e.target.value })); setErr(''); };

  const mismatch = !!form.confirm && form.new_password !== form.confirm;
  const submit = async (e) => {
    e.preventDefault();
    if (!form.old_password || !form.new_password) return setErr(t('profile_err_fill_all', 'Vui lòng nhập đầy đủ thông tin'));
    if (form.new_password.length < MIN_PASSWORD) return setErr(t('fpw_err_min', { defaultValue: 'Mật khẩu mới phải có ít nhất {{n}} ký tự', n: MIN_PASSWORD }));
    if (form.new_password === form.old_password) return setErr(t('fpw_err_same', 'Mật khẩu mới phải khác mật khẩu hiện tại'));
    if (form.new_password !== form.confirm) return setErr(t('profile_err_mismatch', 'Mật khẩu nhập lại không khớp'));
    setBusy(true);
    try {
      await api.post('/auth/change-password', { old_password: form.old_password, new_password: form.new_password });
      // Đổi mật khẩu làm hết hiệu lực mọi phiên cũ
      await login(user.username, form.new_password);
    } catch (e2) {
      setErr(e2.response?.data?.message || e2.message);
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'var(--wt-canvas)', fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}>
      <form onSubmit={submit} style={{ width: 'min(420px, 100%)', background: 'var(--wt-surface)', border: '1px solid var(--wt-line)', borderRadius: 18, boxShadow: '0 24px 60px rgba(15,23,41,.14)', overflow: 'hidden' }}>
        <div style={{ padding: '22px 24px 18px', borderBottom: '1px solid var(--wt-line)', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <span style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, background: 'var(--wt-tint-warning)', border: '1px solid var(--wt-tint-warning-bd)' }}>🔑</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--wt-ink)', letterSpacing: -.2 }}>{t('fpw_title', 'Đổi mật khẩu để tiếp tục')}</div>
            <div style={{ fontSize: 12.5, color: 'var(--wt-text-3)', lineHeight: 1.5, marginTop: 4 }}>
              {t('fpw_desc', 'Tài khoản của bạn đang dùng mật khẩu mặc định. Vì an toàn, hãy đặt mật khẩu riêng trước khi sử dụng hệ thống.')}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--wt-text-2)', marginTop: 8 }}>👤 {user?.full_name} · {user?.username}</div>
          </div>
        </div>

        <div style={{ padding: '18px 24px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={label} htmlFor="fpw-old">{t('profile_current_password', 'Mật khẩu hiện tại')}</label>
            <input id="fpw-old" autoFocus type={show ? 'text' : 'password'} autoComplete="current-password" value={form.old_password} onChange={set('old_password')} style={field} />
          </div>
          <div>
            <label style={label} htmlFor="fpw-new">{t('profile_new_password', 'Mật khẩu mới')}</label>
            <input id="fpw-new" type={show ? 'text' : 'password'} autoComplete="new-password" value={form.new_password} onChange={set('new_password')} style={field} />
            <div style={{ fontSize: 11.5, color: 'var(--wt-text-4)', marginTop: 5 }}>{t('fpw_hint', { defaultValue: 'Ít nhất {{n}} ký tự, khác mật khẩu mặc định.', n: MIN_PASSWORD })}</div>
          </div>
          <div>
            <label style={label} htmlFor="fpw-confirm">{t('profile_confirm_password', 'Xác nhận mật khẩu')}</label>
            <input id="fpw-confirm" type={show ? 'text' : 'password'} autoComplete="new-password" value={form.confirm} onChange={set('confirm')}
              style={{ ...field, borderColor: mismatch ? '#e5384d' : 'var(--wt-line)' }} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--wt-text-3)', cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} /> {t('fpw_show', 'Hiện mật khẩu')}
          </label>

          {err && <div role="alert" style={{ padding: '9px 12px', borderRadius: 10, fontSize: 12.5, fontWeight: 600, color: '#e5384d', background: 'var(--wt-tint-danger)', border: '1px solid var(--wt-tint-danger-bd)' }}>{err}</div>}

          <button type="submit" disabled={busy} style={{ padding: '12px 16px', borderRadius: 11, border: 'none', cursor: busy ? 'default' : 'pointer', fontSize: 14, fontWeight: 800, color: '#fff', fontFamily: 'inherit', opacity: busy ? .7 : 1, background: 'linear-gradient(135deg, #3654ff, #2440d6)', boxShadow: '0 4px 14px rgba(54,84,255,.35)' }}>
            {busy ? '...' : t('fpw_submit', 'Đổi mật khẩu và vào hệ thống')}
          </button>
          <button type="button" onClick={() => logout().then(() => { window.location.href = '/login'; })} style={{ padding: '6px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--wt-text-3)', fontFamily: 'inherit' }}>
            {t('logout', 'Đăng xuất')}
          </button>
        </div>
      </form>
    </div>
  );
}
