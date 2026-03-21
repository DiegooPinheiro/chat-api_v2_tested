const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  firebaseUid: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
  },
  username: {
    type: String,
    required: [true, 'Username e obrigatorio'],
    unique: true,
    trim: true,
    lowercase: true,
  },
  nome: {
    type: String,
    required: [true, 'Nome e obrigatorio'],
  },
  password: {
    type: String,
    minlength: 6,
    select: false,
  },
  foto: {
    type: String,
    default: '',
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

userSchema.pre('save', async function(next) {
  if (!this.password || !this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  return next();
});

userSchema.methods.matchPassword = async function(enteredPassword) {
  if (!this.password) return false;
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
