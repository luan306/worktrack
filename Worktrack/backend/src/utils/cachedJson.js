const zlib  = require('zlib');
const { promisify } = require('util');
const cache = require('../config/cache');

const gzip = promisify(zlib.gzip);

// Trả JSON từ cache, lưu sẵn CẢ chuỗi JSON lẫn bản nén gzip
async function sendCachedJson(req, res, key, ttlMs, produce) {
  const entry = await cache.wrap(key, ttlMs, async () => {
    const json = Buffer.from(JSON.stringify({ success: true, data: await produce() }));
    return { json, gz: json.length > 1024 ? await gzip(json, { level: 6 }) : null };
  });
  res.set('Content-Type', 'application/json; charset=utf-8');
  res.vary('Accept-Encoding');
  // Đã nén sẵn → middleware compression tự bỏ qua (thấy Content-Encoding đã có)
  if (entry.gz && req.acceptsEncodings('gzip')) {
    res.set('Content-Encoding', 'gzip');
    return res.end(entry.gz);
  }
  res.end(entry.json);
}

module.exports = { sendCachedJson };
