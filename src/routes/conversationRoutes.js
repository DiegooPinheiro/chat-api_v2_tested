const express = require('express');
const router = express.Router();
const { createConversation, getUserConversations, deleteConversation } = require('../controllers/conversationController');
const { protect } = require('../middlewares/auth');

router.post('/', protect, createConversation);
router.get('/:userId', protect, getUserConversations);
router.delete('/:conversationId', protect, deleteConversation);

module.exports = router;
