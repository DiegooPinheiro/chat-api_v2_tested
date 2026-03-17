const Message = require('../models/Message');
const Conversation = require('../models/Conversation');

// @desc    Enviar mensagem
// @route   POST /api/messages
// @access  Private
const sendMessage = async (req, res) => {
  const { conversationId, text, mediaUrl, mediaType } = req.body;
  const senderId = req.user._id;

  try {
    if (!conversationId) {
      return res.status(400).json({ message: 'Conversation ID é obrigatório' });
    }

    if (!text && !mediaUrl) {
      return res.status(400).json({ message: 'A mensagem não pode estar vazia (texto ou mídia)' });
    }

    // Verificar se a conversa existe e se o usuário faz parte dela
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversa não encontrada' });
    }

    if (!conversation.participants.includes(senderId)) {
      return res.status(403).json({ message: 'Acesso negado: Você não faz parte desta conversa' });
    }

    // Criar nova mensagem
    const newMessage = new Message({
      conversationId,
      senderId,
      text,
      mediaUrl,
      mediaType
    });

    const savedMessage = await newMessage.save();

    // Atualizar a última mensagem da conversa
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: {
        text,
        senderId,
        createdAt: savedMessage.createdAt
      }
    });

    res.status(201).json(savedMessage);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Listar mensagens de uma conversa
// @route   GET /api/messages/:conversationId
// @access  Private
const getMessages = async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user._id;

  try {
    // Verificar se o usuário faz parte da conversa
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversa não encontrada' });
    }

    if (!conversation.participants.includes(userId)) {
      return res.status(403).json({ message: 'Acesso negado: Você não faz parte desta conversa' });
    }

    const messages = await Message.find({ conversationId })
      .sort({ createdAt: 1 })
      .populate('senderId', 'nome username foto');

    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  sendMessage,
  getMessages
};
