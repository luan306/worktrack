// src/cron/maintenance.cron.js
//
// Bảo trì định kỳ để DB không phình vô hạn theo thời gian:
//   - Xóa refresh token đã hết hạn (mỗi lần đăng nhập/gia hạn đều tạo 1 dòng
//     mới, trước đây không bao giờ bị xóa).
//   - Xóa thông báo ĐÃ ĐỌC cũ hơn NOTIFICATION_KEEP_DAYS ngày (thông báo chưa
//     đọc luôn được giữ lại).
// Chạy 03:00 mỗi ngày + 1 lần lúc server khởi động.

const cron = require('node-cron');
const db   = require('../config/db');

const NOTIFICATION_KEEP_DAYS = 90;
const BATCH = 5000; // xóa từng đợt nhỏ để không khóa bảng lâu khi dữ liệu lớn

async function deleteInBatches(sql, params) {
  let total = 0;
  for (;;) {
    const [r] = await db.query(`${sql} LIMIT ${BATCH}`, params);
    total += r.affectedRows;
    if (r.affectedRows < BATCH) return total;
  }
}

async function runMaintenance() {
  try {
    const tokens = await deleteInBatches('DELETE FROM refresh_tokens WHERE expires_at < NOW()', []);
    const notifs = await deleteInBatches(
      'DELETE FROM notifications WHERE is_read = 1 AND created_at < NOW() - INTERVAL ? DAY',
      [NOTIFICATION_KEEP_DAYS]
    );
    if (tokens || notifs) console.log(`[maintenance] Đã xóa ${tokens} refresh token hết hạn, ${notifs} thông báo cũ`);
  } catch (e) {
    console.error('[maintenance] lỗi:', e.message);
  }
}

cron.schedule('0 3 * * *', runMaintenance, { timezone: 'Asia/Ho_Chi_Minh' });
runMaintenance();

module.exports = { runMaintenance };
