const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('./config/firebaseAdmin');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const conversationRoutes = require('./routes/conversationRoutes');
const messageRoutes = require('./routes/messageRoutes');
const mediaRoutes = require('./routes/mediaRoutes');
const path = require('path');

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((item) => item.trim()) : '*',
}));

// Ativa proteção robusta de Header HTTP escondendo a assinatura do Express Node.
app.use(helmet());

// Limita pedidos a 100 requisições por janela de 15 minutos por IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  limit: 100, 
  message: { message: 'Muitas requisições originadas deste IP, por favor tente novamente mais tarde.' }
});
app.use('/api', limiter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/media', mediaRoutes);

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/', (req, res) => {
  res.json({ message: 'Chat API rodando com sucesso!' });
});

app.use((req, res) => {
  res.status(404).json({ message: 'Rota nao encontrada' });
});

module.exports = app;
