const router = require('express').Router();
const auth   = require('../middleware/auth');
const aC = require('../controllers/auth.controller');
const uC = require('../controllers/users.controller');
const gC = require('../controllers/groups.controller');
const dC = require('../controllers/daily.controller');
const rC = require('../controllers/requests.controller');
const dbC= require('../controllers/dashboard.controller');

// ── Auth ──
router.post('/auth/login',   aC.login);
router.post('/auth/refresh', aC.refresh);
router.post('/auth/logout',  aC.logout);
router.get ('/auth/me',      auth(), aC.me);

// ── Users ──
router.get ('/users',                      auth(['admin','manager']), uC.list);
router.post('/users',                      auth(['admin']),           uC.create);
router.put ('/users/:id',                  auth(['admin','manager']), uC.update);
router.post('/users/:id/reset-password',   auth(['admin']),           uC.resetPassword);
router.post('/users/import',               auth(['admin']),           uC.importUsers);

// ── Groups ──
router.get   ('/groups',                    auth(),                    gC.list);
router.post  ('/groups',                    auth(['admin','manager']), gC.create);
router.put   ('/groups/:id',                auth(['admin','manager']), gC.update);
router.delete('/groups/:id',                auth(['admin']),           gC.remove);
router.post  ('/groups/:id/members',        auth(['admin','manager']), gC.addMember);
router.delete('/groups/:id/members/:userId',auth(['admin','manager']), gC.removeMember);

// ── Daily Tasks ──
router.get('/daily/board',     auth(), dC.getBoardData);
router.get('/daily/page-data', auth(), dC.getPageData);
router.get   ('/daily/task-groups',             auth(), dC.listGroups);
router.post  ('/daily/task-groups',             auth(['admin','manager']), dC.createGroup);
router.put   ('/daily/task-groups/:id',         auth(['admin','manager']), dC.updateGroup);
router.delete('/daily/task-groups/:id',         auth(['admin','manager']), dC.deleteGroup);
router.get   ('/daily/task-groups/:groupId/tasks', auth(), dC.listTasks);
router.post  ('/daily/task-groups/:groupId/tasks', auth(['admin','manager']), dC.createTask);
router.put   ('/daily/tasks/:id',               auth(['admin','manager']), dC.updateTask);
router.delete('/daily/tasks/:id',               auth(['admin','manager']), dC.deleteTask);
router.get   ('/daily/logs',                    auth(), dC.getLogs);
router.post  ('/daily/logs',                    auth(['admin','manager']), dC.saveLogs);
router.get   ('/daily/logs/week',               auth(), dC.getWeekLogs);

// ── Request Tasks ──
router.get   ('/requests',             auth(), rC.list);
router.get   ('/requests/:id',         auth(), rC.getOne);
router.post  ('/requests',             auth(), rC.create);
router.put   ('/requests/:id',         auth(), rC.update);
router.post  ('/requests/:id/assign',  auth(['admin','manager']), rC.addAssignee);
router.delete('/requests/:id/assign/:userId', auth(['admin','manager']), rC.removeAssignee);
router.post  ('/requests/:id/comments',auth(), rC.addComment);
router.post  ('/requests/:id/score',   auth(['admin','manager']), rC.score);

// ── Dashboard ──
router.get ('/dashboard/scores',       auth(['admin','manager']), dbC.getScores);
router.post('/dashboard/lock',         auth(['admin','manager']),          dbC.lockPeriod);
router.get ('/dashboard/excel/:filename', auth(['admin','manager']),       dbC.downloadExcel);

router.get('/dashboard/debug', auth(), dbC.debug);

module.exports = router;