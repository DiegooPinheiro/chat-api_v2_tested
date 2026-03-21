const express = require('express');
const router = express.Router();
const { sendMessage, getMessages, markMessagesAsRead } = require('../controllers/messageController');
const { protect } = require('../middlewares/auth');

router.post('/', protect, sendMessage);
router.post('/:conversationId/read', protect, markMessagesAsRead);
router.get('/:conversationId', protect, getMessages);

module.exports = router;
