const express = require('express');
const { syncFirebaseUser } = require('../controllers/authController');
const { protect } = require('../middlewares/auth');

const router = express.Router();

router.post('/firebase', protect, syncFirebaseUser);

module.exports = router;
