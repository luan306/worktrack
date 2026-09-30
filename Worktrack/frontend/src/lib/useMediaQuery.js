import { useState, useEffect } from 'react';

// true khi màn hình rộng tối đa `max` px — tự cập nhật khi xoay / đổi kích thước
export default function useMaxWidth(max) {
  const q = `(max-width: ${max}px)`;
  const [match, setMatch] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return match;
}
