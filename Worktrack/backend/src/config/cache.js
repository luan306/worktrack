const store = new Map();
const inflight = new Map();

const cache = {
  get(key) {
    const item = store.get(key);
    if (!item) return null;
    if (Date.now() > item.exp) { store.delete(key); return null; }
    return item.val;
  },
  set(key, val, ttlMs = 10000) {
    store.set(key, { val, exp: Date.now() + ttlMs });
  },
  del(key) { store.delete(key); },
  clear(pattern) {
    if (!pattern) { store.clear(); inflight.clear(); return; }
    for (const k of store.keys()) {
      if (k.includes(pattern)) store.delete(k);
    }
    // Truy vấn đang chạy dở cũng có thể trả dữ liệu cũ → không cho request sau dùng lại
    for (const k of inflight.keys()) {
      if (k.includes(pattern)) inflight.delete(k);
    }
  },
  // Lấy từ cache, nếu chưa có thì chạy fn() rồi lưu lại. Nhiều request cùng
  // lúc hỏi CÙNG 1 key (VD: 100 người cùng tải lại danh sách sau 1 thông báo
  // realtime) chỉ chạy fn() ĐÚNG 1 LẦN, các request còn lại chờ chung kết quả.
  async wrap(key, ttlMs, fn) {
    const hit = cache.get(key);
    if (hit !== null) return hit;
    if (inflight.has(key)) return inflight.get(key);
    const p = (async () => {
      try {
        const val = await fn();
        if (inflight.get(key) === p) cache.set(key, val, ttlMs); // không lưu nếu đã bị clear giữa chừng
        return val;
      } finally {
        if (inflight.get(key) === p) inflight.delete(key);
      }
    })();
    inflight.set(key, p);
    return p;
  },
};

// Dọn key hết hạn định kỳ — trước đây key chỉ bị xóa khi có người đọc lại
// đúng key đó, nên các key theo ngày/tuần (board:<nhóm>:<ngày>...) tích tụ mãi
// trong RAM của server.
setInterval(() => {
  const now = Date.now();
  for (const [k, item] of store) if (now > item.exp) store.delete(k);
}, 60 * 1000).unref();

module.exports = cache;
