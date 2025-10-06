import { NextResponse } from "next/server";
import { getGoogleMapsApiKey } from '@/lib/firebase/admin';

export async function GET() {
  try {
    console.log('Fetching API key...');
    const apiKey = await getGoogleMapsApiKey();

    if (!apiKey) {
      return NextResponse.json({ key: null }, { status: 200 });
    }

    return NextResponse.json({ key: apiKey }, { status: 200 });
  } catch (error: any) {
    console.error('Failed to fetch API key:', error);
    return NextResponse.json(
      { error: "SERVER_ERROR", detail: error?.message || "Failed to fetch API key" },
      { status: 500 }
    );
  }
}
