const express = require('express');
const router = express.Router();
const { listUsers, registerUser, authUser, getUserProfile, registerPushToken, syncContacts } = require('../controllers/userController');
const { protect } = require('../middlewares/auth');

router.get('/', protect, listUsers);
router.post('/', registerUser);
router.post('/login', authUser);
router.get('/profile', protect, getUserProfile);
router.post('/push-token', protect, registerPushToken);
router.post('/sync-contacts', protect, syncContacts);

module.exports = router;
