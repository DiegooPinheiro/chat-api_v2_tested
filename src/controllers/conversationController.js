const Conversation = require('../models/Conversation');
const User = require('../models/User');
const Message = require('../models/Message');

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

    const enrichedConversations = conversations.map((conversation) => ({
      ...conversation.toObject(),
      unreadCount: unreadCountMap.get(String(conversation._id)) || 0,
    }));

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
  getUserConversations,
  deleteConversation,
};
