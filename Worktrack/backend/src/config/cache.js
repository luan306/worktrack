const store = new Map();

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
    if (!pattern) { store.clear(); return; }
    for (const k of store.keys()) {
      if (k.includes(pattern)) store.delete(k);
    }
  },
};

module.exports = cache;