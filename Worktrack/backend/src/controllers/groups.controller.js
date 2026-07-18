const db = require('../config/db');

exports.list = async (req, res) => {
  try {
    const [groups] = await db.query(`
      SELECT g.*, u.full_name as leader_name, u.avatar_color as leader_color,
             COUNT(DISTINCT gm.user_id) as member_count
      FROM \`groups\` g
      LEFT JOIN users u ON u.id=g.leader_id
      LEFT JOIN group_members gm ON gm.group_id=g.id
      WHERE g.is_active=1
      GROUP BY g.id ORDER BY g.name`
    );
    for (const g of groups) {
      const [members] = await db.query(
        `SELECT u.id,u.full_name,u.username,u.role,u.avatar_color
         FROM group_members gm JOIN users u ON u.id=gm.user_id
         WHERE gm.group_id=? AND u.is_active=1`, [g.id]
      );
      g.members = members;
    }
    res.json({ success: true, data: groups });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.create = async (req, res) => {
  try {
    const { name, icon='🏭', leader_id } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name required' });
    const [r] = await db.query('INSERT INTO `groups` (name,icon,leader_id) VALUES (?,?,?)', [name, icon, leader_id||null]);
    if (leader_id) await db.query('INSERT IGNORE INTO group_members (group_id,user_id) VALUES (?,?)', [r.insertId, leader_id]);
    res.status(201).json({ success: true, data: { id: r.insertId, name, icon, leader_id } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.update = async (req, res) => {
  try {
    const { name, icon, leader_id } = req.body;
    await db.query('UPDATE `groups` SET name=COALESCE(?,name),icon=COALESCE(?,icon),leader_id=COALESCE(?,leader_id) WHERE id=?',
      [name, icon, leader_id, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.remove = async (req, res) => {
  try {
    await db.query('UPDATE `groups` SET is_active=0 WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// Kiểm tra dùng chung cho addMember/removeMember:
// - Admin/Manager: thao tác được nhóm bất kỳ.
// - Leader: CHỈ thao tác được nhóm mà chính họ là leader_id — không được
//   thêm/xóa thành viên ở nhóm khác, kể cả khi họ là leader của 1 nhóm khác.
// Trả về { ok:true } nếu được phép, { ok:false, message } nếu bị chặn.
async function canManageGroupMembers(req) {
  const isPrivileged = ['admin','manager'].includes(req.user.role);
  if (isPrivileged) return { ok: true };

  if (req.user.role === 'leader') {
    const [[group]] = await db.query('SELECT leader_id FROM `groups` WHERE id=?', [req.params.id]);
    if (!group) return { ok: false, status: 404, message: 'Không tìm thấy nhóm' };
    if (group.leader_id === req.user.id) return { ok: true };
    return { ok: false, status: 403, message: 'Bạn chỉ có thể thêm/xóa thành viên ở nhóm mình phụ trách' };
  }

  return { ok: false, status: 403, message: 'Bạn không có quyền chỉnh sửa thành viên nhóm' };
}

exports.addMember = async (req, res) => {
  try {
    const perm = await canManageGroupMembers(req);
    if (!perm.ok) return res.status(perm.status).json({ success: false, message: perm.message });

    const { user_id } = req.body;
    await db.query('INSERT IGNORE INTO group_members (group_id,user_id) VALUES (?,?)', [req.params.id, user_id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.removeMember = async (req, res) => {
  try {
    const perm = await canManageGroupMembers(req);
    if (!perm.ok) return res.status(perm.status).json({ success: false, message: perm.message });

    await db.query('DELETE FROM group_members WHERE group_id=? AND user_id=?', [req.params.id, req.params.userId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
