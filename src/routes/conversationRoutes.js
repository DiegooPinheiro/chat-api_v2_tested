const express = require('express');
const router = express.Router();
const { 
  createConversation, 
  createGroup, 
  getUserConversations, 
  deleteConversation 
} = require('../controllers/conversationController');
const { protect } = require('../middlewares/auth');

router.post('/', protect, createConversation);
router.post('/groups', protect, createGroup);
router.get('/:userId', protect, getUserConversations);
router.delete('/:conversationId', protect, deleteConversation);

module.exports = router;
