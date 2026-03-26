const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '../../audit.log');

const auditLog = (action, userId, details = {}) => {
  const timestamp = new Date().toISOString();
  const logEntry = JSON.stringify({
    timestamp,
    action,
    userId: String(userId || 'ANONYMOUS'),
    ...details,
  });

  console.log(`[AUDIT] ${timestamp} - ${action} - User: ${userId}`, details);

  try {
    fs.appendFileSync(LOG_FILE, logEntry + '\n');
  } catch (err) {
    console.error('[Logger] Erro ao gravar no log de auditoria:', err.message);
  }
};

module.exports = { auditLog };
