import { NextResponse } from "next/server";
import { getGoogleMapsApiKey } from '@/lib/firebase/admin';
import { rateLimit, rateLimitConfigs, getClientIP, rateLimitHeaders } from '@/lib/rate-limit';
import { cacheGet, cacheSet, routeCacheKey } from '@/lib/cache';

// Tipo do resultado da rota
interface RouteResult {
  distanceMeters: number;
  duration: string;
  encodedPolyline: string;
  legs: unknown[];
}

// TTL do cache em segundos (5 minutos)
const CACHE_TTL = 300;

export async function POST(req: Request) {
  try {
    // Rate limiting
    const clientIP = getClientIP(req);
    const rateLimitResult = rateLimit(clientIP, rateLimitConfigs.authenticated);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "RATE_LIMIT_EXCEEDED", detail: "Muitas requisições. Tente novamente em alguns segundos." },
        { status: 429, headers: rateLimitHeaders(rateLimitResult) }
      );
    }

    const { origin, destination } = await req.json() as {
      origin: { lat: number; lng: number };
      destination: { lat: number; lng: number };
    };

    // Verificar cache
    const cacheKey = routeCacheKey(origin, destination);
    const cached = cacheGet<RouteResult>(cacheKey);
    if (cached) {
      return NextResponse.json(cached, {
        headers: { 'X-Cache': 'HIT' }
      });
    }

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
    const result: RouteResult = {
      distanceMeters: route?.distanceMeters ?? 0,
      duration: route?.duration ?? "0s",
      encodedPolyline: route?.polyline?.encodedPolyline ?? "",
      legs: route?.legs ?? [],
    };

    // Salvar no cache
    cacheSet(cacheKey, result, CACHE_TTL);

    return NextResponse.json(result, {
      headers: { 'X-Cache': 'MISS' }
    });
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: "SERVER_ERROR", detail: errorMessage }, { status: 500 });
  }
}
