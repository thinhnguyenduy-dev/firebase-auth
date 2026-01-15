import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
};

if (!admin.apps.length) {
  if (serviceAccount.projectId && serviceAccount.privateKey && serviceAccount.clientEmail) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
  } else {
    // Only for local development/emulator or if using GOOGLE_APPLICATION_CREDENTIALS
    admin.initializeApp();
    console.warn('Firebase Admin initialized without explicit service account credential. Ensure environment variables are set.');
  }
}

export const auth = admin.auth();
