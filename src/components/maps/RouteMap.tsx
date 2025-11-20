
"use client";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { Loader } from "@googlemaps/js-api-loader";
import type { PlaceValue, RouteInfo, DriverLocation, DriverLocationWithInfo } from "@/lib/types";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DriverLocationPulse } from "./DriverLocationPulse";

export type RouteMapHandle = {
  openStopInfo: (stopId: string) => void;
  centerOnLocation: (lat: number, lng: number, zoom?: number) => void;
};

// Função para gerar o conteúdo HTML do InfoWindow
const createInfoWindowContent = (
  stop: PlaceValue,
  index?: number,
  onRemove?: () => void,
  onEdit?: () => void
): string => {
  const address = stop.address || stop.addressString || '--';
  const title = index !== undefined ? `Parada ${index + 1}` : 'Serviço Avulso';
  const stopId = String(stop.id ?? stop.placeId ?? index);

  // Status badge
  let statusBadge = '';
  if (stop.deliveryStatus === 'completed') {
    statusBadge = '<div style="display: inline-block; background: #22c55e; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; margin-bottom: 12px;">✓ ENTREGUE</div>';
  } else if (stop.deliveryStatus === 'failed') {
    statusBadge = '<div style="display: inline-block; background: #ef4444; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; margin-bottom: 12px;">✗ FALHOU</div>';
  } else if (stop.deliveryStatus === 'arrived') {
    statusBadge = '<div style="display: inline-block; background: #3b82f6; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; margin-bottom: 12px;">↓ CHEGOU</div>';
  } else if (stop.deliveryStatus === 'en_route') {
    statusBadge = '<div style="display: inline-block; background: #f59e0b; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; margin-bottom: 12px;">→ A CAMINHO</div>';
  }

  return `
    <div style="font-family: Inter, sans-serif; font-size: 14px; color: #333; max-width: 280px; padding: 4px;">
      <h4 style="font-weight: 600; font-size: 16px; margin: 0 0 8px 0;">${title}</h4>
      ${statusBadge}
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

        <span style="color: #666; align-self: start;">Complemento:</span>
        <p style="margin: 0; word-break: break-word;">${stop.complemento || '--'}</p>

        <span style="color: #666; align-self: start;">Obs:</span>
        <p style="margin: 0; word-break: break-word; font-style: italic;">${stop.notes || '--'}</p>
      </div>

      <div style="display: flex; justify-content: space-between; margin-top: 16px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
        <button
          data-action="remove"
          data-stop-id="${stopId}"
          style="padding: 0; background: none; border: none; color: #ef4444; cursor: pointer; font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;"
          onmouseover="this.style.textDecoration='underline'"
          onmouseout="this.style.textDecoration='none'"
        >
          Remover da Rota
        </button>
        <button
          data-action="edit"
          data-stop-id="${stopId}"
          style="padding: 0; background: none; border: none; color: #3b82f6; cursor: pointer; font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;"
          onmouseover="this.style.textDecoration='underline'"
          onmouseout="this.style.textDecoration='none'"
        >
          Editar
        </button>
      </div>
    </div>
  `;
};

// Função para gerar o conteúdo HTML do InfoWindow do motorista
const createDriverInfoWindowContent = (
  driverName: string,
  timestamp: Date,
  driverId: string
): string => {
  const formattedDate = format(timestamp, "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR });
  const minutesAgo = Math.floor((Date.now() - timestamp.getTime()) / 1000 / 60);
  const timeAgoText = minutesAgo < 1 ? 'agora mesmo' :
                     minutesAgo === 1 ? 'há 1 minuto' :
                     minutesAgo < 60 ? `há ${minutesAgo} minutos` :
                     `há ${Math.floor(minutesAgo / 60)}h${minutesAgo % 60}min`;

  // Warning indicator if location is stale (> 30 minutes)
  const isStale = minutesAgo > 30;
  const warningBadge = isStale ? `
    <div style="background: #fef3c7; border: 1px solid #f59e0b; color: #92400e; padding: 6px 10px; border-radius: 6px; font-size: 12px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
      <span style="font-weight: 500;">Localização desatualizada</span>
    </div>
  ` : '';

  return `
    <div style="font-family: Inter, sans-serif; font-size: 14px; color: #333; max-width: 300px; padding: 4px;">
      <h4 style="font-weight: 600; font-size: 16px; margin: 0 0 8px 0;">🚚 Motorista</h4>
      ${warningBadge}
      <div style="display: grid; grid-template-columns: 110px 1fr; gap: 8px; margin-bottom: 12px;">
        <span style="color: #666;">Nome:</span>
        <strong style="color: #000;">${driverName}</strong>

        <span style="color: #666;">Última atualização:</span>
        <div>
          <div style="color: #000; font-weight: 500;">${timeAgoText}</div>
          <div style="color: #999; font-size: 12px;">${formattedDate}</div>
        </div>
      </div>
      <button
        data-action="refresh-location"
        data-driver-id="${driverId}"
        style="
          width: 100%;
          padding: 8px 12px;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: background 0.2s;
        "
        onmouseover="this.style.background='#2563eb'"
        onmouseout="this.style.background='#3b82f6'"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
        </svg>
        <span>Atualizar Localização</span>
      </button>
    </div>
  `;
};

type Props = {
  origin?: PlaceValue | null;
  stops?: PlaceValue[];
  routes?: RouteInfo[];
  unassignedStops?: PlaceValue[];
  height?: number;
  driverLocation?: { lat: number; lng: number; heading?: number };
  driverLocations?: DriverLocationWithInfo[];
  onRemoveStop?: (stopId: string) => void;
  onEditStop?: (stopId: string) => void;
  onRefreshDriverLocation?: (driverId: string) => void;
  highlightedStopIds?: string[];
};

export const RouteMap = React.forwardRef<RouteMapHandle, Props>(function RouteMap(
  { origin, stops, routes, unassignedStops, height = 360, driverLocation, driverLocations, onRemoveStop, onEditStop, onRefreshDriverLocation, highlightedStopIds = [] }: Props,
  ref
) {
  const divRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<google.maps.Map | null>(null);
  const markersRef = React.useRef<google.maps.Marker[]>([]);
  const polylinesRef = React.useRef<google.maps.Polyline[]>([]);
  const activeInfoWindowRef = React.useRef<google.maps.InfoWindow | null>(null);
  const driverMarkerRef = React.useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const driverMarkersRef = React.useRef<Map<string, google.maps.marker.AdvancedMarkerElement>>(new Map());
  const driverInfoWindowsRef = React.useRef<Map<string, google.maps.InfoWindow>>(new Map());
  const entriesRef = React.useRef<Map<string, { marker: any; info: google.maps.InfoWindow }>>(
    new Map()
  );
  const hasInitializedBoundsRef = React.useRef<boolean>(false);
  const previousRoutesDataRef = React.useRef<string>('');
  const previousCountCheckRef = React.useRef<string>('');
  const previousDriverLocationsRef = React.useRef<string>('');

  React.useImperativeHandle(ref, () => ({
    openStopInfo: (stopId: string) => {
      const entry = entriesRef.current.get(String(stopId));
      if (entry && mapRef.current) {
        activeInfoWindowRef.current?.close();
        entry.info.open(mapRef.current, entry.marker);
        activeInfoWindowRef.current = entry.info;
      }
    },
    centerOnLocation: (lat: number, lng: number, zoom = 15) => {
      if (mapRef.current) {
        mapRef.current.setCenter({ lat, lng });
        mapRef.current.setZoom(zoom);
      }
    },
  }));


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

      // Uber-style light map theme - minimalista e clean
      const uberLightStyles = [
        { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
        {
          featureType: "administrative.locality",
          elementType: "labels.text.fill",
          stylers: [{ color: "#424242" }]
        },
        {
          featureType: "poi",
          elementType: "labels.text.fill",
          stylers: [{ color: "#757575" }]
        },
        {
          featureType: "poi.park",
          elementType: "geometry",
          stylers: [{ color: "#e5f5e0" }]
        },
        {
          featureType: "poi.park",
          elementType: "labels.text.fill",
          stylers: [{ color: "#4caf50" }]
        },
        {
          featureType: "road",
          elementType: "geometry",
          stylers: [{ color: "#ffffff" }]
        },
        {
          featureType: "road",
          elementType: "geometry.stroke",
          stylers: [{ color: "#e0e0e0" }]
        },
        {
          featureType: "road",
          elementType: "labels.text.fill",
          stylers: [{ color: "#9e9e9e" }]
        },
        {
          featureType: "road.highway",
          elementType: "geometry",
          stylers: [{ color: "#ffffff" }]
        },
        {
          featureType: "road.highway",
          elementType: "geometry.stroke",
          stylers: [{ color: "#bdbdbd" }]
        },
        {
          featureType: "road.highway",
          elementType: "labels.text.fill",
          stylers: [{ color: "#616161" }]
        },
        {
          featureType: "transit",
          elementType: "geometry",
          stylers: [{ color: "#e0e0e0" }]
        },
        {
          featureType: "transit.station",
          elementType: "labels.text.fill",
          stylers: [{ color: "#757575" }]
        },
        {
          featureType: "water",
          elementType: "geometry",
          stylers: [{ color: "#c9e8fb" }]
        },
        {
          featureType: "water",
          elementType: "labels.text.fill",
          stylers: [{ color: "#2196f3" }]
        },
        {
          featureType: "water",
          elementType: "labels.text.stroke",
          stylers: [{ color: "#ffffff" }]
        }
      ];

      mapRef.current = new google.maps.Map(divRef.current, {
        center: { lat: -16.6869, lng: -49.2648 },
        zoom: 12,
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false,
        styles: uberLightStyles,
        mapId: '4a356a5009a25b81' // A custom map ID with no POIs
      });

      // Adicionar listener para fechar InfoWindow ao clicar no mapa
      mapRef.current.addListener('click', () => {
        if (activeInfoWindowRef.current) {
          activeInfoWindowRef.current.close();
          activeInfoWindowRef.current = null;
        }
      });
    });

    return () => { canceled = true; };
  }, []);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !(map instanceof google.maps.Map)) {
      console.warn('⚠️ Map not ready or invalid instance');
      return;
    }

    // Only clear and redraw when data actually changes
    const currentRoutesDataCheck = JSON.stringify({
      originLat: origin?.lat,
      originLng: origin?.lng,
      stopsCount: stops?.length || 0,
      routesData: routes?.map(r => ({
        stopsCount: r.stops.length,
        visible: r.visible,
        color: r.color,
        name: r.name,
        stops: r.stops.map(s => ({
          id: s.id,
          lat: s.lat,
          lng: s.lng,
          address: s.address
        }))
      })),
      unassignedCount: unassignedStops?.length || 0,
      unassignedStops: unassignedStops?.map(s => ({
        id: s.id,
        lat: s.lat,
        lng: s.lng,
        address: s.address
      })),
      highlightedIds: highlightedStopIds.join(',')
    });

    // Skip if data hasn't changed (avoid unnecessary redraws)
    const dataUnchanged = currentRoutesDataCheck === previousRoutesDataRef.current;
    const alreadyInitialized = hasInitializedBoundsRef.current;

    console.log('🗺️ RouteMap useEffect:', {
      dataUnchanged,
      alreadyInitialized,
      willSkip: dataUnchanged && alreadyInitialized,
      routesCount: routes?.length,
      boundsWillBeEmpty: !origin && (!routes || routes.length === 0) && (!stops || stops.length === 0)
    });

    if (dataUnchanged && alreadyInitialized) {
      console.log('⏭️ Skipping redraw - data unchanged');
      return;
    }

    // Clear previous elements
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];
    activeInfoWindowRef.current?.close();
    activeInfoWindowRef.current = null;
    entriesRef.current.clear();


    const bounds = new google.maps.LatLngBounds();

    // Add origin marker
    if (origin && typeof origin.lat === 'number' && typeof origin.lng === 'number' &&
        isFinite(origin.lat) && isFinite(origin.lng)) {
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
    } else if (origin) {
      console.warn('⚠️ Invalid origin coordinates:', origin);
    }
    
    // helper para criar marker+info e indexar por id
    const addStop = (stop: PlaceValue, index?: number, color?: string, isUnassigned = false) => {
      // Validate coordinates
      if (!stop.lat || !stop.lng ||
          typeof stop.lat !== 'number' || typeof stop.lng !== 'number' ||
          !isFinite(stop.lat) || !isFinite(stop.lng)) {
        console.warn(`⚠️ Invalid coordinates for stop:`, stop);
        return;
      }
      const sid = String(stop.id ?? stop.placeId ?? index);
      const isHighlighted = highlightedStopIds.includes(sid);
      const isCompleted = stop.deliveryStatus === 'completed';
      const isFailed = stop.deliveryStatus === 'failed';
      const isNewlyAdded = stop.isNewlyAdded === true;

      // Determinar cor e ícone baseado no status
      let markerBackground = color;
      let markerBorder = "#FFFFFF";
      let markerGlyph = index !== undefined ? `${index + 1}` : '';
      let markerScale = 1;

      if (isHighlighted) {
        markerBackground = '#FFD700';
        markerBorder = '#FF6B00';
        markerGlyph = '★';
        markerScale = 1.5;
      } else if (isCompleted) {
        // Prioridade para entregas concluídas
        markerBackground = '#22c55e'; // Verde para concluído
        markerBorder = '#16a34a';
        markerGlyph = '✓';
      } else if (isFailed) {
        // Prioridade para entregas falhadas
        markerBackground = '#ef4444'; // Vermelho para falha
        markerBorder = '#dc2626';
        markerGlyph = '✗';
      } else if (isNewlyAdded) {
        markerBackground = '#FF6B00'; // Laranja brilhante para recém-adicionados
        markerBorder = '#FFD700';
        markerGlyph = '✨';
        markerScale = 1.3;
      }

      const pinElement = isUnassigned
        ? new google.maps.marker.PinElement({
            background: isHighlighted ? '#FFD700' : (isNewlyAdded ? '#FF6B00' : '#000000'),
            borderColor: isHighlighted ? '#FF6B00' : (isNewlyAdded ? '#FFD700' : '#FFFFFF'),
            glyphColor: isNewlyAdded ? '#FFFFFF' : '#000000',
            scale: isHighlighted ? 1.5 : (isNewlyAdded ? 1.3 : 1),
            glyph: isHighlighted ? '★' : (isNewlyAdded ? '✨' : '')
          })
        : new google.maps.marker.PinElement({
            background: markerBackground,
            borderColor: markerBorder,
            glyph: markerGlyph,
            glyphColor: "#FFFFFF",
            scale: markerScale,
          });

      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: stop,
        content: pinElement.element,
        title: `Parada ${index !== undefined ? index + 1 : 'Avulsa'}: ${stop.customerName ?? ""}`,
        zIndex: isHighlighted ? 1000 : (isNewlyAdded ? 900 : undefined),
      });
      const info = new google.maps.InfoWindow({ content: createInfoWindowContent(stop, index) });

      // Add event listeners for InfoWindow buttons
      google.maps.event.addListener(info, 'domready', () => {
        const removeBtn = document.querySelector(`[data-action="remove"][data-stop-id="${sid}"]`);
        const editBtn = document.querySelector(`[data-action="edit"][data-stop-id="${sid}"]`);

        if (removeBtn) {
          removeBtn.addEventListener('click', () => {
            info.close();
            if (onRemoveStop) {
              onRemoveStop(sid);
            }
          });
        }

        if (editBtn) {
          editBtn.addEventListener('click', () => {
            info.close();
            if (onEditStop) {
              onEditStop(sid);
            }
          });
        }
      });

      marker.addListener("click", () => {
        activeInfoWindowRef.current?.close();
        info.open(map, marker as any);
        activeInfoWindowRef.current = info;
      });

      entriesRef.current.set(sid, { marker: marker as any, info });
      markersRef.current.push(marker as any);
      bounds.extend(stop);
    };
    
    // Handle multiple routes with different colors
    if (routes && routes.length > 0) {
        routes.forEach(route => {
            // Only render if route is visible (defaults to true if not specified)
            const isVisible = route.visible !== false;

            if (isVisible && route.stops) {
                route.stops.forEach((stop, index) => {
                    addStop(stop, index, route.color, false)
                });
            }
            if (isVisible && route.encodedPolyline) {
                 try {
                   const path = google.maps.geometry.encoding.decodePath(route.encodedPolyline);
                   // Validate path coordinates
                   const validPath = path.filter(p => {
                     const lat = typeof p.lat === 'function' ? p.lat() : p.lat;
                     const lng = typeof p.lng === 'function' ? p.lng() : p.lng;
                     return typeof lat === 'number' && typeof lng === 'number' &&
                            isFinite(lat) && isFinite(lng);
                   });

                   if (validPath.length > 0) {
                     const poly = new google.maps.Polyline({
                       map,
                       path: validPath,
                       strokeColor: route.color,
                       strokeWeight: 5,
                       strokeOpacity: 0.8
                     });
                     polylinesRef.current.push(poly);
                     validPath.forEach(p => bounds.extend(p));
                   } else {
                     console.warn(`⚠️ Route ${route.name} has no valid coordinates in polyline`);
                   }
                 } catch (error) {
                   console.error(`Error creating polyline for route ${route.name}:`, error);
                 }
            }
        });
    } else if (stops) { // Fallback for single list of stops
       stops.forEach((stop, index) => {
        addStop(stop, index, undefined, false)
    });
    }

    // Handle unassigned stops with black pins
    if (unassignedStops) {
      console.log('🔵 Rendering unassignedStops:', unassignedStops.length, unassignedStops);
      unassignedStops.forEach(stop => {
        console.log('  🔹 Unassigned stop:', { id: stop.id, isNewlyAdded: stop.isNewlyAdded, address: stop.address });
        addStop(stop, undefined, '#000000', true);
      });
    }

    // Fit bounds to show all routes and stops (only on first load or when count changes)
    const isFirstLoad = !hasInitializedBoundsRef.current;
    const dataChanged = currentRoutesDataCheck !== previousRoutesDataRef.current;

    // Check if only coordinates changed (not the count of stops)
    const currentCountCheck = JSON.stringify({
      stopsCount: stops?.length || 0,
      routesStopsCounts: routes?.map(r => r.stops.length),
      unassignedCount: unassignedStops?.length || 0,
    });
    const countChanged = currentCountCheck !== previousCountCheckRef.current;

    // Only fit bounds on first load or when the number of stops changes
    const shouldFitBounds = isFirstLoad || countChanged;

    console.log('🎯 FitBounds decision:', {
      isFirstLoad,
      dataChanged,
      countChanged,
      shouldFitBounds,
      boundsEmpty: bounds.isEmpty()
    });

    if (!bounds.isEmpty() && shouldFitBounds) {
        // Small delay to ensure map is fully rendered
        requestAnimationFrame(() => {
          console.log('✅ Executing fitBounds with bounds:', bounds.toJSON());
          map.fitBounds(bounds, 100); // 100px padding
        });
        hasInitializedBoundsRef.current = true;
        previousCountCheckRef.current = currentCountCheck;
    }

    // Always update the full data check to trigger marker re-render
    previousRoutesDataRef.current = currentRoutesDataCheck;

  }, [origin, stops, routes, unassignedStops, onRemoveStop, onEditStop, highlightedStopIds]);

  // Update driver location marker (single)
  React.useEffect(() => {
    const map = mapRef.current;

    // Se houver driverLocations (múltiplos), remover o marcador único
    if (driverLocations && driverLocations.length > 0) {
      if (driverMarkerRef.current) {
        driverMarkerRef.current.map = null;
        driverMarkerRef.current = null;
      }
      return;
    }

    if (!map || !driverLocation) {
      if (driverMarkerRef.current) {
        driverMarkerRef.current.map = null;
        driverMarkerRef.current = null;
      }
      return;
    }

    // Create or update driver marker
    if (!driverMarkerRef.current) {
      // Create pulse marker container
      const markerContainer = document.createElement('div');
      markerContainer.style.cursor = 'pointer';
      markerContainer.style.pointerEvents = 'auto';
      const root = createRoot(markerContainer);
      root.render(<DriverLocationPulse size={100} />);

      driverMarkerRef.current = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: driverLocation,
        content: markerContainer,
        title: "Motorista",
      });
    } else {
      // Update position
      driverMarkerRef.current.position = driverLocation;
    }
  }, [driverLocation, driverLocations]);

    // Update multiple driver locations
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !driverLocations || driverLocations.length === 0) {
      // Limpar todos os marcadores múltiplos se não houver dados
      driverMarkersRef.current.forEach((marker) => {
        marker.map = null;
      });
      driverMarkersRef.current.clear();
      driverInfoWindowsRef.current.clear();
      return;
    }

    console.log('🗺️ RouteMap recebeu driverLocations:', driverLocations);

    // Deduplicate driver locations by driverId (keep only the most recent)
    const uniqueDriverLocations = new Map<string, DriverLocationWithInfo>();
    driverLocations.forEach(loc => {
      const existing = uniqueDriverLocations.get(loc.driverId);
      if (!existing) {
        uniqueDriverLocations.set(loc.driverId, loc);
      } else {
        console.warn(`⚠️ Motorista duplicado detectado: ${loc.driverId} (${loc.driverName})`);
        // Keep the most recent timestamp
        const existingTime = existing.timestamp instanceof Date ? existing.timestamp : existing.timestamp.toDate();
        const locTime = loc.timestamp instanceof Date ? loc.timestamp : loc.timestamp.toDate();
        if (locTime > existingTime) {
          uniqueDriverLocations.set(loc.driverId, loc);
          console.log(`  → Mantendo versão mais recente (${locTime.toLocaleTimeString()})`);
        } else {
          console.log(`  → Mantendo versão existente (${existingTime.toLocaleTimeString()})`);
        }
      }
    });

    if (uniqueDriverLocations.size !== driverLocations.length) {
      console.warn(`⚠️ Duplicações removidas: ${driverLocations.length} localizações → ${uniqueDriverLocations.size} únicas`);
    }

    const bounds = new google.maps.LatLngBounds();
    const currentMarkerIds = new Set<string>();

    uniqueDriverLocations.forEach((loc) => {
        const markerId = `driver-${loc.driverId}`;
        currentMarkerIds.add(markerId);

        let marker = driverMarkersRef.current.get(markerId);
        let infoWindow = driverInfoWindowsRef.current.get(markerId);

        if (!marker) {
            // Create pulse marker container
            const markerContainer = document.createElement('div');
            markerContainer.style.cursor = 'pointer';
            markerContainer.style.pointerEvents = 'auto';
            const root = createRoot(markerContainer);
            root.render(<DriverLocationPulse size={100} />);

            marker = new google.maps.marker.AdvancedMarkerElement({
                map,
                content: markerContainer,
                title: loc.driverName,
                gmpClickable: true,
            });
            driverMarkersRef.current.set(markerId, marker);

            // Criar InfoWindow para o motorista
            const timestamp = loc.timestamp instanceof Date ? loc.timestamp : loc.timestamp.toDate();
            infoWindow = new google.maps.InfoWindow({
                content: createDriverInfoWindowContent(loc.driverName, timestamp, loc.driverId),
            });
            driverInfoWindowsRef.current.set(markerId, infoWindow);

            // Adicionar listener de domready para o botão de refresh
            google.maps.event.addListener(infoWindow, 'domready', () => {
              const refreshBtn = document.querySelector(`[data-action="refresh-location"][data-driver-id="${loc.driverId}"]`);
              if (refreshBtn && onRefreshDriverLocation) {
                refreshBtn.addEventListener('click', () => {
                  console.log(`🔄 Solicitando atualização de localização para motorista: ${loc.driverId}`);
                  onRefreshDriverLocation(loc.driverId);
                });
              }
            });

            // Adicionar listener de click no marcador
            marker.addListener("click", () => {
                activeInfoWindowRef.current?.close();
                infoWindow!.open(map, marker as any);
                activeInfoWindowRef.current = infoWindow!;
            });
        } else {
            // Atualizar o conteúdo da InfoWindow existente
            const timestamp = loc.timestamp instanceof Date ? loc.timestamp : loc.timestamp.toDate();
            infoWindow!.setContent(createDriverInfoWindowContent(loc.driverName, timestamp, loc.driverId));
        }

        marker.position = { lat: loc.lat, lng: loc.lng };
        // Removido: rotação do marcador baseada no heading
        // O ícone do motorista deve sempre ficar na vertical
        // if (loc.heading && marker.content instanceof HTMLElement) {
        //     marker.content.style.transform = `rotate(${loc.heading}deg)`;
        // }

        bounds.extend(marker.position);
    });

    // Remove old markers and info windows
    driverMarkersRef.current.forEach((marker, id) => {
        if (!currentMarkerIds.has(id)) {
            marker.map = null;
            driverMarkersRef.current.delete(id);
            driverInfoWindowsRef.current.delete(id);
        }
    });

    // Only fit bounds if driver locations actually changed (not on resize)
    const currentDriverLocationsData = JSON.stringify(
      driverLocations?.map(loc => ({ driverId: loc.driverId, lat: loc.lat, lng: loc.lng }))
    );

    const shouldFitBounds = currentDriverLocationsData !== previousDriverLocationsRef.current;

    // Validate bounds before calling fitBounds
    if (!bounds.isEmpty() && shouldFitBounds) {
      try {
        const boundsObj = bounds.toJSON();
        // Ensure bounds has valid north, south, east, west properties
        if (boundsObj && typeof boundsObj.north === 'number' && typeof boundsObj.south === 'number' &&
            typeof boundsObj.east === 'number' && typeof boundsObj.west === 'number') {
          map.fitBounds(bounds, 100);
          previousDriverLocationsRef.current = currentDriverLocationsData;
        } else {
          console.error('Invalid bounds object:', boundsObj);
        }
      } catch (error) {
        console.error('Error fitting bounds for driver locations:', error);
      }
    }

  }, [driverLocations]);

  const mapStyle: React.CSSProperties = height === -1 ? { height: '100%', width: '100%' } : { height, width: '100%' };

  return <div ref={divRef} style={mapStyle} className="w-full rounded-lg border" />;
});
