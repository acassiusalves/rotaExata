import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';

// Initialize Firebase Admin only if credentials are available
let adminDb: FirebaseFirestore.Firestore | null = null;
let adminApp: App | null = null;
let adminAuth: Auth | null = null;

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (projectId && clientEmail && privateKey) {
  try {
    // Check if app already exists
    const apps = getApps();
    if (apps.length === 0) {
      // Replace escaped newlines with actual newlines
      const formattedKey = privateKey.replace(/\\n/g, '\n');

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
      adminApp = apps[0];
    }

    adminDb = getFirestore(adminApp);
    adminAuth = getAuth(adminApp);
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Failed to initialize Firebase Admin:', err.message);
  }
} else {
  console.warn('Firebase Admin credentials not found');
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
    return null;
  }

  try {
    const accessToken = await getAccessToken();

    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/googleMaps`;

    const response = await fetch(firestoreUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      const error = await response.text();
      throw new Error(`Firestore API error: ${error}`);
    }

    const data = await response.json();
    const apiKey = data.fields?.apiKey?.stringValue || null;

    return apiKey;
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Failed to fetch API key from Firestore:', err.message);
    return null;
  }
}

/**
 * Verifica o token de autenticação e retorna os dados do usuário
 * @param authHeader - Header Authorization (Bearer token)
 * @returns Dados do usuário decodificado ou null se inválido
 */
export async function verifyAuthToken(authHeader: string | null): Promise<{
  uid: string;
  email?: string;
  role?: string;
} | null> {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  if (!adminAuth || !adminDb) {
    return null;
  }

  try {
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);

    // Buscar role do usuário no Firestore
    const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();

    return {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: userData?.role,
    };
  } catch {
    return null;
  }
}

/**
 * Verifica se o usuário tem uma das roles permitidas
 */
export function hasAllowedRole(userRole: string | undefined, allowedRoles: string[]): boolean {
  return userRole ? allowedRoles.includes(userRole) : false;
}

export { adminDb, adminAuth };
