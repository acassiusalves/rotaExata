import { NextResponse } from "next/server";
import { getGoogleMapsApiKey } from '@/lib/firebase/admin';

export async function POST(req: Request) {
  try {
    const { origin, destination } = await req.json() as {
      origin: { lat: number; lng: number };
      destination: { lat: number; lng: number };
    };

    // Get API key from Firestore or fallback to env variable
    const apiKey = await getGoogleMapsApiKey() || process.env.GMAPS_SERVER_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "API_KEY_NOT_CONFIGURED", detail: "Google Maps API key not configured" }, { status: 500 });
    }

    const r = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        // traga só o necessário (barato e rápido)
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs"
      },
      body: JSON.stringify({
        origin:      { location: { latLng: origin } },
        destination: { location: { latLng: destination } },
        travelMode: "DRIVE",
        languageCode: "pt-BR",
        regionCode: "BR",
        polylineQuality: "OVERVIEW",
      }),
      cache: "no-store",
    });

    if (!r.ok) {
      const t = await r.text();
      return NextResponse.json({ error: "ROUTES_ERROR", detail: t }, { status: 502 });
    }

    const data = await r.json();
    const route = data?.routes?.[0];
    return NextResponse.json({
      distanceMeters: route?.distanceMeters ?? 0,
      duration: route?.duration ?? "0s",
      encodedPolyline: route?.polyline?.encodedPolyline ?? "",
      legs: route?.legs ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: "SERVER_ERROR", detail: e?.message }, { status: 500 });
  }
}
