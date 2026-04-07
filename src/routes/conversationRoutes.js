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
const { cacheMiddleware } = require('../middlewares/cache');

router.post('/', protect, createConversation);
router.post('/groups', protect, createGroup);
router.get('/detail/:conversationId', protect, cacheMiddleware(30), getConversationById);
router.get('/:userId', protect, cacheMiddleware(60), getUserConversations);
router.delete('/:conversationId', protect, deleteConversation);

module.exports = router;

