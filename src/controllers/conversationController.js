const Conversation = require('../models/Conversation');
const User = require('../models/User');
const Message = require('../models/Message');
const { auditLog } = require('../utils/logger');
const { decrypt } = require('../utils/crypto');

const ensureSyncedUser = (req, res) => {
  if (req.user) return null;
  res.status(404).json({ message: 'Usuario ainda nao sincronizado na Chat API' });
  return true;
};

const createConversation = async (req, res) => {
  if (ensureSyncedUser(req, res)) return;

  const { participantId } = req.body;
  const senderId = req.user._id;

  try {
    if (!participantId) {
      return res.status(400).json({ message: 'Participant ID e obrigatorio' });
    }

    const otherUser = await User.findById(participantId);
    if (!otherUser) {
      return res.status(404).json({ message: 'Participante nao encontrado' });
    }

    const existingConversation = await Conversation.findOne({
      participants: { $all: [senderId, participantId] },
    });

    if (existingConversation) {
      return res.status(200).json(existingConversation);
    }

    const newConversation = new Conversation({
      participants: [senderId, participantId],
    });

    const savedConversation = await newConversation.save();
    return res.status(201).json(savedConversation);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const createGroup = async (req, res) => {
  if (ensureSyncedUser(req, res)) return;

  const { participantIds, groupName, groupAvatar } = req.body;
  const adminId = req.user._id;

  try {
    if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
      return res.status(400).json({ message: 'Lista de participantes e obrigatoria' });
    }

    if (!groupName || String(groupName).trim().length < 3) {
      return res.status(400).json({ message: 'Nome do grupo e obrigatorio (min. 3 caracteres)' });
    }

    // Adiciona o criador aos participantes se não estiver lá
    const allParticipants = [...new Set([...participantIds, String(adminId)])];

    const newGroup = new Conversation({
      participants: allParticipants,
      isGroup: true,
      groupName: String(groupName).trim(),
      groupAvatar: groupAvatar || null,
      groupAdmin: adminId,
    });

    const savedGroup = await newGroup.save();
    
    auditLog('CREATE_GROUP', adminId, { 
      conversationId: savedGroup._id, 
      groupName: savedGroup.groupName,
      participantCount: allParticipants.length 
    });

    return res.status(201).json(savedGroup);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getUserConversations = async (req, res) => {
  if (ensureSyncedUser(req, res)) return;

  try {
    if (req.params.userId !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Acesso negado' });
    }

    const conversations = await Conversation.find({
      participants: { $in: [req.params.userId] },
    })
      .populate('participants', 'nome username foto')
      .sort({ updatedAt: -1 });

    const unreadCounts = await Message.aggregate([
      {
        $match: {
          conversationId: { $in: conversations.map((conversation) => conversation._id) },
          senderId: { $ne: req.user._id },
          read: false,
          hiddenFor: { $ne: req.user._id },
        },
      },
      {
        $group: {
          _id: '$conversationId',
          unreadCount: { $sum: 1 },
        },
      },
    ]);

    const unreadCountMap = new Map(
      unreadCounts.map((item) => [String(item._id), Number(item.unreadCount || 0)])
    );

    const lastVisibleMessages = await Message.aggregate([
      {
        $match: {
          conversationId: { $in: conversations.map((conversation) => conversation._id) },
          hiddenFor: { $ne: req.user._id },
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$conversationId',
          text: { $first: '$text' },
          mediaUrl: { $first: '$mediaUrl' },
          senderId: { $first: '$senderId' },
          createdAt: { $first: '$createdAt' },
        },
      },
    ]);

    const lastVisibleMessageMap = new Map(
      lastVisibleMessages.map((item) => [
        String(item._id),
        {
          text: item.text ? String(item.text) : item.mediaUrl ? 'Midia' : '',
          senderId: item.senderId,
          createdAt: item.createdAt,
        },
      ])
    );

    const enrichedConversations = conversations.map((conversation) => {
      const obj = conversation.toObject();
      const lastMsg = lastVisibleMessageMap.get(String(conversation._id)) || null;
      
      if (lastMsg && lastMsg.text) {
        lastMsg.text = decrypt(lastMsg.text);
      }
      
      return {
        ...obj,
        unreadCount: unreadCountMap.get(String(conversation._id)) || 0,
        lastMessage: lastMsg,
      };
    });

    return res.status(200).json(enrichedConversations);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const deleteConversation = async (req, res) => {
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

    const messagesResult = await Message.deleteMany({ conversationId: conversation._id });
    await Conversation.deleteOne({ _id: conversation._id });

    auditLog('DELETE_CONVERSATION', userId, { conversationId, messagesDeleted: messagesResult?.deletedCount ?? 0 });

    return res.status(200).json({
      message: 'Conversa excluida com sucesso',
      deletedMessages: messagesResult?.deletedCount ?? 0,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createConversation,
  createGroup,
  getUserConversations,
  deleteConversation,
};
