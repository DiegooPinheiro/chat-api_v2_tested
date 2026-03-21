const admin = require('firebase-admin');

const getPrivateKey = () => {
  const raw = process.env.FIREBASE_PRIVATE_KEY;
  if (!raw) return undefined;
  return raw.replace(/\\n/g, '\n');
};

const hasInlineCredentials = () => {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    getPrivateKey()
  );
};

const initializeFirebaseAdmin = () => {
  if (admin.apps.length > 0) return admin.app();

  if (hasInlineCredentials()) {
    return admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: getPrivateKey(),
      }),
    });
  }

  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
};

initializeFirebaseAdmin();

module.exports = admin;
