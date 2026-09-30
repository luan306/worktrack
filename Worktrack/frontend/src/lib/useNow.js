import { useEffect, useState } from 'react';

// Đồng hồ DÙNG CHUNG cho mọi bộ đếm giờ (đếm ngược deadline, giờ công...).
// Trước đây mỗi thẻ CV tự chạy 1 setInterval riêng → 200 thẻ = 200 timer,
// mỗi giây React phải vẽ lại 200 lần riêng lẻ → trang giật/lag. Giờ mỗi chu
// kỳ chỉ có 1 timer, tất cả thẻ cập nhật trong cùng 1 lần vẽ.
const clocks = new Map(); // periodMs → { subs: Set, timer }

function subscribe(period, fn) {
  let clock = clocks.get(period);
  if (!clock) {
    clock = { subs: new Set(), timer: null };
    clock.timer = setInterval(() => {
      const now = Date.now();
      clock.subs.forEach(f => f(now));
    }, period);
    clocks.set(period, clock);
  }
  clock.subs.add(fn);
  return () => {
    clock.subs.delete(fn);
    if (!clock.subs.size) { clearInterval(clock.timer); clocks.delete(period); }
  };
}

// Trả về Date.now(), tự cập nhật mỗi `period` ms khi `enabled`.
// `period` có thể là hàm (now) => ms để đổi nhịp theo thời gian còn lại.
export function useNow(period = 1000, enabled = true) {
  const [now, setNow] = useState(() => Date.now());
  const ms = typeof period === 'function' ? period(now) : period;
  useEffect(() => (enabled ? subscribe(ms, setNow) : undefined), [ms, enabled]);
  return now;
}
