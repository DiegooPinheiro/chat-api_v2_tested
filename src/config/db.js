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
    // No MongoDB, índices únicos sem o flag 'sparse' barram múltiplos valores nulos.
    try {
      const users = conn.connection.collection('users');
      const indexes = await users.indexes();
      const indexNames = indexes.map(i => i.name);
      
      console.log(`[DB] Índices atuais: ${indexNames.join(', ')}`);

      if (indexNames.includes('username_1')) {
        await users.dropIndex('username_1');
        console.log('[DB] Índice username_1 removido para migração SPARSE.');
      }
      if (indexNames.includes('firebaseUid_1')) {
        await users.dropIndex('firebaseUid_1');
        console.log('[DB] Índice firebaseUid_1 removido para migração SPARSE.');
      }
    } catch (e) {
      console.error('[DB] Erro ao limpar índices:', e.message);
    }
  } catch (error) {
    console.error(`Erro ao conectar ao MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
