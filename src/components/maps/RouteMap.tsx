
"use client";
import * as React from "react";
import { Loader } from "@googlemaps/js-api-loader";
import type { PlaceValue, RouteInfo, DriverLocation, DriverLocationWithInfo } from "@/lib/types";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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
  timestamp: Date
): string => {
  const formattedDate = format(timestamp, "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR });

  return `
    <div style="font-family: Inter, sans-serif; font-size: 14px; color: #333; max-width: 280px; padding: 4px;">
      <h4 style="font-weight: 600; font-size: 16px; margin: 0 0 8px 0;">🚚 Motorista</h4>
      <div style="display: grid; grid-template-columns: 110px 1fr; gap: 8px;">
        <span style="color: #666;">Nome:</span>
        <strong style="color: #000;">${driverName}</strong>

        <span style="color: #666;">Última atualização:</span>
        <span>${formattedDate}</span>
      </div>
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
  highlightedStopIds?: string[];
};

export const RouteMap = React.forwardRef<RouteMapHandle, Props>(function RouteMap(
  { origin, stops, routes, unassignedStops, height = 360, driverLocation, driverLocations, onRemoveStop, onEditStop, highlightedStopIds = [] }: Props,
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

    // Only clear and redraw when data actually changes
    const currentRoutesDataCheck = JSON.stringify({
      originLat: origin?.lat,
      originLng: origin?.lng,
      stopsCount: stops?.length || 0,
      routesData: routes?.map(r => ({
        stopsCount: r.stops.length,
        visible: r.visible,
        color: r.color,
        name: r.name
      })),
      unassignedCount: unassignedStops?.length || 0,
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
    
    // helper para criar marker+info e indexar por id
    const addStop = (stop: PlaceValue, index?: number, color?: string, isUnassigned = false) => {
      if (!stop.lat || !stop.lng) return;
      const sid = String(stop.id ?? stop.placeId ?? index);
      const isHighlighted = highlightedStopIds.includes(sid);
      const isCompleted = stop.deliveryStatus === 'completed';
      const isFailed = stop.deliveryStatus === 'failed';

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
        markerBackground = '#22c55e'; // Verde para concluído
        markerBorder = '#16a34a';
        markerGlyph = '✓';
      } else if (isFailed) {
        markerBackground = '#ef4444'; // Vermelho para falha
        markerBorder = '#dc2626';
        markerGlyph = '✗';
      }

      const pinElement = isUnassigned
        ? new google.maps.marker.PinElement({
            background: isHighlighted ? '#FFD700' : '#000000',
            borderColor: isHighlighted ? '#FF6B00' : '#FFFFFF',
            glyphColor: '#000000',
            scale: isHighlighted ? 1.5 : 1,
            glyph: isHighlighted ? '★' : ''
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
        zIndex: isHighlighted ? 1000 : undefined,
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
                 const path = google.maps.geometry.encoding.decodePath(route.encodedPolyline);
                 const poly = new google.maps.Polyline({ map, path, strokeColor: route.color, strokeWeight: 5, strokeOpacity: 0.8 });
                 polylinesRef.current.push(poly);
                 path.forEach(p => bounds.extend(p));
            }
        });
    } else if (stops) { // Fallback for single list of stops
       stops.forEach((stop, index) => {
        addStop(stop, index, undefined, false)
    });
    }

    // Handle unassigned stops with black pins
    if (unassignedStops) {
      unassignedStops.forEach(stop => addStop(stop, undefined, '#000000', true));
    }

    // Fit bounds to show all routes and stops (only on first load or when data changes)
    const isFirstLoad = !hasInitializedBoundsRef.current;
    const dataChanged = currentRoutesDataCheck !== previousRoutesDataRef.current;
    const shouldFitBounds = isFirstLoad || dataChanged;

    console.log('🎯 FitBounds decision:', {
      isFirstLoad,
      dataChanged,
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
        previousRoutesDataRef.current = currentRoutesDataCheck;
    } else if (bounds.isEmpty()) {
      console.log('⚠️ Bounds is empty, not executing fitBounds');
    } else {
      console.log('⚠️ Should not fit bounds (already initialized and data unchanged)');
    }

  }, [origin, stops, routes, unassignedStops, onRemoveStop, onEditStop, highlightedStopIds]);

  // Update driver location marker (single)
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !driverLocation) {
      if (driverMarkerRef.current) {
        driverMarkerRef.current.map = null;
        driverMarkerRef.current = null;
      }
      return;
    }

    // Create or update driver marker
    if (!driverMarkerRef.current) {
      // Create truck icon
      const truckIcon = document.createElement('div');
      truckIcon.innerHTML = `
        <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
          <circle cx="20" cy="20" r="18" fill="#ef4444" stroke="white" stroke-width="3"/>
          <path d="M12 18h8v-4h-2l-2-3h-4v7zm8 0h6l2 2v4h-8v-6zm-6 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" fill="white"/>
        </svg>
      `;
      truckIcon.style.transform = driverLocation.heading ? `rotate(${driverLocation.heading}deg)` : '';

      driverMarkerRef.current = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: driverLocation,
        content: truckIcon,
        title: "Motorista",
      });
    } else {
      // Update position
      driverMarkerRef.current.position = driverLocation;

      // Update rotation if heading available
      if (driverLocation.heading && driverMarkerRef.current.content instanceof HTMLElement) {
        driverMarkerRef.current.content.style.transform = `rotate(${driverLocation.heading}deg)`;
      }
    }
  }, [driverLocation]);

    // Update multiple driver locations
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !driverLocations) {
      return;
    }

    console.log('🗺️ RouteMap recebeu driverLocations:', driverLocations);

    const bounds = new google.maps.LatLngBounds();
    const currentMarkerIds = new Set<string>();

    driverLocations.forEach((loc, index) => {
        const markerId = `driver-${loc.driverId}`;
        currentMarkerIds.add(markerId);

        let marker = driverMarkersRef.current.get(markerId);
        let infoWindow = driverInfoWindowsRef.current.get(markerId);

        if (!marker) {
            const truckIcon = document.createElement('div');
            truckIcon.innerHTML = `
                <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" style="pointer-events: none;">
                <circle cx="20" cy="20" r="18" fill="#ef4444" stroke="white" stroke-width="3" style="pointer-events: none;"/>
                <path d="M12 18h8v-4h-2l-2-3h-4v7zm8 0h6l2 2v4h-8v-6zm-6 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" fill="white" style="pointer-events: none;"/>
                </svg>
            `;
            truckIcon.style.cursor = 'pointer';
            truckIcon.style.pointerEvents = 'auto';
            marker = new google.maps.marker.AdvancedMarkerElement({
                map,
                content: truckIcon,
                title: loc.driverName,
                gmpClickable: true,
            });
            driverMarkersRef.current.set(markerId, marker);

            // Criar InfoWindow para o motorista
            const timestamp = loc.timestamp instanceof Date ? loc.timestamp : loc.timestamp.toDate();
            infoWindow = new google.maps.InfoWindow({
                content: createDriverInfoWindowContent(loc.driverName, timestamp),
            });
            driverInfoWindowsRef.current.set(markerId, infoWindow);

            // Adicionar listener de click
            marker.addListener("click", () => {
                activeInfoWindowRef.current?.close();
                infoWindow!.open(map, marker as any);
                activeInfoWindowRef.current = infoWindow!;
            });
        } else {
            // Atualizar o conteúdo da InfoWindow existente
            const timestamp = loc.timestamp instanceof Date ? loc.timestamp : loc.timestamp.toDate();
            infoWindow!.setContent(createDriverInfoWindowContent(loc.driverName, timestamp));
        }

        marker.position = { lat: loc.lat, lng: loc.lng };
        if (loc.heading && marker.content instanceof HTMLElement) {
            marker.content.style.transform = `rotate(${loc.heading}deg)`;
        }

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

    if (!bounds.isEmpty() && shouldFitBounds) {
      map.fitBounds(bounds, 100);
      previousDriverLocationsRef.current = currentDriverLocationsData;
    }

  }, [driverLocations]);

  const mapStyle: React.CSSProperties = height === -1 ? { height: '100%', width: '100%' } : { height, width: '100%' };

  return <div ref={divRef} style={mapStyle} className="w-full rounded-lg border" />;
});
