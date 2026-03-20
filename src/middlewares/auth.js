const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ message: 'JWT_SECRET não configurado no servidor' });
  }

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Obter token do header
      token = req.headers.authorization.split(' ')[1];

      // Verificar token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Obter usuário do token
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        return res.status(401).json({ message: 'Não autorizado, usuário não encontrado' });
      }

      next();
    } catch (error) {
      console.error(error);
      return res.status(401).json({ message: 'Não autorizado, token falhou' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Não autorizado, sem token' });
  }
};

module.exports = { protect };
