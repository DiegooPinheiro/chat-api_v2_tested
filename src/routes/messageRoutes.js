const express = require('express');
const router = express.Router();
const { sendMessage, getMessages } = require('../controllers/messageController');
const { protect } = require('../middlewares/auth');

router.post('/', protect, sendMessage);
router.get('/:conversationId', protect, getMessages);

module.exports = router;
