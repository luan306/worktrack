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
               WHERE 1=1`;
    const p = [];
    // ⚠️ Trước đây lọc cứng "WHERE u.is_active=1" — hễ khóa 1 người là họ biến
    // mất khỏi danh sách vĩnh viễn, không có cách nào xem lại hay mở khóa
    // (giống hệt như xóa dù dữ liệu vẫn còn). Giờ mặc định hiện CẢ người đã
    // khóa (khớp với cột trạng thái 🔒/🔓 vốn đã có sẵn ở giao diện) — chỉ lọc
    // theo is_active nếu người dùng chủ động chọn qua bộ lọc.
    if (is_active !== undefined && is_active !== '') { sql += ' AND u.is_active=?'; p.push(is_active); }
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

// PUT /users/:id — cho phép các trường hợp sau:
//   1) Admin/Manager: sửa BẤT KỲ user nào, kể cả đổi role/is_active.
//   2) Leader: KHÔNG được đổi role của ai (kể cả chính mình), nhưng ĐƯỢC sửa
//      thông tin (full_name/email/avatar_color) VÀ khóa/mở khóa (is_active)
//      của bất kỳ ai TRỪ admin/manager — không được đụng vào admin/manager
//      dưới bất kỳ hình thức nào, không tự khóa chính mình.
//   3) Chính chủ (req.user.id === :id): chỉ được tự sửa hồ sơ CỦA MÌNH, và
//      CHỈ với các trường an toàn (full_name, email, avatar_color) — tuyệt đối
//      không cho tự đổi role/is_active dù là tự sửa mình, để tránh tự nâng
//      quyền hoặc tự kích hoạt lại tài khoản đã bị khóa.
// Mọi trường hợp khác (user thường sửa người khác) → 403.
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, email, role, avatar_color, is_active, group_id } = req.body;

    const isSelf       = req.user.id === +id;
    const isPrivileged = ['admin','manager'].includes(req.user.role);
    const isLeader      = req.user.role === 'leader';

    if (!isSelf && !isPrivileged && !isLeader) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền chỉnh sửa người dùng khác' });
    }

    // role là trường nhạy cảm nhất — CHỈ admin/manager được đổi, kể cả Leader
    // hay chính chủ tự sửa mình cũng không được.
    if (role !== undefined && !isPrivileged) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền đổi vai trò người dùng' });
    }

    // Nhóm — CHỈ admin/manager được đổi (giống role, không giao cho Leader
    // hay tự sửa mình, để tránh tự chuyển mình khỏi nhóm đang được quản lý).
    if (group_id !== undefined && !isPrivileged) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền đổi nhóm của người dùng' });
    }

    // Leader sửa NGƯỜI KHÁC (không phải chính mình, không phải admin/manager
    // thực hiện): được phép sửa full_name/email/avatar_color/is_active, NHƯNG
    // target không được là admin/manager — kiểm tra 1 lần chung cho mọi
    // trường thay vì tách riêng như trước.
    if (isLeader && !isSelf && !isPrivileged) {
      const [[target]] = await db.query('SELECT role FROM users WHERE id=?', [id]);
      if (!target) return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
      if (['admin','manager'].includes(target.role)) {
        return res.status(403).json({ success: false, message: 'Leader không có quyền chỉnh sửa tài khoản admin/manager' });
      }
    }

    // is_active (khóa/mở khóa): admin/manager luôn được; Leader được (đã qua
    // kiểm tra target ở trên) nhưng không được tự khóa/mở khóa chính mình.
    if (is_active !== undefined && !isPrivileged) {
      if (!isLeader) {
        return res.status(403).json({ success: false, message: 'Bạn không có quyền đổi trạng thái hoạt động' });
      }
      if (isSelf) {
        return res.status(400).json({ success: false, message: 'Không thể tự khóa/mở khóa chính mình' });
      }
    }

    await db.query(
      `UPDATE users SET
        full_name=COALESCE(?,full_name), email=COALESCE(?,email),
        role=COALESCE(?,role), avatar_color=COALESCE(?,avatar_color),
        is_active=COALESCE(?,is_active)
       WHERE id=?`,
      [full_name, email, role, avatar_color, is_active, id]
    );

    // ⚠️ Đổi nhóm — trước đây EditUserModal có ô chọn "Nhóm" nhưng backend
    // KHÔNG hề xử lý group_id, nên chọn nhóm khác rồi Lưu không có tác dụng
    // gì cả. Giờ thực sự cập nhật: gỡ khỏi nhóm cũ, thêm vào nhóm mới (nếu
    // group_id rỗng/"" thì chỉ gỡ khỏi mọi nhóm, không nhóm nào — tương ứng
    // lựa chọn "-- Không nhóm --" trên giao diện).
    if (group_id !== undefined) {
      await db.query('DELETE FROM group_members WHERE user_id=?', [id]);
      if (group_id) {
        await db.query('INSERT IGNORE INTO group_members (group_id,user_id) VALUES (?,?)', [group_id, id]);
      }
    }

    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// POST /users/:id/reset-password — admin/manager đổi được cho bất kỳ ai;
// Leader đổi được cho bất kỳ ai TRỪ admin/manager (khớp quy tắc chung đã áp
// dụng cho update()/remove()).
exports.resetPassword = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ success: false, message: 'Password required' });

    if (req.user.role === 'leader') {
      const [[target]] = await db.query('SELECT role FROM users WHERE id=?', [req.params.id]);
      if (!target) return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
      if (['admin','manager'].includes(target.role)) {
        return res.status(403).json({ success: false, message: 'Leader không có quyền đổi mật khẩu tài khoản admin/manager' });
      }
    }

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

    // Leader có quyền xóa user, NHƯNG không được xóa tài khoản admin/manager
    if (req.user.role === 'leader') {
      const [[target]] = await db.query('SELECT role FROM users WHERE id=?', [id]);
      if (!target) return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
      if (['admin','manager'].includes(target.role)) {
        return res.status(403).json({ success: false, message: 'Leader không có quyền xóa tài khoản admin/manager' });
      }
    }

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