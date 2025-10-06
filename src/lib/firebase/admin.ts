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

/**
 * Generates a JWT for Firebase Authentication using service account credentials
 */
async function generateFirebaseJWT(): Promise<string> {
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing Firebase credentials');
  }

  // Create JWT header
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  // Create JWT payload
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore'
  };

  // Encode header and payload
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  // Import the crypto module (Node.js built-in)
  const crypto = await import('crypto');

  // Format the private key
  const formattedKey = privateKey.replace(/\\n/g, '\n');

  // Sign the JWT
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signatureInput);
  sign.end();
  const signature = sign.sign(formattedKey, 'base64url');

  return `${signatureInput}.${signature}`;
}

/**
 * Exchanges JWT for an access token
 */
async function getAccessToken(): Promise<string> {
  const jwt = await generateFirebaseJWT();

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get access token: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

export async function getGoogleMapsApiKey(): Promise<string | null> {
  if (!projectId) {
    console.warn('Firebase project ID not found');
    return null;
  }

  try {
    console.log('Getting access token to read API key...');
    const accessToken = await getAccessToken();

    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/googleMaps`;

    console.log('Fetching API key from Firestore...');
    const response = await fetch(firestoreUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log('No API key found in Firestore');
        return null;
      }
      const error = await response.text();
      throw new Error(`Firestore API error: ${error}`);
    }

    const data = await response.json();
    const apiKey = data.fields?.apiKey?.stringValue || null;

    console.log('API key fetched successfully:', !!apiKey);
    return apiKey;
  } catch (error: any) {
    console.error('Failed to fetch API key from Firestore:', {
      message: error?.message,
      stack: error?.stack
    });
    return null;
  }
}

export { adminDb };
