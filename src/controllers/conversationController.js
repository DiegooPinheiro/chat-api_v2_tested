const Conversation = require('../models/Conversation');
const User = require('../models/User');
const Message = require('../models/Message');

// @desc    Criar nova conversa
// @route   POST /api/conversations
// @access  Private
const createConversation = async (req, res) => {
  const { participantId } = req.body;
  const senderId = req.user._id;

  try {
    if (!participantId) {
      return res.status(400).json({ message: 'Participant ID é obrigatório' });
    }

    // Verificar se o outro usuário existe
    const otherUser = await User.findById(participantId);
    if (!otherUser) {
      return res.status(404).json({ message: 'Participante não encontrado' });
    }

    // Verificar se a conversa já existe
    const existingConversation = await Conversation.findOne({
      participants: { $all: [senderId, participantId] }
    });

    if (existingConversation) {
      return res.status(200).json(existingConversation);
    }

    // Criar nova conversa
    const newConversation = new Conversation({
      participants: [senderId, participantId]
    });

    const savedConversation = await newConversation.save();
    res.status(201).json(savedConversation);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Listar conversas de um usuário
// @route   GET /api/conversations/:userId
// @access  Private
const getUserConversations = async (req, res) => {
  try {
    // Verificar se o usuário está pedindo suas próprias conversas ou se é autorizado
    if (req.params.userId !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Acesso negado' });
    }

    const conversations = await Conversation.find({
      participants: { $in: [req.params.userId] }
    })
    .populate('participants', 'nome username foto')
    .sort({ updatedAt: -1 });

    res.status(200).json(conversations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Excluir conversa (e mensagens)
// @route   DELETE /api/conversations/:conversationId
// @access  Private
const deleteConversation = async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user._id;

  try {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversa não encontrada' });
    }

    if (!conversation.participants.includes(userId)) {
      return res.status(403).json({ message: 'Acesso negado: Você não faz parte desta conversa' });
    }

    const messagesResult = await Message.deleteMany({ conversationId: conversation._id });
    await Conversation.deleteOne({ _id: conversation._id });

    return res.status(200).json({
      message: 'Conversa excluída com sucesso',
      deletedMessages: messagesResult?.deletedCount ?? 0,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createConversation,
  getUserConversations,
  deleteConversation
};
