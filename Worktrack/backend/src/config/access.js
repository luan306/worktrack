// Phân quyền HÀNH ĐỘNG + PHẠM VI — Admin chỉnh trên giao diện (Quản trị → 🔐 Phân quyền), không phải sửa code.
//
// AN TOÀN cho hệ thống đang chạy:
//  • Mỗi chỗ kiểm tra quyền gọi decide(key, user, ctx, legacyOk):
//      – Admin CHƯA chỉnh hành động này cho người / vai trò đó → trả đúng kết quả code cũ (legacyOk) → hành vi y như trước.
//      – Admin ĐÃ chỉnh → quyết định theo phạm vi Admin chọn.
//  • Quy tắc giữ cứng (Admin luôn toàn quyền, không ai đụng tài khoản Admin, không tự chấm mình…) không chỉnh được.
//  • Ưu tiên: chỉnh riêng cho NGƯỜI > chỉnh cho VAI TRÒ > mặc định hiện tại.
const db = require('./db');
const { hasPerm } = require('./permissions');

// ── Phạm vi ────────────────────────────────────────────────────────────
const SCOPES = {
  all: 'Tất cả', group: 'Cùng nhóm', led_group: 'Nhóm mình phụ trách',
  created: 'Việc mình tạo', assigned: 'Việc mình làm', self: 'Chính mình',
};
const RANK = { user: 0, assistant: 1, leader: 2, manager: 3, admin: 4 };
const ROLE_NAMES = { admin: 'Admin', manager: 'Manager', leader: 'Leader', assistant: 'Trợ lý Leader', user: 'Nhân viên' };
const roleName = (r) => ROLE_NAMES[r] || r;

// Lựa chọn trong ô chọn theo loại đối tượng — [giá trị, nhãn]; '' = không được
const OPTS = {
  yesno: [['', 'Không được'], ['all', 'Được']],
  view:  [['self', 'Chỉ của mình'], ['group', 'Người cùng nhóm'], ['all', 'Cả công ty']],
  people:[['', 'Không được'], ['group', 'Người cùng nhóm'], ['all', 'Cả công ty']],
  task:  [['', 'Không được'], ['created', 'CV mình tạo'], ['assigned', 'CV mình làm'], ['created+assigned', 'CV mình tạo hoặc làm'], ['group', 'CV của nhóm mình'], ['all', 'Tất cả CV']],
  taskAll: [['', 'Không được'], ['group', 'CV của nhóm mình'], ['all', 'Tất cả CV']],
  groups:[['', 'Không được'], ['led_group', 'Nhóm mình phụ trách'], ['group', 'Nhóm mình là thành viên'], ['all', 'Mọi nhóm']],
};

// ── Danh mục ───────────────────────────────────────────────────────────
// def(u) = mặc định HIỆN TẠI (để hiển thị) → null | { s:[phạm vi], limit?, note? }
// opts: loại ô chọn · ui: mã quyền cũ mà giao diện dùng để hiện nút / menu · hint: giải thích ngắn cho người dùng
const P = hasPerm;
const priv = (u) => u.role === 'admin' || u.role === 'manager';
const all = { s: ['all'] };
const A = (key, module, label, opts, def, extra = {}) => ({ key, module, label, opts, def, ...extra });
const ACTIONS = [
  // 📨 CV yêu cầu
  A('req.create', 'req', 'Tạo CV yêu cầu', 'yesno', (u) => P(u, 'req.create') ? all : null, { ui: 'req.create', hint: 'Trợ lý Leader: chỉ tạo cho nhóm mình, không đặt điểm' }),
  A('req.edit_info', 'req', 'Sửa tiêu đề, mô tả, ưu tiên, deadline', 'task', (u) => P(u, 'req.manager') ? all : { s: ['created'] }),
  A('req.change_status', 'req', 'Đổi trạng thái CV tùy ý', 'task', (u) => P(u, 'req.leader') || P(u, 'req.manager') ? all : u.role === 'assistant' ? null : { s: ['created'] },
    { ui: 'req.leader', hint: 'Người làm CV luôn được Bắt đầu / Nộp' }),
  A('req.assign', 'req', 'Thêm / bớt người làm CV', 'task', (u) => P(u, 'req.manager') ? all : { s: ['created'] }, { hint: 'Trợ lý Leader chỉ giao được người trong nhóm' }),
  A('req.assign_role', 'req', 'Đổi người chính / hỗ trợ', 'task', (u) => P(u, 'req.manager') ? all : { s: ['created'] }, { hint: 'Kèm công tắc ở tab Cài đặt' }),
  A('req.score_prelim', 'req', 'Chấm điểm CV (sơ bộ)', 'task', (u) => P(u, 'req.leader') || P(u, 'req.manager') ? all : u.role === 'assistant' ? null : { s: ['created'] }, { ui: 'req.leader' }),
  A('req.approve', 'req', 'Duyệt hoàn thành + chấm điểm cuối', 'taskAll', (u) => P(u, 'req.manager') ? all : null, { ui: 'req.manager' }),
  A('req.score_direct', 'req', 'Chấm điểm trực tiếp (bỏ qua luồng)', 'yesno', (u) => P(u, 'req.manager') ? all : null, { ui: 'req.manager' }),
  A('req.edit_done', 'req', 'Sửa CV đã hoàn thành', 'taskAll', (u) => P(u, 'req.manager') ? all : null, { ui: 'req.manager' }),
  A('req.delete', 'req', 'Xóa CV', 'task', (u) => P(u, 'req.delete') ? all : u.role === 'assistant' ? null : { s: ['created'] }, { ui: 'req.delete', hint: 'CV đã hoàn thành chỉ xóa được khi có "Tất cả CV"' }),
  A('req.comment', 'req', 'Bình luận trong CV', 'task', () => all),
  A('req.attach_file', 'req', 'Đính kèm file', 'task', () => all),
  A('req.attach_link', 'req', 'Thêm link', 'task', (u) => P(u, 'req.leader') || P(u, 'req.manager') ? all : { s: ['created', 'assigned'] }),
  A('req.attach_delete', 'req', 'Xóa file / link của người khác', 'task', (u) => P(u, 'req.delete') ? all : { s: ['created'] }, { ui: 'req.delete', hint: 'Ai cũng xóa được file / link mình đăng' }),

  // 📅 CV hằng ngày
  A('wl.view', 'wl', 'Xem công việc hằng ngày (lịch, bảng tổng hợp, xuất Excel)', 'view', (u) => !P(u, 'wl.score') ? { s: ['self'] } : priv(u) ? all : { s: ['group'] }),
  A('wl.score', 'wl', 'Chấm điểm ngày', 'people', (u) => !P(u, 'wl.score') ? null : priv(u) ? all : { s: ['group'] }, { ui: 'wl.score', guard: 'Không ai tự chấm cho mình' }),
  A('wl.score_edit', 'wl', 'Sửa điểm đã chấm (kèm lý do)', 'people', (u) => !P(u, 'wl.score') ? null : priv(u) ? all : { s: ['group'] }, { ui: 'wl.score', guard: 'Không ai tự chấm cho mình' }),
  A('wl.dayoff_others', 'wl', 'Đánh dấu nghỉ cho người khác', 'people', (u) => !P(u, 'wl.score') ? null : priv(u) ? all : { s: ['group'] }),
  A('wl.off_reason', 'wl', 'Xem lý do nghỉ của người khác', 'yesno', (u) => P(u, 'wl.score') ? all : null),
  A('wl.holidays', 'wl', 'Quản lý ngày lễ công ty', 'yesno', (u) => P(u, 'wl.holidays') ? all : null, { ui: 'wl.holidays' }),
  A('daily.template', 'wl', 'Quản lý mẫu việc hằng ngày (bản cũ)', 'yesno', (u) => P(u, 'daily.manage') ? all : null, { ui: 'daily.manage', hint: 'Leader chỉ trong nhóm mình' }),

  // 👤 Người dùng & nhóm
  A('user.view_full', 'user', 'Xem đầy đủ danh sách người dùng (email, MSNV…)', 'yesno', (u) => ['admin', 'manager', 'leader'].includes(u.role) ? all : null, { hint: 'Không có quyền → chỉ thấy tên để chọn người' }),
  A('user.create', 'user', 'Tạo tài khoản', 'yesno', (u) => P(u, 'user.manage') ? all : null, { ui: 'user.manage', hint: 'Chỉ tạo được vai trò thấp hơn mình (Manager: mọi vai trò trừ Admin)' }),
  A('user.import', 'user', 'Nhập tài khoản từ Excel', 'yesno', (u) => P(u, 'user.import') ? all : null, { ui: 'user.import', hint: 'Như "Tạo tài khoản"' }),
  A('user.edit', 'user', 'Sửa thông tin tài khoản người khác', 'people', (u) => !P(u, 'user.manage') ? null : priv(u) ? all : { s: ['all'], limit: 'below' }, { ui: 'user.manage', limited: true }),
  A('user.change_role', 'user', 'Đổi vai trò', 'people', (u) => !P(u, 'user.manage') ? null : priv(u) ? all : { s: ['group'], limit: 'below' }, { ui: 'user.manage', limited: true, hint: '"Người cùng nhóm": người nhóm khác phải được Leader nhóm đó duyệt' }),
  A('user.lock', 'user', 'Khóa / mở khóa tài khoản', 'people', (u) => !P(u, 'user.manage') ? null : priv(u) ? all : { s: ['group'], limit: 'below' }, { ui: 'user.manage', limited: true, hint: '"Người cùng nhóm": người nhóm khác phải được duyệt' }),
  A('user.move_group', 'user', 'Chuyển nhóm', 'people', (u) => !P(u, 'user.manage') ? null : priv(u) ? all : { s: ['group'] }, { ui: 'user.manage', limited: true, hint: '"Người cùng nhóm": người nhóm khác phải được duyệt' }),
  A('user.reset_password', 'user', 'Đặt lại mật khẩu', 'people', (u) => !P(u, 'user.manage') ? null : priv(u) ? all : { s: ['all'], limit: 'upto' }, { ui: 'user.manage', limited: true }),
  A('user.delete', 'user', 'Xóa tài khoản', 'people', (u) => !P(u, 'user.manage') ? null : priv(u) ? all : { s: ['all'], limit: 'upto' }, { ui: 'user.manage', limited: true }),
  A('user.avatar_remove', 'user', 'Xóa ảnh đại diện của người khác', 'people', (u) => priv(u) ? all : null),
  A('perm.delegate', 'user', 'Cấp quyền cấp Leader cho nhân viên nhóm mình', 'yesno', (u) => P(u, 'perm.delegate') ? all : null, { ui: 'perm.delegate' }),
  A('group.create', 'user', 'Tạo nhóm', 'yesno', (u) => P(u, 'group.manage') ? all : null, { ui: 'group.manage' }),
  A('group.edit', 'user', 'Sửa tên / người phụ trách nhóm', 'yesno', (u) => priv(u) ? all : null),
  A('group.members', 'user', 'Thêm / bớt thành viên nhóm', 'groups', (u) => !P(u, 'group.manage') ? null : priv(u) ? all : { s: ['led_group'] }, { ui: 'group.manage' }),

  // 📊 Bảng điều khiển & hệ thống
  A('dash.lock', 'sys', 'Chốt kỳ & reset điểm', 'yesno', (u) => P(u, 'dash.lock') ? all : null, { ui: 'dash.lock' }),
  A('dash.export', 'sys', 'Tải Excel các kỳ đã chốt', 'yesno', (u) => P(u, 'dash.export') ? all : null, { ui: 'dash.export' }),
  A('log.view', 'sys', 'Xem nhật ký hoạt động', 'yesno', (u) => P(u, 'log.view') ? all : null, { ui: 'log.view' }),
];
const BY_KEY = new Map(ACTIONS.map(a => [a.key, a]));
const MODULES = [['req', '📨 CV yêu cầu'], ['wl', '📅 CV hằng ngày'], ['user', '👤 Người dùng & nhóm'], ['sys', '📊 Bảng điều khiển & hệ thống']];
const GUARDS = [
  'Admin luôn có toàn quyền — không chỉnh được',
  'Chỉ Admin thao tác được trên tài khoản Admin',
  'Không ai tự chấm điểm cho chính mình',
  'Quản lý tài khoản: không thao tác được người có vai trò cao hơn mình',
  'Trang Quản trị chỉ dành cho Admin',
];

// mã ↔ phạm vi: 'created+assigned' ↔ ['created','assigned'], '' ↔ null
const enc = (sc) => (sc && sc.s.length ? sc.s.slice().sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).join('+') : '');
const ORDER = ['self', 'created', 'assigned', 'led_group', 'group', 'all'];
const dec = (v) => (v ? { s: String(v).split('+') } : null);

// ── Cấu hình Admin đã chỉnh (bảng nhỏ → RAM) ───────────────────────────
let rules = new Map(); // `${type}|${subject}|${action}` → { v, by, at }
let rulesReady = false;
async function loadRules() {
  const [rows] = await db.query('SELECT subject_type, subject, action, scope, updated_by, updated_at FROM access_rules');
  rules = new Map(rows.map(r => [`${r.subject_type}|${r.subject}|${r.action}`, { v: r.scope, by: r.updated_by, at: r.updated_at }]));
  rulesReady = true;
}
const ruleOf = (type, subject, key) => rules.get(`${type}|${subject}|${key}`);
// Đã chỉnh cho người / vai trò của người này chưa → { v, src } | undefined
function ruleFor(user, key) {
  if (!rulesReady || !user || user.role === 'admin') return undefined;
  const u = ruleOf('user', String(user.id), key);
  if (u) return { v: u.v, src: 'user' };
  const r = ruleOf('role', user.role, key);
  if (r) return { v: r.v, src: 'role' };
  return undefined;
}

// Phạm vi đang áp dụng: Admin → tất cả; đã chỉnh → theo Admin; chưa → mặc định
function scopeOf(user, key) {
  const a = BY_KEY.get(key);
  if (!a || !user) return null;
  if (user.role === 'admin') return { s: ['all'], src: 'Admin luôn có toàn quyền' };
  const rule = ruleFor(user, key);
  const d = a.def(user);
  if (rule) {
    const sc = dec(rule.v);
    if (!sc) return null;
    // giới hạn vai trò (quản lý tài khoản): theo mặc định của vai trò, không có thì "không cao hơn mình"
    return { ...sc, limit: a.limited ? (d?.limit || (priv(user) ? undefined : 'upto')) : undefined,
      src: rule.src === 'user' ? 'Admin chỉnh riêng cho người này' : `Admin chỉnh cho vai trò ${roleName(user.role)}` };
  }
  return d ? { ...d, src: 'Mặc định' } : null;
}

// ── Nhóm trong RAM ─────────────────────────────────────────────────────
let groupsOf = new Map(), leaderOf = new Map(), activeUsers = [], loadedAt = 0, loading = null;
async function loadGroups() {
  const [[mem], [grp], [usr]] = await Promise.all([
    db.query('SELECT group_id, user_id FROM group_members'),
    db.query('SELECT id, leader_id FROM `groups`'),
    db.query('SELECT id FROM users WHERE is_active=1'),
  ]);
  const g = new Map();
  mem.forEach(r => { if (!g.has(r.user_id)) g.set(r.user_id, new Set()); g.get(r.user_id).add(r.group_id); });
  groupsOf = g; leaderOf = new Map(grp.map(r => [r.id, r.leader_id])); activeUsers = usr.map(r => r.id); loadedAt = Date.now();
}
async function fresh() {
  if (Date.now() - loadedAt < 60000) return;
  if (!loading) loading = loadGroups().finally(() => { loading = null; });
  await loading;
}
const invalidate = () => { loadedAt = 0; };
const sameGroup = (a, b) => { const x = groupsOf.get(+a), y = groupsOf.get(+b); if (!x || !y) return false; for (const id of x) if (y.has(id)) return true; return false; };

// ── Quyết định ─────────────────────────────────────────────────────────
// ctx: { targetUserId, targetRole, task: { created_by, group_id, assignee_ids }, groupId }
async function can(user, key, ctx = {}) {
  const a = BY_KEY.get(key);
  if (!a) return { ok: false, reason: `Không có hành động "${key}"` };
  const sc = scopeOf(user, key);
  if (!sc) return { ok: false, reason: `${roleName(user.role)} không có quyền "${a.label}"` };
  const t = ctx.targetUserId;
  if (a.guard && t !== undefined && +t === +user.id) return { ok: false, reason: a.guard, scope: sc };
  if (ctx.targetRole && user.role !== 'admin') {
    if (ctx.targetRole === 'admin') return { ok: false, reason: 'Chỉ Admin thao tác được trên tài khoản Admin', scope: sc };
    if (sc.limit === 'below' && !(RANK[ctx.targetRole] < RANK[user.role])) return { ok: false, reason: `Chỉ áp dụng với vai trò thấp hơn ${roleName(user.role)}`, scope: sc };
    if (sc.limit === 'upto' && RANK[ctx.targetRole] > RANK[user.role]) return { ok: false, reason: `Không áp dụng với vai trò cao hơn ${roleName(user.role)}`, scope: sc };
  }
  await fresh();
  const mine = groupsOf.get(+user.id) || new Set();
  for (const s of sc.s) {
    const hit = s === 'all'
      || (s === 'self' && t !== undefined && +t === +user.id)
      || (s === 'group' && t !== undefined && (+t === +user.id || sameGroup(user.id, t)))
      || (s === 'group' && ctx.task && ctx.task.group_id && mine.has(+ctx.task.group_id))
      || (s === 'group' && ctx.groupId !== undefined && mine.has(+ctx.groupId))
      || (s === 'led_group' && ctx.groupId !== undefined && leaderOf.get(+ctx.groupId) === +user.id)
      || (s === 'created' && ctx.task && +ctx.task.created_by === +user.id)
      || (s === 'assigned' && ctx.task && (ctx.task.assignee_ids || []).map(Number).includes(+user.id));
    if (hit) return { ok: true, reason: `Phạm vi: ${SCOPES[s]}`, scope: sc };
  }
  return { ok: false, reason: `Ngoài phạm vi: chỉ được ${sc.s.map(s => SCOPES[s]).join(' / ')}`, scope: sc };
}

/**
 * Dùng ở MỌI chỗ kiểm tra quyền. Chưa chỉnh → trả legacyOk (y như cũ). Đã chỉnh → theo phạm vi Admin chọn.
 * ctx có thể là hàm (async) — chỉ được gọi khi thật sự cần (đã chỉnh) để không tốn truy vấn.
 */
async function decide(key, user, ctx, legacyOk) {
  if (!ruleFor(user, key)) return !!legacyOk;
  const c = typeof ctx === 'function' ? await ctx() : (ctx || {});
  return (await can(user, key, c)).ok;
}
// Đã chỉnh hành động này cho người này chưa (để controller chọn nhánh)
const isTuned = (user, key) => !!ruleFor(user, key);
// Có phạm vi nào không (cổng ở route: phạm vi chi tiết kiểm tra trong controller)
const hasAny = (user, key) => !!scopeOf(user, key);

// Danh sách người trong phạm vi "xem"
async function usersInScope(user, key) {
  const sc = scopeOf(user, key);
  if (!sc) return [];
  await fresh();
  if (sc.s.includes('all')) return activeUsers.slice();
  if (sc.s.includes('group')) return activeUsers.filter(id => id === +user.id || sameGroup(user.id, id));
  if (sc.s.includes('self')) return activeUsers.filter(id => id === +user.id);
  return [];
}

// Mã quyền cũ cho giao diện (hiện menu / nút): chưa chỉnh → như cũ; đã chỉnh → có ít nhất 1 hành động liên quan được phép
const UI_KEYS = [...new Set(ACTIONS.filter(a => a.ui).map(a => a.ui))];
function uiPerms(user, legacyList) {
  if (!user || user.role === 'admin') return legacyList;
  const out = new Set(legacyList);
  for (const k of UI_KEYS) {
    const acts = ACTIONS.filter(a => a.ui === k);
    if (!acts.some(a => ruleFor(user, a.key))) continue;
    const any = acts.some(a => { const sc = scopeOf(user, a.key); return sc && !(sc.s.length === 1 && sc.s[0] === 'self'); });
    if (any) out.add(k); else out.delete(k);
  }
  return [...out];
}

// ── So sánh song song (CV hằng ngày) — chỉ khi CHƯA chỉnh: kiểm tra mặc định hiển thị đúng với code cũ ──
const stats = { since: new Date(), compared: 0, mismatched: 0 };
let tableReady = false;
const shadowOn = () => require('./settings').on('access.shadow');
const record = (action, user, target, legacy, engine) => {
  stats.mismatched++;
  if (!tableReady) return;
  const L = String(legacy).slice(0, 255), E = String(engine).slice(0, 255);
  const k = `${action}|${user.id}|${target}|${L}|${E}`.slice(0, 190);
  db.query(`INSERT INTO access_shadow_log (k, action, actor_id, actor_role, target, legacy, engine) VALUES (?,?,?,?,?,?,?)
              ON DUPLICATE KEY UPDATE n=n+1, last_at=NOW()`, [k, action, user.id, user.role, String(target).slice(0, 100), L, E]).catch(() => {});
};
function shadow(key, user, ctx, legacyOk) {
  if (!shadowOn() || !user || ruleFor(user, key)) return;
  setImmediate(async () => {
    try {
      let r = await can(user, key, ctx);
      stats.compared++;
      if (r.ok !== !!legacyOk) { await loadGroups(); r = await can(user, key, ctx); }
      if (r.ok !== !!legacyOk) record(key, user, ctx.targetUserId ?? ctx.groupId ?? '-', legacyOk ? 'được' : 'không', `${r.ok ? 'được' : 'không'} — ${r.reason}`);
    } catch { /* không ảnh hưởng gì */ }
  });
}
function shadowList(key, user, legacyIds) {
  if (!shadowOn() || !user || ruleFor(user, key)) return;
  const old = new Set(legacyIds.map(Number));
  setImmediate(async () => {
    try {
      let now = new Set(await usersInScope(user, key));
      stats.compared++;
      const differs = () => old.size !== now.size || [...old].some(id => !now.has(id));
      if (differs()) { await loadGroups(); now = new Set(await usersInScope(user, key)); }
      const onlyOld = [...old].filter(id => !now.has(id)), onlyNew = [...now].filter(id => !old.has(id));
      if (onlyOld.length || onlyNew.length)
        record(key + ':list', user, 'danh sách', `cũ có thêm: ${onlyOld.slice(0, 20).join(',') || '—'}`, `mới có thêm: ${onlyNew.slice(0, 20).join(',') || '—'}`);
    } catch { /* bỏ qua */ }
  });
}

async function init() {
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS access_shadow_log (
        k VARCHAR(190) NOT NULL PRIMARY KEY,
        action VARCHAR(50) NOT NULL, actor_id INT NULL, actor_role VARCHAR(20) NULL, target VARCHAR(100) NULL,
        legacy VARCHAR(255) NULL, engine VARCHAR(255) NULL, n INT NOT NULL DEFAULT 1,
        first_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, last_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    tableReady = true;
    await db.query(`CREATE TABLE IF NOT EXISTS access_rules (
        subject_type ENUM('role','user') NOT NULL, subject VARCHAR(30) NOT NULL, action VARCHAR(50) NOT NULL,
        scope VARCHAR(60) NOT NULL DEFAULT '', updated_by INT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (subject_type, subject, action)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await Promise.all([loadRules(), loadGroups()]);
    console.log(`[access] phân quyền theo hành động sẵn sàng (${rules.size} mục Admin đã chỉnh)`);
  } catch (e) { console.error('[access] lỗi khởi tạo (dùng quyền như cũ):', e.message); }
}
setInterval(() => { if (rulesReady) loadRules().catch(() => {}); }, 60 * 1000).unref();

// ── Admin chỉnh ────────────────────────────────────────────────────────
const ROLE_LIST = ['manager', 'leader', 'assistant', 'user'];
const optValues = (a) => OPTS[a.opts].map(o => o[0]);
// Giá trị đang áp dụng cho 1 vai trò (bỏ qua chỉnh riêng từng người)
const roleValue = (role, key) => {
  const r = ruleOf('role', role, key);
  return r ? r.v : enc(BY_KEY.get(key).def({ id: -1, role }));
};
/**
 * changes: [{ type:'role'|'user', subject, action, value }] — value = mã phạm vi | null (trả về mặc định)
 * Trùng mặc định → xóa mục chỉnh (để code cũ tiếp tục quyết định, an toàn nhất).
 */
async function setRules(changes, actorId) {
  const applied = [];
  for (const c of changes) {
    const a = BY_KEY.get(c.action);
    if (!a) throw new Error(`Không có hành động "${c.action}"`);
    if (!['role', 'user'].includes(c.type)) throw new Error('Đối tượng phải là vai trò hoặc người');
    let base;
    if (c.type === 'role') {
      if (!ROLE_LIST.includes(c.subject)) throw new Error('Vai trò không hợp lệ');
      base = enc(a.def({ id: -1, role: c.subject }));
    } else {
      const [[u]] = await db.query('SELECT id, role FROM users WHERE id=?', [c.subject]);
      if (!u) throw new Error('Không tìm thấy người dùng');
      if (u.role === 'admin') throw new Error('Admin luôn có toàn quyền — không chỉnh được');
      base = ruleOf('role', u.role, c.action)?.v ?? enc(a.def({ id: u.id, role: u.role }));
    }
    const v = c.value === null || c.value === undefined ? null : String(c.value);
    if (v !== null && !optValues(a).includes(v)) throw new Error(`Lựa chọn không hợp lệ cho "${a.label}"`);
    const old = ruleOf(c.type, String(c.subject), c.action);
    if (v === null || v === base) await db.query('DELETE FROM access_rules WHERE subject_type=? AND subject=? AND action=?', [c.type, String(c.subject), c.action]);
    else await db.query(`INSERT INTO access_rules (subject_type, subject, action, scope, updated_by) VALUES (?,?,?,?,?)
                           ON DUPLICATE KEY UPDATE scope=VALUES(scope), updated_by=VALUES(updated_by)`, [c.type, String(c.subject), c.action, v, actorId]);
    applied.push({ ...c, label: a.label, from: old ? old.v : base, to: v === null ? base : v, reset: v === null || v === base });
  }
  await loadRules();
  return applied;
}
const labelOf = (key, v) => (OPTS[BY_KEY.get(key).opts].find(o => o[0] === v) || [v, v || 'Không được'])[1];

// Dữ liệu cho trang Quản trị
function catalog() {
  return {
    opts: OPTS, guards: GUARDS, roles: ROLE_LIST.map(r => [r, roleName(r)]),
    modules: MODULES.map(([k, label]) => ({
      key: k, label,
      actions: ACTIONS.filter(a => a.module === k).map(a => ({
        key: a.key, label: a.label, opts: a.opts, hint: a.hint || null, guard: a.guard || null,
        roles: Object.fromEntries(ROLE_LIST.map(r => [r, { value: roleValue(r, a.key), base: enc(a.def({ id: -1, role: r })), tuned: !!ruleOf('role', r, a.key) }])),
      })),
    })),
    shadow: { enabled: shadowOn(), ...stats },
    tuned: rules.size,
  };
}
// Quyền của 1 người: giá trị áp dụng + nguồn
function forUser(u) {
  return Object.fromEntries(ACTIONS.map(a => {
    const own = ruleOf('user', String(u.id), a.key), role = ruleOf('role', u.role, a.key);
    const roleV = role ? role.v : enc(a.def(u));
    return [a.key, { value: own ? own.v : roleV, role_value: roleV, tuned: !!own, role_tuned: !!role }];
  }));
}
async function mismatches(limit = 50) {
  if (!tableReady) return [];
  const [rows] = await db.query(`SELECT l.*, u.full_name AS actor_name FROM access_shadow_log l LEFT JOIN users u ON u.id=l.actor_id ORDER BY l.last_at DESC LIMIT ?`, [limit]);
  return rows;
}

module.exports = { ACTIONS, init, invalidate, scopeOf, can, decide, isTuned, hasAny, usersInScope, uiPerms, shadow, shadowList,
  setRules, labelOf, catalog, forUser, mismatches, stats, roleName };
