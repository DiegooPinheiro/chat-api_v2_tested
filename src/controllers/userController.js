const User = require('../models/User');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');

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
  
  try {
    // 1. Se o token for fornecido, removemos ele de QUALQUER outro usuário 
    // que possa estar usando o mesmo aparelho (evita duplicidade em testes)
    if (token && token.trim() !== '') {
      await User.updateMany(
        { expoPushToken: token, _id: { $ne: req.user._id } },
        { expoPushToken: '' }
      );
    }

    // 2. Atualiza o token do usuário atual (ou limpa se o token enviado for vazio)
    await User.findByIdAndUpdate(req.user._id, { expoPushToken: token || '' });
    
    return res.status(200).json({ 
      message: token ? 'Push token registrado com sucesso' : 'Push token removido com sucesso' 
    });
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

/**
 * @desc    Deletar conta do usuário logado
 * @route   DELETE /api/users/me
 * @access  Private
 */
const deleteMe = async (req, res) => {
  try {
    const userId = req.user._id;

    // 1. Remover mensagens enviadas pelo usuário
    await Message.deleteMany({ senderId: userId });

    // 2. Remover o usuário de conversas (ou deletar conversas se for o único membro)
    // Para simplificar, vamos remover o usuário de todos os arrays de membros
    await Conversation.updateMany(
      { members: userId },
      { $pull: { members: userId } }
    );

    // 3. Remover conversas vazias
    await Conversation.deleteMany({ members: { $size: 0 } });

    // 4. Remover o documento do usuário
    await User.findByIdAndDelete(userId);

    res.status(200).json({
      success: true,
      message: 'Conta deletada com sucesso'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao deletar conta',
      error: error.message
    });
  }
};

module.exports = {
  listUsers,
  registerUser,
  authUser,
  getUserProfile,
  registerPushToken,
  syncContacts,
  deleteMe,
};
