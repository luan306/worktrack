// src/routes/dashboard.routes.js

const express = require('express');
const router  = express.Router();
const dashboardController = require('../controllers/dashboard.controller');

// Middleware xác thực dùng chung của dự án — LÀ FACTORY FUNCTION, phải gọi
// auth() (có dấu ngoặc) chứ không truyền thẳng auth trần vào route, nếu không
// middleware thật sẽ không bao giờ chạy → request bị treo vô thời hạn.
const auth = require('../middleware/auth');

// GET /api/dashboard/scores — bảng xếp hạng điểm theo view (day/week/month/all)
router.get('/scores', auth(), dashboardController.getScores);

// POST /api/dashboard/lock — chốt kỳ + xuất Excel + reset (bấm tay)
router.post('/lock', auth(), dashboardController.lockPeriod);

// GET /api/dashboard/last-export — file Excel của kỳ chốt gần nhất (không chốt/reset)
router.get('/last-export', auth(), dashboardController.getLastExport);

// GET /api/dashboard/exports — danh sách TẤT CẢ các kỳ đã chốt, để chọn tải
router.get('/exports', auth(), dashboardController.getExportList);

// GET /api/dashboard/excel/:filename — tải file Excel cụ thể
router.get('/excel/:filename', auth(), dashboardController.downloadExcel);

// GET /api/dashboard/debug — endpoint debug dữ liệu (chỉ nên bật ở dev)
router.get('/debug', auth(), dashboardController.debug);

module.exports = router;