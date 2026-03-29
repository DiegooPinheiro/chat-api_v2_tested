const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/chat-api';

    // Alguns provedores/redes podem ter problemas com TLS 1.3 ao conectar no Atlas.
    // Forçamos TLS 1.2 quando a URI é do tipo SRV (mongodb+srv://).
    const mongooseOptions = mongoUri.startsWith('mongodb+srv://')
      ? { secureProtocol: 'TLSv1_2_method' }
      : {};

    const conn = await mongoose.connect(mongoUri, mongooseOptions);
    console.log(`MongoDB conectado: ${conn.connection.host}`);

    // Limpeza de índices antigos que impedem múltiplos usuários com null (username/firebaseUid)
    // Isso é necessário porque o MongoDB não atualiza o flag 'sparse' automaticamente.
    try {
      const users = conn.connection.collection('users');
      await Promise.allSettled([
        users.dropIndex('username_1'),
        users.dropIndex('firebaseUid_1')
      ]);
      console.log('[DB] Índices antigos verificados/removidos para garantir suporte a SPARSE.');
    } catch (e) {
      // Ignora se o índice não existir
    }
  } catch (error) {
    console.error(`Erro ao conectar ao MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
