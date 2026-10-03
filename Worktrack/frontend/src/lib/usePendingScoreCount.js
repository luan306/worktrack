// Số ngày "CHỜ CHẤM" (đã ghi việc, chưa có điểm) của những người mình chấm được.
// Dùng cho số đỏ trên menu "CV Hằng ngày" và tab "Chờ chấm". Tự cập nhật khi có ai ghi việc / chấm điểm.
import { useState, useEffect } from 'react';
import api from '../api/client';
import { onRealtime } from './socket';

export default function usePendingScoreCount(enabled) {
  const [count, setCount] = useState(0);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    api.get('/worklog/pending', { params: { count: 1 } })
      .then(r => { if (alive) setCount(r.data.data?.total || 0); })
      .catch(() => {});
    return () => { alive = false; };
  }, [enabled, tick]);
  useEffect(() => (enabled ? onRealtime('worklog:updated', () => setTick(n => n + 1)) : undefined), [enabled]);
  return enabled ? count : 0;
}
