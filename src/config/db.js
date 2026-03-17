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
  } catch (error) {
    console.error(`Erro ao conectar ao MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
