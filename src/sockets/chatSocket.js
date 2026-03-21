const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const admin = require('../config/firebaseAdmin');
const { setSocketServer } = require('./socketStore');
const { markConversationAsRead } = require('../controllers/messageController');

const onlineUsers = new Map();

const setupChatSocket = (io) => {
  setSocketServer(io);

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) {
        return next(new Error('Token Firebase ausente no socket.'));
      }

      const decoded = await admin.auth().verifyIdToken(token);
      const email = String(decoded.email || '').trim().toLowerCase();
      const user = await User.findOne({
        $or: [{ firebaseUid: decoded.uid }, ...(email ? [{ username: email }] : [])],
      }).select('-password');

      if (!user) {
        return next(new Error('Usuario ainda nao sincronizado na Chat API.'));
      }

      socket.data.firebaseUser = decoded;
      socket.data.userId = String(user._id);
      socket.data.mongoUser = user;
      return next();
    } catch (error) {
      return next(new Error(`Falha na autenticacao do socket: ${error.message}`));
    }
  });

  io.on('connection', (socket) => {
    console.log('Novo cliente conectado:', socket.id);

    const authenticatedUserId = String(socket.data.userId);
    onlineUsers.set(authenticatedUserId, socket.id);
    socket.join(`user:${authenticatedUserId}`);
    socket.emit('user_connected', { userId: authenticatedUserId });

    if (process.env.DEBUG_SOCKET === '1') {
      socket.onAny((eventName, ...args) => {
        console.log(`[DEBUG_SOCKET] ${socket.id} -> ${eventName}`, args?.[0]);
      });
    }

    socket.on('connect_user', (_userId, ack) => {
      if (typeof ack === 'function') {
        ack({ ok: true, userId: authenticatedUserId });
      }
    });

    const emitToUser = (userId, event, payload) => {
      const receiverSocketId = onlineUsers.get(String(userId));
      if (receiverSocketId) {
        io.to(receiverSocketId).emit(event, payload);
        return true;
      }

      io.to(`user:${userId}`).emit(event, payload);
      return false;
    };

    const relayTyping = (eventName, data) => {
      const senderId = socket.data.userId ? String(socket.data.userId) : null;
      if (!senderId) return;

      const { conversationId, receiverId, typing } = data || {};
      if (!conversationId || !receiverId) return;

      emitToUser(receiverId, eventName, {
        conversationId,
        receiverId,
        senderId,
        typing: typing === false ? false : true,
      });
    };

    socket.on('typing', (data) => relayTyping('typing', { ...data, typing: true }));
    socket.on('stop_typing', (data) => relayTyping('stop_typing', { ...data, typing: false }));
    socket.on('typing_status', (data) => relayTyping('typing_status', data));
    socket.on('typingStatus', (data) => relayTyping('typingStatus', data));

    socket.on('mark_messages_read', async (data, ack) => {
      const readerId = socket.data.userId ? String(socket.data.userId) : null;
      const { conversationId } = data || {};

      try {
        if (!readerId || !conversationId) {
          if (typeof ack === 'function') ack({ ok: false, message: 'conversationId e obrigatorio' });
          return;
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          if (typeof ack === 'function') ack({ ok: false, message: 'Conversa nao encontrada' });
          return;
        }

        const participants = conversation.participants.map((participant) => String(participant));
        if (!participants.includes(readerId)) {
          if (typeof ack === 'function') ack({ ok: false, message: 'Acesso negado' });
          return;
        }

        const result = await markConversationAsRead(conversationId, readerId);
        if (typeof ack === 'function') ack({ ok: true, ...result });
      } catch (error) {
        console.error('Erro no socket mark_messages_read:', error.message);
        if (typeof ack === 'function') ack({ ok: false, message: error.message });
      }
    });

    socket.on('send_message', async (data) => {
      const { conversationId, text, receiverId, mediaUrl, mediaType } = data || {};
      const senderId = socket.data.userId ? String(socket.data.userId) : null;

      try {
        if (!senderId || !conversationId || !receiverId || (!text && !mediaUrl)) {
          return;
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) return;

        const participants = conversation.participants.map((participant) => String(participant));
        if (!participants.includes(senderId) || !participants.includes(String(receiverId))) {
          return;
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

        let outgoing = savedMessage;
        if (process.env.SOCKET_POPULATE === '1' && typeof savedMessage.populate === 'function') {
          outgoing = await savedMessage.populate('senderId', 'nome username foto');
        }

        socket.emit('receive_message', outgoing);
        emitToUser(receiverId, 'receive_message', outgoing);
      } catch (error) {
        console.error('Erro no socket send_message:', error.message);
      }
    });

    socket.on('disconnect', () => {
      for (const [userId, socketId] of onlineUsers.entries()) {
        if (socketId === socket.id) {
          onlineUsers.delete(userId);
          console.log(`Usuario ${userId} desconectado`);
          break;
        }
      }
    });
  });
};

module.exports = setupChatSocket;
