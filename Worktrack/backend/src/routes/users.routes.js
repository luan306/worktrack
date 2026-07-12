const router = require('express').Router();
const u    = require('../controllers/users.controller');
const g    = require('../controllers/groups.controller');
const auth = require('../middleware/auth');

// Users
router.get   ('/users',                    auth(['admin','manager']),          u.list);
router.post  ('/users',                    auth(['admin','manager','leader']), u.create);
router.put   ('/users/:id',                auth(['admin','manager']),          u.update);
router.post  ('/users/:id/reset-password', auth(['admin']),                    u.resetPassword);
router.post  ('/users/import',             auth(['admin']),                    u.importUsers);
router.delete('/users/:id',                auth(['admin']),                    u.remove);

// Groups
router.get   ('/groups',                     auth(),                     g.list);
router.post  ('/groups',                     auth(['admin','manager']), g.create);
router.put   ('/groups/:id',                 auth(['admin','manager']), g.update);
router.delete('/groups/:id',                 auth(['admin']),           g.remove);
router.post  ('/groups/:id/members',         auth(['admin','manager']), g.addMember);
router.delete('/groups/:id/members/:userId', auth(['admin','manager']), g.removeMember);

module.exports = router;