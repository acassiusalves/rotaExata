import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin only if credentials are available
let adminDb: FirebaseFirestore.Firestore | null = null;

if (!getApps().length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    try {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        })
      });
      adminDb = getFirestore();
    } catch (error) {
      console.error('Failed to initialize Firebase Admin:', error);
    }
  } else {
    console.warn('Firebase Admin credentials not found. API key management will not work.');
  }
} else {
  adminDb = getFirestore();
}

export async function getGoogleMapsApiKey(): Promise<string | null> {
  if (!adminDb) {
    console.warn('Firebase Admin not initialized. Cannot fetch API key from Firestore.');
    return null;
  }

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
