const express = require('express');
const router = express.Router();
const {
  sendMessage,
  getMessages,
  markMessagesAsRead,
  updateMessage,
  deleteMessage,
  deleteManyMessages,
} = require('../controllers/messageController');
const { protect } = require('../middlewares/auth');

router.post('/', protect, sendMessage);
router.post('/delete-many', protect, deleteManyMessages);
router.post('/:conversationId/read', protect, markMessagesAsRead);
router.patch('/:messageId', protect, updateMessage);
router.delete('/:messageId', protect, deleteMessage);
router.get('/:conversationId', protect, getMessages);

module.exports = router;
