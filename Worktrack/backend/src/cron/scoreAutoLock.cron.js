// src/cron/scoreAutoLock.cron.js Tự động CHỐT KỲ + XUẤT EXCEL + RESET điểm vào

const cron = require('node-cron');
const { performLockAndReset } = require('../controllers/dashboard.controller');

const TIMEZONE = 'Asia/Ho_Chi_Minh';

async function runAutoLock(label) {
  console.log(`[AutoLock] ${label} — bắt đầu tự động chốt kỳ & reset điểm...`);
  try {
    // group_id = null → chốt cho toàn bộ công ty
    const result = await performLockAndReset(null, null);
    console.log(`[AutoLock] ${label} — thành công:`, result);
  } catch (e) {
    // Không throw ra ngoài — nếu không có kỳ đang mở
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