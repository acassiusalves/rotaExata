
"use client";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { Loader } from "@googlemaps/js-api-loader";
import type { PlaceValue, RouteInfo, DriverLocation, DriverLocationWithInfo, DeviceInfo } from "@/lib/types";
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

        ${stop.rua || stop.street ? `
          <span style="color: #666; align-self: start;">Rua:</span>
          <p style="margin: 0; word-break: break-word;">${stop.rua || stop.street}</p>
        ` : ''}

        ${stop.numero ? `
          <span style="color: #666; align-self: start;">Número:</span>
          <p style="margin: 0; word-break: break-word;">${stop.numero}</p>
        ` : ''}

        ${stop.complemento ? `
          <span style="color: #666; align-self: start;">Complemento:</span>
          <p style="margin: 0; word-break: break-word;">${stop.complemento}</p>
        ` : ''}

        ${stop.bairro || stop.neighborhood ? `
          <span style="color: #666; align-self: start;">Bairro:</span>
          <p style="margin: 0; word-break: break-word;">${stop.bairro || stop.neighborhood}</p>
        ` : ''}

        ${stop.cidade || stop.city ? `
          <span style="color: #666; align-self: start;">Cidade:</span>
          <p style="margin: 0; word-break: break-word;">${stop.cidade || stop.city}${stop.state ? ` - ${stop.state}` : ''}</p>
        ` : ''}

        ${stop.cep || stop.zipCode ? `
          <span style="color: #666; align-self: start;">CEP:</span>
          <p style="margin: 0; word-break: break-word;">${stop.cep || stop.zipCode}</p>
        ` : ''}

        ${!stop.rua && !stop.street && address ? `
          <span style="color: #666; align-self: start;">Endereço:</span>
          <p style="margin: 0; word-break: break-word;">${address}</p>
        ` : ''}

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

// Helper para cor da bateria
const getBatteryColor = (level: number | null | undefined): string => {
  if (level === null || level === undefined) return '#9ca3af'; // gray
  if (level <= 20) return '#ef4444'; // red
  if (level <= 50) return '#f59e0b'; // yellow
  return '#22c55e'; // green
};

// Helper para icone da bateria (SVG inline)
const getBatteryIcon = (level: number | null | undefined, charging: boolean | null | undefined): string => {
  const color = getBatteryColor(level);
  if (charging) {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><rect x="1" y="6" width="18" height="12" rx="2" ry="2"></rect><line x1="23" y1="13" x2="23" y2="11"></line><polyline points="11 11 13 8 11 13 13 16"></polyline></svg>`;
  }
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><rect x="1" y="6" width="18" height="12" rx="2" ry="2"></rect><line x1="23" y1="13" x2="23" y2="11"></line></svg>`;
};

// Helper para cor da conexão
const getConnectionColor = (type: string | undefined): string => {
  if (!type || type === 'unknown') return '#9ca3af'; // gray
  if (type === '4g' || type === '5g') return '#22c55e'; // green
  if (type === '3g') return '#f59e0b'; // yellow
  return '#f97316'; // orange
};

// Função para gerar o conteúdo HTML do InfoWindow do motorista
const createDriverInfoWindowContent = (
  driverName: string,
  timestamp: Date,
  driverId: string,
  deviceInfo?: DeviceInfo
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

  // Device info section
  let deviceInfoSection = '';
  if (deviceInfo) {
    const batteryColor = getBatteryColor(deviceInfo.batteryLevel);
    const batteryIcon = getBatteryIcon(deviceInfo.batteryLevel, deviceInfo.batteryCharging);
    const connectionColor = getConnectionColor(deviceInfo.connectionEffectiveType);
    const connectionType = deviceInfo.connectionEffectiveType?.toUpperCase() || '?';
    const isOnline = deviceInfo.online !== false;

    deviceInfoSection = `
      <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
        <div style="font-weight: 600; font-size: 12px; color: #666; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Dispositivo</div>
        <div style="display: grid; grid-template-columns: 90px 1fr; gap: 6px; font-size: 13px;">
          <span style="color: #666;">Modelo:</span>
          <span style="color: #000; font-weight: 500;">${deviceInfo.deviceModel || 'Desconhecido'}</span>

          <span style="color: #666;">Sistema:</span>
          <span style="color: #000;">${deviceInfo.osName || '?'} ${deviceInfo.osVersion?.split('.')[0] || ''}</span>

          <span style="color: #666;">Bateria:</span>
          <div style="display: flex; align-items: center; gap: 6px;">
            ${batteryIcon}
            <span style="color: ${batteryColor}; font-weight: 500;">${deviceInfo.batteryLevel !== null && deviceInfo.batteryLevel !== undefined ? `${deviceInfo.batteryLevel}%` : 'N/A'}</span>
            ${deviceInfo.batteryCharging ? '<span style="color: #22c55e; font-size: 11px;">⚡</span>' : ''}
          </div>

          <span style="color: #666;">Conexão:</span>
          <div style="display: flex; align-items: center; gap: 6px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${isOnline ? connectionColor : '#ef4444'}" stroke-width="2">
              ${isOnline
                ? '<path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line>'
                : '<line x1="1" y1="1" x2="23" y2="23"></line><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path><path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line>'
              }
            </svg>
            <span style="color: ${connectionColor}; font-weight: 500;">${connectionType}</span>
            ${!isOnline ? '<span style="color: #ef4444; font-size: 11px;">(offline)</span>' : ''}
          </div>
        </div>
      </div>
    `;
  }

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
      ${deviceInfoSection}
      <button
        data-action="refresh-location"
        data-driver-id="${driverId}"
        style="
          width: 100%;
          margin-top: 12px;
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
  showTimePreferenceMarkers?: boolean;
};

export const RouteMap = React.forwardRef<RouteMapHandle, Props>(function RouteMap(
  { origin, stops, routes, unassignedStops, height = 360, driverLocation, driverLocations, onRemoveStop, onEditStop, onRefreshDriverLocation, highlightedStopIds = [], showTimePreferenceMarkers = false }: Props,
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
  const [mapReady, setMapReady] = React.useState(false);

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

      // Sinalizar que o mapa está pronto
      setMapReady(true);
    });

    return () => { canceled = true; };
  }, []);

  React.useEffect(() => {
    if (!mapReady) return;

    const map = mapRef.current;
    if (!map || !(map instanceof google.maps.Map)) {
      return;
    }

    console.log('🔄 [RouteMap useEffect] Executando com origin:', {
      address: origin?.address,
      lat: origin?.lat,
      lng: origin?.lng,
    });

    // Only clear and redraw when data actually changes - use lightweight check
    const routesKey = routes?.map(r =>
      `${r.name}:${r.visible}:${r.stops.length}:${r.encodedPolyline?.slice(0, 20) || ''}:${r.stops.map(s => `${s.id}|${s.lat?.toFixed(4)}|${s.lng?.toFixed(4)}|${s.deliveryStatus || ''}`).join(',')}`
    ).join(';') || '';
    const stopsKey = stops?.map(s => `${s.id}|${s.lat?.toFixed(4)}|${s.lng?.toFixed(4)}`).join(',') || '';
    const unassignedKey = unassignedStops?.map(s => `${s.id}|${s.lat?.toFixed(4)}|${s.lng?.toFixed(4)}`).join(',') || '';

    const currentRoutesDataCheck = `${origin?.lat?.toFixed(4)}:${origin?.lng?.toFixed(4)}|${stopsKey}|${routesKey}|${unassignedKey}|${highlightedStopIds.join(',')}`;

    // Skip if data hasn't changed (avoid unnecessary redraws)
    const dataUnchanged = currentRoutesDataCheck === previousRoutesDataRef.current;
    const alreadyInitialized = hasInitializedBoundsRef.current;

    if (dataUnchanged && alreadyInitialized) {
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
      // Usar lat/lng explicitamente para garantir posicionamento correto
      const originPosition = { lat: origin.lat, lng: origin.lng };

      console.log('🗺️ [RouteMap] Criando marcador de origem:', {
        address: origin.address,
        position: originPosition,
        originObject: origin
      });

      const originMarker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: originPosition,
        content: new google.maps.marker.PinElement({
          background: '#111827', // dark-gray
          borderColor: '#F9FAFB', // near-white for contrast
          glyph: new URL('https://fonts.gstatic.com/s/i/googlematerialicons/home/v15/24px.svg'),
          glyphColor: '#FFFFFF',
        }).element,
        title: "Origem"
      });
      markersRef.current.push(originMarker as any); // cast because of type mismatch
      bounds.extend(originPosition);

      console.log('✅ [RouteMap] Marcador de origem criado na posição:', originPosition);
    } else {
      console.warn('⚠️ [RouteMap] Origem inválida ou não fornecida:', origin);
    }
    
    // helper para criar marker+info e indexar por id
    const addStop = (stop: PlaceValue, index?: number, color?: string, isUnassigned = false) => {
      // Validate coordinates
      if (!stop.lat || !stop.lng ||
          typeof stop.lat !== 'number' || typeof stop.lng !== 'number' ||
          !isFinite(stop.lat) || !isFinite(stop.lng)) {
        return;
      }
      const sid = String(stop.id ?? stop.placeId ?? index);
      const isHighlighted = highlightedStopIds.includes(sid);
      const isCompleted = stop.deliveryStatus === 'completed';
      const isFailed = stop.deliveryStatus === 'failed';
      const isNewlyAdded = stop.isNewlyAdded === true;
      const hasTimePreference = stop.hasTimePreference === true;

      // Determinar cor e ícone baseado no status
      let markerBackground = color || '#6b7280'; // Cinza como fallback quando cor não definida
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

      // Criar elemento de conteúdo do marcador
      let markerContent: HTMLElement;

      // Definir cores para marcadores com preferência de horário (somente se o toggle estiver ativo)
      // Rosa/magenta para pendentes, verde para concluídos
      if (hasTimePreference && showTimePreferenceMarkers && !isHighlighted && !isCompleted && !isFailed && !isNewlyAdded) {
        markerBackground = '#ec4899'; // Rosa/magenta para entregas com horário
        markerBorder = '#db2777';
      }

      // Usar PinElement para todos os marcadores (incluindo os com preferência de horário)
      const pinElement = new google.maps.marker.PinElement({
        background: isUnassigned
          ? (isHighlighted ? '#FFD700' : (isNewlyAdded ? '#FF6B00' : '#000000'))
          : markerBackground,
        borderColor: isUnassigned
          ? (isHighlighted ? '#FF6B00' : (isNewlyAdded ? '#FFD700' : '#FFFFFF'))
          : markerBorder,
        glyphColor: '#FFFFFF', // Sempre branco para visibilidade
        scale: isHighlighted ? 1.5 : (isNewlyAdded ? 1.3 : markerScale),
        glyph: isHighlighted ? '★' : (isNewlyAdded ? '✨' : markerGlyph), // Sempre mostrar número
      });
      markerContent = pinElement.element;

      // zIndex: marcadores de rota (com index) ficam por cima de não alocados (sem index)
      const baseZIndex = isUnassigned ? 100 : 500; // Rota fica por cima de não alocados
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: stop,
        content: markerContent,
        title: `Parada ${index !== undefined ? index + 1 : 'Avulsa'}: ${stop.customerName ?? ""}${hasTimePreference ? ' (Com horário)' : ''}`,
        zIndex: isHighlighted ? 1000 : (hasTimePreference ? 950 : (isNewlyAdded ? 900 : baseZIndex)),
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
      console.log('📍 [RouteMap] Stop adicionado ao bounds:', {
        address: stop.address?.substring(0, 50),
        lat: stop.lat,
        lng: stop.lng,
        isUnassigned,
      });
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
                   }
                 } catch {
                   // Silently handle polyline errors
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
      unassignedStops.forEach(stop => {
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

    if (!bounds.isEmpty() && shouldFitBounds) {
        console.log('📍 [RouteMap] Bounds calculados:', {
          ne: { lat: bounds.getNorthEast().lat(), lng: bounds.getNorthEast().lng() },
          sw: { lat: bounds.getSouthWest().lat(), lng: bounds.getSouthWest().lng() },
          center: bounds.getCenter().toJSON(),
        });
        // Small delay to ensure map is fully rendered
        requestAnimationFrame(() => {
          map.fitBounds(bounds, 100); // 100px padding
          console.log('🗺️ [RouteMap] Mapa centralizado em:', map.getCenter().toJSON(), 'zoom:', map.getZoom());
        });
        hasInitializedBoundsRef.current = true;
        previousCountCheckRef.current = currentCountCheck;
    }

    // Always update the full data check to trigger marker re-render
    previousRoutesDataRef.current = currentRoutesDataCheck;

  }, [mapReady, origin, stops, routes, unassignedStops, onRemoveStop, onEditStop, highlightedStopIds, showTimePreferenceMarkers]);

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
  }, [mapReady, driverLocation, driverLocations]);

    // Update multiple driver locations
  React.useEffect(() => {
    if (!mapReady) return;

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


    // Deduplicate driver locations by driverId (keep only the most recent)
    const uniqueDriverLocations = new Map<string, DriverLocationWithInfo>();
    driverLocations.forEach(loc => {
      const existing = uniqueDriverLocations.get(loc.driverId);
      if (!existing) {
        uniqueDriverLocations.set(loc.driverId, loc);
      } else {
        // Keep the most recent timestamp
        const existingTime = existing.timestamp instanceof Date ? existing.timestamp : existing.timestamp.toDate();
        const locTime = loc.timestamp instanceof Date ? loc.timestamp : loc.timestamp.toDate();
        if (locTime > existingTime) {
          uniqueDriverLocations.set(loc.driverId, loc);
        }
      }
    });

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
                content: createDriverInfoWindowContent(loc.driverName, timestamp, loc.driverId, loc.deviceInfo),
            });
            driverInfoWindowsRef.current.set(markerId, infoWindow);

            // Adicionar listener de domready para o botão de refresh
            google.maps.event.addListener(infoWindow, 'domready', () => {
              const refreshBtn = document.querySelector(`[data-action="refresh-location"][data-driver-id="${loc.driverId}"]`);
              if (refreshBtn && onRefreshDriverLocation) {
                refreshBtn.addEventListener('click', () => {
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
            infoWindow!.setContent(createDriverInfoWindowContent(loc.driverName, timestamp, loc.driverId, loc.deviceInfo));
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

    // Only fit bounds when NEW drivers appear (not when positions update)
    // Compare only driverIds, not lat/lng, to avoid re-centering on every location update
    const currentDriverIds = JSON.stringify(
      driverLocations?.map(loc => loc.driverId).sort()
    );

    const hasNewDrivers = currentDriverIds !== previousDriverLocationsRef.current;

    // Validate bounds before calling fitBounds - only when new drivers appear
    if (!bounds.isEmpty() && hasNewDrivers) {
      try {
        const boundsObj = bounds.toJSON();
        // Ensure bounds has valid north, south, east, west properties
        if (boundsObj && typeof boundsObj.north === 'number' && typeof boundsObj.south === 'number' &&
            typeof boundsObj.east === 'number' && typeof boundsObj.west === 'number') {
          map.fitBounds(bounds, 100);
          previousDriverLocationsRef.current = currentDriverIds;
        }
      } catch {
        // Silently handle bounds errors
      }
    }

  }, [mapReady, driverLocations, onRefreshDriverLocation]);

  const mapStyle: React.CSSProperties = height === -1 ? { height: '100%', width: '100%' } : { height, width: '100%' };

  return <div ref={divRef} style={mapStyle} className="w-full rounded-lg border" />;
});
