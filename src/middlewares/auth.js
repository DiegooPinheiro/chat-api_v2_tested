const admin = require('../config/firebaseAdmin');
const User = require('../models/User');

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization || '';

  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Nao autorizado, sem token Bearer' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = await admin.auth().verifyIdToken(token);
    const email = String(decoded.email || '').trim().toLowerCase();

    req.firebaseUser = decoded;
    req.user = await User.findOne({
      $or: [{ firebaseUid: decoded.uid }, ...(email ? [{ username: email }] : [])],
    }).select('-password');

    return next();
  } catch (error) {
    console.error('[Auth] Firebase token invalido:', error.message);
    return res.status(401).json({ message: 'Nao autorizado, token Firebase invalido' });
  }
};

module.exports = { protect };
