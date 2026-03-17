const express = require('express');
const router = express.Router();
const { createConversation, getUserConversations } = require('../controllers/conversationController');
const { protect } = require('../middlewares/auth');

router.post('/', protect, createConversation);
router.get('/:userId', protect, getUserConversations);

module.exports = router;
