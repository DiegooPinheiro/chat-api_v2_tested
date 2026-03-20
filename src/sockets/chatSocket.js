const Message = require('../models/Message');
const Conversation = require('../models/Conversation');

// Mapa para rastrear usuários online (userId -> socketId)
const onlineUsers = new Map();

const setupChatSocket = (io) => {
  io.on('connection', (socket) => {
    console.log('Novo cliente conectado:', socket.id);

    if (process.env.DEBUG_SOCKET === '1') {
      socket.onAny((eventName, ...args) => {
        console.log(`[DEBUG_SOCKET] ${socket.id} -> ${eventName}`, args?.[0]);
      });
    }

    // Evento de conexão do usuário com seu ID
    socket.on('connect_user', (userId, ack) => {
      const normalizedUserId = String(userId);
      socket.data.userId = normalizedUserId;
      onlineUsers.set(normalizedUserId, socket.id);
      socket.join(`user:${normalizedUserId}`);
      console.log(`Usuário ${normalizedUserId} está online com socket ${socket.id}`);

      if (typeof ack === 'function') {
        ack({ ok: true, userId: normalizedUserId });
      }

      socket.emit('user_connected', { userId: normalizedUserId });
    });

    const emitToUser = (userId, event, payload) => {
      const receiverSocketId = onlineUsers.get(String(userId));
      if (receiverSocketId) {
        if (process.env.DEBUG_SOCKET === '1') {
          console.log('[DEBUG_SOCKET] emitToUser direct', { userId: String(userId), receiverSocketId, event });
        }
        io.to(receiverSocketId).emit(event, payload);
        return true;
      }
      // fallback room (caso use room ao invés de map em algum momento)
      if (process.env.DEBUG_SOCKET === '1') {
        console.log('[DEBUG_SOCKET] emitToUser room', { userId: String(userId), room: `user:${userId}`, event });
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

    // "Digitando..." (compatível com vários nomes de evento)
    socket.on('typing', (data) => relayTyping('typing', { ...data, typing: true }));
    socket.on('stop_typing', (data) => relayTyping('stop_typing', { ...data, typing: false }));
    socket.on('typing_status', (data) => relayTyping('typing_status', data));
    socket.on('typingStatus', (data) => relayTyping('typingStatus', data));

    // Evento de envio de mensagem em tempo real
    socket.on('send_message', async (data) => {
      const { conversationId, text, receiverId, mediaUrl, mediaType } = data || {};
      const senderId = socket.data.userId ? String(socket.data.userId) : null;

      try {
        if (!senderId) {
          if (process.env.DEBUG_SOCKET === '1') console.log('[DEBUG_SOCKET] send_message ignore: sem senderId');
          return;
        }
        if (!conversationId || !receiverId) {
          if (process.env.DEBUG_SOCKET === '1') console.log('[DEBUG_SOCKET] send_message ignore: sem conversationId/receiverId');
          return;
        }
        if (!text && !mediaUrl) {
          if (process.env.DEBUG_SOCKET === '1') console.log('[DEBUG_SOCKET] send_message ignore: vazio');
          return;
        }

        // Verificar conversa e participantes (evita spoof de senderId e envio para conversa errada)
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          if (process.env.DEBUG_SOCKET === '1') console.log('[DEBUG_SOCKET] send_message ignore: conversa não encontrada');
          return;
        }
        if (process.env.DEBUG_SOCKET === '1') console.log('[DEBUG_SOCKET] send_message conversa ok');

        const participants = conversation.participants.map((p) => String(p));
        if (!participants.includes(String(senderId)) || !participants.includes(String(receiverId))) {
          if (process.env.DEBUG_SOCKET === '1') {
            console.log('[DEBUG_SOCKET] send_message ignore: participantes inválidos', { senderId, receiverId, participants });
          }
          return;
        }
        if (process.env.DEBUG_SOCKET === '1') console.log('[DEBUG_SOCKET] send_message participantes ok');

        // 1. Salvar no banco (mesma lógica do controller)
        const newMessage = new Message({
          conversationId,
          senderId,
          text,
          mediaUrl,
          mediaType
        });

        const savedMessage = await newMessage.save();
        if (process.env.DEBUG_SOCKET === '1') console.log('[DEBUG_SOCKET] send_message salvo', String(savedMessage?._id || ''));

        // Atualizar última mensagem na conversa
        const lastText = text ? String(text) : mediaUrl ? '📎 Mídia' : '';
        await Conversation.findByIdAndUpdate(conversationId, {
          lastMessage: {
            text: lastText,
            senderId,
            createdAt: savedMessage.createdAt
          }
        });
        if (process.env.DEBUG_SOCKET === '1') console.log('[DEBUG_SOCKET] send_message lastMessage atualizado');

        // Populating no socket é opcional (pode ser custoso e atrapalhar testes).
        // O app já lida com senderId como string ou objeto populado.
        let outgoing = savedMessage;
        if (process.env.SOCKET_POPULATE === '1' && typeof savedMessage.populate === 'function') {
          outgoing = await savedMessage.populate('senderId', 'nome username foto');
        }
        if (process.env.DEBUG_SOCKET === '1') console.log('[DEBUG_SOCKET] send_message emitindo');

        // 2. Emitir evento para o remetente (confirmação)
        socket.emit('receive_message', outgoing);

        // 3. Emitir evento para o destinatário se ele estiver online
        const delivered = emitToUser(receiverId, 'receive_message', outgoing);
        if (delivered) {
          console.log(`Mensagem enviada para o usuário ${receiverId}`);
        }
      } catch (error) {
        console.error('Erro no socket send_message:', error.message);
      }
    });

    // Desconexão
    socket.on('disconnect', () => {
      // Remover usuário do mapa de usuários online
      for (const [userId, socketId] of onlineUsers.entries()) {
        if (socketId === socket.id) {
          onlineUsers.delete(userId);
          console.log(`Usuário ${userId} desconectado`);
          break;
        }
      }
    });
  });
};

module.exports = setupChatSocket;
