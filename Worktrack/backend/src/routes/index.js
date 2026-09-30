const router = require('express').Router();
const auth   = require('../middleware/auth');
const cache  = require('../config/cache');
const upload = require('../middleware/upload');
const aC  = require('../controllers/auth.controller');
const uC  = require('../controllers/users.controller');
// File Excel nhập tài khoản chỉ cần đọc trong bộ nhớ, không lưu xuống đĩa
const memUpload = require('multer')({ storage: require('multer').memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const gC  = require('../controllers/groups.controller');
const dC  = require('../controllers/daily.controller');
const rC  = require('../controllers/requests.controller');
const dbC = require('../controllers/dashboard.controller');
const nC  = require('../controllers/notifications.controller');
const alC = require('../controllers/activityLog.controller');
const wlC = require('../controllers/worklog.controller');

// ── Auth ──
router.post('/auth/login',   aC.login);
router.post('/auth/refresh', aC.refresh);
router.post('/auth/logout',  aC.logout);
router.get ('/auth/me',      auth(), aC.me);
router.post('/auth/change-password', auth(), aC.changePassword);

// Mọi thao tác ghi vào nhóm / người dùng làm danh sách nhóm (có kèm thành viên)
// đang cache bị cũ → xóa cache trước khi xử lý và sau khi xử lý xong.
const clearGroupCache = (req, res, next) => {
  if (req.method === 'GET') return next();
  cache.clear('grp:');
  res.on('finish', () => cache.clear('grp:'));
  next();
};
router.use(['/users', '/groups'], clearGroupCache);

// ── Users — static routes TRƯỚC dynamic :id ──
router.get   ('/users',                    auth(),                              uC.list);
router.post  ('/users',                    auth(['admin','manager','leader']), uC.create);
router.post  ('/users/import',             auth(['admin']),                    uC.importUsers);
router.get   ('/users/import/template',    auth(['admin']),                    uC.importTemplate);
router.post  ('/users/import/parse',       auth(['admin']), memUpload.single('file'), uC.parseImportFile);
router.put   ('/users/:id',                auth(),                              uC.update);
router.delete('/users/:id',                auth(['admin','manager','leader']), uC.remove);
router.post  ('/users/:id/reset-password', auth(['admin','manager','leader']),  uC.resetPassword);

// ── Groups ── Leader KHÔNG có quyền gì ở đây — chỉ được tạo tài khoản user (ở trên)
router.get   ('/groups',                     auth(),                              gC.list);
router.post  ('/groups',                     auth(['admin','manager','leader']), gC.create);
router.put   ('/groups/:id',                 auth(['admin','manager']),          gC.update);
router.delete('/groups/:id',                 auth(['admin']),                    gC.remove);
router.post  ('/groups/:id/members',         auth(['admin','manager','leader']), gC.addMember);
router.delete('/groups/:id/members/:userId', auth(['admin','manager','leader']), gC.removeMember);

// ── Daily Tasks — static routes TRƯỚC dynamic ──
router.get('/daily/board',                    auth(),                          dC.getBoardData);
router.get('/daily/page-data',                auth(),                          dC.getPageData);
router.get('/daily/logs/week',                auth(),                          dC.getWeekLogs);
// ⚠️ MỚI — lịch sử ghi chú của ĐÚNG 1 ô (task+người+ngày), dùng cho panel 📝
// bên trong DailyPage.jsx. Phải đứng TRƯỚC '/daily/logs' vì không xung đột
// path nhưng để cùng nhóm static route cho dễ theo dõi.
router.get('/daily/note-history',             auth(),                          dC.getNoteHistory);
router.get('/daily/logs',                     auth(),                          dC.getLogs);
router.post('/daily/logs',                    auth(['admin','manager','leader']), dC.saveLogs);
router.get   ('/daily/task-groups',           auth(),                          dC.listGroups);
router.post  ('/daily/task-groups',           auth(['admin','manager','leader']), dC.createGroup);
router.put   ('/daily/task-groups/:id',       auth(['admin','manager','leader']), dC.updateGroup);
router.delete('/daily/task-groups/:id',       auth(['admin','manager','leader']), dC.deleteGroup);
router.get   ('/daily/task-groups/:groupId/tasks', auth(),                    dC.listTasks);
router.post  ('/daily/task-groups/:groupId/tasks', auth(['admin','manager','leader']), dC.createTask);
router.put   ('/daily/tasks/:id',             auth(['admin','manager','leader']), dC.updateTask);
router.delete('/daily/tasks/:id',             auth(['admin','manager','leader']), dC.deleteTask);

// ── Công việc hằng ngày (user tự ghi việc, Leader chấm cả ngày) ──
// Phân quyền chi tiết (xem ai / chấm ai) kiểm tra trong controller
router.get   ('/worklog/members',       auth(), wlC.members);
router.get   ('/worklog',               auth(), wlC.week);
router.post  ('/worklog/entries',       auth(), wlC.createEntry);
router.put   ('/worklog/entries/:id',   auth(), wlC.updateEntry);
router.delete('/worklog/entries/:id',   auth(), wlC.deleteEntry);
router.put   ('/worklog/scores',        auth(['admin','manager','leader']), wlC.scoreDay);
router.get   ('/worklog/history',       auth(), wlC.history);
router.put   ('/worklog/offs',          auth(), wlC.setDayOff);
router.delete('/worklog/offs',          auth(), wlC.removeDayOff);
router.get   ('/worklog/export',        auth(), wlC.exportReport);
router.get   ('/worklog/overview',      auth(), wlC.overview);

// ── Requests ──
router.get   ('/requests',                    auth(), rC.list);
router.get   ('/requests/:id',                auth(), rC.getOne);
router.get   ('/requests/:id/activity',       auth(), rC.getActivity);
router.post  ('/requests',                    auth(['admin','manager','leader']), rC.create);
router.put   ('/requests/:id',                auth(), rC.update);
router.post  ('/requests/:id/assign',         auth(), rC.addAssignee);
router.delete('/requests/:id/assign/:userId', auth(), rC.removeAssignee);
router.put   ('/requests/:id/assign/:userId/role', auth(), rC.setAssigneeRole);
router.post  ('/requests/:id/claim',          auth(), rC.claim);
// ⚠️ Thêm upload.single('file') để đọc được multipart/form-data khi frontend gửi kèm tệp đính kèm.
// Không có middleware này thì req.file/req.body luôn rỗng với request dạng multipart → lỗi 400 "content required".
router.post  ('/requests/:id/comments',       auth(), upload.single('file'), rC.addComment);
// Chấm điểm trực tiếp, bỏ qua luồng scoring → reviewing → done (frontend không dùng)
// → chỉ Manager/Admin, tránh Leader tự chấm điểm cho CV của mình qua API
router.post  ('/requests/:id/score',          auth(['admin','manager']), rC.score);
router.delete('/requests/:id',                auth(), rC.remove);

// File upload
router.post  ('/requests/:id/files',          auth(), upload.single('file'), rC.uploadFile);
router.delete('/requests/:id/files/:fileId',  auth(), rC.deleteFile);

// ── Dashboard ── ai đăng nhập cũng xem được bảng điểm;
// Export Excel / Lock & Reset chỉ admin/manager
router.get ('/dashboard/debug',              auth(['admin','manager']), dbC.debug);
router.get ('/dashboard/scores',             auth(), dbC.getScores);
router.post('/dashboard/lock',               auth(['admin','manager']), dbC.lockPeriod);
router.get ('/dashboard/excel/:filename',    auth(['admin','manager']), dbC.downloadExcel);
router.get ('/dashboard/last-export',        auth(['admin','manager']), dbC.getLastExport);
router.get ('/dashboard/exports',            auth(['admin','manager']), dbC.getExportList);

// ── Notifications — static routes TRƯỚC dynamic :id ──
router.get ('/notifications/unread-count', auth(), nC.unreadCount);
router.post('/notifications/read-all',     auth(), nC.markAllRead);
router.get ('/notifications',              auth(), nC.list);
router.post('/notifications/:id/read',     auth(), nC.markRead);
router.use('/dashboard', require('./dashboard.routes'));

// ── Activity Log — LỊCH SỬ THAY ĐỔI, chỉ admin/manager được xem ──
router.get('/activity-logs',             auth(['admin','manager']), alC.list);
router.get('/activity-logs/action-types',auth(['admin','manager']), alC.listActionTypes);

// Debug: đếm users
router.get('/debug/users', auth(['admin']), async (req, res) => {
  const db = require('../config/db');
  const [all]    = await db.query('SELECT COUNT(*) as c FROM users');
  const [active] = await db.query('SELECT COUNT(*) as c FROM users WHERE is_active=1');
  const [rows]   = await db.query('SELECT id,username,full_name,is_active FROM users LIMIT 20');
  res.json({ total: all[0].c, active: active[0].c, rows });
});

module.exports = router;