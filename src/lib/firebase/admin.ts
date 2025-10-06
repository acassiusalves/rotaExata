import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    })
  });
}

const adminDb = getFirestore();

export async function getGoogleMapsApiKey(): Promise<string | null> {
  try {
    const settingsDoc = await adminDb.collection('settings').doc('googleMaps').get();

    if (settingsDoc.exists) {
      const data = settingsDoc.data();
      return data?.apiKey || null;
    }

    return null;
  } catch (error) {
    console.error('Failed to fetch API key from Firestore:', error);
    return null;
  }
}

export { adminDb };
