const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  lastMessage: {
    text: String,
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: Date
  }
}, {
  timestamps: true
});

// Garantir que não existam conversas duplicadas entre os mesmos dois usuários (ordem não importa)
conversationSchema.index({ participants: 1 });

module.exports = mongoose.model('Conversation', conversationSchema);
