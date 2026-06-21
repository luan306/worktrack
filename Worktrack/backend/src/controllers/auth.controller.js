const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const db     = require('../config/db');

const makeTokens = (user) => {
  const payload = { id: user.id, username: user.username, role: user.role, full_name: user.full_name };
  return {
    access:  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN  || '8h' }),
    refresh: jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }),
  };
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ success: false, message: 'Username and password required' });

    const [[user]] = await db.query(
      'SELECT * FROM users WHERE (username=? OR email=?) AND is_active=1', [username, username]
    );
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const { access, refresh } = makeTokens(user);
    const exp = new Date(Date.now() + 7 * 86400000);
    await db.query('INSERT INTO refresh_tokens (user_id,token,expires_at) VALUES (?,?,?)', [user.id, refresh, exp]);
    await db.query('UPDATE users SET last_login=NOW() WHERE id=?', [user.id]);

    const [groups] = await db.query(
      `SELECT g.id, g.name, g.icon, CASE WHEN g.leader_id=? THEN 1 ELSE 0 END as is_leader
       FROM group_members gm JOIN \`groups\` g ON g.id=gm.group_id
       WHERE gm.user_id=? AND g.is_active=1`, [user.id, user.id]
    );

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
    const decoded = jwt.verify(refresh_token, process.env.JWT_SECRET);
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
  res.json({ success: true });
};

exports.me = async (req, res) => {
  try {
    const [[user]] = await db.query(
      'SELECT id,username,email,full_name,role,avatar_color,last_login FROM users WHERE id=?', [req.user.id]
    );
    const [groups] = await db.query(
      `SELECT g.id,g.name,g.icon, CASE WHEN g.leader_id=? THEN 1 ELSE 0 END as is_leader
       FROM group_members gm JOIN \`groups\` g ON g.id=gm.group_id
       WHERE gm.user_id=? AND g.is_active=1`, [req.user.id, req.user.id]
    );
    res.json({ success: true, data: { ...user, groups } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
