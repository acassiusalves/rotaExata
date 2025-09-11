"use client";
import * as React from "react";
import { Loader } from "@googlemaps/js-api-loader";
import type { PlaceValue } from "@/lib/types";

type LatLng = { lat: number; lng: number };

export function RouteMap({
  origin,
  destination,
  stops,
  encodedPolyline,
  height = 360,
}: {
  origin?: LatLng | null;
  destination?: LatLng | null;
  stops?: PlaceValue[];
  encodedPolyline?: string | null;
  height?: number;
}) {
  const divRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<google.maps.Map | null>(null);
  const markersRef = React.useRef<google.maps.Marker[]>([]);
  const polyRef = React.useRef<google.maps.Polyline | null>(null);

  React.useEffect(() => {
    let canceled = false;
    const loader = new Loader({
      apiKey: process.env.NEXT_PUBLIC_GMAPS_KEY!,
      libraries: ["places", "geometry", "geocoding"],
      language: "pt-BR",
      region: "BR",
    });

    loader.load().then(() => {
      if (canceled || !divRef.current) return;
      mapRef.current = new google.maps.Map(divRef.current, {
        center: { lat: -16.6869, lng: -49.2648 },
        zoom: 12,
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false,
      });
    });

    return () => { canceled = true; };
  }, []);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // limpa marcadores e polyline
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    if (polyRef.current) { polyRef.current.setMap(null); polyRef.current = null; }

    const bounds = new google.maps.LatLngBounds();

    if (origin) {
      const m = new google.maps.Marker({ map, position: origin, label: "O" });
      markersRef.current.push(m);
      bounds.extend(m.getPosition()!);
    }

    stops?.forEach((stop, index) => {
        if (stop.lat && stop.lng) {
            const m = new google.maps.Marker({ map, position: stop, label: (index + 1).toString() });
            markersRef.current.push(m);
            bounds.extend(m.getPosition()!);
        }
    });

    if (destination) {
      const m = new google.maps.Marker({ map, position: destination, label: "D" });
      markersRef.current.push(m);
      bounds.extend(m.getPosition()!);
    }

    if (encodedPolyline) {
      const path = google.maps.geometry.encoding.decodePath(encodedPolyline);
      polyRef.current = new google.maps.Polyline({ map, path, strokeColor: '#2962FF' });
      path.forEach(p => bounds.extend(p));
    }

    if (markersRef.current.length > 0) {
        map.fitBounds(bounds);
    } 
    if (markersRef.current.length === 1) {
        map.setCenter(bounds.getCenter());
        map.setZoom(15);
    }

  }, [origin, destination, stops, encodedPolyline]);
  
  const mapStyle: React.CSSProperties = height === -1 ? { height: '100%', width: '100%' } : { height, width: '100%' };

  return <div ref={divRef} style={mapStyle} className="w-full rounded-lg border" />;
}
