/**
 * Utilitário de sanitização para evitar scripts maliciosos (XSS) e tags HTML indesejadas.
 * Como estamos em um ambiente mobile (React Native), o maior risco é se o banco de dados
 * for usado por uma interface web futura.
 */

const { auditLog } = require('./logger');

const sanitizeText = (text, userId = 'SYSTEM') => {
  if (typeof text !== 'string') return '';

  // 1. Remove qualquer tag HTML/Script usando regex (simples mas eficaz para mensagens de chat)
  const cleanText = text.replace(/<[^>]*>?/gm, '');

  // 2. Se o texto original continha algo que foi removido, logamos como suspeito
  if (text.length !== cleanText.length) {
    auditLog('XSS_ATTEMPT_DETECTED', userId, {
      original: text,
      cleansed: cleanText,
    });
  }

  // 3. Trim para evitar mensagens de espaços vazios (que passaram pela sanitização)
  return cleanText.trim();
};

module.exports = { sanitizeText };
