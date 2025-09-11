import { NextResponse } from "next/server";
import { promises as fs } from 'fs';
import path from 'path';

// !! SECURITY WARNING !!
// This is a simplified example to demonstrate the concept.
// In a real-world, production application, you should:
// 1. NEVER write API keys to the .env file from a public endpoint. This is a major security risk.
// 2. Store secrets in a secure vault or a dedicated secret management service (like Google Secret Manager, AWS Secrets Manager, or a secure database).
// 3. Authenticate and authorize this endpoint properly to ensure only admins can change keys.

async function setEnvVar(key: string, value: string): Promise<void> {
    const envFilePath = path.resolve(process.cwd(), '.env');
    try {
        let envFileContent = await fs.readFile(envFilePath, 'utf8');
        
        const keyRegex = new RegExp(`^${key}=.*$`, 'm');
        const newEntry = `${key}="${value}"`;

        if (keyRegex.test(envFileContent)) {
            // Key exists, replace it
            envFileContent = envFileContent.replace(keyRegex, newEntry);
        } else {
            // Key doesn't exist, add it
            envFileContent += `\n${newEntry}`;
        }

        await fs.writeFile(envFilePath, envFileContent, 'utf8');
        
    } catch (error: any) {
        // If the file doesn't exist, create it.
        if (error.code === 'ENOENT') {
            await fs.writeFile(envFilePath, `${key}="${value}"\n`, 'utf8');
        } else {
            console.error('Failed to write to .env file:', error);
            throw new Error('Could not write to environment file.');
        }
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
    
    // If validation is successful (or not definitively a failure), save the key.
    // ** THIS IS THE INSECURE PART FOR DEMONSTRATION ONLY **
    await setEnvVar('GMAPS_SERVER_KEY', key);
    // We also set the public key here for client-side map rendering convenience.
    await setEnvVar('NEXT_PUBLIC_GMAPS_KEY', key);

    return NextResponse.json({ message: "API key saved and validated successfully." });

  } catch (e: any) {
    console.error("Failed to save or validate API key:", e);
    return NextResponse.json({ error: "SERVER_ERROR", detail: e?.message || "An unknown error occurred." }, { status: 500 });
  }
}
