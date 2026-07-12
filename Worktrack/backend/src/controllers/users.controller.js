const bcrypt = require('bcryptjs');
const db = require('../config/db');

exports.list = async (req, res) => {
  try {
    const { group_id, role, search, is_active } = req.query;

    // Tăng giới hạn GROUP_CONCAT
    await db.query('SET SESSION group_concat_max_len = 10000');

    let sql = `SELECT u.id,u.username,u.email,u.full_name,u.role,u.avatar_color,u.is_active,u.last_login,u.created_at,
               GROUP_CONCAT(DISTINCT CONCAT(g.id,':',g.name) ORDER BY g.name SEPARATOR '|') as groups_raw
               FROM users u
               LEFT JOIN group_members gm ON gm.user_id=u.id
               LEFT JOIN \`groups\` g ON g.id=gm.group_id AND g.is_active=1
               WHERE u.is_active=1`;
    const p = [];
    if (role)     { sql += ' AND u.role=?'; p.push(role); }
    if (search)   { sql += ' AND (u.full_name LIKE ? OR u.username LIKE ? OR u.email LIKE ?)'; const s=`%${search}%`; p.push(s,s,s); }
    if (group_id) { sql += ' AND gm.group_id=?'; p.push(group_id); }
    sql += ' GROUP BY u.id ORDER BY u.full_name';

    const [rows] = await db.query(sql, p);
    const data = rows.map(r => ({
      ...r,
      groups: r.groups_raw
        ? r.groups_raw.split('|').map(s => { const [id,...rest]=s.split(':'); return {id:+id, name:rest.join(':')}; })
        : [],
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

    // Leader chỉ được tạo tài khoản role 'user' — không được tự gán admin/manager/leader
    if (req.user.role === 'leader' && role !== 'user')
      return res.status(403).json({ success: false, message: 'Leader chỉ được tạo tài khoản nhân viên (user)' });

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
    const COLORS = ['#3a7bd5','#27ae60','#e67e22','#e74c3c','#8e44ad','#16a085','#2980b9','#c0392b'];

    const genUsername = (name) => {
      const parts = name.trim().normalize('NFD')
        .replace(/[̀-ͯ]/g,'').toLowerCase().split(/\s+/);
      if (!parts.length) return 'user';
      const first    = parts[parts.length - 1];
      const initials = parts.slice(0, parts.length - 1).map(p => p[0]).join('');
      return (first + (initials ? '.' + initials : '')).replace(/[^a-z0-9.]/g,'').substring(0, 30) || 'user';
    };

    let created = 0, duplicates = [], errors = [];

    console.log('[import] Nhận', users.length, 'users:', JSON.stringify(users.slice(0,2)));

    for (const u of users) {
      try {
        if (!u.full_name || !u.full_name.trim()) {
          errors.push({ name: '(trống)', error: 'Tên trống' });
          continue;
        }

        const uname = genUsername(u.full_name.trim());
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];

        console.log('[import] Processing:', u.full_name, '→ username:', uname);

        // Kiểm tra trùng username
        const [[exist]] = await db.query(
          'SELECT id, full_name FROM users WHERE username=?', [uname]
        );
        if (exist) {
          duplicates.push({ name: u.full_name, username: uname, existing: exist.full_name });
          continue;
        }

        const hash = await bcrypt.hash('Welcome00', 10);
        const [r]  = await db.query(
          'INSERT INTO users (username,email,password,full_name,role,avatar_color) VALUES (?,?,?,?,?,?)',
          [uname, u.email||null, hash, u.full_name.trim(), u.role||'user', color]
        );
        console.log('[import] Insert result:', r.insertId, r.affectedRows);

        if (r.insertId && u.group_name && u.group_name.trim()) {
          try {
            const [gs] = await db.query(
              'SELECT id FROM `groups` WHERE LOWER(name)=LOWER(?) AND is_active=1 LIMIT 1',
              [u.group_name.trim()]
            );
            let gid;
            if (gs.length) {
              gid = gs[0].id;
            } else {
              const [nr] = await db.query(
                'INSERT INTO `groups` (name, icon, is_active) VALUES (?,?,1)',
                [u.group_name.trim(), '🏭']
              );
              gid = nr.insertId;
            }
            await db.query(
              'INSERT IGNORE INTO group_members (group_id, user_id) VALUES (?,?)',
              [gid, r.insertId]
            );
          } catch(ge) {
            errors.push({ name: u.full_name, error: 'Add group failed: ' + ge.message });
          }
        }

        created++;
      } catch (e) { errors.push({ name: u.full_name, error: e.message }); }
    }

    res.json({ success: true, data: { created, duplicates, errors,
      message: `Đã tạo ${created} user${duplicates.length ? `, ${duplicates.length} trùng username` : ''}${errors.length ? `, ${errors.length} lỗi` : ''}`
    }});
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