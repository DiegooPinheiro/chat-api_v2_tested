const express = require('express');
const router = express.Router();
const { 
  createConversation, 
  createGroup, 
  getUserConversations, 
  getConversationById,
  deleteConversation 
} = require('../controllers/conversationController');
const { protect } = require('../middlewares/auth');

router.post('/', protect, createConversation);
router.post('/groups', protect, createGroup);
router.get('/detail/:conversationId', protect, getConversationById);
router.get('/:userId', protect, getUserConversations);
router.delete('/:conversationId', protect, deleteConversation);

module.exports = router;
