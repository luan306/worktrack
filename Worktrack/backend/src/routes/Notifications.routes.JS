const router = require('express').Router();
const ctrl = require('../controllers/notifications.controller');

// ⚠️ File này KHÔNG tự import auth middleware — vì requests.routes.js của bạn
// cũng vậy (req.user đã có sẵn nhờ middleware áp dụng ở app.js/index.js lúc mount).
// Hãy mount route này CÙNG CHỖ và SAU CÙNG middleware auth như requests router,
// ví dụ nếu app.js đang có:
//
//   app.use('/api/requests', authMiddleware, require('./routes/requests.routes'));
//
// thì thêm dòng tương tự:
//
//   app.use('/api/notifications', authMiddleware, require('./routes/notifications.routes'));

router.get('/', ctrl.list);
router.get('/unread-count', ctrl.unreadCount);
router.post('/:id/read', ctrl.markRead);
router.post('/read-all', ctrl.markAllRead);

module.exports = router;