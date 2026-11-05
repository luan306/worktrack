// Cài đặt hệ thống do Admin bật / tắt (trang Quản trị → Thông báo). Bảng nhỏ → giữ trong RAM, đọc đồng bộ.
const db = require('./db');

// key → { group, label, desc, default }
const CATALOG = [
  { key: 'profile.avatar_upload', group: 'Hồ sơ', label: 'Cho phép tự đổi ảnh đại diện',
    desc: 'Mọi người tải ảnh của mình lên ở trang Cài đặt (hồ sơ). TẮT → ẩn nút đổi ảnh, ai đã có ảnh vẫn giữ (Admin vẫn xóa được ở Quản lý User).', default: true },
  { key: 'notif.leader_unscored', label: 'Nhắc Leader chấm điểm hằng ngày (8:00 sáng T2–T6)',
    desc: 'Leader nhận 1 thông báo gộp: còn bao nhiêu ngày công việc của người cùng nhóm chưa chấm.', default: true },
  { key: 'notif.manager_group', label: 'Manager có nhóm riêng: nhận nhắc chờ chấm như Leader',
    desc: 'Manager có nhân viên trong nhóm mình → có chấm đỏ đếm "Chờ chấm" trên menu CV Hằng ngày + nhận nhắc 8:00 (chỉ tính người trong nhóm của Manager đó).', default: false },
  { key: 'notif.entry_instant', label: 'Báo ngay khi nhân viên ghi công việc hằng ngày',
    desc: 'Người chấm của nhóm (Leader; cả Manager nếu bật mục trên) nhận thông báo ngay — mỗi nhân viên tối đa 1 thông báo / ngày để chuông không bị ngập.', default: false },
  { key: 'notif.staff_missing', label: 'Nhắc nhân viên chưa ghi công việc (8:00 sáng T2–T6)',
    desc: 'Ai chưa ghi việc ngày làm việc trước đó (không nghỉ) sẽ được nhắc ghi bù.', default: true },
  { key: 'notif.manager_reviewing', label: 'Nhắc Manager duyệt CV yêu cầu (8:00 sáng T2–T6)',
    desc: 'Manager nhận nhắc khi còn CV đang chờ Manager duyệt lần cuối.', default: true },
];
const KEYS = new Set(CATALOG.map(c => c.key));
const DEFAULTS = Object.fromEntries(CATALOG.map(c => [c.key, c.default]));

let values = new Map();

async function reload() {
  const [rows] = await db.query('SELECT k, v FROM app_settings');
  values = new Map(rows.map(r => [r.k, r.v]));
}
async function init() {
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS app_settings (
        k VARCHAR(64) NOT NULL PRIMARY KEY, v VARCHAR(255) NOT NULL,
        updated_by INT NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await reload();
  } catch (e) { console.error('[settings] lỗi khởi tạo (dùng mặc định):', e.message); }
}
setInterval(() => reload().catch(() => {}), 60 * 1000).unref();

// bật / tắt (boolean)
function on(key) {
  const v = values.get(key);
  return v === undefined ? !!DEFAULTS[key] : v === '1';
}
async function set(key, value, actorId) {
  await db.query(`INSERT INTO app_settings (k, v, updated_by) VALUES (?,?,?)
                    ON DUPLICATE KEY UPDATE v=VALUES(v), updated_by=VALUES(updated_by)`, [key, value ? '1' : '0', actorId]);
  await reload();
}
const list = () => CATALOG.map(c => ({ group: 'Thông báo', ...c, value: on(c.key), is_default: !values.has(c.key) }));

module.exports = { CATALOG, KEYS, init, reload, on, set, list };
