const { Expo } = require('expo-server-sdk');

// Create a new Expo SDK client
// optionally providing an access token if you have enabled push security
const expo = new Expo();

/**
 * Sends a push notification to an Expo Push Token
 * @param {string} pushToken - The target device's push token
 * @param {object} payload - The title, body, and custom data
 */
const sendPushNotification = async (pushToken, payload) => {
  if (!Expo.isExpoPushToken(pushToken)) {
    console.warn(`[Push Service] Invalid Expo push token: ${pushToken}`);
    return;
  }

  const { title, body, data } = payload;

  const messages = [
    {
      to: pushToken,
      sound: 'default',
      title: title || 'Nova mensagem',
      body: body || '',
      data: data || {},
    },
  ];

  try {
    const ticketChunk = await expo.sendPushNotificationsAsync(messages);
    console.log('[Push Service] Notification sent successfully:', ticketChunk);
    return ticketChunk;
  } catch (error) {
    console.error('[Push Service] Error sending push notification:', error);
  }
};

module.exports = {
  sendPushNotification,
};
