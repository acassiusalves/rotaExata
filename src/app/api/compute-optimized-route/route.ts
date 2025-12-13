import { NextResponse } from 'next/server';
import type { PlaceValue } from '@/lib/types';
import { getGoogleMapsApiKey } from '@/lib/firebase/admin';
import { rateLimit, rateLimitConfigs, getClientIP, rateLimitHeaders } from '@/lib/rate-limit';
import { cacheGet, cacheSet, optimizedRouteCacheKey } from '@/lib/cache';

// Define the structure for a leg in the Google Directions API response
interface RouteLeg {
  distanceMeters: number;
  duration: string;
  polyline: {
    encodedPolyline: string;
  };
}

// Tipo do resultado
interface OptimizedRouteResult {
  stops: PlaceValue[];
  encodedPolyline: string;
  distanceMeters: number;
  duration: string;
}

// TTL do cache em segundos (3 minutos - menor por usar TRAFFIC_AWARE)
const CACHE_TTL = 180;

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

    const { origin, stops } = (await req.json()) as {
      origin: PlaceValue;
      stops: PlaceValue[];
    };

    if (!stops || stops.length === 0) {
      return NextResponse.json({
        stops: [],
        encodedPolyline: '',
        distanceMeters: 0,
        duration: '0s',
      });
    }

    // Verificar cache
    const cacheKey = optimizedRouteCacheKey(origin, stops);
    const cached = cacheGet<OptimizedRouteResult>(cacheKey);
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

    const waypoints = stops.map((stop) => ({
      location: { latLng: { latitude: stop.lat, longitude: stop.lng } },
    }));

    // The last stop is the destination
    const destination = waypoints.pop();

    const r = await fetch(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask':
            'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
          destination: destination,
          intermediates: waypoints,
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_AWARE',
          polylineQuality: 'HIGH_QUALITY',
          computeAlternativeRoutes: false,
        }),
        cache: 'no-store',
      }
    );

    if (!r.ok) {
      const t = await r.text();
      console.error('Google Routes API Error:', t);
      return NextResponse.json(
        { error: 'ROUTES_API_ERROR', detail: t },
        { status: 502 }
      );
    }

    const data = await r.json();
    const route = data?.routes?.[0];

    const result: OptimizedRouteResult = {
      stops: stops,
      encodedPolyline: route?.polyline?.encodedPolyline ?? '',
      distanceMeters: route?.distanceMeters ?? 0,
      duration: route?.duration ?? '0s',
    };

    // Salvar no cache
    cacheSet(cacheKey, result, CACHE_TTL);

    return NextResponse.json(result, {
      headers: { 'X-Cache': 'MISS' }
    });
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    console.error('Server Error in compute-optimized-route:', e);
    return NextResponse.json(
      { error: 'SERVER_ERROR', detail: errorMessage },
      { status: 500 }
    );
  }
}
