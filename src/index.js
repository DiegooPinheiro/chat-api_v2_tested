const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const app = require('./app');
const setupChatSocket = require('./sockets/chatSocket');

// Configuração do ambiente
dotenv.config();

// Conectar ao Banco de Dados
connectDB();

// Criar servidor HTTP para integrar com Socket.IO
const server = http.createServer(app);

// Inicializar Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*", // Em produção, restringir ao domínio do frontend
    methods: ["GET", "POST"]
  }
});

// Configurar eventos de Chat Socket
setupChatSocket(io);

// Iniciar servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
