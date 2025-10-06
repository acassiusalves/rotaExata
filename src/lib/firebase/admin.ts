import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin only if credentials are available
let adminDb: FirebaseFirestore.Firestore | null = null;
let adminApp: App | null = null;

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

console.log('Firebase Admin initialization check:', {
  hasProjectId: !!projectId,
  hasClientEmail: !!clientEmail,
  hasPrivateKey: !!privateKey,
  privateKeyLength: privateKey?.length,
  projectIdValue: projectId
});

if (projectId && clientEmail && privateKey) {
  try {
    // Check if app already exists
    const apps = getApps();
    if (apps.length === 0) {
      console.log('Initializing new Firebase Admin app...');

      // Replace escaped newlines with actual newlines
      const formattedKey = privateKey.replace(/\\n/g, '\n');

      console.log('Key format check:', {
        startsCorrectly: formattedKey.startsWith('-----BEGIN PRIVATE KEY-----'),
        endsCorrectly: formattedKey.endsWith('-----END PRIVATE KEY-----'),
        hasNewlines: formattedKey.includes('\n')
      });

      adminApp = initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: formattedKey,
        }),
        projectId: projectId,
        databaseURL: `https://${projectId}.firebaseio.com`
      });
    } else {
      console.log('Using existing Firebase Admin app');
      adminApp = apps[0];
    }

    adminDb = getFirestore(adminApp);
    console.log('Firebase Admin initialized successfully');
  } catch (error: any) {
    console.error('Failed to initialize Firebase Admin:', {
      message: error?.message,
      code: error?.code,
      stack: error?.stack
    });
  }
} else {
  console.warn('Firebase Admin credentials not found. Missing:', {
    projectId: !projectId,
    clientEmail: !clientEmail,
    privateKey: !privateKey
  });
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
