import { useTranslation } from 'react-i18next';
import { useTheme, toggleTheme } from '../lib/theme';

// Nút bật/tắt chế độ tối. `compact` = chỉ icon (sidebar thu gọn, thanh trên điện thoại).
export default function ThemeToggle({ compact = false, className = '' }) {
  const { t } = useTranslation();
  const dark = useTheme() === 'dark';
  const label = dark ? t('theme_light', 'Chế độ sáng') : t('theme_dark', 'Chế độ tối');
  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={label}
      aria-label={label}
      aria-pressed={dark}
      className={`group flex items-center gap-2.5 rounded-lg text-[#8093b0] transition-colors duration-150 hover:bg-white/[0.06] hover:text-white ${compact ? 'h-9 w-9 justify-center' : 'w-full px-3 py-2 text-[12px] font-medium'} ${className}`}
    >
      {/* Công tắc trượt: mặt trời ↔ mặt trăng */}
      <span className="relative flex h-5 w-9 flex-shrink-0 items-center rounded-full border border-white/10 transition-colors duration-300"
        style={{ background: dark ? 'linear-gradient(135deg,#1b2a55,#3654ff)' : 'linear-gradient(135deg,#fde68a,#f59e0b)' }}>
        <span className="absolute top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[9px] shadow transition-all duration-300"
          style={{ left: dark ? 18 : 2 }}>{dark ? '🌙' : '☀️'}</span>
      </span>
      {!compact && <span className="truncate">{label}</span>}
    </button>
  );
}
