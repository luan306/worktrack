// services/notificationService.js
const db = require('../config/db');

// Map entity_type -> đường dẫn frontend để click thông báo là nhảy đúng chỗ
const ENTITY_LINK = {
  request: (id) => `/requests?id=${id}`,
  // ⚠️ Nhảy thẳng tới ĐÚNG nhóm + ĐÚNG ngày + ĐÚNG công việc thay vì chỉ mở
  // trang Daily chung chung — cần groupId/logDate được gửi kèm trong payload
  // lúc gọi notify() (xem daily.controller.js).
  daily_task: (id, payload = {}) => `/daily?group_id=${payload.groupId||''}&date=${payload.logDate||''}&task_id=${id}`,
  // Công việc hằng ngày: mở đúng người + đúng tuần của ngày được chấm
  worklog: (id, payload = {}) => `/daily?user_id=${id}&date=${payload.workDate || ''}`,
  // Nhắc nhân viên ghi việc: mở lịch của CHÍNH MÌNH đúng ngày còn thiếu
  worklog_self: (_id, payload = {}) => `/daily?date=${payload.workDate || ''}`,
  // Nhắc leader chấm điểm: mở thẳng hộp "Chờ chấm" (ai · ngày nào)
  worklog_team: () => '/daily?view=pending',
  // Nhắc Manager: mở Board (cột "Chờ Manager duyệt")
  request_review: () => '/board',
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
async function notifyMany(io, userIds, { actorId, type, entityType = 'request', entityId, payload = {} }) {
  const unique = [...new Set(userIds.map(Number))].filter(id => id && id !== actorId);
  if (!unique.length) return [];
  if (unique.length === 1) return [await notify(io, { userId: unique[0], actorId, type, entityType, entityId, payload })];

  // 1 câu INSERT nhiều dòng — MySQL cấp id liên tiếp cho các dòng của 1 câu INSERT
  const json = JSON.stringify(payload);
  const [result] = await db.query(
    'INSERT INTO notifications (user_id, actor_id, type, entity_type, entity_id, payload) VALUES ?',
    [unique.map(userId => [userId, actorId || null, type, entityType, entityId, json])]
  );
  const createdAt = new Date().toISOString();
  const link = (ENTITY_LINK[entityType] || (() => null))(entityId, payload);
  return unique.map((userId, i) => {
    const notification = {
      id: result.insertId + i, user_id: userId, actor_id: actorId || null, type,
      entity_type: entityType, entity_id: entityId, payload, is_read: 0, created_at: createdAt, link,
    };
    io?.to(`user:${userId}`).emit('notification:new', notification);
    return notification;
  });
}

module.exports = { notify, notifyMany, ENTITY_LINK };