import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken, hasAllowedRole } from '@/lib/firebase/admin';
import { rateLimit, rateLimitConfigs, getClientIP, rateLimitHeaders } from '@/lib/rate-limit';

const ALLOWED_ROLES = ['admin', 'gestor', 'socio'];

/**
 * Generates a JWT for Firebase Authentication using service account credentials
 */
async function generateFirebaseJWT(): Promise<string> {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

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

/**
 * Saves API key to Firestore using REST API
 */
async function saveApiKeyToFirestore(key: string): Promise<void> {
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (!projectId) {
    throw new Error('Missing Firebase project ID');
  }

  try {
    console.log('Getting access token...');
    const accessToken = await getAccessToken();
    console.log('Access token obtained successfully');

    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/googleMaps`;

    console.log('Attempting to save API key to Firestore...');
    const response = await fetch(firestoreUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          apiKey: { stringValue: key },
          updatedAt: { stringValue: new Date().toISOString() }
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Firestore API error: ${error}`);
    }

    console.log('API key saved successfully to Firestore');
  } catch (error: any) {
    console.error('Failed to save API key to Firestore:', {
      message: error?.message,
      stack: error?.stack
    });
    throw new Error(`Could not save API key to database: ${error?.message || 'Unknown error'}`);
  }
}


export async function POST(req: NextRequest) {
  try {
    // Rate limiting (mais restritivo para escrita)
    const clientIP = getClientIP(req);
    const rateLimitResult = rateLimit(clientIP, rateLimitConfigs.write);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "RATE_LIMIT_EXCEEDED", detail: "Muitas requisições. Tente novamente em alguns segundos." },
        { status: 429, headers: rateLimitHeaders(rateLimitResult) }
      );
    }

    // Verificar autenticação
    const authHeader = req.headers.get('Authorization');
    const user = await verifyAuthToken(authHeader);

    if (!user) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", detail: "Token de autenticação inválido ou ausente" },
        { status: 401 }
      );
    }

    // Verificar se tem permissão
    if (!hasAllowedRole(user.role, ALLOWED_ROLES)) {
      return NextResponse.json(
        { error: "FORBIDDEN", detail: "Você não tem permissão para acessar este recurso" },
        { status: 403 }
      );
    }

    const { key } = await req.json() as { key: string };

    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: "API key is required and must be a string." }, { status: 400 });
    }

    // Attempt to validate the key by making a simple request to a Google Maps API endpoint
    // We use the Directions API here as it's a server-side API.
    const validationUrl = `https://routes.googleapis.com/directions/v2:computeRoutes`;
    const validationResponse = await fetch(validationUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'routes.duration' // Request minimal data
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: 37.422, longitude: -122.084 } } },
        destination: { location: { latLng: { latitude: 37.422, longitude: -122.084 } } },
        travelMode: 'DRIVE'
      })
    });
    
    const validationBody = await validationResponse.json();

    // Check if the API key is invalid
    if (validationResponse.status === 403 || (validationBody.error && validationBody.error.message.includes("API key not valid"))) {
       return NextResponse.json({ error: "VALIDATION_FAILED", detail: "A chave de API do Google Maps fornecida é inválida ou não tem as permissões necessárias (Directions API)." }, { status: 400 });
    }
    
    // Check for other non-OK statuses that aren't explicit "invalid key" errors
    if (!validationResponse.ok) {
        console.warn("Google Maps API key validation returned a non-OK status, but it may still be partially valid.", validationBody);
    }
    
    // If validation is successful (or not definitively a failure), save the key to Firestore
    await saveApiKeyToFirestore(key);

    return NextResponse.json({ message: "API key saved and validated successfully." });

  } catch (e: any) {
    console.error("Failed to save or validate API key:", e);
    return NextResponse.json({ error: "SERVER_ERROR", detail: e?.message || "An unknown error occurred." }, { status: 500 });
  }
}
