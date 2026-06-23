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
    const COLORS = ['#3a7bd5','#27ae60','#e67e22','#e74c3c','#8e44ad','#16a085','#2980b9','#c0392b'];

    for (const u of users) {
      try {
        const hash  = await bcrypt.hash(u.password || 'Welcome00', 10);
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];
        // Gen username: Nguyễn Văn A → a.nv
        const genUsername = (name) => {
          const parts = name.trim().normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().split(/\s+/);
          if (!parts.length) return name.toLowerCase().substring(0,20);
          const firstName = parts[parts.length - 1];
          const initials  = parts.slice(0, parts.length - 1).map(p => p[0]).join('');
          return (firstName + (initials ? '.' + initials : '')).replace(/[^a-z0-9.]/g,'').substring(0,30);
        };
        const uname = u.username || genUsername(u.full_name);

        const [r] = await db.query(
          `INSERT IGNORE INTO users
            (username, email, password, full_name, role, avatar_color)
           VALUES (?,?,?,?,?,?)`,
          [uname, u.email||null, hash, u.full_name, u.role||'user', color]
        );

        if (r.insertId) {
          // Add vào nhóm nếu có group_id hoặc group_name
          if (u.group_id) {
            await db.query('INSERT IGNORE INTO group_members (group_id,user_id) VALUES (?,?)', [u.group_id, r.insertId]);
          } else if (u.group_name) {
            const [gs] = await db.query('SELECT id FROM `groups` WHERE name=? LIMIT 1', [u.group_name]);
            if (gs.length) await db.query('INSERT IGNORE INTO group_members (group_id,user_id) VALUES (?,?)', [gs[0].id, r.insertId]);
          }
          created++;
        }
      } catch (e) { errors.push({ user: u.full_name, error: e.message }); }
    }
    res.json({ success: true, data: { created, errors } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// DELETE /users/:id — xóa cứng khỏi database
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    if (+id === req.user.id) return res.status(400).json({ success: false, message: 'Không thể xóa chính mình!' });
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      await conn.query('DELETE FROM group_members          WHERE user_id=?', [id]);
      await conn.query('DELETE FROM daily_task_logs        WHERE user_id=?', [id]);
      await conn.query('DELETE FROM request_task_assignees WHERE user_id=?', [id]);
      await conn.query('DELETE FROM refresh_tokens         WHERE user_id=?', [id]);
      await conn.query('DELETE FROM users                  WHERE id=?',      [id]);
      await conn.commit();
      res.json({ success: true });
    } catch(e) { await conn.rollback(); throw e; }
    finally { conn.release(); }
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};