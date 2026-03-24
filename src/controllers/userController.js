const User = require('../models/User');

const ensureSyncedUser = (req, res) => {
  if (req.user) return null;
  res.status(404).json({ message: 'Usuario ainda nao sincronizado na Chat API' });
  return true;
};

// @desc    Listar usuarios (busca simples)
// @route   GET /api/users?q=
// @access  Private
const listUsers = async (req, res) => {
  if (ensureSyncedUser(req, res)) return;

  const q = (req.query.q || '').toString().trim();
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

  try {
    const filter = { _id: { $ne: req.user._id } };

    if (q) {
      filter.$or = [
        { username: { $regex: q, $options: 'i' } },
        { nome: { $regex: q, $options: 'i' } },
      ];
    }

    const users = await User.find(filter)
      .select('_id username nome foto')
      .sort({ nome: 1 })
      .limit(limit);

    return res.status(200).json(users);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Endpoint legado desativado
// @route   POST /api/users
// @access  Public
const registerUser = async (req, res) => {
  return res.status(410).json({
    message: 'Cadastro por senha foi desativado. Use POST /api/auth/firebase com token do Firebase.',
  });
};

// @desc    Endpoint legado desativado
// @route   POST /api/users/login
// @access  Public
const authUser = async (req, res) => {
  return res.status(410).json({
    message: 'Login por senha foi desativado. Use POST /api/auth/firebase com token do Firebase.',
  });
};

// @desc    Obter perfil do usuario logado
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = async (req, res) => {
  if (ensureSyncedUser(req, res)) return;

  const user = await User.findById(req.user._id);

  if (user) {
    return res.json({
      _id: user._id,
      username: user.username,
      nome: user.nome,
      foto: user.foto,
    });
  }

  return res.status(404).json({ message: 'Usuario nao encontrado' });
};

// @desc    Registrar token de Push Notification do Expo
// @route   POST /api/users/push-token
// @access  Private
const registerPushToken = async (req, res) => {
  if (ensureSyncedUser(req, res)) return;

  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ message: 'Token de notificacao e obrigatorio' });
  }

  try {
    await User.findByIdAndUpdate(req.user._id, { expoPushToken: token });
    return res.status(200).json({ message: 'Push token registrado com sucesso' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Sincronizar contatos da agenda
// @route   POST /api/users/sync-contacts
// @access  Private
const syncContacts = async (req, res) => {
  if (ensureSyncedUser(req, res)) return;

  const { phones } = req.body;
  
  if (!phones || !Array.isArray(phones)) {
    return res.status(400).json({ message: 'A lista de telefones (phones) é obrigatória.' });
  }

  // Remove formatação para match exato (caso o banco não tenha símbolos)
  const normalizedPhones = phones.map(p => String(p).replace(/\D/g, ''));

  try {
    // Busca usuários (exceto o próprio) cujo phone esteja na lista (e não seja vazio)
    const users = await User.find({
      _id: { $ne: req.user._id },
      phone: { $in: normalizedPhones, $ne: '' }
    }).select('_id username nome foto phone');

    return res.status(200).json(users);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  listUsers,
  registerUser,
  authUser,
  getUserProfile,
  registerPushToken,
  syncContacts,
};
