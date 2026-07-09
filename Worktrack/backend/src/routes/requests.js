const express = require('express');
const router  = express.Router();

const requestsController = require('../controllers/requestsController');

// ⚠️ Chỉnh lại đường dẫn/tên cho khớp middleware xác thực đang dùng trong dự án của bạn.
// Ví dụ nếu file thực tế là middleware/authMiddleware.js và export tên "authenticate":
//   const { authenticate: auth } = require('../middleware/authMiddleware');
const auth = require('../middleware/auth');

// ── Multer dùng chung của dự án (lưu vào /uploads, không giới hạn kích thước)
const upload = require('../middleware/upload');

// ── Danh sách & chi tiết
router.get('/', auth, requestsController.list);
router.get('/:id', auth, requestsController.getOne);

// ── CRUD task
router.post('/', auth, requestsController.create);
router.put('/:id', auth, requestsController.update);
router.delete('/:id', auth, requestsController.remove);

// ── Assignees
router.post('/:id/assign', auth, requestsController.addAssignee);
router.delete('/:id/assign/:userId', auth, requestsController.removeAssignee);

// ── Nhận việc (claim)
router.post('/:id/claim', auth, requestsController.claim);

// ── Bình luận / tin nhắn — CẦN multer để đọc được multipart/form-data khi có đính kèm tệp.
// upload.single('file') đọc field tên "file" trong FormData (đúng như frontend đang gửi:
// form.append('file', attachFile)). Nếu không có file, multer vẫn parse bình thường các
// field text khác (content) — không bắt buộc phải có file mới dùng được middleware này.
router.post('/:id/comments', auth, upload.single('file'), requestsController.addComment);

// ── Chấm điểm riêng (nếu còn dùng route này song song với PUT /:id)
router.post('/:id/score', auth, requestsController.score);

// ── File đính kèm của task
router.post('/:id/files', auth, upload.single('file'), requestsController.uploadFile);
router.delete('/:id/files/:fileId', auth, requestsController.deleteFile);

module.exports = router;