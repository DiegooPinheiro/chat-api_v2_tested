const User = require('../models/User');
const jwt = require('jsonwebtoken');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

// @desc    Registrar novo usuário
// @route   POST /api/users
// @access  Public
const registerUser = async (req, res) => {
  const { username, nome, password, foto } = req.body;

  try {
    const userExists = await User.findOne({ username });

    if (userExists) {
      return res.status(400).json({ message: 'Usuário já existe' });
    }

    const user = await User.create({
      username,
      nome,
      password,
      foto
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        username: user.username,
        nome: user.nome,
        foto: user.foto,
        token: generateToken(user._id)
      });
    } else {
      res.status(400).json({ message: 'Dados de usuário inválidos' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Autenticar usuário e obter token
// @route   POST /api/users/login
// @access  Public
const authUser = async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username }).select('+password');

    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user._id,
        username: user.username,
        nome: user.nome,
        foto: user.foto,
        token: generateToken(user._id)
      });
    } else {
      res.status(401).json({ message: 'Username ou senha inválidos' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Obter perfil do usuário logado
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    res.json({
      _id: user._id,
      username: user.username,
      nome: user.nome,
      foto: user.foto
    });
  } else {
    res.status(404).json({ message: 'Usuário não encontrado' });
  }
};

module.exports = {
  registerUser,
  authUser,
  getUserProfile
};
