const bcrypt = require('bcryptjs');
const db = require('../config/db');

exports.list = async (req, res) => {
  try {
    const { group_id, role, search, is_active } = req.query;
    let sql = `SELECT u.id,u.username,u.email,u.full_name,u.role,u.avatar_color,u.is_active,u.last_login,u.created_at,
               GROUP_CONCAT(DISTINCT CONCAT(g.id,':',g.name) SEPARATOR '|') as groups_raw
               FROM users u
               LEFT JOIN group_members gm ON gm.user_id=u.id
               LEFT JOIN \`groups\` g ON g.id=gm.group_id AND g.is_active=1
               WHERE 1=1`;
    const p = [];
    if (role)      { sql += ' AND u.role=?'; p.push(role); }
    if (is_active !== undefined) { sql += ' AND u.is_active=?'; p.push(is_active); }
    if (search)    { sql += ' AND (u.full_name LIKE ? OR u.username LIKE ? OR u.email LIKE ?)'; const s=`%${search}%`; p.push(s,s,s); }
    if (group_id)  { sql += ' AND gm.group_id=?'; p.push(group_id); }
    sql += ' GROUP BY u.id ORDER BY u.full_name';
    const [rows] = await db.query(sql, p);
    const data = rows.map(r => ({
      ...r,
      groups: r.groups_raw ? r.groups_raw.split('|').map(s => { const [id,name]=s.split(':'); return {id:+id,name}; }) : [],
      groups_raw: undefined,
    }));
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.create = async (req, res) => {
  try {
    const { username, email, full_name, role='user', password, avatar_color='#3a7bd5', group_id } = req.body;
    if (!username || !email || !full_name || !password)
      return res.status(400).json({ success: false, message: 'Missing fields' });
    const hash = await bcrypt.hash(password, 10);
    const [r] = await db.query(
      'INSERT INTO users (username,email,password,full_name,role,avatar_color) VALUES (?,?,?,?,?,?)',
      [username, email, hash, full_name, role, avatar_color]
    );
    if (group_id) await db.query('INSERT IGNORE INTO group_members (group_id,user_id) VALUES (?,?)', [group_id, r.insertId]);
    res.status(201).json({ success: true, data: { id: r.insertId, username, email, full_name, role } });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Username or email already exists' });
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { full_name, email, role, avatar_color, is_active } = req.body;
    if (role && !['admin','manager'].includes(req.user.role))
      return res.status(403).json({ success: false, message: 'No permission to change role' });
    await db.query(
      `UPDATE users SET
        full_name=COALESCE(?,full_name), email=COALESCE(?,email),
        role=COALESCE(?,role), avatar_color=COALESCE(?,avatar_color),
        is_active=COALESCE(?,is_active)
       WHERE id=?`,
      [full_name, email, role, avatar_color, is_active, req.params.id]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.resetPassword = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ success: false, message: 'Password required' });
    await db.query('UPDATE users SET password=? WHERE id=?', [await bcrypt.hash(password, 10), req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.importUsers = async (req, res) => {
  try {
    const { users } = req.body;
    let created = 0, errors = [];
    for (const u of users) {
      try {
        const hash = await bcrypt.hash(u.password || 'Worktrack@123', 10);
        const [r] = await db.query(
          'INSERT IGNORE INTO users (username,email,password,full_name,role,avatar_color) VALUES (?,?,?,?,?,?)',
          [u.username, u.email, hash, u.full_name, u.role||'user', u.avatar_color||'#3a7bd5']
        );
        if (r.insertId && u.group_id)
          await db.query('INSERT IGNORE INTO group_members (group_id,user_id) VALUES (?,?)', [u.group_id, r.insertId]);
        if (r.affectedRows) created++;
      } catch (e) { errors.push({ user: u.username, error: e.message }); }
    }
    res.json({ success: true, data: { created, errors } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
