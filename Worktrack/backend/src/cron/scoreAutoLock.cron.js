// src/cron/scoreAutoLock.cron.js
//
// Tự động CHỐT KỲ + XUẤT EXCEL + RESET điểm vào:
//   - 24h ngày 31/3  → tức 00:00 ngày 01/04
//   - 24h ngày 30/9  → tức 00:00 ngày 01/10
// (Lưu ý: tháng 9 chỉ có 30 ngày nên không có "31/9" — nếu ý bạn là ngày
// khác, chỉ cần đổi 2 pattern cron bên dưới.)
//
// Dùng chung logic với nút "🔒 Chốt & Reset" ở dashboard, thông qua hàm
// performLockAndReset đã export từ dashboard.controller.js — tránh lặp code
// và đảm bảo tự động / thủ công luôn hoạt động giống hệt nhau.
//
// Yêu cầu: npm install node-cron
// Kích hoạt: require file này 1 LẦN DUY NHẤT khi server khởi động
// (xem hướng dẫn thêm vào server.js bên dưới).

const cron = require('node-cron');
const { performLockAndReset } = require('../controllers/dashboard.controller');

const TIMEZONE = 'Asia/Ho_Chi_Minh';

async function runAutoLock(label) {
  console.log(`[AutoLock] ${label} — bắt đầu tự động chốt kỳ & reset điểm...`);
  try {
    // group_id = null → chốt cho toàn bộ công ty (tất cả nhóm)
    // lockedByUserId = null → đánh dấu đây là hành động tự động của hệ thống
    const result = await performLockAndReset(null, null);
    console.log(`[AutoLock] ${label} — thành công:`, result);
  } catch (e) {
    // Không throw ra ngoài — nếu không có kỳ đang mở (VD: đã lỡ bị chốt tay
    // trước đó trong ngày), chỉ log lại chứ không làm crash server.
    console.error(`[AutoLock] ${label} — lỗi:`, e.message);
  }
}

// 00:00 ngày 01/04 hàng năm (= 24h ngày 31/3)
cron.schedule('0 0 1 4 *', () => {
  runAutoLock('Chốt kỳ Quý 1 (31/3 → 1/4)');
}, { timezone: TIMEZONE });

// 00:00 ngày 01/10 hàng năm (= 24h ngày 30/9)
cron.schedule('0 0 1 10 *', () => {
  runAutoLock('Chốt kỳ Quý 3 (30/9 → 1/10)');
}, { timezone: TIMEZONE });

console.log('[AutoLock] Cron tự động chốt kỳ đã được kích hoạt (31/3 và 30/9 hàng năm).');