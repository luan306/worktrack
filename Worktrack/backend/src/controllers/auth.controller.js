const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const db     = require('../config/db');
const { revokeToken } = require('../middleware/auth');
const { logActivity } = require('../services/activityLogService');

const MIN_PASSWORD = 8;

const makeTokens = (user) => {
  const payload = { id: user.id, username: user.username, role: user.role, full_name: user.full_name };
  return {
    // jwtid ngẫu nhiên: 2 lần đăng nhập trong cùng 1 giây vẫn ra 2 token KHÁC nhau
    // (nếu trùng, đăng xuất ở máy này sẽ vô hiệu hóa luôn phiên ở máy kia)
    access:  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN  || '8h', jwtid: crypto.randomUUID() }),
    // type:'refresh' để middleware từ chối nếu ai đó dùng refresh token thay access token
    refresh: jwt.sign({ id: user.id, type: 'refresh' }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d', jwtid: crypto.randomUUID() }),
  };
};

exports.login = async (req, res) => {
  try {
    let { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ success: false, message: 'Username và password bắt buộc' });

    // Sanitize — chặn SQL injection và brute force
    username = String(username).trim().toLowerCase().substring(0, 50);
    if (!/^[a-z0-9._@-]+$/.test(username))
      return res.status(400).json({ success: false, message: 'Username không hợp lệ' });

    const [[user]] = await db.query(
      'SELECT * FROM users WHERE (username=? OR email=?) AND is_active=1', [username, username]
    );
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const { access, refresh } = makeTokens(user);
    const exp = new Date(Date.now() + 7 * 86400000);
    const [, , [groups]] = await Promise.all([
      db.query('INSERT INTO refresh_tokens (user_id,token,expires_at) VALUES (?,?,?)', [user.id, refresh, exp]),
      db.query('UPDATE users SET last_login=NOW() WHERE id=?', [user.id]),
      db.query(
        `SELECT g.id, g.name, g.icon, CASE WHEN g.leader_id=? THEN 1 ELSE 0 END as is_leader
         FROM group_members gm JOIN \`groups\` g ON g.id=gm.group_id
         WHERE gm.user_id=? AND g.is_active=1`, [user.id, user.id]),
    ]);

    res.json({ success: true, data: {
      access_token: access, refresh_token: refresh,
      user: { id: user.id, username: user.username, email: user.email,
              full_name: user.full_name, role: user.role, avatar_color: user.avatar_color, groups }
    }});
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.refresh = async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) return res.status(400).json({ success: false, message: 'Refresh token required' });
    const decoded = jwt.verify(refresh_token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (decoded.role) throw new Error('access token is not a refresh token');
    const [[row]] = await db.query('SELECT * FROM refresh_tokens WHERE token=? AND expires_at>NOW()', [refresh_token]);
    if (!row) return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    const [[user]] = await db.query('SELECT * FROM users WHERE id=? AND is_active=1', [decoded.id]);
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });

    const { access, refresh: newRefresh } = makeTokens(user);
    await db.query('DELETE FROM refresh_tokens WHERE token=?', [refresh_token]);
    const exp = new Date(Date.now() + 7 * 86400000);
    await db.query('INSERT INTO refresh_tokens (user_id,token,expires_at) VALUES (?,?,?)', [user.id, newRefresh, exp]);
    res.json({ success: true, data: { access_token: access, refresh_token: newRefresh } });
  } catch { res.status(401).json({ success: false, message: 'Invalid token' }); }
};

exports.logout = async (req, res) => {
  const { refresh_token } = req.body;
  if (refresh_token) await db.query('DELETE FROM refresh_tokens WHERE token=?', [refresh_token]).catch(() => {});

  // Vô hiệu hóa access token ngay lập tức (trước đây code này gọi tới 1
  // `blacklist` không tồn tại nên token đăng xuất rồi vẫn dùng được thêm 8h)
  const token = req.headers?.authorization?.split(' ')[1];
  if (token) revokeToken(token);

  res.json({ success: true });
};

exports.me = async (req, res) => {
  try {
    const [[[user]], [groups]] = await Promise.all([
      db.query('SELECT id,username,email,full_name,role,avatar_color,last_login FROM users WHERE id=?', [req.user.id]),
      db.query(
        `SELECT g.id,g.name,g.icon, CASE WHEN g.leader_id=? THEN 1 ELSE 0 END as is_leader
         FROM group_members gm JOIN \`groups\` g ON g.id=gm.group_id
         WHERE gm.user_id=? AND g.is_active=1`, [req.user.id, req.user.id]),
    ]);
    res.json({ success: true, data: { ...user, groups } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// POST /auth/change-password
exports.changePassword = async (req, res) => {
  try {
    const { old_password, new_password } = req.body;
    if (!old_password || typeof new_password !== 'string' || new_password.length < MIN_PASSWORD)
      return res.status(400).json({ success:false, message:`Mật khẩu mới phải có ít nhất ${MIN_PASSWORD} ký tự` });
    const [[user]] = await db.query('SELECT * FROM users WHERE id=?', [req.user.id]);
    const ok = await bcrypt.compare(old_password, user.password);
    if (!ok) return res.status(400).json({ success:false, message:'Mật khẩu hiện tại không đúng!' });
    const hash = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password=? WHERE id=?', [hash, req.user.id]);
    // Đăng xuất các thiết bị khác (nếu mật khẩu cũ bị lộ, kẻ gian không gia hạn được phiên)
    await db.query('DELETE FROM refresh_tokens WHERE user_id=?', [req.user.id]);
    await logActivity({
      actorId: req.user.id, actionType: 'user_password_changed', entityType: 'user', entityId: req.user.id,
      description: `${user.full_name} (${user.username}) đã tự đổi mật khẩu`,
    });
    res.json({ success:true });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
};