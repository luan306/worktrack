const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const { styleHeader, sendXlsx, xlsxError } = require('../utils/excel');
const db = require('../config/db');
const cache = require('../config/cache');
const { invalidateUser } = require('../middleware/auth');
const { logActivity, diffFields } = require('../services/activityLogService');

// ── Lịch sử thay đổi tài khoản ──
const ROLE_LABEL = { user: 'Nhân viên', leader: 'Leader', manager: 'Manager', admin: 'Admin' };
async function getUserSnapshot(id) {
  const [[u]] = await db.query(
    `SELECT u.id, u.username, u.full_name, u.email, u.role, u.is_active,
            GROUP_CONCAT(g.name ORDER BY g.name SEPARATOR ', ') AS group_names
       FROM users u
       LEFT JOIN group_members gm ON gm.user_id=u.id
       LEFT JOIN \`groups\` g ON g.id=gm.group_id
      WHERE u.id=? GROUP BY u.id`, [id]);
  return u;
}
const USER_FIELDS = {
  username:    ['tên đăng nhập'],
  full_name:   ['họ tên'],
  email:       ['email'],
  role:        ['vai trò', v => ROLE_LABEL[v] || v],
  is_active:   ['trạng thái', v => (+v ? 'Hoạt động' : 'Đã khóa')],
  group_names: ['nhóm', v => v || '(không nhóm)'],
};
const actorOf = (req) => req.user.full_name || req.user.username;

const ROLES = ['user', 'leader', 'manager', 'admin'];
const MIN_PASSWORD = 8;
const weakPassword = (p) => typeof p !== 'string' || p.length < MIN_PASSWORD;
// Chỉ Admin mới được tạo/nâng quyền Admin hoặc đụng vào tài khoản Admin —
// trước đây Manager có thể tự nâng mình lên Admin, đổi mật khẩu/xóa Admin.
const ADMIN_ONLY = { success: false, message: 'Chỉ Admin mới được thao tác với tài khoản/quyền Admin' };

exports.list = async (req, res) => {
  try {
    const { group_id, role, search, is_active } = req.query;

    // group_concat_max_len đã được set cho mọi connection ở config/db.js
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
    // User thường chỉ cần danh sách tên để chọn người (giao việc, lọc...) —
    // không trả tên đăng nhập / email / lần đăng nhập cuối, tránh lộ danh sách
    // tài khoản admin để dò mật khẩu. Tìm kiếm cũng chỉ theo họ tên.
    const limited = !['admin','manager','leader'].includes(req.user.role);
    if (search && limited) { sql += ' AND u.full_name LIKE ?'; p.push(`%${search}%`); }
    else if (search) { sql += ' AND (u.full_name LIKE ? OR u.username LIKE ? OR u.email LIKE ?)'; const s=`%${search}%`; p.push(s,s,s); }
    if (group_id) { sql += ' AND gm.group_id=?'; p.push(group_id); }
    sql += ' GROUP BY u.id ORDER BY u.full_name';

    const [rows] = await db.query(sql, p);
    const data = rows.map(({ username, email, last_login, created_at, ...r }) => ({
      ...r,
      ...(limited ? {} : { username, email, last_login, created_at }),
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
    if (!ROLES.includes(role))
      return res.status(400).json({ success: false, message: 'Role không hợp lệ' });
    if (weakPassword(password))
      return res.status(400).json({ success: false, message: `Mật khẩu phải có ít nhất ${MIN_PASSWORD} ký tự` });
    if (role === 'admin' && req.user.role !== 'admin') return res.status(403).json(ADMIN_ONLY);

    // Leader chỉ được tạo tài khoản role 'user' — không được tự gán admin/manager/leader
    if (req.user.role === 'leader' && role !== 'user')
      return res.status(403).json({ success: false, message: 'Leader chỉ được tạo tài khoản nhân viên (user)' });

    const hash = await bcrypt.hash(password, 10);
    const [r] = await db.query(
      'INSERT INTO users (username,email,password,full_name,role,avatar_color) VALUES (?,?,?,?,?,?)',
      [username, email, hash, full_name, role, avatar_color]
    );
    if (group_id) await db.query('INSERT IGNORE INTO group_members (group_id,user_id) VALUES (?,?)', [group_id, r.insertId]);
    const created = await getUserSnapshot(r.insertId);
    await logActivity({
      actorId: req.user.id, actionType: 'user_created', entityType: 'user', entityId: r.insertId,
      description: `${actorOf(req)} đã tạo tài khoản ${full_name} (${username}, ${ROLE_LABEL[role] || role}, nhóm: ${created?.group_names || 'không nhóm'})`,
      metadata: { user_id: r.insertId, username, role, group_id: group_id || null },
    });
    res.status(201).json({ success: true, data: { id: r.insertId, username, email, full_name, role } });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Username or email already exists' });
    res.status(500).json({ success: false, message: e.message });
  }
};

// PUT /users/:id — cho phép các trường hợp sau:
//   1) Admin/Manager: sửa BẤT KỲ user nào, kể cả đổi role/is_active/nhóm.
//   2) Leader: KHÔNG được đổi role của ai (kể cả chính mình), nhưng ĐƯỢC sửa
//      thông tin (full_name/email/avatar_color), khóa/mở khóa (is_active),
//      VÀ ĐỔI NHÓM (group_id) cho bất kỳ ai TRỪ admin/manager — không được
//      đụng vào admin/manager dưới bất kỳ hình thức nào, không tự khóa
//      chính mình.
//   3) Chính chủ (req.user.id === :id): chỉ được tự sửa hồ sơ CỦA MÌNH, và
//      CHỈ với các trường an toàn (full_name, email, avatar_color) — tuyệt đối
//      không cho tự đổi role/is_active/group_id dù là tự sửa mình, để tránh
//      tự nâng quyền hoặc tự chuyển nhóm/kích hoạt lại tài khoản đã bị khóa.
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

    // ⚠️ Lấy TRƯỚC thông tin hiện tại của target — cần để so sánh "có thực sự
    // ĐỔI giá trị hay không" thay vì chỉ xét "field có được gửi lên hay
    // không". Trước đây EditUserModal luôn gửi kèm role=giá trị hiện tại (kể
    // cả khi Leader không đổi role), khiến role!==undefined luôn đúng và
    // Leader bị chặn 403 dù chỉ đang đổi NHÓM chứ không hề đụng tới role.
    const [[target]] = !isSelf ? await db.query('SELECT role, is_active FROM users WHERE id=?', [id]) : [[null]];
    if (!isSelf && !target) return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });

    if (role !== undefined && !ROLES.includes(role))
      return res.status(400).json({ success: false, message: 'Role không hợp lệ' });
    if (req.user.role !== 'admin' && (role === 'admin' || target?.role === 'admin'))
      return res.status(403).json(ADMIN_ONLY);

    // username (MSNV) là tên đăng nhập — chính chủ không tự đổi được
    const username = isSelf && !isPrivileged ? undefined : req.body.username;

    // role là trường nhạy cảm nhất — CHỈ admin/manager được đổi, kể cả Leader
    // hay chính chủ tự sửa mình cũng không được. Chỉ chặn khi GIÁ TRỊ thực
    // sự khác với role hiện tại (không chặn oan khi field được gửi lên
    // nhưng giữ nguyên giá trị cũ).
    const roleChanging = role !== undefined && (isSelf || role !== target.role);
    if (roleChanging && !isPrivileged) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền đổi vai trò người dùng' });
    }

    // Nhóm — admin/manager luôn được; Leader ĐƯỢC đổi nhóm cho người khác
    // (đã qua kiểm tra target không phải admin/manager ở khối bên dưới),
    // nhưng KHÔNG được tự chuyển nhóm của chính mình.
    if (group_id !== undefined && !isPrivileged) {
      if (!isLeader) {
        return res.status(403).json({ success: false, message: 'Bạn không có quyền đổi nhóm của người dùng' });
      }
      if (isSelf) {
        return res.status(400).json({ success: false, message: 'Không thể tự đổi nhóm của chính mình' });
      }
    }

    // Leader sửa NGƯỜI KHÁC (không phải chính mình, không phải admin/manager
    // thực hiện): được phép sửa full_name/email/avatar_color/is_active/group_id,
    // NHƯNG target không được là admin/manager — kiểm tra 1 lần chung cho mọi
    // trường thay vì tách riêng như trước.
    if (isLeader && !isSelf && !isPrivileged) {
      if (['admin','manager'].includes(target.role)) {
        return res.status(403).json({ success: false, message: 'Leader không có quyền chỉnh sửa tài khoản admin/manager' });
      }
    }

    // is_active (khóa/mở khóa): admin/manager luôn được; Leader được (đã qua
    // kiểm tra target ở trên) nhưng không được tự khóa/mở khóa chính mình.
    // Cũng chỉ chặn khi GIÁ TRỊ thực sự đổi, cùng lý do như role ở trên.
    const activeChanging = is_active !== undefined && (isSelf || +is_active !== +target.is_active);
    if (activeChanging && !isPrivileged) {
      if (!isLeader) {
        return res.status(403).json({ success: false, message: 'Bạn không có quyền đổi trạng thái hoạt động' });
      }
      if (isSelf) {
        return res.status(400).json({ success: false, message: 'Không thể tự khóa/mở khóa chính mình' });
      }
    }

    const before = await getUserSnapshot(id);
    if (!before) return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });

    try {
      await db.query(
        `UPDATE users SET
          username=COALESCE(?,username), full_name=COALESCE(?,full_name), email=COALESCE(?,email),
          role=COALESCE(?,role), avatar_color=COALESCE(?,avatar_color),
          is_active=COALESCE(?,is_active)
         WHERE id=?`,
        [username, full_name, email, role, avatar_color, is_active, id]
      );
    } catch (ue) {
      if (ue.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ success: false, message: 'MSNV hoặc email đã được dùng bởi tài khoản khác' });
      }
      throw ue;
    }

    invalidateUser(id); // khóa / đổi role có hiệu lực ngay, không chờ token hết hạn

    // Đổi nhóm — gỡ khỏi nhóm cũ, thêm vào nhóm mới (group_id rỗng/"" thì chỉ
    // gỡ khỏi mọi nhóm, không nhóm nào — tương ứng lựa chọn "-- Không nhóm --").
    if (group_id !== undefined) {
      await db.query('DELETE FROM group_members WHERE user_id=?', [id]);
      if (group_id) {
        await db.query('INSERT IGNORE INTO group_members (group_id,user_id) VALUES (?,?)', [group_id, id]);
      }
    }

    // 📝 Ghi đúng những gì đã đổi: cũ → mới
    const after = await getUserSnapshot(id);
    const diff = diffFields(before, after, USER_FIELDS);
    if (diff.text) {
      const action = diff.changes.is_active ? (+after.is_active ? 'user_unlocked' : 'user_locked')
        : diff.changes.role ? 'user_role_changed' : 'user_updated';
      await logActivity({
        actorId: req.user.id, actionType: action, entityType: 'user', entityId: +id,
        description: `${actorOf(req)} đã sửa tài khoản ${before.full_name} (${before.username}): ${diff.text}`,
        metadata: { user_id: +id, changes: diff.changes },
      });
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
    if (weakPassword(password))
      return res.status(400).json({ success: false, message: `Mật khẩu phải có ít nhất ${MIN_PASSWORD} ký tự` });

    const [[target]] = await db.query('SELECT role FROM users WHERE id=?', [req.params.id]);
    if (!target) return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    if (req.user.role === 'leader' && ['admin','manager'].includes(target.role)) {
      return res.status(403).json({ success: false, message: 'Leader không có quyền đổi mật khẩu tài khoản admin/manager' });
    }
    if (target.role === 'admin' && req.user.role !== 'admin') return res.status(403).json(ADMIN_ONLY);

    await db.query('UPDATE users SET password=? WHERE id=?', [await bcrypt.hash(password, 10), req.params.id]);
    // Buộc đăng nhập lại trên mọi thiết bị của người bị đổi mật khẩu
    await db.query('DELETE FROM refresh_tokens WHERE user_id=?', [req.params.id]);
    const t = await getUserSnapshot(req.params.id);
    await logActivity({
      actorId: req.user.id, actionType: 'user_password_reset', entityType: 'user', entityId: +req.params.id,
      description: `${actorOf(req)} đã đặt lại mật khẩu cho ${t?.full_name} (${t?.username})`,
      metadata: { user_id: +req.params.id },
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.importUsers = async (req, res) => {
  try {
    const { users } = req.body;
    const COLORS = ['#3a7bd5','#27ae60','#e67e22','#e74c3c','#8e44ad','#16a085','#2980b9','#c0392b'];


    let created = 0, duplicates = [], errors = [];

    console.log('[import] Nhận', users.length, 'users:', JSON.stringify(users.slice(0,2)));

    for (const u of users) {
      try {
        if (!u.full_name || !u.full_name.trim()) {
          errors.push({ name: '(trống)', error: 'Tên trống' });
          continue;
        }

        // MSNV = tên đăng nhập. Luôn xử lý như CHUỖI để giữ số 0 ở đầu (VD: 019123)
        const uname = String(u.username ?? '').replace(/\s+/g, '');
        if (!uname) { errors.push({ name: u.full_name, error: 'Thiếu MSNV' }); continue; }
        if (uname.length > 50) { errors.push({ name: u.full_name, error: 'MSNV quá dài (tối đa 50 ký tự)' }); continue; }
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
          [uname, u.email||null, hash, u.full_name.trim(), ROLES.includes(u.role) ? u.role : 'user', color]
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

    if (created) await logActivity({
      actorId: req.user.id, actionType: 'user_imported', entityType: 'user',
      description: `${actorOf(req)} đã nhập ${created} tài khoản từ file${duplicates.length ? ` (${duplicates.length} trùng, bỏ qua)` : ''}`,
      metadata: { created, duplicates: duplicates.length, errors: errors.length },
    });
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

    const [[target]] = await db.query('SELECT role FROM users WHERE id=?', [id]);
    if (!target) return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    // Leader có quyền xóa user, NHƯNG không được xóa tài khoản admin/manager
    if (req.user.role === 'leader' && ['admin','manager'].includes(target.role)) {
      return res.status(403).json({ success: false, message: 'Leader không có quyền xóa tài khoản admin/manager' });
    }
    if (target.role === 'admin' && req.user.role !== 'admin') return res.status(403).json(ADMIN_ONLY);
    const removed = await getUserSnapshot(id);
    const [[{ logs: dailyCount }]] = await db.query(
      `SELECT (SELECT COUNT(*) FROM daily_task_logs WHERE user_id=?) + (SELECT COUNT(*) FROM daily_day_scores WHERE user_id=?) AS logs`, [id, id]);

    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      await conn.query('DELETE FROM group_members          WHERE user_id=?', [id]);
      await conn.query('DELETE FROM daily_task_logs        WHERE user_id=?', [id]);
      await conn.query('DELETE FROM daily_entries          WHERE user_id=?', [id]);
      await conn.query('DELETE FROM daily_day_scores       WHERE user_id=?', [id]);
      await conn.query('DELETE FROM daily_day_offs         WHERE user_id=?', [id]);
      await conn.query('DELETE FROM request_task_assignees WHERE user_id=?', [id]);
      await conn.query('DELETE FROM refresh_tokens         WHERE user_id=?', [id]);
      await conn.query('DELETE FROM users                  WHERE id=?',      [id]);
      await conn.commit();
      invalidateUser(id);
      await logActivity({
        actorId: req.user.id, actionType: 'user_deleted', entityType: 'user', entityId: +id,
        description: `${actorOf(req)} đã XÓA tài khoản ${removed.full_name} (${removed.username}, ${ROLE_LABEL[removed.role] || removed.role}, nhóm: ${removed.group_names || 'không nhóm'}) — kèm ${dailyCount} lượt chấm Daily của người này`,
        metadata: { user: removed, deleted_daily_logs: dailyCount },
      });
      cache.clear('req:'); // người bị xóa không còn trong danh sách assignees
      res.json({ success: true });
    } catch(e) { await conn.rollback(); throw e; }
    finally { conn.release(); }
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
// ── Nhập tài khoản từ Excel ───────────────────────────────────────
// GET /users/import/template — file mẫu .xlsx, cột MSNV định dạng TEXT để Excel
// không tự bỏ số 0 ở đầu (019123 → 19123) như khi mở file .csv.
exports.importTemplate = async (req, res) => {
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Nhân viên');
    ws.columns = [
      { header: 'Họ tên', key: 'name', width: 26 },
      { header: 'Email', key: 'email', width: 26 },
      { header: 'Vai trò (user/leader/manager/admin)', key: 'role', width: 20 },
      { header: 'Nhóm', key: 'group', width: 18 },
      { header: 'MSNV', key: 'msnv', width: 14, style: { numFmt: '@' } },
    ];
    styleHeader(ws);
    [['Nguyễn Văn A', 'nva@smc.com', 'user', 'MES', '019001'],
     ['Trần Thị B', '', 'user', 'MES', '019002'],
     ['Lê Văn C', 'lvc@smc.com', 'leader', 'Bảo trì', '009003']]
      .forEach(([name, email, role, group, msnv]) => ws.addRow({ name, email, role, group, msnv }));
    // Định dạng TEXT cho cả cột MSNV (kể cả các dòng người dùng gõ thêm sau này)
    for (let r = 2; r <= 1000; r++) ws.getCell(`E${r}`).numFmt = '@';
    ws.getCell('E1').note = 'Cột này là dạng CHỮ (Text) — gõ 019123 sẽ giữ nguyên số 0 ở đầu';
    await sendXlsx(res, wb, 'mau_import_user.xlsx');
  } catch (e) { xlsxError(res, e); }
};

// POST /users/import/parse (multipart, field "file") — đọc .xlsx, trả về các dòng
// dạng mảng chữ ĐÚNG NHƯ HIỂN THỊ trong Excel (cell.text) → ô MSNV định dạng
// "000000" hay dạng Text đều giữ được số 0 ở đầu.
exports.parseImportFile = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Chưa chọn file' });
    const name = (req.file.originalname || '').toLowerCase();
    if (name.endsWith('.xls')) return res.status(400).json({ success: false, message: 'File .xls (Excel cũ) chưa hỗ trợ — hãy "Lưu thành" .xlsx hoặc .csv' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer);
    const ws = wb.worksheets[0];
    if (!ws) return res.status(400).json({ success: false, message: 'File không có trang tính nào' });
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      if (rows.length >= 501) return;
      const cells = [];
      for (let c = 1; c <= 5; c++) {
        const cell = row.getCell(c);
        let text = String(cell.text ?? '').trim();
        // Ô SỐ có định dạng hiển thị "000000" → Excel hiện 019123 nhưng giá trị là 19123 → thêm lại số 0
        const fmt = cell.numFmt || '';
        if (typeof cell.value === 'number' && /^0+$/.test(fmt) && /^\d+$/.test(text)) text = text.padStart(fmt.length, '0');
        cells.push(text);
      }
      if (cells.some(Boolean)) rows.push(cells);
    });
    res.json({ success: true, data: rows });
  } catch (e) { res.status(400).json({ success: false, message: `Không đọc được file Excel: ${e.message}` }); }
};
