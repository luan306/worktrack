// services/notificationService.js
const db = require('../config/db');

// Map entity_type -> đường dẫn frontend để click thông báo là nhảy đúng chỗ
const ENTITY_LINK = {
  request: (id) => `/requests?id=${id}`,
  // ⚠️ Nhảy thẳng tới ĐÚNG nhóm + ĐÚNG ngày + ĐÚNG công việc thay vì chỉ mở
  // trang Daily chung chung — cần groupId/logDate được gửi kèm trong payload
  // lúc gọi notify() (xem daily.controller.js).
  daily_task: (id, payload = {}) => `/daily?group_id=${payload.groupId||''}&date=${payload.logDate||''}&task_id=${id}`,
};

/**
 * Tạo 1 thông báo cho 1 user, lưu DB + bắn realtime qua socket nếu họ đang online.
 * Tự bỏ qua nếu userId === actorId (không tự thông báo cho chính mình).
 */
async function notify(io, { userId, actorId, type, entityType = 'request', entityId, payload = {} }) {
  if (!userId || userId === actorId) return null;

  const [result] = await db.query(
    `INSERT INTO notifications (user_id, actor_id, type, entity_type, entity_id, payload)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, actorId || null, type, entityType, entityId, JSON.stringify(payload)]
  );

  const notification = {
    id: result.insertId,
    user_id: userId,
    actor_id: actorId || null,
    type,
    entity_type: entityType,
    entity_id: entityId,
    payload,
    is_read: 0,
    created_at: new Date().toISOString(),
    link: (ENTITY_LINK[entityType] || (() => null))(entityId, payload),
  };

  // Mỗi user join room `user:{id}` lúc connect socket — xem hướng dẫn mount ở app.js
  io?.to(`user:${userId}`).emit('notification:new', notification);

  return notification;
}

/** Gửi cùng 1 thông báo cho nhiều user, tự loại trùng và tự bỏ qua actor. */
async function notifyMany(io, userIds, opts) {
  const unique = [...new Set(userIds)].filter(Boolean);
  return Promise.all(unique.map((userId) => notify(io, { ...opts, userId })));
}

module.exports = { notify, notifyMany };