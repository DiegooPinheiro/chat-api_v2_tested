const express = require('express');
const cors = require('cors');
const userRoutes = require('./routes/userRoutes');
const conversationRoutes = require('./routes/conversationRoutes');
const messageRoutes = require('./routes/messageRoutes');
const mediaRoutes = require('./routes/mediaRoutes');
const path = require('path');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rotas
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/media', mediaRoutes);

// Servir arquivos estáticos da pasta de uploads (Apenas para desenvolvimento local!)
// Em produção, use um CDN ou Storage dedicado
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Rota raiz para verificação
app.get('/', (req, res) => {
  res.json({ message: 'Chat API rodando com sucesso!' });
});

// Middleware de tratamento de erro 404
app.use((req, res, next) => {
  res.status(404).json({ message: 'Rota não encontrada' });
});

module.exports = app;
