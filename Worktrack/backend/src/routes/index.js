const router = require('express').Router();
const auth   = require('../middleware/auth');
const upload = require('../middleware/upload');
const aC  = require('../controllers/auth.controller');
const uC  = require('../controllers/users.controller');
const gC  = require('../controllers/groups.controller');
const dC  = require('../controllers/daily.controller');
const rC  = require('../controllers/requests.controller');
const dbC = require('../controllers/dashboard.controller');
const nC  = require('../controllers/notifications.controller');

// ── Auth ──
router.post('/auth/login',   aC.login);
router.post('/auth/refresh', aC.refresh);
router.post('/auth/logout',  aC.logout);
router.get ('/auth/me',      auth(), aC.me);
router.post('/auth/change-password', auth(), aC.changePassword);

// ── Users — static routes TRƯỚC dynamic :id ──
router.get   ('/users',                    auth(),                    uC.list);
router.post  ('/users',                    auth(['admin']),           uC.create);
router.post  ('/users/import',             auth(['admin']),           uC.importUsers);
router.put   ('/users/:id',                auth(['admin','manager']), uC.update);
router.delete('/users/:id',                auth(['admin']),           uC.remove);
router.post  ('/users/:id/reset-password', auth(['admin']),           uC.resetPassword);

// ── Groups ──
router.get   ('/groups',                     auth(),                    gC.list);
router.post  ('/groups',                     auth(['admin','manager']), gC.create);
router.put   ('/groups/:id',                 auth(['admin','manager']), gC.update);
router.delete('/groups/:id',                 auth(['admin']),           gC.remove);
router.post  ('/groups/:id/members',         auth(['admin','manager']), gC.addMember);
router.delete('/groups/:id/members/:userId', auth(['admin','manager']), gC.removeMember);

// ── Daily Tasks — static routes TRƯỚC dynamic ──
router.get('/daily/board',                    auth(),                          dC.getBoardData);
router.get('/daily/page-data',                auth(),                          dC.getPageData);
router.get('/daily/logs/week',                auth(),                          dC.getWeekLogs);
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

// ── Requests ──
router.get   ('/requests',                    auth(), rC.list);
router.get   ('/requests/:id',                auth(), rC.getOne);
router.post  ('/requests',                    auth(['admin','manager','leader']), rC.create);
router.put   ('/requests/:id',                auth(), rC.update);
router.post  ('/requests/:id/assign',         auth(), rC.addAssignee);
router.delete('/requests/:id/assign/:userId', auth(), rC.removeAssignee);
router.post  ('/requests/:id/claim',          auth(), rC.claim);
// ⚠️ Thêm upload.single('file') để đọc được multipart/form-data khi frontend gửi kèm tệp đính kèm.
// Không có middleware này thì req.file/req.body luôn rỗng với request dạng multipart → lỗi 400 "content required".
router.post  ('/requests/:id/comments',       auth(), upload.single('file'), rC.addComment);
router.post  ('/requests/:id/score',          auth(['admin','manager','leader']), rC.score);
router.delete('/requests/:id',                auth(), rC.remove);

// File upload
router.post  ('/requests/:id/files',          auth(), upload.single('file'), rC.uploadFile);
router.delete('/requests/:id/files/:fileId',  auth(), rC.deleteFile);

// ── Dashboard ──
router.get ('/dashboard/debug',              auth(),                    dbC.debug);
router.get ('/dashboard/scores',             auth(['admin','manager']), dbC.getScores);
router.post('/dashboard/lock',               auth(['admin','manager']), dbC.lockPeriod);
router.get ('/dashboard/excel/:filename',    auth(['admin','manager']), dbC.downloadExcel);

// ── Notifications — static routes TRƯỚC dynamic :id ──
router.get ('/notifications/unread-count', auth(), nC.unreadCount);
router.post('/notifications/read-all',     auth(), nC.markAllRead);
router.get ('/notifications',              auth(), nC.list);
router.post('/notifications/:id/read',     auth(), nC.markRead);

// Debug: đếm users
router.get('/debug/users', auth(['admin']), async (req, res) => {
  const db = require('../config/db');
  const [all]    = await db.query('SELECT COUNT(*) as c FROM users');
  const [active] = await db.query('SELECT COUNT(*) as c FROM users WHERE is_active=1');
  const [rows]   = await db.query('SELECT id,username,full_name,is_active FROM users LIMIT 20');
  res.json({ total: all[0].c, active: active[0].c, rows });
});

module.exports = router;