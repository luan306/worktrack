const db = require('../config/db');
// Đường dẫn khi bấm vào thông báo — dùng CHUNG 1 bảng với lúc gửi realtime (không giữ 2 bản)
const { ENTITY_LINK } = require('../services/notificationService');

// GET /api/notifications?limit=20&before=123
exports.list = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(+req.query.limit || 20, 50);
    const before = req.query.before ? +req.query.before : null;

    // MySQL hay chọn nhầm idx_user_unread rồi đọc + sắp xếp TOÀN BỘ thông báo của người đó → chỉ định index (user_id, id)
    const sql = (hint) => `
      SELECT n.*, u.full_name AS actor_name, u.avatar_color AS actor_avatar_color
      FROM notifications n ${hint}
      LEFT JOIN users u ON u.id = n.actor_id
      WHERE n.user_id = ? ${before ? 'AND n.id < ?' : ''}
      ORDER BY n.id DESC
      LIMIT ?
    `;
    const params = before ? [userId, before, limit] : [userId, limit];
    const [rows] = await db.query(sql('FORCE INDEX (idx_notif_user_id)'), params)
      .catch(e => { if (e.errno === 1176) return db.query(sql(''), params); throw e; }); // DB chưa có index này

    res.json({
      success: true,
      // ⚠️ mysql2 tự parse cột JSON thành object JS sẵn
      data: rows.map(r => {
        const payload = typeof r.payload === 'string' ? JSON.parse(r.payload) : (r.payload || {});
        return {
          ...r,
          payload,
          link: (ENTITY_LINK[r.entity_type] || (() => null))(r.entity_id, payload),
        };
      }),
    });
  } catch (e) {
    console.error('[notifications.list]', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /api/notifications/unread-count
exports.unreadCount = async (req, res) => {
  try {
    const [[row]] = await db.query(
      'SELECT COUNT(*) AS count FROM notifications WHERE user_id=? AND is_read=0',
      [req.user.id]
    );
    res.json({ success: true, data: { count: row.count } });
  } catch (e) {
    console.error('[notifications.unreadCount]', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /api/notifications/:id/read
exports.markRead = async (req, res) => {
  try {
    await db.query('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (e) {
    console.error('[notifications.markRead]', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /api/notifications/read-all
exports.markAllRead = async (req, res) => {
  try {
    await db.query('UPDATE notifications SET is_read=1 WHERE user_id=? AND is_read=0', [req.user.id]);
    res.json({ success: true });
  } catch (e) {
    console.error('[notifications.markAllRead]', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};