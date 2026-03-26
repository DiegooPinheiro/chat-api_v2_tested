const crypto = require('crypto');

// Use uma chave de 32 bytes (256 bits) para AES-256-CBC
// Em produção, isso deve vir de uma variável de ambiente (ENCRYPTION_KEY)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '12345678901234567890123456789012'; 
const IV_LENGTH = 16; // Para AES, o IV é sempre 16 bytes

const encrypt = (text) => {
  if (!text) return text;
  
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    // Retornamos o IV + o texto criptografado em formato hexadecimal para salvar no banco
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  } catch (error) {
    console.error('[Crypto] Erro ao criptografar:', error.message);
    return text; // Fallback para texto original em caso de erro crítico
  }
};

const decrypt = (text) => {
  if (!text || !text.includes(':')) return text;
  
  try {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString();
  } catch (error) {
    // Se falhar, provavelmente o texto não estava criptografado (mensagens antigas)
    // Então retornamos o texto original.
    return text;
  }
};

module.exports = { encrypt, decrypt };
