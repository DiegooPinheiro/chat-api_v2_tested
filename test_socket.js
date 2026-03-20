const io = require('socket.io-client');
const http = require('http');
const app = require('./src/app');
const setupChatSocket = require('./src/sockets/chatSocket');
const mongoose = require('mongoose');

// Configuração para teste local
const TEST_DB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chat_test';
process.env.DEBUG_SOCKET = '1';

async function runSocketTests() {
  console.log('--- Iniciando Testes de WebSocket (MOCKED DB) ---');

  try {
    // Mockar as funções do Mongoose para os testes
    mongoose.connect = () => Promise.resolve();
    
    // Mockar Message.save
    const Message = require('./src/models/Message');
    Message.prototype.save = function() {
      this._id = new mongoose.Types.ObjectId();
      this.createdAt = new Date();
      return Promise.resolve(this);
    };

    // Mockar Conversation.findByIdAndUpdate
    const Conversation = require('./src/models/Conversation');
    Conversation.findByIdAndUpdate = () => Promise.resolve();

    console.log('Mocks do Mongoose configurados para WebSocket.');

    // Criar servidor HTTP para o Socket.IO
    const server = http.createServer(app);
    const ioServer = require('socket.io')(server);
    setupChatSocket(ioServer);

    const PORT = 3001;
    server.listen(PORT, () => {
      console.log(`Servidor de teste rodando na porta ${PORT}`);
    });

    const SOCKET_URL = `http://localhost:${PORT}`;

    // 2. Simular Usuário A e Usuário B conectando
    const userAId = '60c72b2f9b1e8b001c8e4d1a';
    const userBId = '60c72b2f9b1e8b001c8e4d1b';
    const conversationId = '60c72b2f9b1e8b001c8e4d1c';

    // Mockar Conversation.findById (necessário para validação no socket)
    Conversation.findById = (id) => Promise.resolve({
      _id: id,
      participants: [userAId, userBId].map((v) => new mongoose.Types.ObjectId(v)),
    });

    const clientA = io(SOCKET_URL, { transports: ['websocket'] });
    const clientB = io(SOCKET_URL, { transports: ['websocket'] });

    // 3. Testar Evento de Conexão (connect_user) após conectar
    await Promise.all([
      new Promise((resolve) => clientA.on('connect', resolve)),
      new Promise((resolve) => clientB.on('connect', resolve)),
    ]);

    await Promise.all([
      new Promise((resolve) => clientA.emit('connect_user', userAId, resolve)),
      new Promise((resolve) => clientB.emit('connect_user', userBId, resolve)),
    ]);
    console.log('[Teste 1] Usuários conectados ao WebSocket.');

    // 4. Testar Envio e Recebimento de Mensagem em Tempo Real
    console.log('[Teste 2] Enviando mensagem do Usuário A para o Usuário B...');
    
    const messageData = {
      conversationId,
      text: 'Olá Usuário B! Esta mensagem foi enviada via WebSocket.',
      receiverId: userBId
    };

    clientB.on('receive_message', (msg) => {
      console.log('✅ Usuário B recebeu a mensagem via WebSocket com sucesso!');
      console.log('Conteúdo da mensagem:', msg.text);
      
      // Encerrar conexões e servidor
      clientA.disconnect();
      clientB.disconnect();
      server.close();
      console.log('\n--- Todos os Testes de WebSocket passaram com sucesso! ---');
      process.exit(0);
    });

    clientA.on('receive_message', (msg) => {
      console.log('ℹ️ Usuário A recebeu confirmação via WebSocket:');
      console.log('Conteúdo da mensagem:', msg.text);
    });

    // Enviar a mensagem após um pequeno delay para garantir que B esteja ouvindo
    setTimeout(() => {
      clientA.emit('send_message', messageData);
    }, 500);

    // Timeout de segurança para os testes
    setTimeout(() => {
      console.error('❌ ERRO: Timeout aguardando mensagem via WebSocket.');
      clientA.disconnect();
      clientB.disconnect();
      server.close();
      process.exit(1);
    }, 5000);

  } catch (error) {
    console.error('\n❌ ERRO NOS TESTES DE SOCKET:', error.message);
    process.exit(1);
  }
}

runSocketTests();
