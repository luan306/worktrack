// Yêu cầu cần Leader nhóm khác đồng ý: Leader nhóm A muốn đổi VAI TRÒ / KHÓA–MỞ KHÓA / CHUYỂN NHÓM
// tài khoản thuộc nhóm B (không chung nhóm) → gửi cho Leader nhóm B duyệt, đồng ý mới áp dụng.
const db = require('../config/db');

async function init() {
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS approval_requests (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        type VARCHAR(30) NOT NULL,
        requester_id INT NOT NULL,
        target_user_id INT NOT NULL,
        changes JSON NOT NULL,
        approver_ids JSON NOT NULL,
        status ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
        decided_by INT NULL, decided_at DATETIME NULL, decision_note VARCHAR(500) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_appr_status (status, created_at),
        KEY idx_appr_target (target_user_id),
        CONSTRAINT fk_appr_target FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_appr_requester FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    // bản cũ chưa có 2 cột này → thêm
    const [cols] = await db.query(
      "SELECT column_name AS c FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='approval_requests'");
    const has = new Set(cols.map(x => x.c || x.COLUMN_NAME));
    if (!has.has('summary')) await db.query('ALTER TABLE approval_requests ADD COLUMN summary VARCHAR(500) NULL AFTER changes');
    if (!has.has('requester_hidden')) await db.query('ALTER TABLE approval_requests ADD COLUMN requester_hidden TINYINT(1) NOT NULL DEFAULT 0');
    // nhiều bước duyệt (🔀 Quy trình): bước hiện tại, danh sách bước, ai đã đồng ý ở bước trước
    if (!has.has('stage')) await db.query('ALTER TABLE approval_requests ADD COLUMN stage TINYINT NOT NULL DEFAULT 1, ADD COLUMN stages JSON NULL, ADD COLUMN progress JSON NULL');
  } catch (e) { console.error('[approval] lỗi tạo bảng:', e.message); }
}

// 2 người có chung nhóm nào không
async function shareGroup(a, b) {
  const [[r]] = await db.query(
    'SELECT 1 AS x FROM group_members x JOIN group_members y ON y.group_id=x.group_id WHERE x.user_id=? AND y.user_id=? LIMIT 1', [a, b]);
  return !!r;
}

// Nhóm của 1 người + Leader của các nhóm đó (leader_id của nhóm, hoặc thành viên vai trò Leader)
async function groupLeadersOf(userId, excludeId) {
  const [groups] = await db.query(
    `SELECT g.id, g.name FROM group_members gm JOIN \`groups\` g ON g.id=gm.group_id AND g.is_active=1 WHERE gm.user_id=?`, [userId]);
  if (!groups.length) return { groups, leaders: [] };
  const [leaders] = await db.query(
    `SELECT DISTINCT u.id, u.full_name FROM users u
      WHERE u.is_active=1 AND u.id<>? AND u.role='leader' AND (
        u.id IN (SELECT leader_id FROM \`groups\` WHERE id IN (?) AND leader_id IS NOT NULL)
        OR u.id IN (SELECT user_id FROM group_members WHERE group_id IN (?)))`,
    [excludeId || 0, groups.map(g => g.id), groups.map(g => g.id)]);
  return { groups, leaders };
}

/**
 * Ai duyệt, theo quy trình "Duyệt thay đổi tài khoản" (Quản trị → 🔀 Quy trình).
 * → { skip: true }  không cần duyệt (áp dụng ngay)
 * → { error }       không gửi được (vd nhóm chưa có Leader)
 * → { groups, stages: [{ kind:'leader'|'manager', ids:[...], names:[...] }] }
 */
async function approvalPlan(targetId, requesterId) {
  const c = require('../config/workflow').acct();
  const { groups, leaders } = await groupLeadersOf(targetId, requesterId);
  const stages = [];
  const wantLeader = c.approver !== 'manager', wantManager = c.approver !== 'group_leader';
  let needManager = wantManager;
  if (wantLeader) {
    if (!groups.length) { if (!wantManager) return { skip: true, groups }; }        // như trước: không thuộc nhóm nào → áp dụng ngay
    else if (leaders.length) stages.push({ kind: 'leader', ids: leaders.map(l => l.id), names: leaders.map(l => l.full_name) });
    else if (c.no_leader === 'manager') needManager = true;
    else if (!wantManager) return { error: `Nhóm ${groups.map(g => g.name).join(', ')} chưa có Leader để duyệt — nhờ Manager / Admin thực hiện`, groups };
  }
  if (needManager) {
    const [m] = await db.query("SELECT id, full_name FROM users WHERE role='manager' AND is_active=1 AND id<>? ORDER BY full_name", [requesterId]);
    if (!m.length) return { error: 'Chưa có Manager nào để duyệt — nhờ Admin thực hiện', groups };
    stages.push({ kind: 'manager', ids: m.map(x => x.id), names: m.map(x => x.full_name) });
  }
  return { groups, stages };
}

module.exports = { init, shareGroup, groupLeadersOf, approvalPlan };
