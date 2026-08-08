const db    = require('../config/db');
const cache = require('../config/cache');

// GET /activity-logs — quyền admin/manager được chặn ở route (auth(['admin','manager']))
// Query: page, limit, action_type, entity_type, actor_id, from, to (YYYY-MM-DD)
exports.list = async (req, res) => {
  try {
    const { page = 1, limit = 30, action_type, entity_type, actor_id, from, to } = req.query;
    const p = Math.max(1, +page || 1);
    const l = Math.min(100, Math.max(1, +limit || 30));
    const offset = (p - 1) * l;

    let where = 'WHERE 1=1';
    const params = [];
    if (action_type) { where += ' AND al.action_type=?'; params.push(action_type); }
    if (entity_type) { where += ' AND al.entity_type=?'; params.push(entity_type); }
    if (actor_id)    { where += ' AND al.actor_id=?';    params.push(actor_id); }
    if (from)        { where += ' AND al.created_at>=?'; params.push(`${from} 00:00:00`); }
    if (to)          { where += ' AND al.created_at<=?'; params.push(`${to} 23:59:59`); }

    const [[{ cnt }]] = await db.query(`SELECT COUNT(*) as cnt FROM activity_logs al ${where}`, params);
    const [rows] = await db.query(
      `SELECT al.*, u.full_name as actor_name, u.avatar_color as actor_color
       FROM activity_logs al
       LEFT JOIN users u ON u.id=al.actor_id
       ${where}
       ORDER BY al.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, l, offset]
    );

    res.json({ success: true, data: { items: rows, total: cnt, page: p, limit: l, totalPages: Math.ceil(cnt / l) || 1 } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// GET /activity-logs/action-types — danh sách các loại hành động đang có trong
// DB, để đổ vào dropdown lọc bên frontend mà không cần hardcode.
// ⚠️ TỐI ƯU: danh sách này gần như KHÔNG ĐỔI (chỉ tăng khi thêm tính năng mới
// vào code, không phải khi có thêm dữ liệu) — trước đây mỗi lần mở trang Lịch
// sử là 1 lần SELECT DISTINCT quét TOÀN BỘ bảng activity_logs, càng nhiều bản
// ghi thì càng chậm dù kết quả gần như luôn giống lần trước. Cache 5 phút để
// không phải quét lại liên tục — dữ liệu vẫn tự cập nhật đúng, chỉ trễ tối đa
// 5 phút nếu vừa có action_type mới tinh xuất hiện lần đầu.
exports.listActionTypes = async (req, res) => {
  try {
    const cKey = 'activitylog:action-types';
    let types = cache.get(cKey);
    if (!types) {
      const [rows] = await db.query('SELECT DISTINCT action_type FROM activity_logs ORDER BY action_type');
      types = rows.map(r => r.action_type);
      cache.set(cKey, types, 5 * 60 * 1000); // 5 phút
    }
    res.json({ success: true, data: types });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};