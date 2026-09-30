const db = require('../config/db');
const { sendCachedJson } = require('../utils/cachedJson');
const { logActivity, diffFields } = require('../services/activityLogService');

const actorOf = (req) => req.user.full_name || req.user.username;
const getGroup = async (id) => (await db.query(
  'SELECT g.*, u.full_name AS leader_name FROM `groups` g LEFT JOIN users u ON u.id=g.leader_id WHERE g.id=?', [id]))[0][0];
const userName = async (id) => (await db.query('SELECT full_name FROM users WHERE id=?', [id]))[0][0]?.full_name || `#${id}`;

// Danh sách nhóm giống nhau với mọi người và hầu như mọi trang đều tải →
// cache dùng chung (bị xóa khi sửa nhóm / thành viên / người dùng — xem routes/index.js)
exports.list = async (req, res) => {
  try {
    await sendCachedJson(req, res, 'grp:list', 60000, async () => {
    const [groups] = await db.query(`
      SELECT g.*, u.full_name as leader_name, u.avatar_color as leader_color,
             COUNT(DISTINCT gm.user_id) as member_count
      FROM \`groups\` g
      LEFT JOIN users u ON u.id=g.leader_id
      LEFT JOIN group_members gm ON gm.group_id=g.id
      WHERE g.is_active=1
      GROUP BY g.id ORDER BY g.name`
    );
    // Lấy thành viên của TẤT CẢ nhóm trong 1 câu rồi chia ở JS (trước đây 1 câu/nhóm)
    const byGroup = {};
    if (groups.length) {
      const [members] = await db.query(
        `SELECT gm.group_id, u.id,u.full_name,u.username,u.role,u.avatar_color
         FROM group_members gm JOIN users u ON u.id=gm.user_id
         WHERE gm.group_id IN (?) AND u.is_active=1`, [groups.map(g => g.id)]
      );
      for (const { group_id, ...m } of members) (byGroup[group_id] ??= []).push(m);
    }
    groups.forEach(g => { g.members = byGroup[g.id] || []; });
    return groups;
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.create = async (req, res) => {
  try {
    const { name, icon='🏭', leader_id } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name required' });
    const [r] = await db.query('INSERT INTO `groups` (name,icon,leader_id) VALUES (?,?,?)', [name, icon, leader_id||null]);
    if (leader_id) await db.query('INSERT IGNORE INTO group_members (group_id,user_id) VALUES (?,?)', [r.insertId, leader_id]);
    await logActivity({
      actorId: req.user.id, actionType: 'group_created', entityType: 'group', entityId: r.insertId,
      description: `${actorOf(req)} đã tạo nhóm "${name}"${leader_id ? ` (leader: ${await userName(leader_id)})` : ''}`,
    });
    res.status(201).json({ success: true, data: { id: r.insertId, name, icon, leader_id } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.update = async (req, res) => {
  try {
    const { name, icon, leader_id } = req.body;
    const before = await getGroup(req.params.id);
    if (!before) return res.status(404).json({ success: false, message: 'Not found' });
    await db.query('UPDATE `groups` SET name=COALESCE(?,name),icon=COALESCE(?,icon),leader_id=COALESCE(?,leader_id) WHERE id=?',
      [name, icon, leader_id, req.params.id]);
    const diff = diffFields(before, await getGroup(req.params.id),
      { name: ['tên'], icon: ['biểu tượng'], leader_name: ['leader', v => v || '(chưa có)'] });
    if (diff.text) await logActivity({
      actorId: req.user.id, actionType: 'group_updated', entityType: 'group', entityId: +req.params.id,
      description: `${actorOf(req)} đã sửa nhóm "${before.name}": ${diff.text}`,
      metadata: { changes: diff.changes },
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.remove = async (req, res) => {
  try {
    const before = await getGroup(req.params.id);
    await db.query('UPDATE `groups` SET is_active=0 WHERE id=?', [req.params.id]);
    await logActivity({
      actorId: req.user.id, actionType: 'group_deleted', entityType: 'group', entityId: +req.params.id,
      description: `${actorOf(req)} đã xóa nhóm "${before?.name || '#' + req.params.id}"`,
    });
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
    const [r] = await db.query('INSERT IGNORE INTO group_members (group_id,user_id) VALUES (?,?)', [req.params.id, user_id]);
    if (r.affectedRows) await logActivity({
      actorId: req.user.id, actionType: 'group_member_added', entityType: 'group', entityId: +req.params.id,
      description: `${actorOf(req)} đã thêm ${await userName(user_id)} vào nhóm "${(await getGroup(req.params.id))?.name}"`,
      metadata: { user_id: +user_id },
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.removeMember = async (req, res) => {
  try {
    const perm = await canManageGroupMembers(req);
    if (!perm.ok) return res.status(perm.status).json({ success: false, message: perm.message });

    const [r] = await db.query('DELETE FROM group_members WHERE group_id=? AND user_id=?', [req.params.id, req.params.userId]);
    if (r.affectedRows) await logActivity({
      actorId: req.user.id, actionType: 'group_member_removed', entityType: 'group', entityId: +req.params.id,
      description: `${actorOf(req)} đã gỡ ${await userName(req.params.userId)} khỏi nhóm "${(await getGroup(req.params.id))?.name}"`,
      metadata: { user_id: +req.params.userId },
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
