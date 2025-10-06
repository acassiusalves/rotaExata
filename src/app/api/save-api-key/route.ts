import { NextResponse } from "next/server";
import { adminDb } from '@/lib/firebase/admin';

async function saveApiKeyToFirestore(key: string): Promise<void> {
  if (!adminDb) {
    throw new Error('Firebase Admin not initialized. Please configure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY environment variables.');
  }

  try {
    console.log('Attempting to save API key to Firestore...');
    await adminDb.collection('settings').doc('googleMaps').set({
      apiKey: key,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    console.log('API key saved successfully to Firestore');
  } catch (error: any) {
    console.error('Failed to save API key to Firestore:', {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      stack: error?.stack
    });
    throw new Error(`Could not save API key to database: ${error?.message || 'Unknown error'}`);
  }
}


export async function POST(req: Request) {
  try {
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
