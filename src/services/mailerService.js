const { Resend } = require('resend');

/**
 * Serviço de e-mail utilizando Resend.
 * Responsável por enviar códigos de verificação e notificações.
 */
class MailerService {
  constructor() {
    this.fromEmail = 'onboarding@resend.dev'; // No modo onboarding, o Resend costuma exigir o e-mail puro
  }

  /**
   * Envia o código de Verificação em Duas Etapas.
   * @param {string} to - Destinatário
   * @param {string} code - PIN de 6 dígitos
   */
  async sendTwoStepCode(to, code) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn('[MailerService] RESEND_API_KEY não configurada. Simulando envio.');
      return { success: true, simulated: true };
    }

    // Inicializa o cliente na hora do envio para garantir que tenha a chave correta
    const resend = new Resend(apiKey);

    try {
      console.log(`[MailerService] Tentando enviar e-mail para ${to} com chave que inicia com ${apiKey.substring(0, 5)}...`);
      const { data, error } = await resend.emails.send({
        from: this.fromEmail,
        to: [to],
        subject: `${code} é o seu código de verificação`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #0088cc; text-align: center;">Vibe Messenger</h2>
            <p style="font-size: 16px; color: #333;">Olá,</p>
            <p style="font-size: 16px; color: #333;">Você solicitou a ativação da <b>Verificação em Duas Etapas</b> no seu Telegram Clone.</p>
            <div style="background: #f4f4f4; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #000;">${code}</span>
            </div>
            <p style="font-size: 14px; color: #777; text-align: center;">Insira este código no aplicativo para confirmar seu e-mail.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 12px; color: #999; text-align: center;">Se você não solicitou este código, ignore este e-mail.</p>
          </div>
        `,
      });

      if (error) {
        console.error('[MailerService] Erro ao enviar e-mail:', error);
        throw new Error(error.message);
      }

      console.log(`[2FA Email] Enviado com sucesso para ${to}. ID: ${data.id}`);
      return { success: true, id: data.id };
    } catch (err) {
      console.error('[MailerService] Exception ao enviar e-mail:', err.message);
      throw err;
    }
  }
}

module.exports = new MailerService();
