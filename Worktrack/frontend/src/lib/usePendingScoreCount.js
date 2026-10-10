// Số ngày "CHỜ CHẤM" (đã ghi việc, chưa có điểm) của những người mình chấm được
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
  // Con số trên menu không cần tức thì
  useEffect(() => (enabled ? onRealtime('worklog:updated', () => setTick(n => n + 1), { wait: 3000, jitter: 4000 }) : undefined), [enabled]);
  return enabled ? count : 0;
}
