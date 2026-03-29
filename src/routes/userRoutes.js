const express = require('express');
const router = express.Router();
const { listUsers, registerUser, authUser, getUserProfile, registerPushToken, syncContacts, deleteMe, sendTwoStepCode } = require('../controllers/userController');
const { protect } = require('../middlewares/auth');

router.get('/', protect, listUsers);
router.post('/', registerUser);
router.post('/login', authUser);
router.get('/profile', protect, getUserProfile);
router.post('/push-token', protect, registerPushToken);
router.post('/sync-contacts', protect, syncContacts);
router.post('/2fa/send-code', protect, sendTwoStepCode);
router.delete('/me', protect, deleteMe);

module.exports = router;
