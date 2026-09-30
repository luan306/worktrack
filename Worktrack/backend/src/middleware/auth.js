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

// ── Trạng thái user đọc từ DB (cache ngắn) ──
// Không tin role/is_active ghi trong token: token sống 8h, nếu chỉ đọc từ token
// thì user bị KHÓA hoặc bị HẠ QUYỀN vẫn dùng quyền cũ tới khi token hết hạn.
const USER_TTL = 15 * 1000;
const userCache = new Map();
async function loadUser(id) {
  const hit = userCache.get(id);
  if (hit && hit.exp > Date.now()) return hit.user;
  const [[user]] = await db.query(
    'SELECT id, username, full_name, role, is_active FROM users WHERE id=?', [id]
  );
  userCache.set(id, { user, exp: Date.now() + USER_TTL });
  return user;
}
// Gọi sau khi sửa/khóa/xóa user để thay đổi có hiệu lực ngay
const invalidateUser = (id) => userCache.delete(+id);

// Xác thực access token — dùng chung cho HTTP và Socket.IO.
// Trả về user hiện tại trong DB, hoặc ném lỗi có .status.
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

const auth = (roles = []) => async (req, res, next) => {
  const h = req.headers.authorization;
  const token = h?.startsWith('Bearer ') ? h.slice(7) : null;
  try {
    const user = await verifyAccessToken(token);
    req.user = { id: user.id, username: user.username, full_name: user.full_name, role: user.role };
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
