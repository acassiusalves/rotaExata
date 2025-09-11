import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { key } = await req.json() as { key: string };

    if (!key) {
      return NextResponse.json({ error: "API key is required" }, { status: 400 });
    }

    // !! SECURITY WARNING !!
    // In a real application, you should NEVER expose an endpoint that writes to .env files.
    // API keys should be set as environment variables in your hosting provider's dashboard.
    // This endpoint is for demonstration purposes only and does not actually save the key.
    console.log(`Received API Key to save (simulation): ${key.substring(0, 5)}...`);
    
    // Simulate a successful save
    return NextResponse.json({ message: "API key saved successfully (simulation)." });

  } catch (e: any) {
    console.error("Failed to save API key:", e);
    return NextResponse.json({ error: "SERVER_ERROR", detail: e?.message }, { status: 500 });
  }
}
