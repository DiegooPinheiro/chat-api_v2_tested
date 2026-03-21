const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const { emitToUserRoom } = require('../sockets/socketStore');

const ensureSyncedUser = (req, res) => {
  if (req.user) return null;
  res.status(404).json({ message: 'Usuario ainda nao sincronizado na Chat API' });
  return true;
};

const ensureConversationAccess = async (conversationId, userId) => {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    return { error: { status: 404, message: 'Conversa nao encontrada' } };
  }

  if (!conversation.participants.some((participant) => String(participant) === String(userId))) {
    return { error: { status: 403, message: 'Acesso negado: voce nao faz parte desta conversa' } };
  }

  return { conversation };
};

const markConversationAsRead = async (conversationId, readerId) => {
  const unreadMessages = await Message.find({
    conversationId,
    senderId: { $ne: readerId },
    read: false,
  }).select('_id senderId');

  if (!unreadMessages.length) {
    return { modifiedCount: 0, messageIds: [] };
  }

  const messageIds = unreadMessages.map((message) => message._id);
  await Message.updateMany(
    { _id: { $in: messageIds } },
    { $set: { read: true } }
  );

  const senderIds = Array.from(new Set(unreadMessages.map((message) => String(message.senderId))));
  const payload = {
    conversationId: String(conversationId),
    readerId: String(readerId),
    messageIds: messageIds.map((id) => String(id)),
    read: true,
  };

  senderIds.forEach((senderId) => {
    emitToUserRoom(senderId, 'messages_read', payload);
  });

  return { modifiedCount: messageIds.length, messageIds: payload.messageIds };
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

    const { error } = await ensureConversationAccess(conversationId, senderId);
    if (error) {
      return res.status(error.status).json({ message: error.message });
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
    const { error } = await ensureConversationAccess(conversationId, userId);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    await markConversationAsRead(conversationId, userId);

    const messages = await Message.find({ conversationId })
      .sort({ createdAt: 1 })
      .populate('senderId', 'nome username foto');

    return res.status(200).json(messages);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const markMessagesAsRead = async (req, res) => {
  if (ensureSyncedUser(req, res)) return;

  const { conversationId } = req.params;
  const userId = req.user._id;

  try {
    const { error } = await ensureConversationAccess(conversationId, userId);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const result = await markConversationAsRead(conversationId, userId);
    return res.status(200).json({
      message: 'Mensagens marcadas como lidas',
      ...result,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  sendMessage,
  getMessages,
  markMessagesAsRead,
  markConversationAsRead,
};
