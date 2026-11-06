// Trang Quản trị (chỉ Admin): Phân quyền + Sửa CV toàn quyền (mọi trường, kể cả các trường không hiện trên giao diện thường)
const db    = require('../config/db');
const cache = require('../config/cache');
const perm  = require('../config/permissions');
const { invalidateUser } = require('../middleware/auth');
const { logActivity, diffFields, fmtText, fmtDateTime, fmtScore, STATUS_LABEL, PRIORITY_LABEL } = require('../services/activityLogService');

const actorOf = (req) => req.user.full_name || req.user.username;
const bad = (res, message, status = 400) => res.status(status).json({ success: false, message });
const ROLE_LABEL = { manager: 'Manager', leader: 'Leader', assistant: 'Trợ lý Leader', user: 'Nhân viên' };
const permLabel = (k) => perm.CATALOG.find(p => p.key === k)?.label || k;

// ───────────────────────── Phân quyền ─────────────────────────
exports.getPermissions = async (req, res) => {
  try {
    const overrides = perm.userOverrides();
    const ids = [...new Set([...overrides.map(o => o.user_id), ...overrides.map(o => o.updated_by).filter(Boolean)])];
    const [users] = ids.length
      ? await db.query('SELECT id, full_name, username, role, avatar_color FROM users WHERE id IN (?)', [ids]) : [[]];
    const byId = new Map(users.map(u => [u.id, u]));
    res.json({ success: true, data: {
      catalog: perm.CATALOG, roles: perm.ROLES, matrix: perm.matrix(),
      overrides: overrides.filter(o => byId.has(o.user_id)).map(o => ({ ...o, user: byId.get(o.user_id), set_by: byId.get(o.updated_by)?.full_name || null })),
    } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// Quyền thực tế của 1 người (để xem trước khi cấp / thu hồi)
exports.getUserPermissions = async (req, res) => {
  try {
    const [[u]] = await db.query('SELECT id, full_name, username, role FROM users WHERE id=?', [req.params.id]);
    if (!u) return bad(res, 'Không tìm thấy người dùng', 404);
    const own = perm.userOverrides().filter(o => o.user_id === u.id);
    res.json({ success: true, data: { user: u, perms: perm.CATALOG.map(p => {
      const o = own.find(x => x.perm === p.key);
      return { key: p.key, effective: perm.hasPerm(u, p.key), by_role: perm.roleHas(u.role, p.key), override: o ? o.allowed : null };
    }) } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// Lý do sửa — BẮT BUỘC, ghi vào nhật ký để người xem log biết vì sao
const REASON_MIN = 5, REASON_MAX = 500;
const reasonOf = (req) => String(req.body?.reason ?? '').trim().replace(/\s+/g, ' ');
const reasonError = (r) => (r.length < REASON_MIN ? `Vui lòng nhập lý do (ít nhất ${REASON_MIN} ký tự) — lý do được ghi vào Nhật ký hoạt động`
  : r.length > REASON_MAX ? `Lý do tối đa ${REASON_MAX} ký tự` : '');
const withReason = (text, r) => `${text} — Lý do: ${r}`;

const parseAllowed = (v) => (v === null || v === 'default' ? null : v === true || v === 1 || v === 'true' || v === '1');

exports.setRolePermission = async (req, res) => {
  try {
    const { role, perm: key } = req.body;
    const reason = reasonOf(req);
    if (reasonError(reason)) return bad(res, reasonError(reason));
    if (!perm.ROLES.includes(role)) return bad(res, 'Vai trò không hợp lệ (không chỉnh được quyền của Admin)');
    if (!perm.KEYS.has(key)) return bad(res, 'Quyền không hợp lệ');
    const allowed = parseAllowed(req.body.allowed);
    const before = perm.roleHas(role, key);
    await perm.setRolePerm(role, key, allowed, req.user.id);
    const after = perm.roleHas(role, key);
    if (before !== after) await logActivity({
      actorId: req.user.id, actionType: 'permission_changed', entityType: 'permission',
      description: withReason(`${actorOf(req)} đã ${after ? 'CẤP' : 'THU HỒI'} quyền "${permLabel(key)}" cho vai trò ${ROLE_LABEL[role] || role}`, reason),
      metadata: { scope: 'role', role, perm: key, allowed: after, reason },
    });
    req.app.get('io')?.emit('permissions:changed'); // mọi người tải lại quyền của mình
    res.json({ success: true, data: { matrix: perm.matrix() } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.setUserPermission = async (req, res) => {
  try {
    const { user_id, perm: key } = req.body;
    const reason = reasonOf(req);
    if (reasonError(reason)) return bad(res, reasonError(reason));
    if (!perm.KEYS.has(key)) return bad(res, 'Quyền không hợp lệ');
    const [[u]] = await db.query('SELECT id, full_name, username, role FROM users WHERE id=?', [user_id]);
    if (!u) return bad(res, 'Không tìm thấy người dùng', 404);
    if (u.role === 'admin') return bad(res, 'Admin luôn có mọi quyền — không cần cấp / thu hồi');
    const allowed = parseAllowed(req.body.allowed);
    const before = perm.hasPerm(u, key);
    await perm.setUserPerm(u.id, key, allowed, req.user.id);
    const after = perm.hasPerm(u, key);
    invalidateUser(u.id);
    await logActivity({
      actorId: req.user.id, actionType: 'permission_changed', entityType: 'user', entityId: u.id,
      description: withReason(allowed === null
        ? `${actorOf(req)} đã bỏ ngoại lệ quyền "${permLabel(key)}" của ${u.full_name} (${u.username}) — theo vai trò: ${after ? 'có' : 'không'}`
        : `${actorOf(req)} đã ${allowed ? 'CẤP RIÊNG' : 'THU HỒI RIÊNG'} quyền "${permLabel(key)}" cho ${u.full_name} (${u.username})`, reason),
      metadata: { scope: 'user', user_id: u.id, perm: key, override: allowed, before, after, reason },
    });
    req.app.get('io')?.to(`user:${u.id}`).emit('permissions:changed');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ───────────────────────── Sửa CV toàn quyền ─────────────────────────
// GET /admin/requests?q= — tìm theo mã (#12 / 12) hoặc tên
exports.searchRequests = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    let sql = `SELECT r.id, r.title, r.status, r.deadline, r.completed_at, r.is_late, r.score, r.updated_at,
                      u.full_name AS creator_name, g.name AS group_name,
                      (SELECT GROUP_CONCAT(x.full_name ORDER BY a.role, x.full_name SEPARATOR ', ')
                         FROM request_task_assignees a JOIN users x ON x.id=a.user_id WHERE a.task_id=r.id) AS assignee_names
                 FROM request_tasks r
                 LEFT JOIN users u ON u.id=r.created_by
                 LEFT JOIN \`groups\` g ON g.id=r.group_id`;
    const p = [];
    const idq = q.replace(/^#/, '');
    if (/^\d+$/.test(idq)) { sql += ' WHERE r.id=? OR r.title LIKE ?'; p.push(+idq, `%${q}%`); }
    else if (q) { sql += ' WHERE r.title LIKE ?'; p.push(`%${q}%`); }
    if (req.query.status) { sql += (p.length ? ' AND' : ' WHERE') + ' r.status=?'; p.push(req.query.status); }
    sql += ' ORDER BY r.updated_at DESC, r.id DESC LIMIT 100';
    const [rows] = await db.query(sql, p);
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

const DT = "DATE_FORMAT(%s,'%Y-%m-%dT%H:%i')";
const dt = (c) => DT.replace('%s', c) + ` AS ${c}`;

async function loadFull(id) {
  const [[task]] = await db.query(
    `SELECT id, title, description, tools, priority, status, created_by, group_id, score, scored_by, is_late, hours_spent, started_by,
            ${dt('deadline')}, ${dt('started_at')}, ${dt('completed_at')}, ${dt('scored_at')}, ${dt('created_at')}, ${dt('updated_at')}
       FROM request_tasks WHERE id=?`, [id]);
  if (!task) return null;
  const [assignees] = await db.query(
    `SELECT a.user_id, a.role, a.score, a.added_late, ${DT.replace('%s', 'a.accepted_at')} AS accepted_at, u.full_name, u.username
       FROM request_task_assignees a JOIN users u ON u.id=a.user_id WHERE a.task_id=? ORDER BY a.role, a.id`, [id]);
  return { ...task, assignees };
}

exports.getRequest = async (req, res) => {
  try {
    const t = await loadFull(req.params.id);
    if (!t) return bad(res, 'Không tìm thấy CV', 404);
    res.json({ success: true, data: t });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

const STATUSES = ['pending', 'assigned', 'in_progress', 'scoring', 'reviewing', 'done', 'cancelled', 'archived'];
const PRIORITIES = ['low', 'medium', 'high'];
const DT_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/;
// '' / null → NULL; 'YYYY-MM-DDTHH:mm' giờ địa phương → giữ nguyên giờ
const toSqlDt = (v) => (v ? String(v).replace('T', ' ').slice(0, 16) + ':00' : null);
const numOrNull = (v) => (v === '' || v === null || v === undefined ? null : +v);

exports.updateRequest = async (req, res) => {
  const id = +req.params.id;
  const b = req.body || {};
  const reason = reasonOf(req);
  if (reasonError(reason)) return bad(res, reasonError(reason));
  const before = await loadFull(id).catch(() => null);
  if (!before) return bad(res, 'Không tìm thấy CV', 404);

  // ── Kiểm tra dữ liệu ──
  const set = {};
  const put = (k, v) => { if (b[k] !== undefined) set[k] = v; };
  if (b.title !== undefined && !String(b.title).trim()) return bad(res, 'Tên CV không được trống');
  if (b.title !== undefined && String(b.title).length > 200) return bad(res, 'Tên CV tối đa 200 ký tự');
  if (b.status !== undefined && !STATUSES.includes(b.status)) return bad(res, 'Trạng thái không hợp lệ');
  if (b.priority !== undefined && !PRIORITIES.includes(b.priority)) return bad(res, 'Độ ưu tiên không hợp lệ');
  for (const k of ['deadline', 'started_at', 'completed_at', 'scored_at'])
    if (b[k] && !DT_RE.test(String(b[k]))) return bad(res, `Thời gian "${k}" không hợp lệ`);
  for (const k of ['score'])
    if (b[k] !== undefined && b[k] !== '' && b[k] !== null && !(Number.isFinite(+b[k]) && +b[k] >= 0 && +b[k] <= 99999)) return bad(res, 'Điểm không hợp lệ');
  if (b.hours_spent !== undefined && b.hours_spent !== '' && b.hours_spent !== null && !(Number.isFinite(+b.hours_spent) && +b.hours_spent >= 0 && +b.hours_spent < 10000))
    return bad(res, 'Giờ thực hiện không hợp lệ');

  put('title', b.title !== undefined ? String(b.title).trim() : undefined);
  put('description', b.description || null);
  put('tools', b.tools || null);
  put('priority', b.priority);
  put('status', b.status);
  put('group_id', numOrNull(b.group_id));
  put('created_by', numOrNull(b.created_by));
  put('scored_by', numOrNull(b.scored_by));
  put('score', numOrNull(b.score));
  put('hours_spent', numOrNull(b.hours_spent));
  for (const k of ['deadline', 'started_at', 'completed_at', 'scored_at']) put(k, toSqlDt(b[k]));
  if (b.is_late !== undefined) set.is_late = b.is_late ? 1 : 0;
  // Tự tính lại "trễ" theo hạn chót & giờ nộp sau khi sửa
  if (b.recompute_late) {
    const dl = set.deadline !== undefined ? set.deadline : before.deadline && toSqlDt(before.deadline);
    const ca = set.completed_at !== undefined ? set.completed_at : before.completed_at && toSqlDt(before.completed_at);
    set.is_late = dl && ca && ca > dl ? 1 : 0;
  }

  let assignees = null;
  if (Array.isArray(b.assignees)) {
    const seen = new Set();
    assignees = [];
    for (const a of b.assignees) {
      const uid = +a.user_id;
      if (!uid || seen.has(uid)) return bad(res, 'Danh sách người thực hiện bị trùng hoặc thiếu người');
      seen.add(uid);
      if (!['main', 'support'].includes(a.role)) return bad(res, 'Vai trò người thực hiện phải là Chính hoặc Hỗ trợ');
      const sc = numOrNull(a.score);
      if (sc !== null && !(Number.isFinite(sc) && sc >= 0 && sc <= 99999)) return bad(res, 'Điểm người thực hiện không hợp lệ');
      assignees.push({ user_id: uid, role: a.role, score: sc, added_late: a.added_late ? 1 : 0 });
    }
    if (!require('../config/settings').on('request.multi_main') && assignees.filter(a => a.role === 'main').length > 1)
      return bad(res, 'Chỉ được 1 người Chính (Admin đang tắt "Cho phép nhiều người làm chính")');
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const k of ['group_id']) if (set[k]) {
      const [[g]] = await conn.query('SELECT id FROM `groups` WHERE id=?', [set[k]]);
      if (!g) { await conn.rollback(); return bad(res, 'Nhóm không tồn tại'); }
    }
    const userIds = [set.created_by, set.scored_by, ...(assignees || []).map(a => a.user_id)].filter(Boolean);
    if (userIds.length) {
      const [found] = await conn.query('SELECT id FROM users WHERE id IN (?)', [[...new Set(userIds)]]);
      if (found.length !== new Set(userIds).size) { await conn.rollback(); return bad(res, 'Có người dùng không tồn tại'); }
    }
    const keys = Object.keys(set);
    if (keys.length) await conn.query(`UPDATE request_tasks SET ${keys.map(k => `\`${k}\`=?`).join(', ')} WHERE id=?`, [...keys.map(k => set[k]), id]);
    if (assignees) {
      const keep = assignees.map(a => a.user_id);
      await conn.query(`DELETE FROM request_task_assignees WHERE task_id=?${keep.length ? ' AND user_id NOT IN (?)' : ''}`, keep.length ? [id, keep] : [id]);
      for (const a of assignees) await conn.query(
        `INSERT INTO request_task_assignees (task_id, user_id, role, score, added_late) VALUES (?,?,?,?,?)
           ON DUPLICATE KEY UPDATE role=VALUES(role), score=VALUES(score), added_late=VALUES(added_late)`,
        [id, a.user_id, a.role, a.score, a.added_late]);
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback().catch(() => {});
    conn.release();
    return res.status(500).json({ success: false, message: e.message });
  }
  conn.release();

  try {
    const after = await loadFull(id);
    // ── Nhật ký: ghi rõ từng trường đã đổi ──
    const names = new Map();
    const ids = [before.created_by, after.created_by, before.scored_by, after.scored_by].filter(Boolean);
    if (ids.length) (await db.query('SELECT id, full_name FROM users WHERE id IN (?)', [ids]))[0].forEach(u => names.set(u.id, u.full_name));
    const [gs] = await db.query('SELECT id, name FROM `groups` WHERE id IN (?)', [[before.group_id, after.group_id, 0].filter(v => v !== null)]);
    const gname = new Map(gs.map(g => [g.id, g.name]));
    const who = (v) => (v ? names.get(v) || `#${v}` : '(trống)');
    const { text } = diffFields(before, after, {
      title: ['tên'], description: ['mô tả'], tools: ['công cụ'],
      priority: ['ưu tiên', v => PRIORITY_LABEL[v] || v], status: ['trạng thái', v => STATUS_LABEL[v] || v],
      group_id: ['nhóm', v => (v ? gname.get(v) || `#${v}` : '(không nhóm)')],
      created_by: ['người tạo', who], scored_by: ['người chấm', who],
      deadline: ['hạn chót', fmtDateTime], started_at: ['bắt đầu', fmtDateTime], completed_at: ['hoàn thành lúc', fmtDateTime],
      scored_at: ['chấm lúc', fmtDateTime], score: ['điểm', fmtScore], is_late: ['trễ hạn', v => (+v ? 'có' : 'không')],
      hours_spent: ['giờ thực hiện', v => (v == null ? '(trống)' : `${+v}h`)],
    });
    const fmtA = (list) => list.map(a => `${a.full_name}${a.role === 'support' ? ' (hỗ trợ)' : ''}${a.score != null ? ` ${+a.score}đ` : ''}`).join(', ') || '(không ai)';
    const aText = assignees && fmtA(before.assignees) !== fmtA(after.assignees) ? `người thực hiện: ${fmtA(before.assignees)} → ${fmtA(after.assignees)}` : '';
    const all = [text, aText].filter(Boolean).join('; ');
    if (all) await logActivity({
      actorId: req.user.id, actionType: 'request_admin_edit', entityType: 'request', entityId: id,
      description: withReason(`${actorOf(req)} (Admin) đã sửa trực tiếp CV #${id} ${fmtText(after.title)} — ${all}`, reason),
      metadata: { before, after, reason },
    });
    cache.clear('req:'); cache.clear('dash:');
    req.app.get('io')?.emit('requests:updated', { id, action: 'admin_edit' });
    res.json({ success: true, data: after, changed: !!all });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};


// ───────────────────────── Ủy quyền (Leader / Manager) ─────────────────────────
// Người có quyền "perm.delegate" cấp / thu hồi RIÊNG các quyền cấp Leader cho nhân viên trong nhóm mình:
//  • chỉ quyền delegable (không có quyền cấp Manager / Admin) và chỉ quyền mà chính mình đang có
//  • Leader: chỉ Nhân viên / Trợ lý Leader cùng nhóm; Manager: Nhân viên / Trợ lý / Leader — không đổi được vai trò
//  • không ghi đè ngoại lệ do người cấp cao hơn đặt (vd Leader không sửa được ngoại lệ Admin đã đặt)
const RANK = { admin: 3, manager: 2, leader: 1 };
const rankOf = (role) => RANK[role] || 0;
const highScope = (req) => ['admin', 'manager'].includes(req.user.role);
const grantable = (req) => perm.CATALOG.filter(p => perm.DELEGABLE.has(p.key) && perm.hasPerm(req.user, p.key));

async function delegateTargets(req, onlyId) {
  const roles = highScope(req) ? ['user', 'assistant', 'leader'] : ['user', 'assistant'];
  let sql = `SELECT u.id, u.full_name, u.username, u.role, u.avatar_color,
                    GROUP_CONCAT(DISTINCT g.name ORDER BY g.name SEPARATOR ', ') AS group_names
               FROM users u
               LEFT JOIN group_members gm ON gm.user_id=u.id
               LEFT JOIN \`groups\` g ON g.id=gm.group_id AND g.is_active=1
              WHERE u.is_active=1 AND u.role IN (?) AND u.id<>?`;
  const p = [roles, req.user.id];
  if (!highScope(req)) {
    sql += ` AND u.id IN (SELECT b.user_id FROM group_members a JOIN group_members b ON b.group_id=a.group_id WHERE a.user_id=?)`;
    p.push(req.user.id);
  }
  if (onlyId) { sql += ' AND u.id=?'; p.push(onlyId); }
  sql += ' GROUP BY u.id ORDER BY u.full_name';
  return (await db.query(sql, p))[0];
}

// người đặt ngoại lệ → vai trò (để biết có bị khóa không)
async function settersOf(ids) {
  if (!ids.length) return new Map();
  const [rows] = await db.query('SELECT id, full_name, role FROM users WHERE id IN (?)', [ids]);
  return new Map(rows.map(r => [r.id, r]));
}

exports.getDelegation = async (req, res) => {
  try {
    const keys = grantable(req);
    const members = await delegateTargets(req);
    const setterIds = [...new Set(members.flatMap(m => keys.map(k => perm.overrideOf(m.id, k.key)?.updated_by)).filter(Boolean))];
    const setters = await settersOf(setterIds);
    res.json({ success: true, data: {
      catalog: keys.map(k => ({ key: k.key, group: k.group, label: k.label })),
      members: members.map(m => ({ ...m, perms: keys.map(k => {
        const o = perm.overrideOf(m.id, k.key);
        const by = o?.updated_by ? setters.get(o.updated_by) : null;
        return { key: k.key, effective: perm.hasPerm(m, k.key), by_role: perm.roleHas(m.role, k.key), override: o ? o.allowed : null,
          set_by: by?.full_name || null, locked: !!by && rankOf(by.role) > rankOf(req.user.role) };
      }) })),
    } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.setDelegation = async (req, res) => {
  try {
    const { user_id, perm: key } = req.body;
    const reason = reasonOf(req);
    if (reasonError(reason)) return bad(res, reasonError(reason));
    if (!perm.DELEGABLE.has(key)) return bad(res, 'Quyền này chỉ Admin mới cấp được (quyền cấp Manager / Admin)', 403);
    if (!perm.hasPerm(req.user, key)) return bad(res, 'Bạn chỉ cấp được quyền mà chính mình đang có', 403);
    const [u] = await delegateTargets(req, +user_id);
    if (!u) return bad(res, highScope(req) ? 'Không cấp quyền được cho người này' : 'Bạn chỉ phân quyền được cho Nhân viên / Trợ lý Leader trong nhóm mình', 403);
    const cur = perm.overrideOf(u.id, key);
    if (cur?.updated_by && cur.updated_by !== req.user.id) {
      const [[setter]] = await db.query('SELECT full_name, role FROM users WHERE id=?', [cur.updated_by]);
      if (setter && rankOf(setter.role) > rankOf(req.user.role))
        return bad(res, `Ngoại lệ này do ${setter.full_name} (${setter.role}) đặt — bạn không sửa được`, 403);
    }
    const allowed = parseAllowed(req.body.allowed);
    const before = perm.hasPerm(u, key);
    await perm.setUserPerm(u.id, key, allowed, req.user.id);
    const after = perm.hasPerm(u, key);
    invalidateUser(u.id);
    await logActivity({
      actorId: req.user.id, actionType: 'permission_changed', entityType: 'user', entityId: u.id,
      description: withReason(allowed === null
        ? `${actorOf(req)} đã bỏ ngoại lệ quyền "${permLabel(key)}" của ${u.full_name} (${u.username}) — theo vai trò: ${after ? 'có' : 'không'}`
        : `${actorOf(req)} đã ${allowed ? 'CẤP RIÊNG' : 'THU HỒI RIÊNG'} quyền "${permLabel(key)}" cho ${u.full_name} (${u.username})`, reason),
      metadata: { scope: 'delegate', user_id: u.id, perm: key, override: allowed, before, after, reason },
    });
    req.app.get('io')?.to(`user:${u.id}`).emit('permissions:changed');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// GET /permissions/roles — các vai trò người đang đăng nhập GÁN ĐƯỢC + mỗi vai trò gồm những quyền gì
// (Leader chỉ thấy vai trò thấp hơn mình: Nhân viên, Trợ lý Leader)
exports.roleSummary = async (req, res) => {
  try {
    const r = req.user.role;
    const roles = r === 'admin' ? ['user', 'assistant', 'leader', 'manager', 'admin'] : r === 'manager' ? ['user', 'assistant', 'leader', 'manager'] : ['user', 'assistant'];
    res.json({ success: true, data: {
      roles: roles.map(role => ({
        role, label: ROLE_LABEL[role] || (role === 'admin' ? 'Admin' : role),
        perms: perm.CATALOG.filter(p => perm.roleHas(role, p.key)).map(p => p.label),
        keys: perm.CATALOG.filter(p => perm.roleHas(role, p.key)).map(p => p.key),
      })),
      // các quyền cấp Leader mà người đang đăng nhập có → hiện thành công tắc trong khung Sửa nhân viên
      switchable: grantable(req).map(p => ({ key: p.key, label: p.label })),
      can_switch: perm.hasPerm(req.user, 'perm.delegate'),
    } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ───────────────────────── Cài đặt thông báo (Admin) ─────────────────────────
const settings = require('../config/settings');
exports.getSettings = async (req, res) => {
  try { res.json({ success: true, data: settings.list() }); }
  catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
exports.setSetting = async (req, res) => {
  try {
    const { key } = req.body;
    const reason = reasonOf(req);
    if (reasonError(reason)) return bad(res, reasonError(reason));
    if (!settings.KEYS.has(key)) return bad(res, 'Cài đặt không hợp lệ');
    const value = req.body.value === true || req.body.value === 1 || req.body.value === '1' || req.body.value === 'true';
    const before = settings.on(key);
    await settings.set(key, value, req.user.id);
    if (before !== value) await logActivity({
      actorId: req.user.id, actionType: 'setting_changed', entityType: 'setting',
      description: withReason(`${actorOf(req)} đã ${value ? 'BẬT' : 'TẮT'} "${settings.CATALOG.find(c => c.key === key).label}"`, reason),
      metadata: { key, before, after: value, reason },
    });
    req.app.get('io')?.emit('permissions:changed'); // giao diện tải lại /auth/me (chấm đỏ "Chờ chấm" của Manager)
    res.json({ success: true, data: settings.list() });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
