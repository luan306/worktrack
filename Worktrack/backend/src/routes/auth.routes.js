const router = require('express').Router();
const ctrl   = require('../controllers/auth.controller');
const auth   = require('../middleware/auth');

router.post('/login',   ctrl.login);
router.post('/refresh', ctrl.refresh);
router.post('/logout',  ctrl.logout);
router.get ('/me',      auth(), ctrl.me);

module.exports = router;
