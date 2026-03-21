const Message = require('../models/Message');
const Conversation = require('../models/Conversation');

const ensureSyncedUser = (req, res) => {
  if (req.user) return null;
  res.status(404).json({ message: 'Usuario ainda nao sincronizado na Chat API' });
  return true;
};

const sendMessage = async (req, res) => {
  if (ensureSyncedUser(req, res)) return;

  const { conversationId, text, mediaUrl, mediaType } = req.body;
  const senderId = req.user._id;

  try {
    if (!conversationId) {
      return res.status(400).json({ message: 'Conversation ID e obrigatorio' });
    }

    if (!text && !mediaUrl) {
      return res.status(400).json({ message: 'A mensagem nao pode estar vazia (texto ou midia)' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversa nao encontrada' });
    }

    if (!conversation.participants.some((participant) => String(participant) === String(senderId))) {
      return res.status(403).json({ message: 'Acesso negado: voce nao faz parte desta conversa' });
    }

    const newMessage = new Message({
      conversationId,
      senderId,
      text,
      mediaUrl,
      mediaType,
    });

    const savedMessage = await newMessage.save();
    const lastText = text ? String(text) : mediaUrl ? 'Midia' : '';

    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: {
        text: lastText,
        senderId,
        createdAt: savedMessage.createdAt,
      },
    });

    return res.status(201).json(savedMessage);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getMessages = async (req, res) => {
  if (ensureSyncedUser(req, res)) return;

  const { conversationId } = req.params;
  const userId = req.user._id;

  try {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversa nao encontrada' });
    }

    if (!conversation.participants.some((participant) => String(participant) === String(userId))) {
      return res.status(403).json({ message: 'Acesso negado: voce nao faz parte desta conversa' });
    }

    const messages = await Message.find({ conversationId })
      .sort({ createdAt: 1 })
      .populate('senderId', 'nome username foto');

    return res.status(200).json(messages);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  sendMessage,
  getMessages,
};
