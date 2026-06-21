import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: BASE,
  timeout: 10000,
});

// ── Cache GET responses (TTL 30s) ──
const cache = new Map();
const TTL = 30_000;

function cacheKey(cfg) {
  return `${cfg.url}?${new URLSearchParams(cfg.params||{}).toString()}`;
}

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('access_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  res => {
    // Cache GET
    if (res.config.method === 'get') {
      cache.set(cacheKey(res.config), { data: res.data, ts: Date.now() });
    }
    // Clear cache on mutations
    if (['post','put','patch','delete'].includes(res.config.method)) {
      cache.clear();
    }
    return res;
  },
  async err => {
    const orig = err.config;
    if (err.response?.status !== 401 || orig._retry) return Promise.reject(err);
    if (refreshing) {
      return new Promise((res, rej) => queue.push({ resolve: res, reject: rej }))
        .then(t => { orig.headers.Authorization = `Bearer ${t}`; return api(orig); });
    }
    orig._retry = true; refreshing = true;
    try {
      const rt = localStorage.getItem('refresh_token');
      const { data } = await axios.post(`${BASE}/auth/refresh`, { refresh_token: rt });
      const { access_token, refresh_token } = data.data;
      localStorage.setItem('access_token', access_token);
      localStorage.setItem('refresh_token', refresh_token);
      flush(null, access_token);
      orig.headers.Authorization = `Bearer ${access_token}`;
      return api(orig);
    } catch (e) {
      flush(e, null);
      localStorage.clear();
      window.location.href = '/login';
      return Promise.reject(e);
    } finally { refreshing = false; }
  }
);

// Wrap get để dùng cache
const _get = api.get.bind(api);
api.get = (url, cfg = {}) => {
  const key = `${url}?${new URLSearchParams(cfg.params||{}).toString()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL) {
    // Return cached as promise
    return Promise.resolve({ data: hit.data, config: { method: 'get', url, ...cfg } });
  }
  return _get(url, cfg);
};

// Prefetch helper — gọi trước khi cần
api.prefetch = (url, cfg = {}) => {
  const key = `${url}?${new URLSearchParams(cfg.params||{}).toString()}`;
  const hit = cache.get(key);
  if (!hit || Date.now() - hit.ts > TTL) {
    _get(url, cfg).catch(() => {});
  }
};

export const clearApiCache = () => cache.clear();

let refreshing = false;
let queue = [];
const flush = (err, token) => { queue.forEach(p => err ? p.reject(err) : p.resolve(token)); queue = []; };

export default api;