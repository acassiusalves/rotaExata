"use client";
import * as React from "react";
import { Loader } from "@googlemaps/js-api-loader";
import type { PlaceValue, RouteInfo } from "@/lib/types";

// Função para gerar o conteúdo HTML do InfoWindow
const createInfoWindowContent = (stop: PlaceValue, index: number): string => {
  const address = stop.address || stop.formattedAddress || stop.addressString || '--';
  return `
    <div style="font-family: Inter, sans-serif; font-size: 14px; color: #333; max-width: 280px; padding: 4px;">
      <h4 style="font-weight: 600; font-size: 16px; margin: 0 0 12px 0;">Parada ${index + 1}</h4>
      <div style="display: grid; grid-template-columns: 90px 1fr; gap: 8px;">
        <span style="color: #666;">Cliente:</span>
        <strong style="color: #000;">${stop.customerName || '--'}</strong>

        <span style="color: #666;">Pedido Nº:</span>
        <span>${stop.orderNumber || '--'}</span>

        <span style="color: #666;">Telefone:</span>
        <span>${stop.phone || '--'}</span>

        <span style="color: #666;">Janela:</span>
        <span>${stop.timeWindowStart && stop.timeWindowEnd ? `${stop.timeWindowStart} - ${stop.timeWindowEnd}` : '--'}</span>

        <span style="color: #666; align-self: start;">Endereço:</span>
        <p style="margin: 0; word-break: break-word;">${address}</p>

        <span style="color: #666; align-self: start;">Obs:</span>
        <p style="margin: 0; word-break: break-word; font-style: italic;">${stop.notes || '--'}</p>
      </div>
    </div>
  `;
};


export function RouteMap({
  origin,
  stops,
  routes,
  height = 360,
}: {
  origin?: PlaceValue | null;
  stops?: PlaceValue[];
  routes?: RouteInfo[];
  height?: number;
}) {
  const divRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<google.maps.Map | null>(null);
  const markersRef = React.useRef<google.maps.Marker[]>([]);
  const polylinesRef = React.useRef<google.maps.Polyline[]>([]);
  const activeInfoWindowRef = React.useRef<google.maps.InfoWindow | null>(null);


  React.useEffect(() => {
    let canceled = false;
    const loader = new Loader({
      apiKey: process.env.NEXT_PUBLIC_GMAPS_KEY!,
      libraries: ["places", "geometry", "geocoding", "marker"],
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
        mapId: '4a356a5009a25b81' // A custom map ID with no POIs
      });
    });

    return () => { canceled = true; };
  }, []);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear previous elements
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];
    activeInfoWindowRef.current?.close();
    activeInfoWindowRef.current = null;


    const bounds = new google.maps.LatLngBounds();

    // Add origin marker
    if (origin) {
      const originMarker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: origin,
        content: new google.maps.marker.PinElement({
          background: '#111827', // dark-gray
          borderColor: '#F9FAFB', // near-white for contrast
          glyph: new URL('https://fonts.gstatic.com/s/i/googlematerialicons/home/v15/24px.svg'),
          glyphColor: '#FFFFFF',
        }).element,
        title: "Origem"
      });
      markersRef.current.push(originMarker as any); // cast because of type mismatch
      bounds.extend(origin);
    }
    
    // Handle multiple routes with different colors
    if (routes && routes.length > 0) {
        routes.forEach(route => {
            if (route.stops) {
                route.stops.forEach((stop, index) => {
                    if (stop.lat && stop.lng) {
                        const marker = new google.maps.marker.AdvancedMarkerElement({
                            map,
                            position: stop,
                            content: new google.maps.marker.PinElement({
                                background: route.color,
                                borderColor: '#FFFFFF',
                                glyph: `${index + 1}`,
                                glyphColor: '#FFFFFF',
                            }).element,
                            title: `Parada ${index + 1}: ${stop.customerName}`
                        });

                        const infoWindow = new google.maps.InfoWindow({
                            content: createInfoWindowContent(stop, index)
                        });

                        marker.addListener('click', () => {
                            activeInfoWindowRef.current?.close();
                            infoWindow.open(map, marker as any);
                            activeInfoWindowRef.current = infoWindow;
                        });

                        markersRef.current.push(marker as any);
                        bounds.extend(stop);
                    }
                });
            }
            if (route.encodedPolyline) {
                 const path = google.maps.geometry.encoding.decodePath(route.encodedPolyline);
                 const poly = new google.maps.Polyline({ map, path, strokeColor: route.color, strokeWeight: 5, strokeOpacity: 0.8 });
                 polylinesRef.current.push(poly);
                 path.forEach(p => bounds.extend(p));
            }
        });
    } else if (stops) { // Fallback for single list of stops
       stops.forEach((stop, index) => {
        if (stop.lat && stop.lng) {
             const marker = new google.maps.marker.AdvancedMarkerElement({
                map,
                position: stop,
                content: new google.maps.marker.PinElement({
                    glyph: `${index + 1}`,
                }).element
            });

            const infoWindow = new google.maps.InfoWindow({
                content: createInfoWindowContent(stop, index)
            });

            marker.addListener('click', () => {
                activeInfoWindowRef.current?.close();
                infoWindow.open(map, marker as any);
                activeInfoWindowRef.current = infoWindow;
            });

            markersRef.current.push(marker as any);
            bounds.extend(stop);
        }
    });
    }


    if (!bounds.isEmpty()) {
        map.fitBounds(bounds, 100); // 100px padding
    }

  }, [origin, stops, routes]);
  
  const mapStyle: React.CSSProperties = height === -1 ? { height: '100%', width: '100%' } : { height, width: '100%' };

  return <div ref={divRef} style={mapStyle} className="w-full rounded-lg border" />;
}
