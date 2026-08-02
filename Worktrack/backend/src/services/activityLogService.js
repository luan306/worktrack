const db = require('../config/db');

// Ghi 1 dòng log hoạt động — dùng ở khắp các controller khi có hành động quan
// trọng cần lưu vết (tạo/xóa CV, đổi người, chấm điểm...). KHÔNG throw ra
// ngoài nếu lỗi — việc ghi log không được phép làm hỏng luồng chính của
// request (giống cách notify() được xử lý ở các controller khác).
async function logActivity({ actorId, actionType, entityType, entityId = null, description, metadata = null }) {
  try {
    await db.query(
      'INSERT INTO activity_logs (actor_id,action_type,entity_type,entity_id,description,metadata) VALUES (?,?,?,?,?,?)',
      [actorId, actionType, entityType, entityId, description, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (e) {
    console.error('[activityLog] Lỗi ghi log:', e.message);
  }
}

module.exports = { logActivity };