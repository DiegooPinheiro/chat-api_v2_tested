const express = require('express');
const router = express.Router();
const { listUsers, registerUser, authUser, getUserProfile } = require('../controllers/userController');
const { protect } = require('../middlewares/auth');

router.get('/', protect, listUsers);
router.post('/', registerUser);
router.post('/login', authUser);
router.get('/profile', protect, getUserProfile);

module.exports = router;
