const User = require('../models/User');
const { auditLog } = require('../utils/logger');

const normalizeEmail = (value) => {
  const email = String(value || '').trim().toLowerCase();
  return email === '' ? null : email;
};
const normalizeName = (value) => String(value || '').trim();

const syncFirebaseUser = async (req, res) => {
  try {
    const firebaseUid = String(req.firebaseUser?.uid || '').trim();
    const tokenEmail = normalizeEmail(req.firebaseUser?.email);
    const tokenName = normalizeName(req.firebaseUser?.name);
    const tokenPhoto = String(req.firebaseUser?.picture || '').trim();

    if (!firebaseUid) {
      return res.status(400).json({ message: 'Token Firebase sem UID valido.' });
    }

    const bodyEmail = normalizeEmail(req.body?.email);
    const bodyName = normalizeName(req.body?.displayName);
    const bodyPhoto = String(req.body?.photoURL || '').trim();
    const bodyPhone = String(req.body?.phone || '').replace(/\D/g, '').trim();

    if (bodyEmail && tokenEmail && bodyEmail !== tokenEmail) {
      return res.status(400).json({ message: 'Email incompativel com o token Firebase.' });
    }

    // Se tiver email no token ou no body, usamos como username principal
    const username = tokenEmail || bodyEmail || undefined;
    const nome = bodyName || tokenName || 'Usuario';
    const foto = bodyPhoto || tokenPhoto || '';
    const phone = bodyPhone || '';
    const phoneVerified = req.body?.phoneVerified === true;

    // Busca preferencialmente pelo firebaseUid
    let user = await User.findOne({ firebaseUid }).select('-password');

    // Se não achar pelo UID mas tiver username, tenta pelo username
    if (!user && username) {
      user = await User.findOne({ username }).select('-password');
    }

    if (!user) {
      user = await User.create({
        firebaseUid,
        username,
        nome,
        foto,
        phone,
        phoneVerified,
      });
    } else {
      user.firebaseUid = firebaseUid;
      if (username) user.username = username;
      user.nome = nome;
      user.foto = foto;
      if (phone) user.phone = phone;
      if (phoneVerified) user.phoneVerified = true;
      await user.save();
    }

    auditLog(user ? 'USER_SYNC_UPDATE' : 'USER_SYNC_CREATE', user?._id || 'NEW', { firebaseUid, username });

    return res.status(200).json({
      _id: user._id,
      username: user.username,
      nome: user.nome,
      foto: user.foto,
      phone: user.phone,
      phoneVerified: user.phoneVerified || false,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  syncFirebaseUser,
};
