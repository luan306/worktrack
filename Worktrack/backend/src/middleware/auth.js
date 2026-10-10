const jwt = require('jsonwebtoken');
const db  = require('../config/db');

// ── Token đã đăng xuất — giữ trong RAM tới khi token tự hết hạn ──
const revoked = new Map(); // token → thời điểm hết hạn (ms)
function revokeToken(token) {
  const exp = jwt.decode(token)?.exp;
  if (exp) revoked.set(token, exp * 1000);
}
setInterval(() => {
  const now = Date.now();
  for (const [t, exp] of revoked) if (exp < now) revoked.delete(t);
}, 60 * 60 * 1000).unref();

// Trạng thái user đọc từ DB (cache ngắn)
const USER_TTL = 15 * 1000;
const userCache = new Map();
async function loadUser(id) {
  const hit = userCache.get(id);
  if (hit && hit.exp > Date.now()) return hit.user;
  // SELECT * rồi chỉ giữ các cột cần
  const [[row]] = await db.query('SELECT * FROM users WHERE id=?', [id]);
  const user = row && {
    id: row.id, username: row.username, full_name: row.full_name, role: row.role, is_active: row.is_active,
    must_change_password: !!row.must_change_password,
  };
  userCache.set(id, { user, exp: Date.now() + USER_TTL });
  return user;
}
// Gọi sau khi sửa/khóa/xóa user để thay đổi có hiệu lực ngay
const invalidateUser = (id) => userCache.delete(+id);

// Xác thực access token — dùng chung cho HTTP và Socket.IO
async function verifyAccessToken(token) {
  const fail = (message) => Object.assign(new Error(message), { status: 401 });
  if (!token) throw fail('No token');

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    throw fail('Invalid token');
  }
  // Refresh token (sống 7 ngày, không có role) không được dùng thay access token
  if (decoded.type === 'refresh' || !decoded.role) throw fail('Invalid token');
  if (revoked.has(token)) throw fail('Token revoked');

  const user = await loadUser(decoded.id);
  if (!user || !user.is_active) throw fail('Tài khoản không tồn tại hoặc đã bị khóa');
  return user;
}

// Tài khoản còn mật khẩu mặc định chỉ được gọi: xem thông tin mình + đổi mật khẩu (đăng xuất không cần token)
const PASSWORD_CHANGE_OK = /\/auth\/(me|change-password)(\?|$)/;

const auth = (roles = []) => async (req, res, next) => {
  const h = req.headers.authorization;
  const token = h?.startsWith('Bearer ') ? h.slice(7) : null;
  try {
    const user = await verifyAccessToken(token);
    req.user = { id: user.id, username: user.username, full_name: user.full_name, role: user.role, must_change_password: user.must_change_password };
    // Chặn ở SERVER, không chỉ ở giao diện: ai gọi thẳng API bằng token cũng không lách được
    if (user.must_change_password && !PASSWORD_CHANGE_OK.test(req.originalUrl))
      return res.status(403).json({ success: false, code: 'PASSWORD_CHANGE_REQUIRED', message: 'Bạn cần đổi mật khẩu mặc định trước khi tiếp tục sử dụng hệ thống' });
    if (roles.length && !roles.includes(user.role))
      return res.status(403).json({ success: false, message: 'Forbidden' });
    next();
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, message: e.message });
    next(e);
  }
};

module.exports = auth;
module.exports.revokeToken = revokeToken;
module.exports.invalidateUser = invalidateUser;
module.exports.verifyAccessToken = verifyAccessToken;
