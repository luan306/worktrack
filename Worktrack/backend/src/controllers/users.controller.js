const { hasPerm } = require('../config/permissions');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const { styleHeader, sendXlsx, xlsxError } = require('../utils/excel');
const db = require('../config/db');
const cache = require('../config/cache');
const { invalidateUser } = require('../middleware/auth');
const { DEFAULT_PASSWORD } = require('../utils/password');
const { logActivity, diffFields } = require('../services/activityLogService');
const { sendCachedJson } = require('../utils/cachedJson');
const { shareGroup, groupLeadersOf, approvalPlan } = require('../services/approvalService');
const workflow = require('../config/workflow'); // quy trình "Duyệt thay đổi tài khoản" (🔀 Quy trình)
const KIND_LABEL = { leader: 'Leader nhóm', manager: 'Manager' };
const { notifyMany, notify } = require('../services/notificationService');

// ── Lịch sử thay đổi tài khoản ──
const ROLE_LABEL = { user: 'Nhân viên', assistant: 'Trợ lý Leader', leader: 'Leader', manager: 'Manager', admin: 'Admin' };
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

const ROLES = ['user', 'assistant', 'leader', 'manager', 'admin'];
// Vai trò THẤP HƠN Leader — Leader (và người được quyền quản lý tài khoản, không phải Admin/Manager) chỉ gán được các vai trò này
const LOWER_ROLES = ['user', 'assistant'];
const access = require('../config/access'); // phân quyền theo hành động — Admin chưa chỉnh thì như cũ
const RANK = { user: 0, assistant: 1, leader: 2, manager: 3, admin: 4 };
const U_KEYS = { edit: 'user.edit', role: 'user.change_role', is_active: 'user.lock', group_id: 'user.move_group' };
const MIN_PASSWORD = 8;
const weakPassword = (p) => typeof p !== 'string' || p.length < MIN_PASSWORD;
// Chỉ Admin mới được tạo/nâng quyền Admin hoặc đụng vào tài khoản Admin
const ADMIN_ONLY = { success: false, message: 'Chỉ Admin mới được thao tác với tài khoản/quyền Admin' };

exports.list = async (req, res) => {
  try {
    const { group_id, role, search, is_active } = req.query;
    // User thường chỉ cần danh sách tên để chọn người
    const limited = !(await access.decide('user.view_full', req.user, {}, ['admin','manager','leader'].includes(req.user.role)));
    // Trang nào cũng gọi → cache dùng chung; mọi thao tác ghi vào /users, /groups xóa cache 'grp:' (routes/index.js)
    await sendCachedJson(req, res, 'grp:users:' + JSON.stringify([group_id, role, search, is_active, limited]), 60000, async () => {

    // group_concat_max_len đã được set cho mọi connection ở config/db.js
    let sql = `SELECT u.id,u.username,u.email,u.full_name,u.role,u.avatar_color,u.avatar_url,u.is_active,u.last_login,u.created_at,
               GROUP_CONCAT(DISTINCT CONCAT(g.id,':',g.name) ORDER BY g.name SEPARATOR '|') as groups_raw
               FROM users u
               LEFT JOIN group_members gm ON gm.user_id=u.id
               LEFT JOIN \`groups\` g ON g.id=gm.group_id AND g.is_active=1
               WHERE 1=1`;
    const p = [];
    // ⚠️ Trước đây lọc cứng "WHERE u.is_active=1"
    if (is_active !== undefined && is_active !== '') { sql += ' AND u.is_active=?'; p.push(is_active); }
    if (role)     { sql += ' AND u.role=?'; p.push(role); }
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
    return data;
    });
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

    // Không phải Admin/Manager (Leader hoặc người được cấp quyền) chỉ tạo được vai trò thấp hơn Leader
    if (!['admin','manager'].includes(req.user.role) && !LOWER_ROLES.includes(role))
      return res.status(403).json({ success: false, message: 'Bạn chỉ tạo được tài khoản Nhân viên hoặc Trợ lý Leader' });

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

// PUT /users/:id — cho phép các trường hợp sau
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, email, avatar_color } = req.body;
    let { role, is_active, group_id } = req.body;

    const isSelf       = req.user.id === +id;
    // Admin/Manager có quyền "Quản lý tài khoản": sửa mọi thứ; người khác có quyền đó: như Leader (chỉ tài khoản nhân viên)
    // Admin đã chỉnh 1 trong các quyền quản lý tài khoản (Quản trị → 🔐 Phân quyền) cho người này → kiểm tra thêm theo đó
    const tunedU = !isSelf && Object.values(U_KEYS).some(k => access.isTuned(req.user, k));
    const grantedU = tunedU && Object.values(U_KEYS).some(k => access.hasAny(req.user, k));
    const canManage     = hasPerm(req.user, 'user.manage') || grantedU;
    const isPrivileged = ['admin','manager'].includes(req.user.role) && canManage;
    const isLeader      = !isPrivileged && canManage;

    if (!isSelf && !isPrivileged && !isLeader) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền chỉnh sửa người dùng khác' });
    }

    // ⚠️ Lấy TRƯỚC thông tin hiện tại của target
    const [[target]] = !isSelf ? await db.query('SELECT role, is_active, username, full_name, email, avatar_color FROM users WHERE id=?', [id]) : [[null]];
    if (!isSelf && !target) return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });

    if (role !== undefined && !ROLES.includes(role))
      return res.status(400).json({ success: false, message: 'Role không hợp lệ' });
    if (req.user.role !== 'admin' && (role === 'admin' || target?.role === 'admin'))
      return res.status(403).json(ADMIN_ONLY);

    // username (MSNV) là tên đăng nhập — chính chủ không tự đổi được
    const username = isSelf && !isPrivileged ? undefined : req.body.username;

    // role là trường nhạy cảm nhất — Admin/Manager đổi tùy ý; Leader chỉ đổi qua lại giữa các vai trò THẤP HƠN Leader
    // (Nhân viên ⇄ Trợ lý Leader), không tự đổi mình, không đụng tới Leader / Manager / Admin
    const roleChanging = role !== undefined && (isSelf || role !== target.role);
    if (roleChanging && !isPrivileged) {
      if (!isLeader || isSelf) return res.status(403).json({ success: false, message: 'Bạn không có quyền đổi vai trò người dùng' });
      if (!LOWER_ROLES.includes(target.role) || !LOWER_ROLES.includes(role))
        return res.status(403).json({ success: false, message: 'Bạn chỉ đổi được vai trò giữa Nhân viên và Trợ lý Leader' });
    }

    // Nhóm — admin/manager luôn được
    if (group_id !== undefined && !isPrivileged) {
      if (!isLeader) {
        return res.status(403).json({ success: false, message: 'Bạn không có quyền đổi nhóm của người dùng' });
      }
      if (isSelf) {
        return res.status(400).json({ success: false, message: 'Không thể tự đổi nhóm của chính mình' });
      }
    }

    // Leader sửa NGƯỜI KHÁC (không phải chính mình, không phải admin/manager thực hiện)
    if (isLeader && !isSelf && !isPrivileged) {
      if (['admin','manager'].includes(target.role)) {
        return res.status(403).json({ success: false, message: 'Leader không có quyền chỉnh sửa tài khoản admin/manager' });
      }
    }

    // is_active (khóa/mở khóa): admin/manager luôn được
    const activeChanging = is_active !== undefined && (isSelf || +is_active !== +target.is_active);
    if (activeChanging && !isPrivileged) {
      if (!isLeader) {
        return res.status(403).json({ success: false, message: 'Bạn không có quyền đổi trạng thái hoạt động' });
      }
      if (isSelf) {
        return res.status(400).json({ success: false, message: 'Không thể tự khóa/mở khóa chính mình' });
      }
    }

    // Đổi nhóm thật hay không (so với hiện tại)
    let groupChanging = false;
    if (group_id !== undefined && !isSelf) {
      const [cur] = await db.query('SELECT group_id FROM group_members WHERE user_id=?', [id]);
      const now = new Set(cur.map(r => r.group_id));
      groupChanging = !(group_id ? (now.size === 1 && now.has(+group_id)) : now.size === 0);
    }

    // Theo cấu hình Admin (chỉ khi đã chỉnh): từng thao tác phải được phép; "Người cùng nhóm" → người nhóm khác đi qua duyệt
    const noApproval = new Set();
    if (tunedU) {
      if (roleChanging && !isPrivileged && RANK[role] >= RANK[req.user.role])
        return res.status(403).json({ success: false, message: 'Không đặt được vai trò ngang hoặc cao hơn vai trò của mình' });
      const infoChanging = ['username', 'full_name', 'email', 'avatar_color'].some(k => req.body[k] !== undefined && String(req.body[k] ?? '') !== String(target[k] ?? ''));
      const ctx = { targetUserId: +id, targetRole: target.role };
      for (const [field, changing] of [['edit', infoChanging], ['role', roleChanging], ['is_active', activeChanging], ['group_id', groupChanging]]) {
        const key = U_KEYS[field];
        if (!changing || !access.isTuned(req.user, key)) continue;
        const r = await access.can(req.user, key, ctx);
        if (r.ok) { if (r.scope.s.includes('all')) noApproval.add(field); continue; }
        if (field !== 'edit' && r.scope?.s.includes('group') && r.reason.startsWith('Ngoài phạm vi')) continue; // nhóm khác → cần duyệt
        return res.status(403).json({ success: false, message: r.reason });
      }
    }

    // 🤝 Leader sửa tài khoản thuộc NHÓM KHÁC (không chung nhóm): đổi vai trò / khóa–mở khóa / chuyển nhóm
    //    phải được Leader nhóm đó đồng ý → tách ra thành yêu cầu chờ duyệt; các trường khác vẫn lưu ngay
    let pending = null;
    const acctFlow = workflow.acct();
    if (isLeader && !isSelf && !isPrivileged && acctFlow.when !== 'never') {
      const sens = {};
      if (roleChanging && !noApproval.has('role')) sens.role = role;
      if (activeChanging && !noApproval.has('is_active')) sens.is_active = +is_active ? 1 : 0;
      if (groupChanging && !noApproval.has('group_id')) sens.group_id = group_id ? +group_id : null;
      if (Object.keys(sens).length && (acctFlow.when === 'always' || !(await shareGroup(req.user.id, +id)))) {
        const plan = await approvalPlan(+id, req.user.id);
        if (plan.error) return res.status(403).json({ success: false, message: plan.error });
        if (!plan.skip) {
          pending = { sens, groups: plan.groups, stages: plan.stages };
          // phần cần duyệt tách ra; phần Admin cho phép "Cả công ty" vẫn lưu ngay
          if ('role' in sens || !roleChanging) role = undefined;
          if ('is_active' in sens || !activeChanging) is_active = undefined;
          if ('group_id' in sens || !groupChanging) group_id = undefined;
        }
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

    // Đổi nhóm — gỡ khỏi nhóm cũ, thêm vào nhóm mới
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

    if (pending) {
      const r = await createApproval(req, +id, before, pending);
      return res.status(202).json({ success: true, pending: true, approval_id: r.id, message: r.message,
        approval: { what: r.what, target: r.target, groups: r.groups, approvers: r.approvers } });
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ───────────── Yêu cầu chờ Leader nhóm khác duyệt ─────────────
const describeChanges = async (sens, target) => {
  const parts = [];
  if (sens.role !== undefined) parts.push(`vai trò: ${ROLE_LABEL[target.role] || target.role} → ${ROLE_LABEL[sens.role] || sens.role}`);
  if (sens.is_active !== undefined) parts.push(sens.is_active ? 'MỞ KHÓA tài khoản' : 'KHÓA tài khoản');
  if (sens.group_id !== undefined) {
    let to = '(không nhóm)';
    if (sens.group_id) { const [[g]] = await db.query('SELECT name FROM `groups` WHERE id=?', [sens.group_id]); to = g?.name || `#${sens.group_id}`; }
    parts.push(`chuyển nhóm: ${target.group_names || '(không nhóm)'} → ${to}`);
  }
  return parts.join('; ');
};

async function createApproval(req, targetId, target, { sens, groups, stages }) {
  const first = stages[0];
  // gửi lại cho cùng người → thay yêu cầu cũ đang chờ
  await db.query("UPDATE approval_requests SET status='cancelled', decided_at=NOW(), decision_note='Đã gửi yêu cầu mới thay thế' WHERE status='pending' AND requester_id=? AND target_user_id=?", [req.user.id, targetId]);
  const what = await describeChanges(sens, target);
  const [r] = await db.query(
    'INSERT INTO approval_requests (type, requester_id, target_user_id, changes, summary, approver_ids, stage, stages) VALUES (?,?,?,?,?,?,1,?)',
    ['user_change', req.user.id, targetId, JSON.stringify(sens), what.slice(0, 500), JSON.stringify(first.ids), JSON.stringify(stages.map(s => ({ kind: s.kind, ids: s.ids })))]);
  const groupNames = groups.map(g => g.name).join(', ') || '(không nhóm)';
  const chain = stages.map(s => `${KIND_LABEL[s.kind]} (${s.names.join(' / ')})`).join(' → ');
  await logActivity({
    actorId: req.user.id, actionType: 'user_change_requested', entityType: 'user', entityId: targetId,
    description: `${actorOf(req)} đã GỬI YÊU CẦU sửa tài khoản ${target.full_name} (${target.username}, nhóm ${groupNames}): ${what} — chờ duyệt: ${chain}`,
    metadata: { approval_id: r.insertId, changes: sens },
  });
  notifyMany(req.app.get('io'), first.ids, {
    actorId: req.user.id, type: 'user_change_request', entityType: 'user_approval', entityId: r.insertId,
    payload: { actorName: actorOf(req), targetName: target.full_name, what },
  }).catch(e => console.error('[notify approval]', e.message));
  return { id: r.insertId, what, target: target.full_name, groups: groups.map(g => g.name), approvers: first.names,
    message: `Đã gửi yêu cầu (${what}) — chờ duyệt: ${chain}. Thay đổi chỉ được áp dụng khi ${stages.length > 1 ? 'tất cả các bước' : 'họ'} đồng ý.` };
}

const parseJson = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

// GET /users/approvals — yêu cầu chờ mình duyệt + yêu cầu mình đã gửi (14 ngày gần nhất)
exports.listApprovals = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT a.*, rq.full_name AS requester_name, t.full_name AS target_name, t.username AS target_username, t.role AS target_role,
              d.full_name AS decided_by_name
         FROM approval_requests a
         JOIN users rq ON rq.id=a.requester_id
         JOIN users t  ON t.id=a.target_user_id
         LEFT JOIN users d ON d.id=a.decided_by
        WHERE a.created_at >= NOW() - INTERVAL 14 DAY
          AND ((a.requester_id=? AND a.requester_hidden=0) OR (a.status='pending' AND JSON_CONTAINS(a.approver_ids, CAST(? AS JSON))))
        ORDER BY a.status='pending' DESC, a.id DESC LIMIT 100`, [req.user.id, String(req.user.id)]);
    const out = [];
    for (const r of rows) {
      const sens = parseJson(r.changes);
      const target = await getUserSnapshot(r.target_user_id);
      out.push({
        id: r.id, status: r.status, created_at: r.created_at, decided_at: r.decided_at, decision_note: r.decision_note, decided_by_name: r.decided_by_name,
        requester_name: r.requester_name, target_name: r.target_name, target_username: r.target_username,
        what: r.summary || await describeChanges(sens, target || {}), changes: sens,
        mine: r.requester_id === req.user.id, can_decide: r.status === 'pending' && parseJson(r.approver_ids).includes(req.user.id),
        stage: r.stage || 1, stages: (parseJson(r.stages) || [{ kind: 'leader' }]).map(s => s.kind), progress: parseJson(r.progress) || [],
      });
    }
    res.json({ success: true, data: out });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

async function loadPending(req, res) {
  const [[a]] = await db.query('SELECT * FROM approval_requests WHERE id=?', [req.params.id]);
  if (!a) { res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu' }); return null; }
  if (a.status !== 'pending') { res.status(400).json({ success: false, message: 'Yêu cầu này đã được xử lý rồi' }); return null; }
  return { ...a, changes: parseJson(a.changes), approver_ids: parseJson(a.approver_ids) };
}

// POST /users/approvals/:id/approve — Leader nhóm của người bị sửa đồng ý → áp dụng
exports.approve = async (req, res) => {
  try {
    const a = await loadPending(req, res); if (!a) return;
    const stages = parseJson(a.stages) || [{ kind: 'leader', ids: a.approver_ids }]; // yêu cầu cũ: 1 bước Leader
    const stageNo = a.stage || 1, cur = stages[stageNo - 1] || stages[0];
    if (!a.approver_ids.includes(req.user.id)) return res.status(403).json({ success: false, message: 'Bạn không phải người duyệt bước này' });
    if (cur.kind === 'leader') {
      // vẫn phải đang là Leader nhóm của người đó (có thể đã đổi nhóm / đổi vai trò sau khi gửi)
      const { leaders } = await groupLeadersOf(a.target_user_id, a.requester_id);
      if (!leaders.some(l => l.id === req.user.id))
        return res.status(403).json({ success: false, message: 'Bạn không phải Leader nhóm của người này nên không duyệt được' });
    } else if (!['manager', 'admin'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Bước này do Manager duyệt' });
    const [[rq]] = await db.query('SELECT id, role, username, full_name, is_active FROM users WHERE id=?', [a.requester_id]);
    const [[t]] = await db.query('SELECT role FROM users WHERE id=?', [a.target_user_id]);
    const fail = (m) => res.status(400).json({ success: false, message: m });
    if (!rq?.is_active || !(hasPerm(rq, 'user.manage') || Object.values(U_KEYS).some(k => access.isTuned(rq, k) && access.hasAny(rq, k)))) return fail('Người gửi không còn quyền quản lý tài khoản — yêu cầu không áp dụng được');
    if (!t || ['admin', 'manager'].includes(t.role)) return fail('Không áp dụng được cho tài khoản Admin / Manager');
    const s = a.changes;
    if (s.role !== undefined && (!LOWER_ROLES.includes(t.role) || !LOWER_ROLES.includes(s.role)))
      return fail('Chỉ đổi được vai trò giữa Nhân viên và Trợ lý Leader');

    // còn bước sau → chuyển sang bước tiếp (chưa áp dụng)
    const progress = [...(parseJson(a.progress) || []), { stage: stageNo, kind: cur.kind, by: req.user.id, name: actorOf(req), at: new Date() }];
    if (stageNo < stages.length) {
      const next = stages[stageNo];
      const [u] = await db.query("UPDATE approval_requests SET stage=?, approver_ids=?, progress=? WHERE id=? AND status='pending' AND stage=?",
        [stageNo + 1, JSON.stringify(next.ids), JSON.stringify(progress), a.id, stageNo]);
      if (!u.affectedRows) return fail('Yêu cầu vừa được người khác xử lý — tải lại trang');
      const tg = await getUserSnapshot(a.target_user_id);
      await logActivity({
        actorId: req.user.id, actionType: 'user_change_stage_approved', entityType: 'user', entityId: a.target_user_id,
        description: `${actorOf(req)} (${KIND_LABEL[cur.kind]}) đã ĐỒNG Ý bước ${stageNo}/${stages.length} yêu cầu sửa tài khoản ${tg?.full_name}: ${a.summary || ''} — chờ ${KIND_LABEL[next.kind]} duyệt tiếp`,
        metadata: { approval_id: a.id, stage: stageNo },
      });
      notifyMany(req.app.get('io'), next.ids, {
        actorId: a.requester_id, type: 'user_change_request', entityType: 'user_approval', entityId: a.id,
        payload: { actorName: rq.full_name, targetName: tg?.full_name, what: `${a.summary || ''} · ${actorOf(req)} đã đồng ý bước ${stageNo}` },
      }).catch(() => {});
      return res.json({ success: true, data: { next: next.kind } });
    }

    const before = await getUserSnapshot(a.target_user_id);
    if (s.role !== undefined || s.is_active !== undefined)
      await db.query('UPDATE users SET role=COALESCE(?,role), is_active=COALESCE(?,is_active) WHERE id=?', [s.role ?? null, s.is_active ?? null, a.target_user_id]);
    if (s.group_id !== undefined) {
      await db.query('DELETE FROM group_members WHERE user_id=?', [a.target_user_id]);
      if (s.group_id) await db.query('INSERT IGNORE INTO group_members (group_id,user_id) VALUES (?,?)', [s.group_id, a.target_user_id]);
    }
    invalidateUser(a.target_user_id);
    cache.clear('grp:');
    await db.query("UPDATE approval_requests SET status='approved', decided_by=?, decided_at=NOW(), decision_note=?, progress=? WHERE id=?",
      [req.user.id, String(req.body?.note || '').slice(0, 500) || null, JSON.stringify(progress), a.id]);
    const after = await getUserSnapshot(a.target_user_id);
    const diff = diffFields(before, after, USER_FIELDS);
    await logActivity({
      actorId: a.requester_id, actionType: diff.changes.is_active ? (+after.is_active ? 'user_unlocked' : 'user_locked') : diff.changes.role ? 'user_role_changed' : 'user_updated',
      entityType: 'user', entityId: a.target_user_id,
      description: `${rq.full_name} đã sửa tài khoản ${before.full_name} (${before.username}): ${diff.text || '(không đổi gì)'} — được ${progress.map(p => `${p.name} (${KIND_LABEL[p.kind]})`).join(' → ')} ĐỒNG Ý`,
      metadata: { approval_id: a.id, approved_by: req.user.id, changes: diff.changes },
    });
    notify(req.app.get('io'), { userId: a.requester_id, actorId: req.user.id, type: 'user_change_approved', entityType: 'user_approval', entityId: a.id,
      payload: { actorName: actorOf(req), targetName: before.full_name, what: diff.text } }).catch(() => {});
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// POST /users/approvals/:id/reject — Leader nhóm từ chối
exports.reject = async (req, res) => {
  try {
    const a = await loadPending(req, res); if (!a) return;
    if (!a.approver_ids.includes(req.user.id)) return res.status(403).json({ success: false, message: 'Bạn không phải người duyệt yêu cầu này' });
    const note = String(req.body?.note || '').trim().slice(0, 500) || null;
    await db.query("UPDATE approval_requests SET status='rejected', decided_by=?, decided_at=NOW(), decision_note=? WHERE id=?", [req.user.id, note, a.id]);
    const t = await getUserSnapshot(a.target_user_id);
    const what = await describeChanges(a.changes, t || {});
    await logActivity({
      actorId: req.user.id, actionType: 'user_change_rejected', entityType: 'user', entityId: a.target_user_id,
      description: `${actorOf(req)} đã TỪ CHỐI yêu cầu sửa tài khoản ${t?.full_name} (${what})${note ? ` — Lý do: ${note}` : ''}`,
      metadata: { approval_id: a.id, note },
    });
    notify(req.app.get('io'), { userId: a.requester_id, actorId: req.user.id, type: 'user_change_rejected', entityType: 'user_approval', entityId: a.id,
      payload: { actorName: actorOf(req), targetName: t?.full_name, what, note } }).catch(() => {});
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// POST /users/approvals/:id/hide — người gửi xóa (ẩn) 1 yêu cầu ĐÃ XỬ LÝ khỏi danh sách của mình (nhật ký vẫn giữ)
// POST /users/approvals/hide-done — xóa (ẩn) tất cả yêu cầu đã xử lý
exports.hideApproval = async (req, res) => {
  try {
    const all = req.params.id === undefined;
    const [r] = await db.query(
      `UPDATE approval_requests SET requester_hidden=1 WHERE requester_id=? AND status<>'pending'${all ? '' : ' AND id=?'}`,
      all ? [req.user.id] : [req.user.id, req.params.id]);
    if (!all && !r.affectedRows) return res.status(400).json({ success: false, message: 'Chỉ xóa được yêu cầu của mình đã xử lý xong (yêu cầu đang chờ thì bấm Hủy)' });
    res.json({ success: true, data: { hidden: r.affectedRows } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// POST /users/approvals/:id/cancel — người gửi tự hủy
exports.cancelApproval = async (req, res) => {
  try {
    const a = await loadPending(req, res); if (!a) return;
    if (a.requester_id !== req.user.id) return res.status(403).json({ success: false, message: 'Chỉ người gửi mới hủy được yêu cầu' });
    await db.query("UPDATE approval_requests SET status='cancelled', decided_at=NOW(), decision_note='Người gửi tự hủy' WHERE id=?", [a.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// POST /users/:id/reset-password
exports.resetPassword = async (req, res) => {
  try {
    const { password } = req.body;
    if (weakPassword(password))
      return res.status(400).json({ success: false, message: `Mật khẩu phải có ít nhất ${MIN_PASSWORD} ký tự` });

    const [[target]] = await db.query('SELECT role FROM users WHERE id=?', [req.params.id]);
    if (!target) return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    if (access.isTuned(req.user, 'user.reset_password')) {
      const r = await access.can(req.user, 'user.reset_password', { targetUserId: +req.params.id, targetRole: target.role });
      if (!r.ok) return res.status(403).json({ success: false, message: r.reason });
    } else if (!['admin','manager'].includes(req.user.role) && ['admin','manager'].includes(target.role)) {
      return res.status(403).json({ success: false, message: 'Leader không có quyền đổi mật khẩu tài khoản admin/manager' });
    }
    if (target.role === 'admin' && req.user.role !== 'admin') return res.status(403).json(ADMIN_ONLY);

    // Đặt lại về mật khẩu mặc định → người đó phải đổi ở lần đăng nhập tới; đặt mật khẩu riêng → gỡ yêu cầu
    await db.query('UPDATE users SET password=?, must_change_password=? WHERE id=?',
      [await bcrypt.hash(password, 10), password === DEFAULT_PASSWORD ? 1 : 0, req.params.id]);
    invalidateUser(req.params.id);
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
    if (!Array.isArray(users)) return res.status(400).json({ success: false, message: 'Thiếu danh sách tài khoản' });
    if (users.length > 500) return res.status(400).json({ success: false, message: 'Tối đa 500 dòng mỗi lần nhập' });
    // Giống "Tạo tài khoản": Leader chỉ tạo nhân viên, chỉ Admin tạo được admin; chỉ Admin được tạo nhóm mới
    const actorRole = req.user.role;
    const allowedRoles = actorRole === 'admin' ? ROLES : actorRole === 'manager' ? ROLES.filter(r => r !== 'admin') : LOWER_ROLES;
    const groupIdCache = new Map();
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
        const rawRole = String(u.role || '').trim().toLowerCase();
        const role = ROLES.includes(rawRole) ? rawRole : 'user';
        if (!allowedRoles.includes(role)) {
          errors.push({ name: u.full_name, error: actorRole !== 'manager'
            ? `Bạn chỉ tạo được Nhân viên (user) hoặc Trợ lý Leader (assistant) — dòng này là "${role}"`
            : 'Chỉ Admin mới tạo được tài khoản admin' });
          continue;
        }
        // Nhóm: tìm trước khi tạo tài khoản — người không phải Admin không được tạo nhóm mới
        const gname = String(u.group_name || '').trim();
        let gid = null;
        if (gname) {
          const key = gname.toLowerCase();
          if (groupIdCache.has(key)) gid = groupIdCache.get(key);
          else {
            const [gs] = await db.query('SELECT id FROM `groups` WHERE LOWER(name)=LOWER(?) AND is_active=1 LIMIT 1', [gname]);
            gid = gs[0]?.id || null;
            if (gid) groupIdCache.set(key, gid);
          }
          if (!gid && actorRole !== 'admin') {
            errors.push({ name: u.full_name, error: `Nhóm "${gname}" chưa có — nhờ Admin tạo nhóm trước` });
            continue;
          }
        }

        console.log('[import] Processing:', u.full_name, '→ username:', uname);

        // Kiểm tra trùng username
        const [[exist]] = await db.query(
          'SELECT id, full_name FROM users WHERE username=?', [uname]
        );
        if (exist) {
          duplicates.push({ name: u.full_name, username: uname, existing: exist.full_name });
          continue;
        }

        const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
        const [r]  = await db.query(
          'INSERT INTO users (username,email,password,full_name,role,avatar_color) VALUES (?,?,?,?,?,?)',
          [uname, u.email||null, hash, u.full_name.trim(), role, color]
        );
        console.log('[import] Insert result:', r.insertId, r.affectedRows);

        if (r.insertId && gname) {
          try {
            if (!gid) { // chỉ Admin tới được đây: tạo nhóm mới
              const [nr] = await db.query('INSERT INTO `groups` (name, icon, is_active) VALUES (?,?,1)', [gname, '🏭']);
              gid = nr.insertId;
              groupIdCache.set(gname.toLowerCase(), gid);
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
      } catch (e) {
        // lỗi database → câu dễ hiểu (vd trùng email)
        const msg = e.code === 'ER_DUP_ENTRY'
          ? (/email/i.test(e.message) ? `Email ${u.email} đã có tài khoản khác dùng` : `MSNV ${u.username} đã có tài khoản khác dùng`)
          : e.message;
        errors.push({ name: u.full_name, error: msg });
      }
    }

    if (created) await logActivity({
      actorId: req.user.id, actionType: 'user_imported', entityType: 'user',
      description: `${actorOf(req)} đã nhập ${created} tài khoản từ file${duplicates.length ? ` (${duplicates.length} trùng, bỏ qua)` : ''}`,
      metadata: { created, duplicates: duplicates.length, errors: errors.length },
    });
    const byName = new Map(users.map(x => [x.full_name, String(x.username ?? '')]));
    errors.forEach(e => { if (e.username === undefined) e.username = byName.get(e.name) || ''; });
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
    if (access.isTuned(req.user, 'user.delete')) {
      const r = await access.can(req.user, 'user.delete', { targetUserId: +id, targetRole: target.role });
      if (!r.ok) return res.status(403).json({ success: false, message: r.reason });
    } else if (!['admin','manager'].includes(req.user.role) && ['admin','manager'].includes(target.role)) {
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
// Nhập tài khoản từ Excel ─────────────────────────────────────── GET /users/import/template
exports.importTemplate = async (req, res) => {
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Nhân viên');
    ws.columns = [
      { header: 'Họ tên', key: 'name', width: 26 },
      { header: 'Email', key: 'email', width: 26 },
      { header: !['admin','manager'].includes(req.user.role) ? 'Vai trò (user/assistant)' : `Vai trò (${req.user.role === 'admin' ? ROLES.join('/') : ROLES.filter(r => r !== 'admin').join('/')})`, key: 'role', width: 24 },
      { header: 'Nhóm', key: 'group', width: 18 },
      { header: 'MSNV', key: 'msnv', width: 14, style: { numFmt: '@' } },
    ];
    styleHeader(ws);
    [['Nguyễn Văn A', 'nva@smc.com', 'user', 'MES', '019001'],
     ['Trần Thị B', '', 'user', 'MES', '019002'],
     ['Lê Văn C', 'lvc@smc.com', !['admin','manager'].includes(req.user.role) ? 'user' : 'leader', 'Bảo trì', '009003']]
      .forEach(([name, email, role, group, msnv]) => ws.addRow({ name, email, role, group, msnv }));
    // Định dạng TEXT cho cả cột MSNV (kể cả các dòng người dùng gõ thêm sau này)
    for (let r = 2; r <= 1000; r++) ws.getCell(`E${r}`).numFmt = '@';
    ws.getCell('E1').note = 'Cột này là dạng CHỮ (Text) — gõ 019123 sẽ giữ nguyên số 0 ở đầu';
    await sendXlsx(res, wb, 'mau_import_user.xlsx');
  } catch (e) { xlsxError(res, e); }
};

// POST /users/import/parse (multipart, field "file")
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

// ───────────── Ảnh đại diện ─────────────
// Ảnh đã được trình duyệt cắt vuông + thu nhỏ (256px) trước khi gửi → chỉ kiểm tra loại & dung lượng
const AVATAR_DIR = require('path').join(__dirname, '../uploads/avatars');
const AVATAR_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
// nhận diện ảnh thật bằng vài byte đầu file (không tin đuôi / mime trình duyệt gửi)
const sniff = (b) => (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) ? 'image/jpeg'
  : (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) ? 'image/png'
  : (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') ? 'image/webp' : null;
const removeAvatarFile = (url) => {
  if (!url || !url.startsWith('/uploads/avatars/')) return;
  const f = require('path').join(AVATAR_DIR, require('path').basename(url));
  require('fs').promises.unlink(f).catch(() => {});
};

// POST /auth/avatar (multipart "file") — tự đổi ảnh của mình
exports.uploadAvatar = async (req, res) => {
  try {
    if (!require('../config/settings').on('profile.avatar_upload'))
      return res.status(403).json({ success: false, message: 'Admin đang tắt chức năng tự đổi ảnh đại diện' });
    if (!req.file) return res.status(400).json({ success: false, message: 'Chưa chọn ảnh' });
    const type = sniff(req.file.buffer);
    if (!type) return res.status(400).json({ success: false, message: 'Chỉ nhận ảnh JPG, PNG hoặc WEBP' });
    const fs = require('fs');
    await fs.promises.mkdir(AVATAR_DIR, { recursive: true });
    const name = `u${req.user.id}-${Date.now()}${AVATAR_TYPES[type]}`;
    await fs.promises.writeFile(require('path').join(AVATAR_DIR, name), req.file.buffer);
    const [[old]] = await db.query('SELECT avatar_url FROM users WHERE id=?', [req.user.id]);
    const url = `/uploads/avatars/${name}`;
    await db.query('UPDATE users SET avatar_url=? WHERE id=?', [url, req.user.id]);
    removeAvatarFile(old?.avatar_url);
    cache.clear('grp:'); cache.clear('dash:');
    await logActivity({ actorId: req.user.id, actionType: 'user_avatar_changed', entityType: 'user', entityId: req.user.id,
      description: `${actorOf(req)} đã đổi ảnh đại diện`, metadata: { avatar_url: url } });
    res.json({ success: true, data: { avatar_url: url } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// DELETE /auth/avatar — bỏ ảnh của mình | DELETE /users/:id/avatar — Admin/Manager bỏ ảnh của người khác (ảnh không phù hợp)
exports.removeAvatar = async (req, res) => {
  try {
    const id = req.params.id ? +req.params.id : req.user.id;
    const [[u]] = await db.query('SELECT full_name, avatar_url, role FROM users WHERE id=?', [id]);
    if (id !== req.user.id && !(await access.decide('user.avatar_remove', req.user, { targetUserId: id, targetRole: u?.role }, ['admin', 'manager'].includes(req.user.role))))
      return res.status(403).json({ success: false, message: 'Chỉ Admin / Manager mới xóa ảnh của người khác' });
    if (!u) return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    await db.query('UPDATE users SET avatar_url=NULL WHERE id=?', [id]);
    removeAvatarFile(u.avatar_url);
    cache.clear('grp:'); cache.clear('dash:');
    await logActivity({ actorId: req.user.id, actionType: 'user_avatar_changed', entityType: 'user', entityId: id,
      description: id === req.user.id ? `${actorOf(req)} đã bỏ ảnh đại diện` : `${actorOf(req)} đã XÓA ảnh đại diện của ${u.full_name}` });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
