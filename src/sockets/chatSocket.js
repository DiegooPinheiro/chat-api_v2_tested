const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const admin = require('../config/firebaseAdmin');
const { setSocketServer } = require('./socketStore');
const { markConversationAsRead } = require('../controllers/messageController');
const { sanitizeText } = require('../utils/sanitizer');
const { encrypt } = require('../utils/crypto');

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
      return false; // Returns true if connected on this node, false if not (offline or other node)
    };

    const relayTyping = async (eventName, data) => {
      const senderId = socket.data.userId ? String(socket.data.userId) : null;
      if (!senderId) return;

      const { conversationId, typing } = data || {};
      if (!conversationId) return;

      try {
        const conversation = await Conversation.findById(conversationId).select('participants');
        if (!conversation) return;

        const otherParticipants = conversation.participants
          .map(p => String(p))
          .filter(id => id !== senderId);

        otherParticipants.forEach(pId => {
          emitToUser(pId, eventName, {
            conversationId,
            senderId,
            typing: typing === false ? false : true,
          });
        });
      } catch (err) {
        console.error('Erro ao repassar typing status:', err.message);
      }
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
      const { conversationId, receiverId, mediaUrl, mediaType, clientMessageId } = data || {};
      const initialText = data?.text || '';
      const senderId = socket.data.userId ? String(socket.data.userId) : null;
      const text = sanitizeText(initialText, senderId);

      try {
        // Em grupos o receiverId pode ser nulo, focamos no conversationId
        if (!senderId || !conversationId || (!text && !mediaUrl)) {
          return;
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) return;

        const participants = conversation.participants.map((participant) => String(participant));
        if (!participants.includes(senderId)) {
          return;
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

        let outgoing = savedMessage;
        if (process.env.SOCKET_POPULATE === '1' && typeof savedMessage.populate === 'function') {
          outgoing = await savedMessage.populate('senderId', 'nome username foto');
        }

        const outgoingPayload = {
          ...(typeof outgoing.toObject === 'function' ? outgoing.toObject() : outgoing),
          text: text, 
          clientMessageId: clientMessageId || null,
        };

        // Enviar para todos os outros participantes
        const otherParticipants = participants.filter(pId => pId !== senderId);
        
        // Se for um chat 1-on-1 e tiver receiverId específico, mantemos a lógica de status para o remetente
        let hasAnyOnline = false;

        for (const pId of otherParticipants) {
          const isOnline = emitToUser(pId, 'receive_message', outgoingPayload);
          if (isOnline) hasAnyOnline = true;

          // Push Notifications para quem está offline
          if (!isOnline) {
            try {
              const receiver = await User.findById(pId).select('expoPushToken');
              if (receiver && receiver.expoPushToken) {
                const { sendPushNotification } = require('../services/expoPushService');
                const senderName = conversation.isGroup 
                  ? `${conversation.groupName}: ${socket.data.mongoUser?.nome || 'Membro'}`
                  : (socket.data.mongoUser?.nome || 'Nova mensagem');
                
                const pushBody = text ? text : (mediaUrl ? `📸 Arquivo de midia` : 'Nova mensagem');
                
                sendPushNotification(receiver.expoPushToken, {
                  title: senderName,
                  body: pushBody,
                  data: { conversationId, type: 'new_message' }
                });
              }
            } catch (pushErr) {
              console.error(`Erro ao enviar push para ${pId}:`, pushErr.message);
            }
          }
        }

        // Emitir de volta para o próprio remetente para confirmar o recebimento/sincronia
        socket.emit('receive_message', { 
          ...outgoingPayload, 
          localStatus: hasAnyOnline ? 'delivered' : 'sent' 
        });

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
