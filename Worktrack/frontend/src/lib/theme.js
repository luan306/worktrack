// Chế độ sáng / tối — lưu trên trình duyệt ('light' | 'dark'); chưa chọn thì theo hệ điều hành.
// <html data-theme> đã được đặt sẵn trong index.html trước khi vẽ trang (không chớp trắng).
import { useSyncExternalStore } from 'react';

const KEY = 'wt_theme';
const listeners = new Set();

const current = () => document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';

export function setTheme(theme) {
  const apply = () => {
    document.documentElement.setAttribute('data-theme', theme);
    listeners.forEach(fn => fn());
  };
  try { localStorage.setItem(KEY, theme); } catch { /* trình duyệt chặn lưu → chỉ đổi phiên này */ }
  // Mờ dần bằng View Transitions (1 hiệu ứng cho cả trang); trình duyệt cũ → đổi ngay
  if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.startViewTransition(apply);
  } else apply();
}

export const toggleTheme = () => setTheme(current() === 'dark' ? 'light' : 'dark');

// Chưa từng chọn → đổi theo hệ điều hành khi người dùng đổi giao diện máy
try {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch { /* bỏ qua */ }
    if (!saved) { document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light'); listeners.forEach(fn => fn()); }
  });
} catch { /* trình duyệt cũ */ }

const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const useTheme = () => useSyncExternalStore(subscribe, current, () => 'light');
