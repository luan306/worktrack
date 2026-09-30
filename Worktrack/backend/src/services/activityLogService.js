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

// Ghi nhiều dòng log trong 1 câu INSERT (thay vì await logActivity() trong vòng lặp)
async function logActivities(entries) {
  if (!entries.length) return;
  try {
    await db.query(
      'INSERT INTO activity_logs (actor_id,action_type,entity_type,entity_id,description,metadata) VALUES ?',
      [entries.map(({ actorId, actionType, entityType, entityId = null, description, metadata = null }) =>
        [actorId, actionType, entityType, entityId, description, metadata ? JSON.stringify(metadata) : null])]
    );
  } catch (e) {
    console.error('[activityLog] Lỗi ghi log:', e.message);
  }
}

// ── Định dạng giá trị cho mô tả log ──
const fmtText = (v) => (v === null || v === undefined || v === '' ? '(trống)' : `"${String(v).length > 60 ? String(v).slice(0, 60) + '…' : v}"`);
// 05/10/2026 17:00 (giờ địa phương của server)
const fmtDateTime = (v) => {
  if (!v) return '(trống)';
  const d = new Date(v), p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fmtScore = (v) => (v === null || v === undefined || v === '' ? '(chưa có)' : `${+v}đ`);
const STATUS_LABEL = {
  pending: 'Chờ nhận', assigned: 'Đã giao', in_progress: 'Đang làm', scoring: 'Chờ chấm điểm',
  reviewing: 'Chờ duyệt', done: 'Hoàn thành', cancelled: 'Đã hủy', archived: 'Lưu trữ',
};
const PRIORITY_LABEL = { low: 'Thấp', medium: 'Trung bình', high: 'Cao', urgent: 'Khẩn cấp' };

// So sánh trước/sau theo từng trường: chỉ ghi những trường THỰC SỰ đổi.
// fields: { tên_trường: [nhãn tiếng Việt, hàm định dạng] }
// Trả về { text: 'tiêu đề: "a" → "b"; deadline: … → …', changes: { trường: { old, new } } }
function diffFields(before, after, fields) {
  const parts = [], changes = {};
  for (const [key, [label, fmt = fmtText]] of Object.entries(fields)) {
    if (after[key] === undefined) continue;
    const o = fmt(before[key]), n = fmt(after[key]);
    if (o === n) continue;
    parts.push(`${label}: ${o} → ${n}`);
    changes[key] = { old: before[key] ?? null, new: after[key] ?? null };
  }
  return { text: parts.join('; '), changes };
}

module.exports = {
  logActivity, logActivities, diffFields,
  fmtText, fmtDateTime, fmtScore, STATUS_LABEL, PRIORITY_LABEL,
};