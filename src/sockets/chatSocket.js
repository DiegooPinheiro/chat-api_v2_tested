const Message = require('../models/Message');
const Conversation = require('../models/Conversation');

// Mapa para rastrear usuários online (userId -> socketId)
const onlineUsers = new Map();

const setupChatSocket = (io) => {
  io.on('connection', (socket) => {
    console.log('Novo cliente conectado:', socket.id);

    // Evento de conexão do usuário com seu ID
    socket.on('connect_user', (userId) => {
      onlineUsers.set(userId, socket.id);
      console.log(`Usuário ${userId} está online com socket ${socket.id}`);
    });

    // Evento de envio de mensagem em tempo real
    socket.on('send_message', async (data) => {
      const { conversationId, senderId, text, receiverId, mediaUrl, mediaType } = data;

      try {
        if (!text && !mediaUrl) return;

        // 1. Salvar no banco (mesma lógica do controller)
        const newMessage = new Message({
          conversationId,
          senderId,
          text,
          mediaUrl,
          mediaType
        });

        const savedMessage = await newMessage.save();

        // Atualizar última mensagem na conversa
        await Conversation.findByIdAndUpdate(conversationId, {
          lastMessage: {
            text,
            senderId,
            createdAt: savedMessage.createdAt
          }
        });

        // 2. Emitir evento para o remetente (confirmação)
        socket.emit('receive_message', savedMessage);

        // 3. Emitir evento para o destinatário se ele estiver online
        const receiverSocketId = onlineUsers.get(receiverId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit('receive_message', savedMessage);
          console.log(`Mensagem enviada para o usuário ${receiverId} no socket ${receiverSocketId}`);
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
