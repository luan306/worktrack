// Phân quyền: quyền mặc định theo VAI TRÒ (Admin chỉnh được) + ngoại lệ CẤP / THU HỒI cho TỪNG NGƯỜI.
// Admin luôn có mọi quyền — không ai (kể cả Admin) tự khóa được Admin.
// Quyền chỉ quyết định "được làm chức năng đó hay không"; PHẠM VI dữ liệu giữ như cũ
// (vd: người được quyền chấm Daily chỉ chấm được người cùng nhóm, Leader chỉ sửa tài khoản nhân viên...).
const db = require('./db');

const ROLES = ['manager', 'leader', 'assistant', 'user']; // vai trò chỉnh được (admin luôn full)

// key → nhóm, nhãn, vai trò có quyền MẶC ĐỊNH (đúng như hệ thống trước khi có phân quyền)
const CATALOG = [
  { key: 'req.create',   group: 'CV Yêu cầu', label: 'Tạo CV yêu cầu',                                              roles: ['manager', 'leader', 'assistant'], delegable: true },
  { key: 'req.leader',   group: 'CV Yêu cầu', label: 'Quyền Leader trong CV: chấm sơ bộ, đổi trạng thái, xem & thao tác mọi CV', roles: ['manager', 'leader'], delegable: true },
  { key: 'req.manager',  group: 'CV Yêu cầu', label: 'Quyền Manager trong CV: duyệt hoàn thành, chấm điểm cuối, sửa CV của người khác / CV đã xong, đổi người làm', roles: ['manager'] },
  { key: 'req.delete',   group: 'CV Yêu cầu', label: 'Xóa CV, file, link của người khác',                           roles: ['manager'] },
  { key: 'wl.score',     group: 'CV Hằng ngày', label: 'Chấm điểm & xem công việc hằng ngày của người cùng nhóm',  roles: ['manager', 'leader'], delegable: true },
  { key: 'daily.manage', group: 'CV Hằng ngày', label: 'Quản lý mẫu công việc hằng ngày (nhóm việc / việc)',       roles: ['manager', 'leader'], delegable: true },
  { key: 'wl.holidays',  group: 'CV Hằng ngày', label: 'Quản lý ngày lễ công ty',                                  roles: [] },
  { key: 'user.manage',  group: 'Người dùng', label: 'Tạo / sửa / khóa / xóa tài khoản, đặt lại mật khẩu',          roles: ['manager', 'leader'], delegable: true },
  { key: 'user.import',  group: 'Người dùng', label: 'Nhập tài khoản từ Excel',                                    roles: ['manager', 'leader'], delegable: true },
  { key: 'group.manage', group: 'Người dùng', label: 'Tạo nhóm, thêm / bớt thành viên nhóm',                       roles: ['manager', 'leader'], delegable: true },
  { key: 'dash.lock',    group: 'Bảng điều khiển', label: 'Chốt kỳ & reset điểm',                                  roles: ['manager'] },
  { key: 'dash.export',  group: 'Bảng điều khiển', label: 'Xem & tải Excel các kỳ đã chốt',                        roles: ['manager'] },
  { key: 'log.view',     group: 'Hệ thống', label: 'Xem nhật ký hoạt động',                                        roles: ['manager'] },
  // Quyền ĐẶC BIỆT — mặc định TẮT, Admin bật khi cần: cấp/thu hồi từng quyền cấp Leader cho nhân viên trong nhóm
  { key: 'perm.delegate', group: 'Hệ thống', label: '⚡ Quyền đặc biệt: cấp / thu hồi TỪNG quyền cấp Leader cho nhân viên trong nhóm (mặc định tắt — không cấp được quyền Manager / Admin)', roles: [] },
];
const KEYS = new Set(CATALOG.map(p => p.key));
const DELEGABLE = new Set(CATALOG.filter(p => p.delegable).map(p => p.key));

// Bộ nhớ đệm: toàn bộ bảng rất nhỏ → giữ trong RAM, đọc đồng bộ (hasPerm không cần await)
let roleRows = new Map();  // `${role}|${perm}` → 0/1
let userRows = new Map();  // userId → Map(perm → 0/1)
let userBy = new Map();    // `${userId}|${perm}` → id người đặt ngoại lệ
let ready = false;

async function ensureTables() {
  await db.query(`CREATE TABLE IF NOT EXISTS role_permissions (
      role VARCHAR(20) NOT NULL, perm VARCHAR(50) NOT NULL, allowed TINYINT(1) NOT NULL,
      updated_by INT NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (role, perm)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await db.query(`CREATE TABLE IF NOT EXISTS user_permissions (
      user_id INT NOT NULL, perm VARCHAR(50) NOT NULL, allowed TINYINT(1) NOT NULL,
      updated_by INT NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, perm),
      CONSTRAINT fk_user_perm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

async function reload() {
  const [[r], [u]] = await Promise.all([
    db.query('SELECT role, perm, allowed FROM role_permissions'),
    db.query('SELECT user_id, perm, allowed, updated_by FROM user_permissions'),
  ]);
  const rr = new Map(); r.forEach(x => rr.set(`${x.role}|${x.perm}`, +x.allowed));
  const ur = new Map(), ub = new Map();
  u.forEach(x => { if (!ur.has(x.user_id)) ur.set(x.user_id, new Map()); ur.get(x.user_id).set(x.perm, +x.allowed); ub.set(`${x.user_id}|${x.perm}`, x.updated_by); });
  roleRows = rr; userRows = ur; userBy = ub; ready = true;
}

async function init() {
  try { await ensureTables(); await reload(); console.log('[perm] phân quyền sẵn sàng'); }
  catch (e) { console.error('[perm] lỗi khởi tạo phân quyền (dùng quyền mặc định):', e.message); }
}
// Dự phòng: nạp lại mỗi phút (nếu sau này chạy nhiều backend cùng lúc)
setInterval(() => { if (ready) reload().catch(() => {}); }, 60 * 1000).unref();

const roleDefault = (role, key) => !!CATALOG.find(p => p.key === key)?.roles.includes(role);
function roleHas(role, key) {
  if (role === 'admin') return true;
  const v = roleRows.get(`${role}|${key}`);
  return v === undefined ? roleDefault(role, key) : !!v;
}
// user: { id, role }
function hasPerm(user, key) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const o = userRows.get(+user.id)?.get(key);
  if (o !== undefined) return !!o;
  return roleHas(user.role, key);
}
const permsOf = (user) => CATALOG.filter(p => hasPerm(user, p.key)).map(p => p.key);

// Bảng ma trận cho trang Phân quyền
function matrix() {
  const roles = {};
  for (const role of ROLES) {
    roles[role] = {};
    for (const p of CATALOG) roles[role][p.key] = { allowed: roleHas(role, p.key), is_default: !roleRows.has(`${role}|${p.key}`), default: roleDefault(role, p.key) };
  }
  return roles;
}

async function setRolePerm(role, key, allowed, actorId) {
  if (allowed === null || allowed === roleDefault(role, key)) await db.query('DELETE FROM role_permissions WHERE role=? AND perm=?', [role, key]);
  else await db.query(
    `INSERT INTO role_permissions (role, perm, allowed, updated_by) VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE allowed=VALUES(allowed), updated_by=VALUES(updated_by)`, [role, key, allowed ? 1 : 0, actorId]);
  await reload();
}
async function setUserPerm(userId, key, allowed, actorId) {
  if (allowed === null) await db.query('DELETE FROM user_permissions WHERE user_id=? AND perm=?', [userId, key]);
  else await db.query(
    `INSERT INTO user_permissions (user_id, perm, allowed, updated_by) VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE allowed=VALUES(allowed), updated_by=VALUES(updated_by)`, [userId, key, allowed ? 1 : 0, actorId]);
  await reload();
}
const userOverrides = () => [...userRows].flatMap(([uid, m]) => [...m].map(([perm, allowed]) => ({ user_id: uid, perm, allowed: !!allowed, updated_by: userBy.get(`${uid}|${perm}`) ?? null })));
const overrideOf = (userId, key) => {
  const v = userRows.get(+userId)?.get(key);
  return v === undefined ? null : { allowed: !!v, updated_by: userBy.get(`${userId}|${key}`) ?? null };
};

module.exports = { CATALOG, KEYS, DELEGABLE, overrideOf, ROLES, init, reload, hasPerm, roleHas, roleDefault, permsOf, matrix, setRolePerm, setUserPerm, userOverrides };
