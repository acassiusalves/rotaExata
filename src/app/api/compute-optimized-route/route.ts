import { NextResponse } from 'next/server';
import type { PlaceValue } from '@/lib/types';

// Define the structure for a leg in the Google Directions API response
interface RouteLeg {
  distanceMeters: number;
  duration: string;
  polyline: {
    encodedPolyline: string;
  };
}

export async function POST(req: Request) {
  try {
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
          'X-Goog-Api-Key': process.env.GMAPS_SERVER_KEY!,
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

    return NextResponse.json({
      stops: stops, // Return the original stops for reference
      encodedPolyline: route?.polyline?.encodedPolyline ?? '',
      distanceMeters: route?.distanceMeters ?? 0,
      duration: route?.duration ?? '0s',
    });
  } catch (e: any) {
    console.error('Server Error in compute-optimized-route:', e);
    return NextResponse.json(
      { error: 'SERVER_ERROR', detail: e?.message },
      { status: 500 }
    );
  }
}
