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

module.exports = {
  listUsers,
  registerUser,
  authUser,
  getUserProfile,
};
