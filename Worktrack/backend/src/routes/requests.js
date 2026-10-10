const express = require('express');
const router  = express.Router();

const requestsController = require('../controllers/requestsController');

// ⚠️ Chỉnh lại đường dẫn/tên cho khớp middleware xác thực đang dùng trong dự án của bạn
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

// Bình luận / tin nhắn — CẦN multer để đọc được multipart/form-data khi có đính kèm tệp
router.post('/:id/comments', auth, upload.single('file'), requestsController.addComment);

// ── Chấm điểm riêng (nếu còn dùng route này song song với PUT /:id)
router.post('/:id/score', auth, requestsController.score);

// ── File đính kèm của task
router.post('/:id/files', auth, upload.single('file'), requestsController.uploadFile);
router.delete('/:id/files/:fileId', auth, requestsController.deleteFile);

module.exports = router;