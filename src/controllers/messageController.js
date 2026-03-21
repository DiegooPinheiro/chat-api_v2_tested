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

const syncConversationLastMessage = async (conversationId) => {
  const latestMessage = await Message.findOne({ conversationId })
    .sort({ createdAt: -1 })
    .select('text mediaUrl senderId createdAt');

  const nextLastMessage = latestMessage
    ? {
        text: latestMessage.text ? String(latestMessage.text) : latestMessage.mediaUrl ? 'Midia' : '',
        senderId: latestMessage.senderId,
        createdAt: latestMessage.createdAt,
      }
    : null;

  await Conversation.findByIdAndUpdate(conversationId, {
    lastMessage: nextLastMessage,
  });

  return nextLastMessage;
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

const deleteMessage = async (req, res) => {
  if (ensureSyncedUser(req, res)) return;

  const { messageId } = req.params;
  const userId = req.user._id;
  const deleteForEveryone = req.query.deleteForEveryone === 'true' || req.body?.deleteForEveryone === true;

  try {
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Mensagem nao encontrada' });
    }

    const { error, conversation } = await ensureConversationAccess(message.conversationId, userId);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    await Message.deleteOne({ _id: message._id });
    const lastMessage = await syncConversationLastMessage(message.conversationId);

    const participants = (conversation?.participants || []).map((participant) => String(participant));
    const payload = {
      conversationId: String(message.conversationId),
      messageIds: [String(message._id)],
      deletedBy: String(userId),
      deleteForEveryone,
      lastMessage,
    };

    participants.forEach((participantId) => {
      emitToUserRoom(participantId, 'messages_deleted', payload);
    });

    return res.status(200).json({
      message: 'Mensagem apagada com sucesso',
      ...payload,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const deleteManyMessages = async (req, res) => {
  if (ensureSyncedUser(req, res)) return;

  const { messageIds, deleteForEveryone = false } = req.body || {};
  const userId = req.user._id;

  try {
    if (!Array.isArray(messageIds) || !messageIds.length) {
      return res.status(400).json({ message: 'messageIds deve ser um array com pelo menos um item' });
    }

    const messages = await Message.find({ _id: { $in: messageIds } });
    if (!messages.length) {
      return res.status(404).json({ message: 'Nenhuma mensagem encontrada para apagar' });
    }

    const conversationIds = Array.from(new Set(messages.map((message) => String(message.conversationId))));
    if (conversationIds.length !== 1) {
      return res.status(400).json({ message: 'As mensagens devem pertencer a uma unica conversa' });
    }

    const conversationId = conversationIds[0];
    const { error, conversation } = await ensureConversationAccess(conversationId, userId);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const normalizedIds = messages.map((message) => String(message._id));
    await Message.deleteMany({ _id: { $in: normalizedIds } });
    const lastMessage = await syncConversationLastMessage(conversationId);

    const participants = (conversation?.participants || []).map((participant) => String(participant));
    const payload = {
      conversationId,
      messageIds: normalizedIds,
      deletedBy: String(userId),
      deleteForEveryone: deleteForEveryone === true,
      lastMessage,
    };

    participants.forEach((participantId) => {
      emitToUserRoom(participantId, 'messages_deleted', payload);
    });

    return res.status(200).json({
      message: 'Mensagens apagadas com sucesso',
      deletedCount: normalizedIds.length,
      ...payload,
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
  deleteMessage,
  deleteManyMessages,
  syncConversationLastMessage,
};
