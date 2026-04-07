const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const { emitToUserRoom } = require('../sockets/socketStore');
const { auditLog } = require('../utils/logger');
const { sanitizeText } = require('../utils/sanitizer');
const { encrypt, decrypt } = require('../utils/crypto');
const { clearCache } = require('../middlewares/cache');

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

const buildVisibleMessageQuery = (conversationId, userId) => ({
  conversationId,
  hiddenFor: { $ne: userId },
});

const markConversationAsRead = async (conversationId, readerId) => {
  const unreadMessages = await Message.find({
    ...buildVisibleMessageQuery(conversationId, readerId),
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

  const { conversationId, mediaUrl, mediaType } = req.body;
  const initialText = req.body?.text || '';
  const text = sanitizeText(initialText, req.user._id);
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
      text: encrypt(text),
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

    try {
      let outgoing = savedMessage;
      if (process.env.SOCKET_POPULATE === '1' && typeof savedMessage.populate === 'function') {
        outgoing = await savedMessage.populate('senderId', 'nome username foto');
      }

      const populatedMessage = {
        ...(typeof outgoing.toObject === 'function' ? outgoing.toObject() : outgoing),
      };

      // Ensure we have access to the conversation participants
      if (conversation && conversation.participants) {
        const receiverIdObj = conversation.participants.find(p => String(p) !== String(senderId));
        if (receiverIdObj) {
          const receiverIdStr = String(receiverIdObj);
          
          // Emit to the receiver's socket room
          // emitToUserRoom returns true if a socket was present in the room
          const isOnline = emitToUserRoom(receiverIdStr, 'receive_message', populatedMessage);
          
          if (!isOnline) {
            const User = require('../models/User');
            const receiver = await User.findById(receiverIdStr).select('expoPushToken');
            
            if (receiver && receiver.expoPushToken) {
              const { sendPushNotification } = require('../services/expoPushService');
              const sender = req.user;
              const pushBody = text ? text : (mediaUrl ? `ðŸ“¸ Arquivo de midia` : 'Nova mensagem');
              
              sendPushNotification(receiver.expoPushToken, {
                title: sender.nome || 'Nova mensagem',
                body: pushBody,
                data: { conversationId, type: 'new_message' }
              });
            }
          }
        }
      }
    } catch (socketErr) {
      console.error('Erro ao processar socket/push via REST:', socketErr.message);
    }

    const responseMessage = savedMessage.toObject();
    responseMessage.text = text; // Retornamos o texto descriptografado para o autor

    await clearCache("cache:/api/messages/*");
    return res.status(201).json(responseMessage);
  } catch (error) {
    console.error('[Error] falha generalizada:', error);
    return res.status(500).json({ message: 'Falha interna no servidor.' });
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

    const messages = await Message.find(buildVisibleMessageQuery(conversationId, userId))
      .sort({ createdAt: 1 })
      .populate('senderId', 'nome username foto');

    const decryptedMessages = messages.map((m) => {
      const obj = m.toObject();
      if (obj.text) obj.text = decrypt(obj.text);
      return obj;
    });

    return res.status(200).json(decryptedMessages);
  } catch (error) {
    console.error('[Error] falha generalizada:', error);
    return res.status(500).json({ message: 'Falha interna no servidor.' });
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
    await clearCache("cache:/api/messages/*");
    await clearCache("cache:/api/messages/*");
    await clearCache("cache:/api/messages/*");
    return res.status(200).json({
      message: 'Mensagens marcadas como lidas',
      ...result,
    });
  } catch (error) {
    console.error('[Error] falha generalizada:', error);
    return res.status(500).json({ message: 'Falha interna no servidor.' });
  }
};

const updateMessage = async (req, res) => {
  if (ensureSyncedUser(req, res)) return;

  const { messageId } = req.params;
  const userId = req.user._id;
  const initialText = req.body?.text || '';
  const nextText = sanitizeText(initialText, userId);

  try {
    if (!nextText) {
      return res.status(400).json({ message: 'O texto da mensagem nao pode ficar vazio' });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Mensagem nao encontrada' });
    }

    const { error, conversation } = await ensureConversationAccess(message.conversationId, userId);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    if (String(message.senderId) !== String(userId)) {
      return res.status(403).json({ message: 'Voce so pode editar mensagens enviadas por voce' });
    }

    if (message.mediaUrl && !message.text) {
      return res.status(400).json({ message: 'Edicao ainda disponivel apenas para mensagens de texto' });
    }

    message.text = encrypt(nextText);
    message.edited = true;
    await message.save();

    const conversationLastMessage = conversation?.lastMessage;
    const isConversationLastMessage =
      conversationLastMessage &&
      String(conversationLastMessage.senderId) === String(message.senderId) &&
      new Date(conversationLastMessage.createdAt).getTime() === new Date(message.createdAt).getTime();

    let lastMessage = conversationLastMessage || null;
    if (isConversationLastMessage) {
      lastMessage = {
        text: nextText,
        senderId: message.senderId,
        createdAt: message.createdAt,
      };

      await Conversation.findByIdAndUpdate(message.conversationId, {
        lastMessage,
      });
    }

    const populatedMessage = await Message.findById(message._id).populate('senderId', 'nome username foto');
    const participants = (conversation?.participants || []).map((participant) => String(participant));
    const payload = {
      conversationId: String(message.conversationId),
      message: populatedMessage,
      updatedBy: String(userId),
      lastMessage,
    };

    participants.forEach((participantId) => {
      emitToUserRoom(participantId, 'message_updated', payload);
    });

    const finalResponse = populatedMessage.toObject();
    finalResponse.text = decrypt(finalResponse.text);

    await clearCache("cache:/api/messages/*");
    await clearCache("cache:/api/messages/*");
    await clearCache("cache:/api/messages/*");
    return res.status(200).json({
      message: 'Mensagem atualizada com sucesso',
      updatedMessage: finalResponse,
      lastMessage,
    });
  } catch (error) {
    console.error('[Error] falha generalizada:', error);
    return res.status(500).json({ message: 'Falha interna no servidor.' });
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

    const participants = (conversation?.participants || []).map((participant) => String(participant));
    let lastMessage = null;
    let recipients = [String(userId)];

    if (deleteForEveryone) {
      if (String(message.senderId) !== String(userId)) {
        auditLog('DELETE_FOR_EVERYONE_FAILED_NOT_AUTHOR', userId, { messageId, conversationId: message.conversationId });
        return res.status(403).json({ message: 'Apenas o autor pode excluir a mensagem para todos' });
      }

      await Message.deleteOne({ _id: message._id });
      lastMessage = await syncConversationLastMessage(message.conversationId);
      recipients = participants;
      auditLog('DELETE_MESSAGE_FOR_EVERYONE', userId, { messageId, conversationId: message.conversationId });
    } else {
      await Message.updateOne(
        { _id: message._id },
        { $addToSet: { hiddenFor: userId } }
      );
    }

    const payload = {
      conversationId: String(message.conversationId),
      messageIds: [String(message._id)],
      deletedBy: String(userId),
      deleteForEveryone,
      lastMessage,
    };

    recipients.forEach((participantId) => {
      emitToUserRoom(participantId, 'messages_deleted', payload);
    });

    await clearCache("cache:/api/messages/*");
    await clearCache("cache:/api/messages/*");
    await clearCache("cache:/api/messages/*");
    return res.status(200).json({
      message: 'Mensagem apagada com sucesso',
      ...payload,
    });
  } catch (error) {
    console.error('[Error] falha generalizada:', error);
    return res.status(500).json({ message: 'Falha interna no servidor.' });
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

    const participants = (conversation?.participants || []).map((participant) => String(participant));
    const normalizedIds = messages.map((message) => String(message._id));
    let lastMessage = null;
    let recipients = [String(userId)];

    if (deleteForEveryone === true) {
      const unauthorizedMessages = messages.filter((m) => String(m.senderId) !== String(userId));
      if (unauthorizedMessages.length > 0) {
        auditLog('DELETE_MANY_FOR_EVERYONE_FAILED_NOT_AUTHOR', userId, { conversationId, count: unauthorizedMessages.length });
        return res.status(403).json({ message: 'Voce so pode deletar para todos as mensagens enviadas por voce' });
      }

      await Message.deleteMany({ _id: { $in: normalizedIds } });
      lastMessage = await syncConversationLastMessage(conversationId);
      recipients = participants;
      auditLog('DELETE_MANY_MESSAGES_FOR_EVERYONE', userId, { conversationId, count: normalizedIds.length });
    } else {
      await Message.updateMany(
        { _id: { $in: normalizedIds } },
        { $addToSet: { hiddenFor: userId } }
      );
    }

    const payload = {
      conversationId,
      messageIds: normalizedIds,
      deletedBy: String(userId),
      deleteForEveryone: deleteForEveryone === true,
      lastMessage,
    };

    recipients.forEach((participantId) => {
      emitToUserRoom(participantId, 'messages_deleted', payload);
    });

    await clearCache("cache:/api/messages/*");
    await clearCache("cache:/api/messages/*");
    await clearCache("cache:/api/messages/*");
    return res.status(200).json({
      message: 'Mensagens apagadas com sucesso',
      deletedCount: normalizedIds.length,
      ...payload,
    });
  } catch (error) {
    console.error('[Error] falha generalizada:', error);
    return res.status(500).json({ message: 'Falha interna no servidor.' });
  }
};

module.exports = {
  sendMessage,
  getMessages,
  markMessagesAsRead,
  markConversationAsRead,
  updateMessage,
  deleteMessage,
  deleteManyMessages,
  syncConversationLastMessage,
};

